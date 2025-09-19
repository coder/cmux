//! Text buffer implementation using rope for efficient text storage and manipulation.

use ropey::{Rope, RopeSlice};
use std::ops::Range;

/// The core text storage using rope data structure for efficient editing operations.
#[derive(Clone, Debug)]
pub struct TextBuffer {
    rope: Rope,
}

impl TextBuffer {
    /// Create a new empty text buffer.
    pub fn new() -> Self {
        Self {
            rope: Rope::new(),
        }
    }
    
    /// Create a text buffer from a string.
    pub fn from_str(text: &str) -> Self {
        Self {
            rope: Rope::from_str(text),
        }
    }
    
    /// Insert text at the specified character position.
    pub fn insert(&mut self, pos: usize, text: &str) {
        if pos <= self.len_chars() {
            self.rope.insert(pos, text);
        }
    }
    
    /// Delete text in the specified character range.
    pub fn delete(&mut self, range: Range<usize>) {
        let end = range.end.min(self.len_chars());
        let start = range.start.min(end);
        if start < end {
            self.rope.remove(start..end);
        }
    }
    
    /// Replace text in the specified character range with new text.
    pub fn replace(&mut self, range: Range<usize>, text: &str) {
        self.delete(range.clone());
        self.insert(range.start, text);
    }
    
    /// Get a slice of the rope for the specified character range.
    pub fn slice(&self, range: Range<usize>) -> RopeSlice {
        let end = range.end.min(self.len_chars());
        let start = range.start.min(end);
        self.rope.slice(start..end)
    }
    
    /// Get the total number of characters in the buffer.
    pub fn len_chars(&self) -> usize {
        self.rope.len_chars()
    }
    
    /// Check if the buffer is empty.
    pub fn is_empty(&self) -> bool {
        self.rope.len_chars() == 0
    }
    
    /// Get the total number of lines in the buffer.
    pub fn line_count(&self) -> usize {
        if self.rope.len_chars() == 0 {
            1 // Empty buffer still has one line
        } else {
            self.rope.len_lines()
        }
    }
    
    /// Get the content of a specific line.
    pub fn line(&self, line_idx: usize) -> Option<RopeSlice> {
        if line_idx < self.line_count() {
            Some(self.rope.line(line_idx))
        } else {
            None
        }
    }
    
    /// Convert line index to character index (start of line).
    pub fn line_to_char(&self, line: usize) -> usize {
        if line == 0 {
            0
        } else if line >= self.line_count() {
            self.len_chars()
        } else {
            self.rope.line_to_char(line)
        }
    }
    
    /// Convert character index to line index.
    pub fn char_to_line(&self, char_idx: usize) -> usize {
        let clamped_idx = char_idx.min(self.len_chars());
        self.rope.char_to_line(clamped_idx)
    }
    
    /// Get the character index of the end of a line (excluding newline).
    pub fn line_end_char(&self, line: usize) -> usize {
        if line >= self.line_count() {
            return self.len_chars();
        }
        
        let line_start = self.line_to_char(line);
        let line_slice = self.rope.line(line);
        let line_len = line_slice.len_chars();
        
        // Subtract 1 if the line ends with a newline (except for the last line)
        if line < self.line_count() - 1 && line_len > 0 {
            line_start + line_len - 1
        } else {
            line_start + line_len
        }
    }
    
    /// Convert (line, column) coordinate to character index.
    pub fn line_col_to_char(&self, line: usize, col: usize) -> usize {
        if line >= self.line_count() {
            return self.len_chars();
        }
        
        let line_start = self.line_to_char(line);
        let line_end = self.line_end_char(line);
        let max_col = line_end - line_start;
        
        line_start + col.min(max_col)
    }
    
    /// Convert character index to (line, column) coordinate.
    pub fn char_to_line_col(&self, char_idx: usize) -> (usize, usize) {
        let clamped_idx = char_idx.min(self.len_chars());
        let line = self.char_to_line(clamped_idx);
        let line_start = self.line_to_char(line);
        let col = clamped_idx - line_start;
        (line, col)
    }
    
    /// Get the length of a specific line in characters (excluding newline).
    pub fn line_len(&self, line: usize) -> usize {
        if let Some(line_slice) = self.line(line) {
            let len = line_slice.len_chars();
            // Subtract 1 if the line ends with a newline (except for the last line)
            if line < self.line_count() - 1 && len > 0 {
                len - 1
            } else {
                len
            }
        } else {
            0
        }
    }
    
