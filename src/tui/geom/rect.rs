//! Rectangle type for geometric calculations.

use super::Point;

/// A rectangular area with position and dimensions.
#[derive(Debug, Clone, Copy)]
pub struct Rect {
    /// X coordinate (column)
    pub x: u32,
    /// Y coordinate (row)
    pub y: u32,
    /// Width in cells
    pub w: u32,
    /// Height in cells
    pub h: u32,
}

impl Rect {
    /// Check if the given position is within this rectangle.
    pub fn contains(&self, point: Point) -> bool {
        let x = point.x() as u32;
        let y = point.y() as u32;
        x >= self.x && x < self.x + self.w && y >= self.y && y < self.y + self.h
    }
}

impl From<Rect> for Point {
    fn from(rect: Rect) -> Self {
        Point::new(rect.x as u16, rect.y as u16)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rect_contains() {
        let rect = Rect { x: 10, y: 5, w: 20, h: 15 };
        
        // Inside
        assert!(rect.contains(Point::new(15, 10)));
        assert!(rect.contains(Point::new(10, 5))); // Top-left corner
        assert!(rect.contains(Point::new(29, 19))); // Bottom-right - 1
        
        // Outside
        assert!(!rect.contains(Point::new(9, 10))); // Left of rect
        assert!(!rect.contains(Point::new(30, 10))); // Right of rect
        assert!(!rect.contains(Point::new(15, 4))); // Above rect
        assert!(!rect.contains(Point::new(15, 20))); // Below rect
    }

    #[test]
    fn test_rect_to_point_conversion() {
        let rect = Rect { x: 42, y: 17, w: 100, h: 50 };
        let point = Point::from(rect);
        
        assert_eq!(point.x(), 42);
        assert_eq!(point.y(), 17);
    }
}