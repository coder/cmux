//! Rendering system for panes.

use super::buffer::Buffer;
use super::layout::Rect;

/// Context passed to pane renderers.
#[derive(Debug, Clone)]
pub struct PaneContext {
    /// The ID of the pane being rendered.
    pub id: usize,
    /// The rectangle where the pane should be rendered.
    pub rect: Rect,
    /// Whether this pane currently has focus.
    pub focused: bool,
}

/// Trait for rendering pane content.
pub trait PaneRenderer: Send {
    /// Render the pane content to the buffer.
    fn render(&mut self, ctx: &PaneContext, buffer: &mut Buffer);
    
    /// Handle an event. Default implementation does nothing.
    fn handle_event(&mut self, _ctx: &PaneContext, _event: &Event) -> EventResult {
        EventResult::None
    }
}

/// Result of handling an event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventResult {
    /// No action needed.
    None,
    /// Request a re-render.
    Render,
}

/// Events that can be sent to panes.
#[derive(Debug, Clone)]
pub enum Event {
    /// A key was pressed.
    Key(KeyEvent),
    /// The mouse was moved or clicked.
    Mouse(MouseEvent),
    /// The terminal was resized.
    Resize(u16, u16),
    /// Focus state changed.
    Focus { focused: bool },
}

/// A keyboard event.
#[derive(Debug, Clone, Copy)]
pub struct KeyEvent {
    pub code: KeyCode,
    pub modifiers: KeyModifiers,
}

/// Key codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyCode {
    Char(char),
    Enter,
    Tab,
    Backspace,
    Delete,
    Left,
    Right,
    Up,
    Down,
    Home,
    End,
    PageUp,
    PageDown,
    F(u8),
    Esc,
}

/// Keyboard modifiers.
#[derive(Debug, Clone, Copy, Default)]
pub struct KeyModifiers {
    pub shift: bool,
    pub ctrl: bool,
    pub alt: bool,
}

/// A mouse event.
#[derive(Debug, Clone, Copy)]
pub struct MouseEvent {
    pub x: u16,
    pub y: u16,
    pub kind: MouseEventKind,
}

/// Kind of mouse event.
#[derive(Debug, Clone, Copy)]
pub enum MouseEventKind {
    Moved,
    Down(MouseButton),
    Up(MouseButton),
    Drag(MouseButton),
    ScrollDown,
    ScrollUp,
}

/// Mouse button.
#[derive(Debug, Clone, Copy)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}


use super::layout::LayoutNode;
use std::collections::HashSet;

/// Context for rendering a layout tree.
pub struct RenderContext {
    /// Set of pane IDs that are currently focused.
    focused_panes: HashSet<usize>,
}

impl RenderContext {
    /// Create a new render context.
    pub fn new() -> Self {
        Self {
            focused_panes: HashSet::new(),
        }
    }
    
    /// Set a pane as focused.
    pub fn set_focused(&mut self, pane_id: usize, focused: bool) {
        if focused {
            self.focused_panes.insert(pane_id);
        } else {
            self.focused_panes.remove(&pane_id);
        }
    }
    
    /// Check if a pane is focused.
    pub fn is_focused(&self, pane_id: usize) -> bool {
        self.focused_panes.contains(&pane_id)
    }
    
    /// Render a layout tree to a buffer.
    pub fn render(&mut self, layout: &mut LayoutNode, buffer: &mut Buffer) {
        let rect = buffer.area();
        let panes = layout.compute(rect);
        
        // Create a map of pane IDs to their rectangles
        let mut pane_rects = std::collections::HashMap::new();
        for (id, rect) in panes {
            pane_rects.insert(id, rect);
        }
        
        // Now render each pane
        self.render_node(layout, &pane_rects, buffer);
    }
    
    /// Forward an event to all panes in the layout tree.
    /// Returns true if any pane requested a re-render.
    pub fn forward_event(&mut self, layout: &mut LayoutNode, event: &Event) -> bool {
        let rect = Rect { x: 0, y: 0, w: 0, h: 0 }; // Dummy rect for event handling
        let panes = layout.compute(rect);
        
        // Create a map of pane IDs to their rectangles
        let mut pane_rects = std::collections::HashMap::new();
        for (id, rect) in panes {
            pane_rects.insert(id, rect);
        }
        
        self.forward_event_node(layout, &pane_rects, event)
    }
    
    fn forward_event_node(&mut self, node: &mut LayoutNode, pane_rects: &std::collections::HashMap<usize, Rect>, event: &Event) -> bool {
        match node {
            LayoutNode::Pane { id, renderer } => {
                let rect = pane_rects.get(id).copied().unwrap_or(Rect { x: 0, y: 0, w: 0, h: 0 });
                let ctx = PaneContext {
                    id: *id,
                    rect,
                    focused: self.is_focused(*id),
                };
                matches!(renderer.handle_event(&ctx, event), EventResult::Render)
            }
            LayoutNode::Split { children, .. } => {
                // Forward to all children and accumulate results
                children.iter_mut()
                    .map(|child| self.forward_event_node(&mut child.node, pane_rects, event))
                    .any(|needs_render| needs_render)
            }
        }
    }
    
    fn render_node(&mut self, node: &mut LayoutNode, pane_rects: &std::collections::HashMap<usize, Rect>, buffer: &mut Buffer) {
        match node {
            LayoutNode::Pane { id, renderer } => {
                if let Some(&rect) = pane_rects.get(id) {
                    let ctx = PaneContext {
                        id: *id,
                        rect,
                        focused: self.is_focused(*id),
                    };
                    renderer.render(&ctx, buffer);
                }
            }
            LayoutNode::Split { children, .. } => {
                // Recursively render each child
                for child in children.iter_mut() {
                    self.render_node(&mut child.node, pane_rects, buffer);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tui::render_impl::TextRenderer;
    
    #[test]
    fn test_render_context() {
        use super::super::layout::{Child, Size, SplitDir};
        
        let mut layout = LayoutNode::Split {
            dir: SplitDir::Horizontal,
            gutter: 0,
            children: vec![
                Child {
                    node: Box::new(LayoutNode::Pane {
                        id: 0,
                        renderer: Box::new(TextRenderer::new("Left")),
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: None,
                        max_cells: None,
                    },
                },
                Child {
                    node: Box::new(LayoutNode::Pane {
                        id: 1,
                        renderer: Box::new(TextRenderer::new("Right")),
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: None,
                        max_cells: None,
                    },
                },
            ],
        };
        
        let mut buffer = Buffer::new(20, 10);
        let mut ctx = RenderContext::new();
        ctx.set_focused(0, true);
        
        ctx.render(&mut layout, &mut buffer);
        
        // Check that both panes were rendered with borders
        assert_eq!(buffer.get_mut(0, 0).unwrap().ch, '┌');
        assert_eq!(buffer.get_mut(10, 0).unwrap().ch, '┌');
    }
}