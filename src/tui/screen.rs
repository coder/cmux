//! Terminal screen management.

use std::io::{self, Write};
use crossterm::{
    cursor,
    event::{self, Event, KeyCode},
    execute,
    terminal::{self, EnterAlternateScreen, LeaveAlternateScreen},
};

use super::ansi::AnsiBuilder;
use super::buffer::Buffer;
use super::layout::LayoutNode;
use super::render::RenderContext;

/// A terminal screen that manages the alternate screen buffer and rendering.
pub struct Screen {
    /// The layout to render.
    pub layout: LayoutNode,
    /// The render context for managing pane rendering.
    render_context: RenderContext,
    /// Buffer for double-buffering.
    buffer: Buffer,
    /// Whether the alternate screen is active.
    active: bool,
}

impl Screen {
    /// Create a new screen with the given layout.
    pub fn new(layout: LayoutNode) -> Self {
        let (width, height) = terminal::size().unwrap_or((80, 24));
        Self {
            layout,
            render_context: RenderContext::new(),
            buffer: Buffer::new(width, height),
            active: false,
        }
    }
    
    /// Enter the alternate screen and set up the terminal.
    pub fn setup(&mut self) -> io::Result<()> {
        if self.active {
            return Ok(());
        }
        
        // Enter alternate screen
        execute!(
            io::stdout(),
            EnterAlternateScreen,
            cursor::Hide,
            terminal::Clear(terminal::ClearType::All)
        )?;
        
        // Enable raw mode for input handling
        terminal::enable_raw_mode()?;
        
        self.active = true;
        
        // Update buffer size to match terminal
        self.resize()?;
        
        Ok(())
    }
    
    /// Leave the alternate screen and restore the terminal.
    pub fn teardown(&mut self) -> io::Result<()> {
        if !self.active {
            return Ok(());
        }
        
        // Disable raw mode
        terminal::disable_raw_mode()?;
        
        // Leave alternate screen
        execute!(
            io::stdout(),
            cursor::Show,
            LeaveAlternateScreen
        )?;
        
        self.active = false;
        Ok(())
    }
    
    /// Resize the buffer to match the current terminal size.
    pub fn resize(&mut self) -> io::Result<()> {
        let (width, height) = terminal::size()?;
        self.buffer = Buffer::new(width, height);
        Ok(())
    }
    
    /// Render the layout to the terminal.
    pub fn render(&mut self) -> io::Result<()> {
        // Clear the buffer
        self.buffer.clear();
        
        // Render the layout to the buffer
        self.render_context.render(&mut self.layout, &mut self.buffer);
        
        // Draw the buffer to the terminal
        self.draw_to_terminal()?;
        
        Ok(())
    }
    
    /// Draw the buffer contents to the terminal.
    fn draw_to_terminal(&self) -> io::Result<()> {
        // Build entire output in a single string to minimize syscalls
        let capacity = (self.buffer.width * self.buffer.height * 4) as usize;
        let mut builder = AnsiBuilder::new(capacity);
        
        // Move cursor to top-left
        builder.cursor_to(1, 1);
        
        let mut last_style = None;
        
        for y in 0..self.buffer.height {
            if y > 0 {
                // Move to next line (more efficient than newline which might trigger scrolling)
                builder.cursor_to(1, y + 1);
            }
            
            for x in 0..self.buffer.width {
                if let Some(cell) = self.buffer.get(x, y) {
                    // Apply style changes if needed
                    if last_style != Some(&cell.style) {
                        // Reset all attributes
                        builder.reset();
                        
                        // Apply foreground color
                        if let Some(fg) = cell.style.fg {
                            builder.fg_color(fg);
                        }
                        
                        // Apply background color
                        if let Some(bg) = cell.style.bg {
                            builder.bg_color(bg);
                        }
                        
                        // Apply modifiers if any
                        if cell.style.modifiers.bits != 0 {
                            builder.modifiers(cell.style.modifiers);
                        }
                        
                        last_style = Some(&cell.style);
                    }
                    
                    builder.push(cell.ch);
                }
            }
        }
        
        // Reset styles at the end
        builder.reset();
        
        let output = builder.build();
        
        // Single write syscall for the entire frame
        io::stdout().write_all(output.as_bytes())?;
        io::stdout().flush()?;
        
        Ok(())
    }
    
    /// Handle terminal events.
    pub fn handle_event(&mut self) -> io::Result<bool> {
        if event::poll(std::time::Duration::from_millis(100))? {
            match event::read()? {
                Event::Key(key_event) => {
                    // Check for quit keys
                    if key_event.code == KeyCode::Char('q') || key_event.code == KeyCode::Esc {
                        return Ok(false); // Signal to quit
                    }
                }
                Event::Resize(width, height) => {
                    self.buffer = Buffer::new(width, height);
                    self.render()?;
                }
                _ => {}
            }
        }
        Ok(true) // Continue running
    }
    
    /// Run the screen in a loop until quit.
    pub fn run(&mut self) -> io::Result<()> {
        self.setup()?;
        
        // Initial render
        self.render()?;
        
        // Event loop
        loop {
            if !self.handle_event()? {
                break;
            }
        }
        
        self.teardown()?;
        Ok(())
    }
}

impl Drop for Screen {
    fn drop(&mut self) {
        // Ensure we clean up the terminal on drop
        let _ = self.teardown();
    }
}