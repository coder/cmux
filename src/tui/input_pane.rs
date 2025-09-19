//! Input pane reimplemented with TextBuffer/TextBufferView architecture for proper data/view separation.

use super::buffer::Buffer;
use super::render::{PaneRenderer, PaneContext, Event, EventResult, MouseEventKind, MouseButton, KeyCode};
use super::style::{Style, Color};
use super::border::BorderStyle;
use super::geom::Point;
use super::text_buffer::{TextBuffer, TextBufferView, ViewportState};
use arboard::Clipboard;

/// A multi-line input pane using TextBuffer for efficient text storage.
pub struct InputPane {
    /// The underlying text buffer using rope for efficient operations.
    buffer: TextBuffer,
    /// Current cursor position in buffer coordinates (character index).
    cursor_pos: usize,
    /// Base text style.
    pub style: Style,
    /// Border style when not focused.
    pub border: BorderStyle,
    /// Border style when focused.
    pub focused_border: BorderStyle,
    /// Placeholder text shown when empty and not focused.
    placeholder: Option<String>,
    /// Selection range (start, end) in buffer character indices.
    selection: Option<(usize, usize)>,
}

impl InputPane {
    /// Create a new input pane.
    pub fn new() -> Self {
        Self {
            buffer: TextBuffer::new(),
            cursor_pos: 0,
            style: Style::default(),
            border: BorderStyle::Single,
            focused_border: BorderStyle::Thick,
            placeholder: None,
            selection: None,
        }
    }
    