    /// Convert the entire buffer to a string.
    pub fn to_string(&self) -> String {
        String::from(&self.rope)
    }
    
    /// Get a string for the specified character range.
    pub fn substr(&self, range: Range<usize>) -> String {
        String::from(self.slice(range))
    }
    
    /// Get the character at the specified position.
    pub fn char_at(&self, pos: usize) -> Option<char> {
        if pos < self.len_chars() {
            Some(self.rope.char(pos))
        } else {
            None
        }
    }
}

impl Default for TextBuffer {
    fn default() -> Self {
        Self::new()
    }
}

impl From<&str> for TextBuffer {
    fn from(text: &str) -> Self {
        Self::from_str(text)
    }
}

impl From<String> for TextBuffer {
    fn from(text: String) -> Self {
        Self::from_str(&text)
    }
}

/// Viewport state for text buffer display.
#[derive(Debug, Clone)]
pub struct ViewportState {
    /// Top visible logical line.
    pub scroll_line: usize,
    /// Left visible column (for no-wrap mode).
    pub scroll_col: usize,
    /// Lines that can be displayed.
    pub visible_height: usize,
    /// Characters per line.
    pub visible_width: usize,
}

impl ViewportState {
    pub fn new(visible_width: usize, visible_height: usize) -> Self {
        Self {
            scroll_line: 0,
            scroll_col: 0,
            visible_height,
            visible_width,
        }
    }
}

/// Text wrapping mode for display.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WrapMode {
    /// Soft wrap at viewport width.
    Wrap,
    /// Allow horizontal scrolling.
    NoWrap,
}

/// A display line that may be wrapped from a logical line.
#[derive(Debug, Clone)]
pub struct DisplayLine {
    /// The content of this display line.
    pub content: String,
    /// Index of the logical line this display line comes from.
    pub logical_line_index: usize,
    /// True if this is a wrapped continuation of a logical line.
    pub is_wrapped: bool,
    /// Column offset within the logical line where this display line starts.
    pub logical_col_start: usize,
}

/// View into a TextBuffer for display purposes.
pub struct TextBufferView<'a> {
    buffer: &'a TextBuffer,
    viewport: ViewportState,
    wrap_mode: WrapMode,
}

impl<'a> TextBufferView<'a> {
    /// Create a new text buffer view.
    pub fn new(buffer: &'a TextBuffer, viewport: ViewportState) -> Self {
        Self {
            buffer,
            viewport,
            wrap_mode: WrapMode::Wrap,
        }
    }
    
    /// Create a new text buffer view with specified wrap mode.
    pub fn with_wrap_mode(buffer: &'a TextBuffer, viewport: ViewportState, wrap_mode: WrapMode) -> Self {
        Self {
            buffer,
            viewport,
            wrap_mode,
        }
    }
    
    /// Get the current viewport state.
    pub fn viewport(&self) -> &ViewportState {
        &self.viewport
    }
    
    /// Update the viewport state.
    pub fn set_viewport(&mut self, viewport: ViewportState) {
        self.viewport = viewport;
    }
    
    /// Get the current wrap mode.
    pub fn wrap_mode(&self) -> WrapMode {
        self.wrap_mode
    }
    
    /// Set the wrap mode.
    pub fn set_wrap_mode(&mut self, wrap_mode: WrapMode) {
        self.wrap_mode = wrap_mode;
    }
    
