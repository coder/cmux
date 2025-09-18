//! Text pane with mouse-based text selection support.

use super::buffer::Buffer;
use super::render::{PaneRenderer, PaneContext, Event, EventResult, MouseEventKind, MouseButton, KeyCode};
use super::style::{Style, Color};
use super::border::BorderStyle;
use arboard::Clipboard;

/// A text pane that supports mouse-based text selection.
pub struct TextPane {
    /// The text content to display.
    pub text: String,
    /// Base text style.
    pub style: Style,
    /// Border style when not focused.
    pub border: BorderStyle,
    /// Border style when focused.
    pub focused_border: BorderStyle,
    
    // Selection state
    selection_start: Option<(u16, u16)>,  // (col, row) within pane content area
    selection_end: Option<(u16, u16)>,
    is_selecting: bool,
    selected_text: String,
    
    // Cached text layout
    wrapped_lines: Vec<String>,
    line_starts: Vec<usize>,  // Character index where each line starts in original text
}

impl TextPane {
    /// Create a new text pane with the given text.
    pub fn new(text: impl Into<String>) -> Self {
        let text = text.into();
        let mut pane = Self {
            text: text.clone(),
            style: Style::default(),
            border: BorderStyle::Single,
            focused_border: BorderStyle::Thick,
            selection_start: None,
            selection_end: None,
            is_selecting: false,
            selected_text: String::new(),
            wrapped_lines: Vec::new(),
            line_starts: Vec::new(),
        };
        pane.update_wrapped_lines(&text, 80); // Default width, will be updated on render
        pane
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
    
    /// Update the wrapped lines cache based on available width.
    fn update_wrapped_lines(&mut self, text: &str, width: u16) {
        self.wrapped_lines.clear();
        self.line_starts.clear();
        
        if width == 0 {
            return;
        }
        
        let mut char_index = 0;
        for line in text.lines() {
            if line.is_empty() {
                self.wrapped_lines.push(String::new());
                self.line_starts.push(char_index);
                char_index += 1; // Account for newline
                continue;
            }
            
            let mut current_line = String::new();
            let mut current_width = 0;
            let line_start = char_index;
            
            for word in line.split_whitespace() {
                let word_len = word.len() as u16;
                
                if current_width > 0 && current_width + word_len + 1 > width {
                    // Word doesn't fit, start new line
                    self.wrapped_lines.push(current_line.clone());
                    self.line_starts.push(line_start + current_line.len() - current_line.matches(' ').count());
                    current_line.clear();
                    current_width = 0;
                }
                
                if current_width > 0 {
                    current_line.push(' ');
                    current_width += 1;
                }
                
                current_line.push_str(word);
                current_width += word_len;
            }
            
            if !current_line.is_empty() {
                self.wrapped_lines.push(current_line);
                self.line_starts.push(line_start);
            }
            
            char_index += line.len() + 1; // +1 for newline
        }
    }
    
    /// Convert pane-relative coordinates to text character position.
    fn coords_to_text_pos(&self, x: u16, y: u16) -> Option<usize> {
        let line_idx = y as usize;
        if line_idx >= self.wrapped_lines.len() {
            return None;
        }
        
        let col_idx = x as usize;
        let line = &self.wrapped_lines[line_idx];
        if col_idx > line.len() {
            return None;
        }
        
        Some(self.line_starts[line_idx] + col_idx.min(line.len()))
    }
    
    /// Start a new selection at the given position.
    fn start_selection(&mut self, x: u16, y: u16) {
        self.selection_start = Some((x, y));
        self.selection_end = Some((x, y));
        self.is_selecting = true;
        self.selected_text.clear();
    }
    
    /// Update the selection end point.
    fn update_selection(&mut self, x: u16, y: u16) {
        if self.is_selecting {
            self.selection_end = Some((x, y));
            self.update_selected_text();
        }
    }
    
    /// Finalize the current selection.
    fn finalize_selection(&mut self) {
        self.is_selecting = false;
        self.update_selected_text();
    }
    
    /// Clear the selection.
    fn clear_selection(&mut self) {
        self.selection_start = None;
        self.selection_end = None;
        self.is_selecting = false;
        self.selected_text.clear();
    }
    
    /// Update the selected text based on current selection.
    fn update_selected_text(&mut self) {
        self.selected_text.clear();
        
        let (start, end) = match (self.selection_start, self.selection_end) {
            (Some(s), Some(e)) => {
                // Normalize selection (start should be before end)
                if s.1 < e.1 || (s.1 == e.1 && s.0 <= e.0) {
                    (s, e)
                } else {
                    (e, s)
                }
            }
            _ => return,
        };
        
        // Extract text between start and end positions
        for y in start.1..=end.1 {
            let line_idx = y as usize;
            if line_idx >= self.wrapped_lines.len() {
                break;
            }
            
            let line = &self.wrapped_lines[line_idx];
            let start_col = if y == start.1 { start.0 as usize } else { 0 };
            let end_col = if y == end.1 { end.0 as usize } else { line.len() };
            
            if start_col < line.len() {
                self.selected_text.push_str(&line[start_col..end_col.min(line.len())]);
                if y < end.1 {
                    self.selected_text.push('\n');
                }
            }
        }
    }
    
    /// Check if a character at the given position is selected.
    fn is_char_selected(&self, x: u16, y: u16) -> bool {
        let (start, end) = match (self.selection_start, self.selection_end) {
            (Some(s), Some(e)) => {
                // Normalize selection
                if s.1 < e.1 || (s.1 == e.1 && s.0 <= e.0) {
                    (s, e)
                } else {
                    (e, s)
                }
            }
            _ => return false,
        };
        
        if y < start.1 || y > end.1 {
            return false;
        }
        
        if y == start.1 && y == end.1 {
            // Selection on single line
            x >= start.0 && x < end.0
        } else if y == start.1 {
            // First line of selection
            x >= start.0
        } else if y == end.1 {
            // Last line of selection
            x < end.0
        } else {
            // Middle lines are fully selected
            true
        }
    }
    
    /// Get the currently selected text.
    pub fn get_selected_text(&self) -> &str {
        &self.selected_text
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
        
        // Update wrapped lines if width changed
        let text = self.text.clone();
        self.update_wrapped_lines(&text, text_rect.w as u16);
        
        // Render text with selection highlighting
        if text_rect.w > 0 && text_rect.h > 0 {
            for (line_idx, line) in self.wrapped_lines.iter().enumerate() {
                if line_idx >= text_rect.h as usize {
                    break;
                }
                
                let y = text_rect.y + line_idx as u32;
                
                for (col_idx, ch) in line.chars().enumerate() {
                    if col_idx >= text_rect.w as usize {
                        break;
                    }
                    
                    let x = text_rect.x + col_idx as u32;
                    
                    // Check if this character is selected and pane is focused
                    let style = if ctx.focused && self.is_char_selected(col_idx as u16, line_idx as u16) {
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
    }
    
    fn handle_event(&mut self, ctx: &PaneContext, event: &Event) -> EventResult {
        match event {
            Event::Mouse(mouse) => {
                // Calculate text area bounds
                let text_rect = self.border.content_rect(ctx.rect);
                
                // Check if mouse is within text area
                if !text_rect.contains(mouse.x, mouse.y) {
                    return EventResult::None;
                }
                
                // Convert to text-area-relative coordinates
                let local_x = mouse.x - text_rect.x as u16;
                let local_y = mouse.y - text_rect.y as u16;
                
                match mouse.kind {
                    MouseEventKind::Down(MouseButton::Left) => {
                        self.start_selection(local_x, local_y);
                        EventResult::Render
                    }
                    MouseEventKind::Drag(MouseButton::Left) if self.is_selecting => {
                        self.update_selection(local_x, local_y);
                        EventResult::Render
                    }
                    MouseEventKind::Up(MouseButton::Left) if self.is_selecting => {
                        self.finalize_selection();
                        EventResult::Render
                    }
                    _ => EventResult::None,
                }
            }
            Event::Key(key) => {
                // Handle Ctrl+C to copy selected text to clipboard
                if key.code == KeyCode::Char('c') && key.modifiers.ctrl && !self.selected_text.is_empty() {
                    match Clipboard::new().and_then(|mut clipboard| clipboard.set_text(&self.selected_text)) {
                        Ok(()) => {
                            // Successfully copied to clipboard - could add visual feedback here
                            EventResult::None
                        }
                        Err(_) => {
                            // Clipboard operation failed - silently ignore for now
                            EventResult::None
                        }
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