    /// Create a new input pane with initial text.
    pub fn with_text(text: impl Into<String>) -> Self {
        let buffer = TextBuffer::from(text.into());
        let cursor_pos = buffer.len_chars();
        
        Self {
            buffer,
            cursor_pos,
            style: Style::default(),
            border: BorderStyle::Single,
            focused_border: BorderStyle::Thick,
            placeholder: None,
            selection: None,
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
    
    /// Set the placeholder text.
    pub fn with_placeholder(mut self, placeholder: impl Into<String>) -> Self {
        self.placeholder = Some(placeholder.into());
        self
    }
    
    /// Get the current text content.
    pub fn text(&self) -> String {
        self.buffer.to_string()
    }
    
    /// Get the current cursor position as buffer character index.
    pub fn cursor_pos(&self) -> usize {
        self.cursor_pos
    }
    
    /// Get cursor position as (line, column) coordinates.
    pub fn cursor_line_col(&self) -> (usize, usize) {
        self.buffer.char_to_line_col(self.cursor_pos)
    }
    
    /// Move cursor to specific buffer character position.
    fn move_cursor_to(&mut self, pos: usize) {
        self.cursor_pos = pos.min(self.buffer.len_chars());
        self.clear_selection();
        self.reset_cursor_blink();
    }
    
    /// Move cursor to specific line and column.
    fn move_cursor_to_line_col(&mut self, line: usize, col: usize) {
        self.cursor_pos = self.buffer.line_col_to_char(line, col);
        self.clear_selection();
        self.reset_cursor_blink();
    }
    
    /// Move cursor horizontally by delta characters.
    fn move_cursor_horizontal(&mut self, delta: i32, _extend_selection: bool) {
        let new_pos = if delta < 0 {
            self.cursor_pos.saturating_sub((-delta) as usize)
        } else {
            (self.cursor_pos + delta as usize).min(self.buffer.len_chars())
        };
        
        self.cursor_pos = new_pos;
        self.clear_selection();
        self.reset_cursor_blink();
    }
    
    /// Move cursor vertically by delta lines.
    fn move_cursor_vertical(&mut self, delta: i32, _extend_selection: bool) {
        let (current_line, current_col) = self.buffer.char_to_line_col(self.cursor_pos);
        
        let new_line = if delta < 0 {
            current_line.saturating_sub((-delta) as usize)
        } else {
            (current_line + delta as usize).min(self.buffer.line_count().saturating_sub(1))
        };
        
        // Try to preserve column position, but clamp to line length
        self.move_cursor_to_line_col(new_line, current_col);
    }
    
    /// Insert a character at cursor position.
    fn insert_char(&mut self, ch: char) {
        self.delete_selection();
        self.buffer.insert(self.cursor_pos, &ch.to_string());
        self.cursor_pos += 1;
        self.reset_cursor_blink();
    }
    
    /// Insert a newline at cursor position.
    fn insert_newline(&mut self) {
        self.delete_selection();
        self.buffer.insert(self.cursor_pos, "\n");
        self.cursor_pos += 1;
        self.reset_cursor_blink();
    }
    
    /// Delete character before cursor (backspace).
    fn backspace(&mut self) {
        if self.has_selection() {
            self.delete_selection();
        } else if self.cursor_pos > 0 {
            self.buffer.delete(self.cursor_pos - 1..self.cursor_pos);
            self.cursor_pos -= 1;
        }
        self.reset_cursor_blink();
    }
    
    /// Delete word before cursor (alt-backspace).
    fn delete_word_backwards(&mut self) {
        if self.has_selection() {
            self.delete_selection();
            return;
        }
        
        if self.cursor_pos == 0 {
            return;
        }
        
        let text = self.buffer.to_string();
        let mut pos = self.cursor_pos;
        
        // First, skip any trailing whitespace
        while pos > 0 {
            let ch = text.chars().nth(pos - 1);
            if let Some(c) = ch {
                if !c.is_whitespace() {
                    break;
                }
            }
            pos -= 1;
        }
        
        // Then, delete the word itself
        while pos > 0 {
            let ch = text.chars().nth(pos - 1);
            if let Some(c) = ch {
                if c.is_whitespace() {
                    break;
                }
            }
            pos -= 1;
        }
        
        // Delete from pos to cursor_pos
        if pos < self.cursor_pos {
            self.buffer.delete(pos..self.cursor_pos);
            self.cursor_pos = pos;
        }
        self.reset_cursor_blink();
    }
    
    /// Delete character after cursor.
    fn delete(&mut self) {
        if self.has_selection() {
            self.delete_selection();
        } else if self.cursor_pos < self.buffer.len_chars() {
            self.buffer.delete(self.cursor_pos..self.cursor_pos + 1);
        }
        self.reset_cursor_blink();
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
    fn get_selected_text(&self) -> String {
        if let Some((start, end)) = self.get_selection_range() {
            self.buffer.substr(start..end)
        } else {
            String::new()
        }
    }
    
    /// Delete the current selection.
    fn delete_selection(&mut self) {
        if let Some((start, end)) = self.get_selection_range() {
            self.buffer.delete(start..end);
            self.cursor_pos = start;
            self.clear_selection();
        }
    }
    
    /// Clear the current selection.
    fn clear_selection(&mut self) {
        self.selection = None;
    }
    
    /// Select all text in the buffer.
    fn select_all(&mut self) {
        if self.buffer.len_chars() > 0 {
            self.selection = Some((0, self.buffer.len_chars()));
        }
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
    
    /// Paste text from clipboard at cursor position.
    fn paste_from_clipboard(&mut self) -> bool {
        if let Ok(mut clipboard) = Clipboard::new() {
            if let Ok(text) = clipboard.get_text() {
                if !text.is_empty() {
                    self.delete_selection();
                    self.buffer.insert(self.cursor_pos, &text);
                    self.cursor_pos += text.chars().count();
                    return true;
                }
            }
        }
        false
    }
}

impl PaneRenderer for InputPane {
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
        let mut view = TextBufferView::new(&self.buffer, viewport);
        
        // Scroll to keep cursor visible
        view.scroll_to_char(self.cursor_pos);
        
        // Determine what to display
        let display_placeholder = self.buffer.is_empty() && !ctx.focused;
        let placeholder_style = Style::new().fg(Color::White);
        
        if display_placeholder {
            // Show placeholder text
            if let Some(ref placeholder) = self.placeholder {
                let visible_text = if placeholder.len() > text_rect.w as usize {
                    &placeholder[..text_rect.w as usize]
                } else {
                    placeholder
                };
                
                for (i, ch) in visible_text.chars().enumerate() {
                    if i >= text_rect.w as usize {
                        break;
                    }
                    let x = text_rect.x + i as u32;
                    let y = text_rect.y;
                    buffer.set_char(x as u16, y as u16, ch, placeholder_style);
                }
            }
        } else {
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
                    
                    // Check if character is selected
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
            
            // Render cursor if focused
            if ctx.focused {
                // For cursor at end of text, we need to handle specially
                let (cursor_line, cursor_col) = self.buffer.char_to_line_col(self.cursor_pos);
                
                // Try to map the cursor position to display coordinates
                // This handles both cursor in text and cursor at end of line
                let viewport = ViewportState::new(text_rect.w as usize, text_rect.h as usize);
                let mut temp_view = TextBufferView::new(&self.buffer, viewport);
                temp_view.scroll_to_char(self.cursor_pos);
                
                // Calculate display position for cursor
                let visible_lines = temp_view.visible_lines().collect::<Vec<_>>();
                for (display_line_idx, display_line) in visible_lines.iter().enumerate() {
                    if display_line.logical_line_index == cursor_line {
                        // Check if cursor is within this display line's range
                        let line_start_col = display_line.logical_col_start;
                        let line_end_col = line_start_col + display_line.content.len();
                        
                        if cursor_col >= line_start_col && cursor_col <= line_end_col {
                            let display_col = cursor_col - line_start_col;
                            let cursor_x = text_rect.x + display_col as u32;
                            let cursor_y = text_rect.y + display_line_idx as u32;
                            
                            // Determine cursor character and style based on position
                            let (cursor_char, cursor_style) = if cursor_col < line_end_col {
                                // Cursor is over existing text - show reversed character
                                let ch = display_line.content.chars().nth(display_col).unwrap_or(' ');
                                (ch, Style::new()
                                    .fg(self.style.bg.unwrap_or(Color::Black))
                                    .bg(self.style.fg.unwrap_or(Color::White)))
                            } else {
                                // Cursor is at end of line - show solid box
                                ('█', self.style)
                            };
                            
                            buffer.set_char(cursor_x as u16, cursor_y as u16, cursor_char, cursor_style);
                            break;
                        }
                    }
                }
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
                        let mut view = TextBufferView::new(&self.buffer, viewport);
                        view.scroll_to_char(self.cursor_pos);
                        
                        if let Some(char_pos) = view.display_to_char(local_point.y() as usize, local_point.x() as usize) {
                            self.move_cursor_to(char_pos);
                        }
                        EventResult::Render
                    }
                    _ => EventResult::None,
                }
            }
            Event::Key(key) => {
                let shift_pressed = key.modifiers.shift;
                let ctrl_pressed = key.modifiers.ctrl;
                let alt_pressed = key.modifiers.alt;
                
                match key.code {
                    KeyCode::Char(ch) => {
                        // Handle special key combinations
                        if ctrl_pressed || alt_pressed {
                            match ch {
                                'c' if !self.get_selected_text().is_empty() => {
                                    // Copy selected text
                                    self.copy_to_clipboard();
                                    EventResult::None
                                }
                                'v' => {
                                    // Paste from clipboard
                                    if self.paste_from_clipboard() {
                                        EventResult::Render
                                    } else {
                                        EventResult::None
                                    }
                                }
                                'a' => {
                                    // Select all
                                    self.select_all();
                                    EventResult::Render
                                }
                                'x' if !self.get_selected_text().is_empty() => {
                                    // Cut selected text
                                    if self.copy_to_clipboard() {
                                        self.delete_selection();
                                        return EventResult::Render;
                                    }
                                    EventResult::None
                                }
                                _ => {
                                    // Regular character input with ctrl/alt - ignore
                                    EventResult::None
                                }
                            }
                        } else {
                            // Regular character input
                            self.insert_char(ch);
                            EventResult::Render
                        }
                    }
                    KeyCode::Enter => {
                        // Insert newline
                        self.insert_newline();
                        EventResult::Render
                    }
                    KeyCode::Left => {
                        self.move_cursor_horizontal(-1, shift_pressed);
                        EventResult::Render
                    }
                    KeyCode::Right => {
                        self.move_cursor_horizontal(1, shift_pressed);
                        EventResult::Render
                    }
                    KeyCode::Up => {
                        self.move_cursor_vertical(-1, shift_pressed);
                        EventResult::Render
                    }
                    KeyCode::Down => {
                        self.move_cursor_vertical(1, shift_pressed);
                        EventResult::Render
                    }
                    KeyCode::Home => {
                        let (line, _) = self.buffer.char_to_line_col(self.cursor_pos);
                        self.move_cursor_to_line_col(line, 0);
                        EventResult::Render
                    }
                    KeyCode::End => {
                        let (line, _) = self.buffer.char_to_line_col(self.cursor_pos);
                        let line_len = self.buffer.line_len(line);
                        self.move_cursor_to_line_col(line, line_len);
                        EventResult::Render
                    }
                    KeyCode::Backspace => {
                        if alt_pressed {
                            // Alt+Backspace: delete word backwards
                            self.delete_word_backwards();
                        } else {
                            self.backspace();
                        }
                        EventResult::Render
                    }
                    KeyCode::Delete => {
                        self.delete();
                        EventResult::Render
                    }
                    _ => EventResult::None,
                }
            }
            Event::Focus { focused } => {
                if !focused {
                    // Clear selection when losing focus
                    self.clear_selection();
                }
                EventResult::Render
            }
            Event::Animation => {
                // No longer need to handle animation for cursor
                EventResult::None
            }
            _ => EventResult::None,
        }
    }
}

impl InputPane {
    /// Check if a character at the given buffer position is selected.
    fn is_char_selected(&self, char_pos: usize) -> bool {
        if let Some((start, end)) = self.get_selection_range() {
            char_pos >= start && char_pos < end
        } else {
            false
        }
    }
    
