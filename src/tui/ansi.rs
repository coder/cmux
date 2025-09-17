//! ANSI escape code utilities.

use std::fmt::Write;
use super::style::{Color, Modifiers};

/// ANSI escape sequences
pub struct Ansi;

impl Ansi {
    /// CSI (Control Sequence Introducer)
    pub const CSI: &'static str = "\x1b[";
    
    /// Reset all attributes
    pub const RESET: &'static str = "\x1b[0m";
    
    /// Clear screen
    pub const CLEAR: &'static str = "\x1b[2J";
    
    /// Hide cursor
    pub const HIDE_CURSOR: &'static str = "\x1b[?25l";
    
    /// Show cursor
    pub const SHOW_CURSOR: &'static str = "\x1b[?25h";
    
    /// Move cursor to position (1-indexed)
    pub fn cursor_to(x: u16, y: u16) -> String {
        format!("{}{};{}H", Self::CSI, y, x)
    }
    
    /// Move cursor to home (1,1)
    pub fn cursor_home() -> &'static str {
        "\x1b[H"
    }
    
    /// Set foreground color
    pub fn fg_color(color: Color) -> String {
        let mut s = String::new();
        write_color(&mut s, color, true);
        s
    }
    
    /// Set background color
    pub fn bg_color(color: Color) -> String {
        let mut s = String::new();
        write_color(&mut s, color, false);
        s
    }
    
    /// Apply text modifiers
    pub fn modifiers(mods: Modifiers) -> String {
        let mut s = String::new();
        write_modifiers(&mut s, mods);
        s
    }
    
    /// Enter alternate screen
    pub fn enter_alt_screen() -> &'static str {
        "\x1b[?1049h"
    }
    
    /// Leave alternate screen
    pub fn leave_alt_screen() -> &'static str {
        "\x1b[?1049l"
    }
}

/// Write color escape code to a string
pub fn write_color(output: &mut String, color: Color, foreground: bool) {
    let base = if foreground { 30 } else { 40 };
    
    match color {
        Color::Reset => {
            if foreground {
                output.push_str("\x1b[39m");
            } else {
                output.push_str("\x1b[49m");
            }
        }
        Color::Black => write!(output, "{}{}m", Ansi::CSI, base).unwrap(),
        Color::Red => write!(output, "{}{}m", Ansi::CSI, base + 1).unwrap(),
        Color::Green => write!(output, "{}{}m", Ansi::CSI, base + 2).unwrap(),
        Color::Yellow => write!(output, "{}{}m", Ansi::CSI, base + 3).unwrap(),
        Color::Blue => write!(output, "{}{}m", Ansi::CSI, base + 4).unwrap(),
        Color::Magenta => write!(output, "{}{}m", Ansi::CSI, base + 5).unwrap(),
        Color::Cyan => write!(output, "{}{}m", Ansi::CSI, base + 6).unwrap(),
        Color::White => write!(output, "{}{}m", Ansi::CSI, base + 7).unwrap(),
        // Bright colors use 90-97 for foreground, 100-107 for background
        Color::BrightBlack => {
            let code = if foreground { 90 } else { 100 };
            write!(output, "{}{}m", Ansi::CSI, code).unwrap();
        }
        Color::BrightRed => {
            let code = if foreground { 91 } else { 101 };
            write!(output, "{}{}m", Ansi::CSI, code).unwrap();
        }
        Color::BrightGreen => {
            let code = if foreground { 92 } else { 102 };
            write!(output, "{}{}m", Ansi::CSI, code).unwrap();
        }
        Color::BrightYellow => {
            let code = if foreground { 93 } else { 103 };
            write!(output, "{}{}m", Ansi::CSI, code).unwrap();
        }
        Color::BrightBlue => {
            let code = if foreground { 94 } else { 104 };
            write!(output, "{}{}m", Ansi::CSI, code).unwrap();
        }
        Color::BrightMagenta => {
            let code = if foreground { 95 } else { 105 };
            write!(output, "{}{}m", Ansi::CSI, code).unwrap();
        }
        Color::BrightCyan => {
            let code = if foreground { 96 } else { 106 };
            write!(output, "{}{}m", Ansi::CSI, code).unwrap();
        }
        Color::BrightWhite => {
            let code = if foreground { 97 } else { 107 };
            write!(output, "{}{}m", Ansi::CSI, code).unwrap();
        }
        Color::Rgb(r, g, b) => {
            if foreground {
                write!(output, "{}38;2;{};{};{}m", Ansi::CSI, r, g, b).unwrap();
            } else {
                write!(output, "{}48;2;{};{};{}m", Ansi::CSI, r, g, b).unwrap();
            }
        }
        Color::Indexed(idx) => {
            if foreground {
                write!(output, "{}38;5;{}m", Ansi::CSI, idx).unwrap();
            } else {
                write!(output, "{}48;5;{}m", Ansi::CSI, idx).unwrap();
            }
        }
    }
}

/// Write modifier escape codes to a string
pub fn write_modifiers(output: &mut String, mods: Modifiers) {
    if mods.bits & Modifiers::BOLD != 0 {
        write!(output, "{}1m", Ansi::CSI).unwrap();
    }
    if mods.bits & Modifiers::DIM != 0 {
        write!(output, "{}2m", Ansi::CSI).unwrap();
    }
    if mods.bits & Modifiers::ITALIC != 0 {
        write!(output, "{}3m", Ansi::CSI).unwrap();
    }
    if mods.bits & Modifiers::UNDERLINE != 0 {
        write!(output, "{}4m", Ansi::CSI).unwrap();
    }
    if mods.bits & Modifiers::SLOW_BLINK != 0 {
        write!(output, "{}5m", Ansi::CSI).unwrap();
    }
    if mods.bits & Modifiers::RAPID_BLINK != 0 {
        write!(output, "{}6m", Ansi::CSI).unwrap();
    }
    if mods.bits & Modifiers::REVERSED != 0 {
        write!(output, "{}7m", Ansi::CSI).unwrap();
    }
    if mods.bits & Modifiers::HIDDEN != 0 {
        write!(output, "{}8m", Ansi::CSI).unwrap();
    }
    if mods.bits & Modifiers::CROSSED_OUT != 0 {
        write!(output, "{}9m", Ansi::CSI).unwrap();
    }
}

/// Build a complete styled output string efficiently
pub struct AnsiBuilder {
    output: String,
}

impl AnsiBuilder {
    pub fn new(capacity: usize) -> Self {
        Self {
            output: String::with_capacity(capacity),
        }
    }
    
    pub fn cursor_to(&mut self, x: u16, y: u16) -> &mut Self {
        write!(self.output, "{}{};{}H", Ansi::CSI, y, x).unwrap();
        self
    }
    
    pub fn reset(&mut self) -> &mut Self {
        self.output.push_str(Ansi::RESET);
        self
    }
    
    pub fn fg_color(&mut self, color: Color) -> &mut Self {
        write_color(&mut self.output, color, true);
        self
    }
    
    pub fn bg_color(&mut self, color: Color) -> &mut Self {
        write_color(&mut self.output, color, false);
        self
    }
    
    pub fn modifiers(&mut self, mods: Modifiers) -> &mut Self {
        write_modifiers(&mut self.output, mods);
        self
    }
    
    pub fn text(&mut self, text: &str) -> &mut Self {
        self.output.push_str(text);
        self
    }
    
    pub fn push(&mut self, ch: char) -> &mut Self {
        self.output.push(ch);
        self
    }
    
    pub fn build(self) -> String {
        self.output
    }
    
    pub fn as_str(&self) -> &str {
        &self.output
    }
}