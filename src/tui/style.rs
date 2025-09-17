//! Styling and theming for terminal rendering.

use std::fmt;

/// Color representation for terminal output.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Color {
    Reset,
    Black,
    Red,
    Green,
    Yellow,
    Blue,
    Magenta,
    Cyan,
    White,
    BrightBlack,
    BrightRed,
    BrightGreen,
    BrightYellow,
    BrightBlue,
    BrightMagenta,
    BrightCyan,
    BrightWhite,
    Rgb(u8, u8, u8),
    Indexed(u8),
}

/// Text modifiers (bold, italic, underline, etc.).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Modifiers {
    bits: u16,
}

impl Modifiers {
    pub const BOLD: u16 = 1 << 0;
    pub const DIM: u16 = 1 << 1;
    pub const ITALIC: u16 = 1 << 2;
    pub const UNDERLINE: u16 = 1 << 3;
    pub const SLOW_BLINK: u16 = 1 << 4;
    pub const RAPID_BLINK: u16 = 1 << 5;
    pub const REVERSED: u16 = 1 << 6;
    pub const HIDDEN: u16 = 1 << 7;
    pub const CROSSED_OUT: u16 = 1 << 8;

    pub fn new() -> Self {
        Self { bits: 0 }
    }

    pub fn bold(mut self) -> Self {
        self.bits |= Self::BOLD;
        self
    }

    pub fn italic(mut self) -> Self {
        self.bits |= Self::ITALIC;
        self
    }

    pub fn underline(mut self) -> Self {
        self.bits |= Self::UNDERLINE;
        self
    }

    pub fn reversed(mut self) -> Self {
        self.bits |= Self::REVERSED;
        self
    }
}

/// Style for rendering text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Style {
    pub fg: Option<Color>,
    pub bg: Option<Color>,
    pub modifiers: Modifiers,
}

impl Default for Style {
    fn default() -> Self {
        Style {
            fg: None,
            bg: None,
            modifiers: Modifiers::new(),
        }
    }
}

impl Style {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn fg(mut self, color: Color) -> Self {
        self.fg = Some(color);
        self
    }

    pub fn bg(mut self, color: Color) -> Self {
        self.bg = Some(color);
        self
    }

    pub fn bold(mut self) -> Self {
        self.modifiers = self.modifiers.bold();
        self
    }

    pub fn italic(mut self) -> Self {
        self.modifiers = self.modifiers.italic();
        self
    }

    pub fn underline(mut self) -> Self {
        self.modifiers = self.modifiers.underline();
        self
    }

    pub fn reversed(mut self) -> Self {
        self.modifiers = self.modifiers.reversed();
        self
    }
}

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