    /// Get an iterator over the visible display lines.
    pub fn visible_lines(&self) -> impl Iterator<Item = DisplayLine> + '_ {
        VisibleLinesIter::new(self)
    }
    
    /// Convert display coordinates to buffer character position.
    pub fn display_to_char(&self, display_line: usize, display_col: usize) -> Option<usize> {
        let mut current_display_line = 0;
        
        for line in self.visible_lines() {
            if current_display_line == display_line {
                let col_in_line = display_col.min(line.content.len());
                return Some(self.buffer.line_col_to_char(line.logical_line_index, 
                    line.logical_col_start + col_in_line));
            }
            current_display_line += 1;
        }
        
        None
    }
    
    /// Convert buffer character position to display coordinates.
    pub fn char_to_display(&self, char_pos: usize) -> Option<(usize, usize)> {
        let (logical_line, logical_col) = self.buffer.char_to_line_col(char_pos);
        
        let mut current_display_line = 0;
        
        for line in self.visible_lines() {
            if line.logical_line_index == logical_line {
                let line_end = line.logical_col_start + line.content.len();
                if logical_col >= line.logical_col_start && logical_col < line_end {
                    let display_col = logical_col - line.logical_col_start;
                    return Some((current_display_line, display_col));
                }
            }
            current_display_line += 1;
        }
        
        None
    }
    
    /// Scroll the viewport to ensure the given character position is visible.
    pub fn scroll_to_char(&mut self, char_pos: usize) {
        let (line, _col) = self.buffer.char_to_line_col(char_pos);
        
        // Ensure line is visible
        if line < self.viewport.scroll_line {
            self.viewport.scroll_line = line;
        } else if line >= self.viewport.scroll_line + self.viewport.visible_height {
            self.viewport.scroll_line = line.saturating_sub(self.viewport.visible_height - 1);
        }
    }
}

/// Iterator over visible display lines.
struct VisibleLinesIter<'a> {
    view: &'a TextBufferView<'a>,
    current_logical_line: usize,
    current_display_line: usize,
    current_col_offset: usize,
}

impl<'a> VisibleLinesIter<'a> {
    fn new(view: &'a TextBufferView<'a>) -> Self {
        Self {
            view,
            current_logical_line: view.viewport.scroll_line,
            current_display_line: 0,
            current_col_offset: 0,
        }
    }
}

impl<'a> Iterator for VisibleLinesIter<'a> {
    type Item = DisplayLine;
    
