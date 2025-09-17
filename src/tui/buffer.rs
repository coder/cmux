//! Buffer for terminal rendering.

use super::layout::Rect;
use super::style::{Style, BorderStyle};

/// A single cell in the terminal buffer.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Cell {
    pub ch: char,
    pub style: Style,
}

impl Default for Cell {
    fn default() -> Self {
        Cell {
            ch: ' ',
            style: Style::default(),
        }
    }
}

/// A buffer for rendering terminal content.
#[derive(Debug, Clone)]
pub struct Buffer {
    pub cells: Vec<Cell>,
    pub width: u16,
    pub height: u16,
}

impl Buffer {
    /// Create a new buffer with the given dimensions.
    pub fn new(width: u16, height: u16) -> Self {
        Buffer {
            cells: vec![Cell::default(); (width * height) as usize],
            width,
            height,
        }
    }

    /// Get the area of the buffer as a Rect.
    pub fn area(&self) -> Rect {
        Rect {
            x: 0,
            y: 0,
            w: self.width as u32,
            h: self.height as u32,
        }
    }

    /// Get a reference to a cell at the given position.
    pub fn get(&self, x: u16, y: u16) -> Option<&Cell> {
        if x >= self.width || y >= self.height {
            return None;
        }
        let index = (y * self.width + x) as usize;
        self.cells.get(index)
    }
    
    /// Get a mutable reference to a cell at the given position.
    pub fn get_mut(&mut self, x: u16, y: u16) -> Option<&mut Cell> {
        if x >= self.width || y >= self.height {
            return None;
        }
        let index = (y * self.width + x) as usize;
        self.cells.get_mut(index)
    }

    /// Set a character at the given position with a style.
    pub fn set_char(&mut self, x: u16, y: u16, ch: char, style: Style) {
        if let Some(cell) = self.get_mut(x, y) {
            cell.ch = ch;
            cell.style = style;
        }
    }

    /// Set a string at the given position with a style.
    pub fn set_string(&mut self, x: u16, y: u16, text: &str, style: Style) {
        let mut current_x = x;
        for ch in text.chars() {
            if current_x >= self.width {
                break;
            }
            self.set_char(current_x, y, ch, style);
            current_x += 1;
        }
    }

    /// Fill a rectangle with a character and style.
    pub fn fill_rect(&mut self, rect: Rect, ch: char, style: Style) {
        let x_start = rect.x as u16;
        let y_start = rect.y as u16;
        let x_end = (rect.x + rect.w).min(self.width as u32) as u16;
        let y_end = (rect.y + rect.h).min(self.height as u32) as u16;

        for y in y_start..y_end {
            for x in x_start..x_end {
                self.set_char(x, y, ch, style);
            }
        }
    }

    /// Draw a box border around a rectangle.
    pub fn draw_box(&mut self, rect: Rect, border: BorderStyle) {
        if rect.w < 2 || rect.h < 2 {
            return;
        }

        let chars = border.chars();
        let style = Style::default();

        let x = rect.x as u16;
        let y = rect.y as u16;
        let right = (rect.x + rect.w - 1) as u16;
        let bottom = (rect.y + rect.h - 1) as u16;

        // Corners
        self.set_char(x, y, chars.top_left, style);
        self.set_char(right, y, chars.top_right, style);
        self.set_char(x, bottom, chars.bottom_left, style);
        self.set_char(right, bottom, chars.bottom_right, style);

        // Top and bottom borders
        for i in (x + 1)..right {
            self.set_char(i, y, chars.horizontal, style);
            self.set_char(i, bottom, chars.horizontal, style);
        }

        // Left and right borders
        for i in (y + 1)..bottom {
            self.set_char(x, i, chars.vertical, style);
            self.set_char(right, i, chars.vertical, style);
        }
    }

    /// Clear the buffer by filling it with spaces.
    pub fn clear(&mut self) {
        for cell in &mut self.cells {
            *cell = Cell::default();
        }
    }

    /// Clear a rectangular area.
    pub fn clear_rect(&mut self, rect: Rect) {
        self.fill_rect(rect, ' ', Style::default());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_buffer_creation() {
        let buffer = Buffer::new(10, 5);
        assert_eq!(buffer.width, 10);
        assert_eq!(buffer.height, 5);
        assert_eq!(buffer.cells.len(), 50);
    }

    #[test]
    fn test_set_char() {
        let mut buffer = Buffer::new(10, 5);
        buffer.set_char(3, 2, 'X', Style::default());
        
        let cell = buffer.get_mut(3, 2).unwrap();
        assert_eq!(cell.ch, 'X');
    }

    #[test]
    fn test_set_string() {
        let mut buffer = Buffer::new(10, 5);
        buffer.set_string(1, 1, "Hello", Style::default());
        
        assert_eq!(buffer.get_mut(1, 1).unwrap().ch, 'H');
        assert_eq!(buffer.get_mut(2, 1).unwrap().ch, 'e');
        assert_eq!(buffer.get_mut(3, 1).unwrap().ch, 'l');
        assert_eq!(buffer.get_mut(4, 1).unwrap().ch, 'l');
        assert_eq!(buffer.get_mut(5, 1).unwrap().ch, 'o');
    }

    #[test]
    fn test_fill_rect() {
        let mut buffer = Buffer::new(10, 5);
        let rect = Rect { x: 2, y: 1, w: 3, h: 2 };
        buffer.fill_rect(rect, '#', Style::default());
        
        for y in 1..3 {
            for x in 2..5 {
                assert_eq!(buffer.get_mut(x, y).unwrap().ch, '#');
            }
        }
    }
}