    /// Reset cursor (no longer needed for blinking, kept for compatibility).
    fn reset_cursor_blink(&mut self) {
        // No-op now that cursor doesn't blink
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_input_pane_creation() {
        let pane = InputPane::new();
        assert_eq!(pane.text(), "");
        assert_eq!(pane.cursor_pos(), 0);
        
        let pane = InputPane::with_text("Hello\nWorld");
        assert_eq!(pane.text(), "Hello\nWorld");
        assert_eq!(pane.cursor_pos(), 11); // End of text
    }
    
    #[test]
    fn test_cursor_movement() {
        let mut pane = InputPane::with_text("Hello\nWorld");
        
        // Move to specific position
        pane.move_cursor_to(5);
        assert_eq!(pane.cursor_pos(), 5); // End of "Hello"
        
        // Move to line/col
        pane.move_cursor_to_line_col(1, 2);
        assert_eq!(pane.cursor_pos(), 8); // "r" in "World"
    }
    
    #[test]
    fn test_text_insertion() {
        let mut pane = InputPane::with_text("Hello World");
        pane.move_cursor_to(5);
        
        pane.insert_char(',');
        assert_eq!(pane.text(), "Hello, World");
        assert_eq!(pane.cursor_pos(), 6);
    }
    
    #[test]
    fn test_newline_insertion() {
        let mut pane = InputPane::with_text("Hello World");
        pane.move_cursor_to(5);
        
        pane.insert_newline();
        assert_eq!(pane.text(), "Hello\n World");
        assert_eq!(pane.cursor_pos(), 6); // Start of new line
    }
    
    #[test]
    fn test_selection_and_deletion() {
        let mut pane = InputPane::with_text("Hello World");
        
        // Select "World"
        pane.selection = Some((6, 11));
        assert!(pane.has_selection());
        assert_eq!(pane.get_selected_text(), "World");
        
        // Delete selection
        pane.delete_selection();
        assert_eq!(pane.text(), "Hello ");
        assert_eq!(pane.cursor_pos(), 6);
        assert!(!pane.has_selection());
    }
}