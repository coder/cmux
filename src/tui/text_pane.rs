//! Text pane reimplemented with TextBuffer/TextBufferView architecture for proper data/view separation.

use super::buffer::Buffer;
use super::render::{PaneRenderer, PaneContext, Event, EventResult, MouseEventKind, MouseButton, KeyCode};
use super::style::{Style, Color};
use super::border::BorderStyle;
use super::geom::Point;
use super::text_buffer::{TextBuffer, TextBufferView, ViewportState};
use arboard::Clipboard;

/// A text pane that supports mouse-based text selection using TextBuffer for efficient storage.
pub struct TextPane {
    /// The underlying text buffer using rope for efficient operations.
    buffer: TextBuffer,
    /// Base text style.
    pub style: Style,
    /// Border style when not focused.
    pub border: BorderStyle,
    /// Border style when focused.
    pub focused_border: BorderStyle,
    /// Selection range (start, end) in buffer character indices.
    selection: Option<(usize, usize)>,
    /// Whether selection is currently in progress.
    is_selecting: bool,
}

impl TextPane {
    /// Create a new text pane with the given text.
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            buffer: TextBuffer::from(text.into()),
            style: Style::default(),
            border: BorderStyle::Single,
            focused_border: BorderStyle::Thick,
            selection: None,
            is_selecting: false,
        }
    }
    
    /// Set the text style.
    pub fn with_style(mut self, style: Style) -> Self {
        self.style = style;
        self
    }
    
    /// Set the border style.
    pub fn with_border(mut self, border: BorderStyle) -> Self {
        self.border = border;
        self
    }
    
    /// Set the focused border style.
    pub fn with_focused_border(mut self, border: BorderStyle) -> Self {
        self.focused_border = border;
        self
    }
    
    /// Get the current text content.
    pub fn text(&self) -> String {
        self.buffer.to_string()
    }
    
    /// Check if there's an active selection.
    fn has_selection(&self) -> bool {
        self.selection.map_or(false, |(start, end)| start != end)
    }
    
    /// Get the normalized selection range (start <= end).
    fn get_selection_range(&self) -> Option<(usize, usize)> {
        self.selection.map(|(start, end)| {
            if start <= end {
                (start, end)
            } else {
                (end, start)
            }
        })
    }
    
    /// Get the currently selected text.
    pub fn get_selected_text(&self) -> String {
        if let Some((start, end)) = self.get_selection_range() {
            self.buffer.substr(start..end)
        } else {
            String::new()
        }
    }
    
    /// Start a new selection at the given buffer character position.
    fn start_selection(&mut self, char_pos: usize) {
        self.selection = Some((char_pos, char_pos));
        self.is_selecting = true;
    }
    
    /// Update the selection end point.
    fn update_selection(&mut self, char_pos: usize) {
        if self.is_selecting {
            if let Some((start, _)) = self.selection {
                self.selection = Some((start, char_pos));
            }
        }
    }
    
    /// Finalize the current selection.
    fn finalize_selection(&mut self) {
        self.is_selecting = false;
    }
    
    /// Clear the selection.
    fn clear_selection(&mut self) {
        self.selection = None;
        self.is_selecting = false;
    }
    
    /// Check if a character at the given buffer position is selected.
    fn is_char_selected(&self, char_pos: usize) -> bool {
        if let Some((start, end)) = self.get_selection_range() {
            char_pos >= start && char_pos < end
        } else {
            false
        }
    }
    
    /// Find word boundaries at the given buffer character position.
    fn find_word_at_position(&self, char_pos: usize) -> Option<(usize, usize)> {
        if char_pos >= self.buffer.len_chars() {
            return None;
        }
        
        let text = self.buffer.to_string();
        let chars: Vec<char> = text.chars().collect();
        
        if char_pos >= chars.len() {
            return None;
        }
        
        // Check if the character at this position is a word character
        let char_at_pos = chars[char_pos];
        if !Self::is_word_char(char_at_pos) {
            return None;
        }
        
        // Find word start
        let mut start = char_pos;
        while start > 0 && Self::is_word_char(chars[start - 1]) {
            start -= 1;
        }
        
        // Find word end
        let mut end = char_pos + 1;
        while end < chars.len() && Self::is_word_char(chars[end]) {
            end += 1;
        }
        
        Some((start, end))
    }
    
    /// Check if a character is considered part of a word (alphanumeric or underscore).
    fn is_word_char(ch: char) -> bool {
        ch.is_alphanumeric() || ch == '_'
    }
    
    /// Copy selected text to clipboard.
    fn copy_to_clipboard(&self) -> bool {
        let selected_text = self.get_selected_text();
        if !selected_text.is_empty() {
            if let Ok(mut clipboard) = Clipboard::new() {
                clipboard.set_text(&selected_text).is_ok()
            } else {
                false
            }
        } else {
            false
        }
    }
}

