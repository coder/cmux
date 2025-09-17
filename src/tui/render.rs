//! Rendering system for panes.

use super::buffer::Buffer;
use super::layout::Rect;
use super::style::{Style, BorderStyle};

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
    fn handle_event(&mut self, _ctx: &PaneContext, _event: Event) -> EventResult {
        EventResult::Ignored
    }
    
    /// Called when focus state changes. Default implementation does nothing.
    fn focus_changed(&mut self, _ctx: &PaneContext, _focused: bool) {}
}

/// Result of handling an event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventResult {
    /// The event was handled and should not be propagated.
    Consumed,
    /// The event was not handled and should be propagated.
    Ignored,
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

/// A no-op renderer for testing.
pub struct NoopRenderer;

impl PaneRenderer for NoopRenderer {
    fn render(&mut self, _ctx: &PaneContext, _buffer: &mut Buffer) {
        // Do nothing
    }
}

/// A simple text renderer.
pub struct TextRenderer {
    pub text: String,
    pub style: Style,
    pub border: BorderStyle,
}

impl TextRenderer {
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            style: Style::default(),
            border: BorderStyle::Single,
        }
    }

    pub fn with_style(mut self, style: Style) -> Self {
        self.style = style;
        self
    }

    pub fn with_border(mut self, border: BorderStyle) -> Self {
        self.border = border;
        self
    }
}

impl PaneRenderer for TextRenderer {
    fn render(&mut self, ctx: &PaneContext, buffer: &mut Buffer) {
        // Draw border if not None
        if !matches!(self.border, BorderStyle::None) {
            buffer.draw_box(ctx.rect, self.border);
        }
        
        // Calculate text area (inside border if present)
        let text_rect = if matches!(self.border, BorderStyle::None) {
            ctx.rect
        } else {
            Rect {
                x: ctx.rect.x + 1,
                y: ctx.rect.y + 1,
                w: ctx.rect.w.saturating_sub(2),
                h: ctx.rect.h.saturating_sub(2),
            }
        };
        
        // Draw text
        if text_rect.w > 0 && text_rect.h > 0 {
            let x = text_rect.x as u16;
            let y = text_rect.y as u16;
            
            // Simple word wrapping
            let mut current_y = y;
            let mut current_x = x;
            let max_x = (text_rect.x + text_rect.w) as u16;
            let max_y = (text_rect.y + text_rect.h) as u16;
            
            for word in self.text.split_whitespace() {
                let word_len = word.len() as u16;
                
                // Check if word fits on current line
                if current_x + word_len > max_x && current_x > x {
                    // Move to next line
                    current_y += 1;
                    current_x = x;
                    
                    if current_y >= max_y {
                        break;
                    }
                }
                
                // Draw word
                buffer.set_string(current_x, current_y, word, self.style);
                current_x += word_len;
                
                // Add space after word if there's room
                if current_x < max_x {
                    buffer.set_char(current_x, current_y, ' ', self.style);
                    current_x += 1;
                }
            }
        }
    }
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

    #[test]
    fn test_noop_renderer() {
        let mut renderer = NoopRenderer;
        let mut buffer = Buffer::new(10, 10);
        let ctx = PaneContext {
            id: 0,
            rect: Rect { x: 0, y: 0, w: 10, h: 10 },
            focused: false,
        };
        
        renderer.render(&ctx, &mut buffer);
        // Should complete without error
    }

    #[test]
    fn test_text_renderer() {
        let mut renderer = TextRenderer::new("Hello, World!");
        let mut buffer = Buffer::new(20, 10);
        let ctx = PaneContext {
            id: 0,
            rect: Rect { x: 0, y: 0, w: 20, h: 5 },
            focused: false,
        };
        
        renderer.render(&ctx, &mut buffer);
        
        // Check that border was drawn
        assert_eq!(buffer.get_mut(0, 0).unwrap().ch, '┌');
        assert_eq!(buffer.get_mut(19, 0).unwrap().ch, '┐');
        assert_eq!(buffer.get_mut(0, 4).unwrap().ch, '└');
        assert_eq!(buffer.get_mut(19, 4).unwrap().ch, '┘');
    }
    
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