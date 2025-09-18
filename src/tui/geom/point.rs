//! Point type for coordinate handling.

use std::ops::{Add, Sub};

/// A point representing x,y coordinates in the terminal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Point(pub u16, pub u16);

impl Point {
    /// Create a new point.
    pub fn new(x: u16, y: u16) -> Self {
        Self(x, y)
    }

    /// Get the x coordinate.
    pub fn x(self) -> u16 {
        self.0
    }

    /// Get the y coordinate.
    pub fn y(self) -> u16 {
        self.1
    }
}


impl Add for Point {
    type Output = Point;

    fn add(self, other: Point) -> Point {
        Point(self.0 + other.0, self.1 + other.1)
    }
}

impl Sub for Point {
    type Output = Point;

    fn sub(self, other: Point) -> Point {
        Point(
            self.0.saturating_sub(other.0),
            self.1.saturating_sub(other.1),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_point_creation() {
        let p = Point::new(10, 20);
        assert_eq!(p.x(), 10);
        assert_eq!(p.y(), 20);
    }

    #[test]
    fn test_point_arithmetic() {
        let p1 = Point::new(10, 20);
        let p2 = Point::new(5, 8);
        
        let sum = p1 + p2;
        assert_eq!(sum.x(), 15);
        assert_eq!(sum.y(), 28);
        
        let diff = p1 - p2;
        assert_eq!(diff.x(), 5);
        assert_eq!(diff.y(), 12);
    }

    #[test]
    fn test_point_saturating_sub() {
        let p1 = Point::new(5, 8);
        let p2 = Point::new(10, 20);
        
        let diff = p1 - p2;
        assert_eq!(diff.x(), 0); // saturating_sub prevents underflow
        assert_eq!(diff.y(), 0);
    }
}