impl PaneRenderer for TextPane {
    fn render(&mut self, ctx: &PaneContext, buffer: &mut Buffer) {
        // Use focused border style if focused
        let border_style = if ctx.focused {
            self.focused_border
        } else {
            self.border
        };
        
        // Draw border if not None
        if !matches!(border_style, BorderStyle::None) {
            buffer.draw_box(ctx.rect, border_style);
        }
        
        // Calculate text area (inside border if present)
        let text_rect = border_style.content_rect(ctx.rect);
        
        if text_rect.w == 0 || text_rect.h == 0 {
            return;
        }
        
        // Create viewport for this text area  
        let viewport = ViewportState::new(text_rect.w as usize, text_rect.h as usize);
        let view = TextBufferView::new(&self.buffer, viewport);
        
        // Render text using TextBufferView
        for (display_line_idx, display_line) in view.visible_lines().enumerate() {
            let y = text_rect.y + display_line_idx as u32;
            
            for (col, ch) in display_line.content.chars().enumerate() {
                if col >= text_rect.w as usize {
                    break;
                }
                
                let x = text_rect.x + col as u32;
                let char_pos = self.buffer.line_col_to_char(
                    display_line.logical_line_index,
                    display_line.logical_col_start + col,
                );
                
                // Check if character is selected and pane is focused
                let style = if ctx.focused && self.is_char_selected(char_pos) {
                    // Highlight selected text with reversed colors
                    Style::new()
                        .fg(self.style.bg.unwrap_or(Color::Black))
                        .bg(self.style.fg.unwrap_or(Color::White))
                } else {
                    self.style
                };
                
                buffer.set_char(x as u16, y as u16, ch, style);
            }
        }
    }
    
