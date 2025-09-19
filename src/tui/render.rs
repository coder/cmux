//! Rendering system for panes.

use super::buffer::Buffer;

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
    /// Animation tick for periodic updates (cursor blink, etc.).
    Animation,
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
    DoubleClick(MouseButton),
    TripleClick(MouseButton),
    ScrollDown,
    ScrollUp,
}

/// Mouse button.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

impl From<MouseEvent> for Point {
    fn from(mouse: MouseEvent) -> Self {
        Point::new(mouse.x, mouse.y)
    }
}

use super::layout::LayoutNode;
use super::geom::{Point, Rect};
use std::collections::HashMap;

/// Context for rendering a layout tree.
pub struct RenderContext {
    /// The currently focused pane ID.
    focused_pane: Option<usize>,
    /// Cached pane rectangles from last compute.
    pane_rects: HashMap<usize, Rect>,
}

impl RenderContext {
    /// Create a new render context.
    pub fn new() -> Self {
        Self {
            focused_pane: None,
            pane_rects: HashMap::new(),
        }
    }
    
    /// Set the focused pane.
    pub fn set_focused_pane(&mut self, pane_id: usize) {
        self.focused_pane = Some(pane_id);
    }
    
    /// Clear the focused pane.
    pub fn clear_focus(&mut self) {
        self.focused_pane = None;
    }
    
    /// Check if a pane is focused.
    pub fn is_focused(&self, pane_id: usize) -> bool {
        self.focused_pane == Some(pane_id)
    }
    
    /// Get the pane at the given position.
    pub fn pane_at_position(&self, x: u16, y: u16) -> Option<usize> {
        for (pane_id, rect) in &self.pane_rects {
            if x >= rect.x as u16 
                && x < (rect.x + rect.w) as u16
                && y >= rect.y as u16 
                && y < (rect.y + rect.h) as u16 {
                return Some(*pane_id);
            }
        }
        None
    }
    
    /// Render a layout tree to a buffer.
    pub fn render(&mut self, layout: &mut LayoutNode, buffer: &mut Buffer) {
        let rect = buffer.area();
        let panes = layout.compute(rect);
        
        // Update cached pane rectangles
        self.pane_rects.clear();
        for (id, rect) in panes {
            self.pane_rects.insert(id, rect);
        }
        
        // Now render each pane
        self.render_node(layout, &self.pane_rects.clone(), buffer);
    }
    
    /// Forward an event to all panes in the layout tree.
    /// Returns true if any pane requested a re-render.
    pub fn forward_event(&mut self, layout: &mut LayoutNode, event: &Event, screen_rect: Rect) -> bool {
        let panes = layout.compute(screen_rect);
        
        // Update cached pane rectangles
        self.pane_rects.clear();
        for (id, rect) in panes {
            self.pane_rects.insert(id, rect);
        }
        
        // Handle mouse click to change focus
        if let Event::Mouse(mouse_event) = event {
            use super::render::MouseEventKind;
            if let MouseEventKind::Down(_) = mouse_event.kind {
                if let Some(pane_id) = self.pane_at_position(mouse_event.x, mouse_event.y) {
                    let was_focused = self.focused_pane;
                    self.focused_pane = Some(pane_id);
                    // Request re-render if focus changed
                    if was_focused != self.focused_pane {
                        return true;
                    }
                }
            }
        }
        
        self.forward_event_node(layout, &self.pane_rects.clone(), event)
    }
    
    fn forward_event_node(&mut self, node: &mut LayoutNode, pane_rects: &HashMap<usize, Rect>, event: &Event) -> bool {
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
    
    fn render_node(&mut self, node: &mut LayoutNode, pane_rects: &HashMap<usize, Rect>, buffer: &mut Buffer) {
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
    use crate::tui::text_pane::TextPane;
    
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
                        renderer: Box::new(TextPane::new("Left")),
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
                        renderer: Box::new(TextPane::new("Right")),
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
        ctx.set_focused_pane(0);
        
        ctx.render(&mut layout, &mut buffer);
        
        // Check that both panes were rendered with borders
        // Pane 0 is focused, so it should have thick border
        assert_eq!(buffer.get_mut(0, 0).unwrap().ch, '┏');
        // Pane 1 is not focused, so it should have single border  
        assert_eq!(buffer.get_mut(10, 0).unwrap().ch, '┌');
    }

    #[test]
    fn test_mouse_event_to_point_conversion() {
        let mouse = MouseEvent {
            x: 42,
            y: 17,
            kind: MouseEventKind::Down(MouseButton::Left),
        };
        
        let point = Point::from(mouse);
        assert_eq!(point.x(), 42);
        assert_eq!(point.y(), 17);
    }
}