    fn next(&mut self) -> Option<Self::Item> {
        // Stop if we've filled all visible lines
        if self.current_display_line >= self.view.viewport.visible_height {
            return None;
        }
        
        // Stop if we've reached the end of the buffer
        if self.current_logical_line >= self.view.buffer.line_count() {
            return None;
        }
        
        let logical_line_content = self.view.buffer.line(self.current_logical_line)?;
        let logical_line_str = String::from(logical_line_content);
        
        // Remove trailing newline for processing
        let line_content = if logical_line_str.ends_with('\n') {
            &logical_line_str[..logical_line_str.len() - 1]
        } else {
            &logical_line_str
        };
        
        match self.view.wrap_mode {
            WrapMode::NoWrap => {
                // No wrapping: just show what fits from scroll_col
                let start_col = self.view.viewport.scroll_col;
                let end_col = (start_col + self.view.viewport.visible_width).min(line_content.len());
                
                let content = if start_col < line_content.len() {
                    line_content[start_col..end_col].to_string()
                } else {
                    String::new()
                };
                
                let display_line = DisplayLine {
                    content,
                    logical_line_index: self.current_logical_line,
                    is_wrapped: false,
                    logical_col_start: start_col,
                };
                
                self.current_logical_line += 1;
                self.current_display_line += 1;
                self.current_col_offset = 0;
                
                Some(display_line)
            }
            WrapMode::Wrap => {
                // Wrapping: break line at viewport width with word boundary preference
                let remaining_content = &line_content[self.current_col_offset..];
                let max_width = self.view.viewport.visible_width;
                
                if remaining_content.is_empty() {
                    // End of this logical line, move to next
                    self.current_logical_line += 1;
                    self.current_col_offset = 0;
                    return self.next();
                }
                
                let take_len = if remaining_content.len() <= max_width {
                    // Entire remaining content fits
                    remaining_content.len()
                } else {
                    // Need to wrap - find best break point
                    let mut break_point = max_width;
                    
                    // Look backwards from max_width for word boundary
                    for i in (0..max_width.min(remaining_content.len())).rev() {
                        if let Some(ch) = remaining_content.chars().nth(i) {
                            if ch.is_whitespace() {
                                break_point = i + 1; // Break after whitespace
                                break;
                            }
                        }
                    }
                    
                    // If no whitespace found and we're not at start of logical line,
                    // try to break at punctuation
                    if break_point == max_width && self.current_col_offset > 0 {
                        for i in (0..max_width.min(remaining_content.len())).rev() {
                            if let Some(ch) = remaining_content.chars().nth(i) {
                                if ch.is_ascii_punctuation() {
                                    break_point = i + 1; // Break after punctuation
                                    break;
                                }
                            }
                        }
                    }
                    
                    break_point.min(remaining_content.len())
                };
                
                let content = remaining_content[..take_len].trim_end().to_string();
                let is_wrapped = self.current_col_offset > 0;
                
                let display_line = DisplayLine {
                    content,
                    logical_line_index: self.current_logical_line,
                    is_wrapped,
                    logical_col_start: self.current_col_offset,
                };
                
                // Advance position, skipping any whitespace we trimmed
                self.current_col_offset += take_len;
                while self.current_col_offset < line_content.len() && 
                      line_content.chars().nth(self.current_col_offset).map_or(false, |c| c.is_whitespace()) {
                    self.current_col_offset += 1;
                }
                
                self.current_display_line += 1;
                
                // If we've consumed the entire logical line, move to the next one
                if self.current_col_offset >= line_content.len() {
                    self.current_logical_line += 1;
                    self.current_col_offset = 0;
                }
                
                Some(display_line)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_buffer() {
        let buffer = TextBuffer::new();
        assert_eq!(buffer.len_chars(), 0);
        assert_eq!(buffer.line_count(), 1);
        assert!(buffer.is_empty());
        assert_eq!(buffer.to_string(), "");
    }
    
    #[test]
    fn test_buffer_from_str() {
        let buffer = TextBuffer::from_str("Hello\nWorld\n");
        assert_eq!(buffer.len_chars(), 12);
        assert_eq!(buffer.line_count(), 3); // Two lines plus empty line at end
        assert_eq!(buffer.to_string(), "Hello\nWorld\n");
    }
    
    #[test]
    fn test_insert_and_delete() {
        let mut buffer = TextBuffer::from_str("Hello World");
        
        // Insert text
        buffer.insert(5, ", Beautiful");
        assert_eq!(buffer.to_string(), "Hello, Beautiful World");
        
        // Delete text
        buffer.delete(5..16);
        assert_eq!(buffer.to_string(), "Hello World");
    }
    
    #[test]
    fn test_line_operations() {
        let buffer = TextBuffer::from_str("Line 1\nLine 2\nLine 3");
        
        assert_eq!(buffer.line_count(), 3);
        assert_eq!(String::from(buffer.line(0).unwrap()), "Line 1\n");
        assert_eq!(String::from(buffer.line(1).unwrap()), "Line 2\n");
        assert_eq!(String::from(buffer.line(2).unwrap()), "Line 3");
        
        assert_eq!(buffer.line_len(0), 6); // "Line 1"
        assert_eq!(buffer.line_len(1), 6); // "Line 2" 
        assert_eq!(buffer.line_len(2), 6); // "Line 3"
    }
    
    #[test]
    fn test_coordinate_conversion() {
        let buffer = TextBuffer::from_str("Hello\nWorld\nTest");
        
        // Test line_to_char
        assert_eq!(buffer.line_to_char(0), 0);  // Start of "Hello"
        assert_eq!(buffer.line_to_char(1), 6);  // Start of "World"
        assert_eq!(buffer.line_to_char(2), 12); // Start of "Test"
        
        // Test char_to_line
        assert_eq!(buffer.char_to_line(0), 0);  // "H" in "Hello"
        assert_eq!(buffer.char_to_line(5), 0);  // "\n" after "Hello"
        assert_eq!(buffer.char_to_line(6), 1);  // "W" in "World"
        assert_eq!(buffer.char_to_line(12), 2); // "T" in "Test"
        
        // Test line_col_to_char
        assert_eq!(buffer.line_col_to_char(0, 0), 0);  // Start of "Hello"
        assert_eq!(buffer.line_col_to_char(0, 5), 5);  // End of "Hello"
        assert_eq!(buffer.line_col_to_char(1, 0), 6);  // Start of "World"
        assert_eq!(buffer.line_col_to_char(2, 4), 16); // End of "Test"
        
        // Test char_to_line_col
        assert_eq!(buffer.char_to_line_col(0), (0, 0));   // "H"
        assert_eq!(buffer.char_to_line_col(5), (0, 5));   // End of "Hello"
        assert_eq!(buffer.char_to_line_col(6), (1, 0));   // "W"
        assert_eq!(buffer.char_to_line_col(16), (2, 4));  // End of "Test"
    }
    
    #[test]
    fn test_replace() {
        let mut buffer = TextBuffer::from_str("Hello World");
        buffer.replace(6..11, "Rust");
        assert_eq!(buffer.to_string(), "Hello Rust");
    }
    
    #[test]
    fn test_slice_and_substr() {
        let buffer = TextBuffer::from_str("Hello World");
        
        let slice = buffer.slice(0..5);
        assert_eq!(String::from(slice), "Hello");
        
        let substr = buffer.substr(6..11);
        assert_eq!(substr, "World");
    }
    
    #[test]
    fn test_char_at() {
        let buffer = TextBuffer::from_str("Hello");
        assert_eq!(buffer.char_at(0), Some('H'));
        assert_eq!(buffer.char_at(4), Some('o'));
        assert_eq!(buffer.char_at(5), None);
    }
    
    #[test]
    fn test_edge_cases() {
        let mut buffer = TextBuffer::new();
        
        // Insert into empty buffer
        buffer.insert(0, "Hello");
        assert_eq!(buffer.to_string(), "Hello");
        
        // Insert at end
        buffer.insert(5, " World");
        assert_eq!(buffer.to_string(), "Hello World");
        
        // Delete beyond bounds (should be safe)
        buffer.delete(100..200);
        assert_eq!(buffer.to_string(), "Hello World");
        
        // Access line beyond bounds
        assert_eq!(buffer.line(100), None);
        assert_eq!(buffer.line_to_char(100), buffer.len_chars());
    }

    #[test]
    fn test_text_buffer_view_basic() {
        let buffer = TextBuffer::from_str("Hello\nWorld\nTest");
        let viewport = ViewportState::new(10, 3);
        let view = TextBufferView::new(&buffer, viewport);
        
        let lines: Vec<DisplayLine> = view.visible_lines().collect();
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0].content, "Hello");
        assert_eq!(lines[1].content, "World");
        assert_eq!(lines[2].content, "Test");
        assert!(!lines[0].is_wrapped);
        assert!(!lines[1].is_wrapped);
        assert!(!lines[2].is_wrapped);
    }
    
    #[test]
    fn test_text_buffer_view_wrapping() {
        let buffer = TextBuffer::from_str("This is a very long line that should wrap");
        let viewport = ViewportState::new(10, 5); // Width of 10, height of 5
        let view = TextBufferView::new(&buffer, viewport);
        
        let lines: Vec<DisplayLine> = view.visible_lines().collect();
        assert!(lines.len() > 1); // Should wrap into multiple lines
        
        // Word-boundary wrapping should break at whitespace and trim trailing spaces
        assert_eq!(lines[0].content, "This is a");  // Trimmed trailing space
        assert_eq!(lines[1].content, "very long");  // Next segment
        assert!(!lines[0].is_wrapped);
        assert!(lines[1].is_wrapped);
        assert_eq!(lines[1].logical_line_index, 0); // Same logical line
    }
    
    #[test]
    fn test_view_coordinate_conversion() {
        let buffer = TextBuffer::from_str("Hello\nWorld");
        let viewport = ViewportState::new(10, 2);
        let view = TextBufferView::new(&buffer, viewport);
        
        // Test char_to_display
        assert_eq!(view.char_to_display(0), Some((0, 0))); // 'H' in "Hello"
        assert_eq!(view.char_to_display(6), Some((1, 0))); // 'W' in "World"
        
        // Test display_to_char
        assert_eq!(view.display_to_char(0, 0), Some(0)); // First char
        assert_eq!(view.display_to_char(1, 0), Some(6)); // 'W' in "World"
    }
    
    #[test]
    fn test_viewport_scrolling() {
        let buffer = TextBuffer::from_str("Line1\nLine2\nLine3\nLine4\nLine5");
        let mut viewport = ViewportState::new(10, 2); // Can show 2 lines
        viewport.scroll_line = 2; // Start from line 3
        
        let view = TextBufferView::new(&buffer, viewport);
        let lines: Vec<DisplayLine> = view.visible_lines().collect();
        
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].content, "Line3");
        assert_eq!(lines[1].content, "Line4");
    }
}