    fn handle_event(&mut self, ctx: &PaneContext, event: &Event) -> EventResult {
        match event {
            Event::Mouse(mouse) => {
                // Calculate text area bounds
                let text_rect = self.border.content_rect(ctx.rect);
                let mouse_point = Point::from(*mouse);
                
                // Check if mouse is within text area
                if !text_rect.contains(mouse_point) {
                    return EventResult::None;
                }
                
                // Convert to text-area-relative coordinates
                let local_point = mouse_point - text_rect.into();
                
                match mouse.kind {
                    MouseEventKind::Down(MouseButton::Left) => {
                        // Create temporary view to convert display coordinates to buffer position
                        let viewport = ViewportState::new(text_rect.w as usize, text_rect.h as usize);
                        let view = TextBufferView::new(&self.buffer, viewport);
                        
                        if let Some(char_pos) = view.display_to_char(local_point.y() as usize, local_point.x() as usize) {
                            self.start_selection(char_pos);
                        }
                        EventResult::Render
                    }
                    MouseEventKind::Drag(MouseButton::Left) if self.is_selecting => {
                        let viewport = ViewportState::new(text_rect.w as usize, text_rect.h as usize);
                        let view = TextBufferView::new(&self.buffer, viewport);
                        
                        if let Some(char_pos) = view.display_to_char(local_point.y() as usize, local_point.x() as usize) {
                            self.update_selection(char_pos);
                        }
                        EventResult::Render
                    }
                    MouseEventKind::Up(MouseButton::Left) if self.is_selecting => {
                        self.finalize_selection();
                        EventResult::Render
                    }
                    MouseEventKind::DoubleClick(MouseButton::Left) => {
                        // Select word at click position
                        let viewport = ViewportState::new(text_rect.w as usize, text_rect.h as usize);
                        let view = TextBufferView::new(&self.buffer, viewport);
                        
                        if let Some(char_pos) = view.display_to_char(local_point.y() as usize, local_point.x() as usize) {
                            if let Some((start, end)) = self.find_word_at_position(char_pos) {
                                self.selection = Some((start, end));
                                self.is_selecting = false;
                                return EventResult::Render;
                            }
                        }
                        EventResult::None
                    }
                    MouseEventKind::TripleClick(MouseButton::Left) => {
                        // Select entire line
                        let viewport = ViewportState::new(text_rect.w as usize, text_rect.h as usize);
                        let view = TextBufferView::new(&self.buffer, viewport);
                        
                        if let Some(char_pos) = view.display_to_char(local_point.y() as usize, local_point.x() as usize) {
                            let (line, _) = self.buffer.char_to_line_col(char_pos);
                            let line_start = self.buffer.line_to_char(line);
                            let line_end = self.buffer.line_end_char(line);
                            self.selection = Some((line_start, line_end));
                            self.is_selecting = false;
                            return EventResult::Render;
                        }
                        EventResult::None
                    }
                    _ => EventResult::None,
                }
            }
            Event::Key(key) => {
                // Handle copy command: Ctrl+C (Windows/Linux) or Cmd+C (macOS)
                let is_copy_command = key.code == KeyCode::Char('c') && 
                    (key.modifiers.ctrl || key.modifiers.alt) && 
                    self.has_selection();
                
                if is_copy_command {
                    if self.copy_to_clipboard() {
                        EventResult::None
                    } else {
                        EventResult::None
                    }
                } else {
                    EventResult::None
                }
            }
            Event::Focus { focused } => {
                if !focused {
                    // Clear selection when losing focus
                    self.clear_selection();
                }
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
    fn test_text_pane_creation() {
        let pane = TextPane::new("Hello World");
        assert_eq!(pane.text(), "Hello World");
        assert!(!pane.has_selection());
    }
    
    #[test]
    fn test_word_finding() {
        let pane = TextPane::new("Hello world! This is a test.");
        
        // Test finding word "Hello" (position 2 is inside "Hello")
        let word = pane.find_word_at_position(2);
        assert_eq!(word, Some((0, 5)));
        
        // Test finding word "world" (position 8 is inside "world")
        let word = pane.find_word_at_position(8);
        assert_eq!(word, Some((6, 11)));
        
        // Test clicking on non-word character (space) - should return None
        let word = pane.find_word_at_position(5);
        assert_eq!(word, None);
        
        // Test clicking on punctuation
        let word = pane.find_word_at_position(11);
        assert_eq!(word, None);
    }
    
    #[test]
    fn test_is_word_char() {
        assert!(TextPane::is_word_char('a'));
        assert!(TextPane::is_word_char('Z'));
        assert!(TextPane::is_word_char('5'));
        assert!(TextPane::is_word_char('_'));
        
        assert!(!TextPane::is_word_char(' '));
        assert!(!TextPane::is_word_char('!'));
        assert!(!TextPane::is_word_char('.'));
        assert!(!TextPane::is_word_char('-'));
    }

    #[test]
    fn test_word_selection_with_underscores() {
        let pane = TextPane::new("my_variable_name = 42");
        
        // Test selecting the entire variable name with underscores
        let word = pane.find_word_at_position(8);
        assert_eq!(word, Some((0, 16)));
    }

    #[test]
    fn test_selection_operations() {
        let mut pane = TextPane::new("Hello World");
        
        // Test selection
        pane.selection = Some((0, 5));
        assert!(pane.has_selection());
        assert_eq!(pane.get_selected_text(), "Hello");
        
        // Test char selection
        assert!(pane.is_char_selected(0));
        assert!(pane.is_char_selected(4));
        assert!(!pane.is_char_selected(5));
        assert!(!pane.is_char_selected(6));
        
        // Test clear selection
        pane.clear_selection();
        assert!(!pane.has_selection());
        assert_eq!(pane.get_selected_text(), "");
    }
    
    #[test]
    fn test_multiline_text() {
        let pane = TextPane::new("Line 1\nLine 2\nLine 3");
        assert_eq!(pane.text(), "Line 1\nLine 2\nLine 3");
        
        // Test line-based operations work with buffer
        assert_eq!(pane.buffer.line_count(), 3);
        assert_eq!(pane.buffer.line_len(0), 6); // "Line 1"
        assert_eq!(pane.buffer.line_len(1), 6); // "Line 2"  
        assert_eq!(pane.buffer.line_len(2), 6); // "Line 3"
    }
}