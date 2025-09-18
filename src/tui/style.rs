//! Styling and theming for terminal rendering.

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
    pub bits: u16,
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

