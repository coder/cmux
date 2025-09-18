//! Border styling for terminal UI components.

use std::fmt;
use super::layout::Rect;

/// Characters used for drawing box borders.
#[derive(Debug, Clone, Copy)]
pub struct BorderChars {
    pub top_left: char,
    pub top_right: char,
    pub bottom_left: char,
    pub bottom_right: char,
    pub horizontal: char,
    pub vertical: char,
}

/// Border style presets.
#[derive(Debug, Clone, Copy)]
pub enum BorderStyle {
    None,
    Single,
    Double,
    Rounded,
    Thick,
}

impl BorderStyle {
    /// Get the characters for this border style.
    pub fn chars(&self) -> BorderChars {
        match self {
            BorderStyle::None => BorderChars {
                top_left: ' ',
                top_right: ' ',
                bottom_left: ' ',
                bottom_right: ' ',
                horizontal: ' ',
                vertical: ' ',
            },
            BorderStyle::Single => BorderChars {
                top_left: '┌',
                top_right: '┐',
                bottom_left: '└',
                bottom_right: '┘',
                horizontal: '─',
                vertical: '│',
            },
            BorderStyle::Double => BorderChars {
                top_left: '╔',
                top_right: '╗',
                bottom_left: '╚',
                bottom_right: '╝',
                horizontal: '═',
                vertical: '║',
            },
            BorderStyle::Rounded => BorderChars {
                top_left: '╭',
                top_right: '╮',
                bottom_left: '╰',
                bottom_right: '╯',
                horizontal: '─',
                vertical: '│',
            },
            BorderStyle::Thick => BorderChars {
                top_left: '┏',
                top_right: '┓',
                bottom_left: '┗',
                bottom_right: '┛',
                horizontal: '━',
                vertical: '┃',
            },
        }
    }

    /// Calculate the content area inside this border style.
    pub fn content_rect(&self, outer: Rect) -> Rect {
        match self {
            BorderStyle::None => outer,
            _ => Rect {
                x: outer.x + 1,
                y: outer.y + 1,
                w: outer.w.saturating_sub(2),
                h: outer.h.saturating_sub(2),
            },
        }
    }
}

impl fmt::Display for BorderStyle {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BorderStyle::None => write!(f, "None"),
            BorderStyle::Single => write!(f, "Single"),
            BorderStyle::Double => write!(f, "Double"),
            BorderStyle::Rounded => write!(f, "Rounded"),
            BorderStyle::Thick => write!(f, "Thick"),
        }
    }
}