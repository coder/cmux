//! Renderer implementations.

use super::buffer::Buffer;
use super::render::{PaneRenderer, PaneContext, Event, EventResult};
use super::style::{Style, BorderStyle};
use super::layout::Rect;

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
            
            // Handle text with newlines and word wrapping
            let mut current_y = y;
            let max_y = (text_rect.y + text_rect.h) as u16;
            
            for line in self.text.lines() {
                if current_y >= max_y {
                    break;
                }
                
                let mut current_x = x;
                let max_x = (text_rect.x + text_rect.w) as u16;
                
                for word in line.split_whitespace() {
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
                
                // Move to next line for newline
                current_y += 1;
            }
        }
    }
    
    fn handle_event(&mut self, _ctx: &PaneContext, event: &Event) -> EventResult {
        match event {
            Event::Focus { .. } => {
                // Could update style or border based on focus
                EventResult::Render
            }
            _ => EventResult::None,
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
    fn test_text_renderer_focus_event() {
        let mut renderer = TextRenderer::new("Test");
        let ctx = PaneContext {
            id: 0,
            rect: Rect { x: 0, y: 0, w: 10, h: 10 },
            focused: false,
        };
        
        // Focus event should trigger re-render
        let result = renderer.handle_event(&ctx, &Event::Focus { focused: true });
        assert_eq!(result, EventResult::Render);
        
        // Other events should not
        let result = renderer.handle_event(&ctx, &Event::Resize(80, 24));
        assert_eq!(result, EventResult::None);
    }
}