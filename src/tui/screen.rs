//! Terminal screen management.

use std::io::{self, Write};
use crossterm::{
    cursor,
    execute,
    terminal::{self, EnterAlternateScreen, LeaveAlternateScreen},
};

use super::ansi::AnsiBuilder;
use super::buffer::Buffer;
use super::layout::LayoutNode;
use super::render::{RenderContext, Event as RenderEvent};

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
    /// Whether to capture mouse events.
    capture_mouse: bool,
}

impl Screen {
    /// Create a new screen with the given layout.
    pub fn new(layout: LayoutNode) -> Self {
        let (width, height) = terminal::size().unwrap_or((80, 24));
        let mut render_context = RenderContext::new();
        // Focus the first pane by default (pane 0)
        render_context.set_focused_pane(0);
        Self {
            layout,
            render_context,
            buffer: Buffer::new(width, height),
            active: false,
            capture_mouse: true,  // Default to true for click-based focus
        }
    }
    
    /// Set whether to capture mouse events.
    pub fn set_capture_mouse(&mut self, capture: bool) {
        self.capture_mouse = capture;
    }
    
    /// Enter the alternate screen and set up the terminal.
    pub fn setup(&mut self) -> io::Result<()> {
        if self.active {
            return Ok(());
        }
        
        // Enter alternate screen
        if self.capture_mouse {
            execute!(
                io::stdout(),
                EnterAlternateScreen,
                cursor::Hide,
                terminal::Clear(terminal::ClearType::All),
                crossterm::event::EnableMouseCapture
            )?;
        } else {
            execute!(
                io::stdout(),
                EnterAlternateScreen,
                cursor::Hide,
                terminal::Clear(terminal::ClearType::All)
            )?;
        }
        
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
        if self.capture_mouse {
            execute!(
                io::stdout(),
                crossterm::event::DisableMouseCapture,
                cursor::Show,
                LeaveAlternateScreen
            )?;
        } else {
            execute!(
                io::stdout(),
                cursor::Show,
                LeaveAlternateScreen
            )?;
        }
        
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
    
    
    /// Run the screen in a loop until quit.
    pub async fn run(&mut self) -> io::Result<()> {
        use super::event_loop::{EventLoopHandle, ProcessedEvent};
        
        self.setup()?;
        
        // Send initial focus event to pane 0
        let screen_rect = self.buffer.area();
        let focus_event = RenderEvent::Focus { focused: true };
        self.render_context.forward_event(&mut self.layout, &focus_event, screen_rect);
        
        // Initial render
        self.render()?;
        
        // Start the background event loop
        let mut event_handle = EventLoopHandle::start()?;
        
        // Main event processing loop
        while let Some(processed_event) = event_handle.recv().await {
            match processed_event {
                ProcessedEvent::Quit => {
                    break;
                }
                ProcessedEvent::Animation => {
                    // Forward animation event to all panes
                    let screen_rect = self.buffer.area();
                    let needs_render = self.render_context.forward_event(
                        &mut self.layout, 
                        &RenderEvent::Animation, 
                        screen_rect
                    );
                    
                    // Re-render if any pane requested it
                    if needs_render {
                        self.render()?;
                    }
                }
                ProcessedEvent::Render(render_event) => {
                    let mut needs_render = false;
                    let screen_rect = self.buffer.area();
                    
                    // Handle resize specially to update buffer
                    if let RenderEvent::Resize(width, height) = &render_event {
                        self.buffer = Buffer::new(*width, *height);
                        needs_render = true;
                    }
                    
                    // Forward event to all panes
                    let pane_needs_render = self.render_context.forward_event(
                        &mut self.layout, 
                        &render_event, 
                        screen_rect
                    );
                    
                    needs_render = needs_render || pane_needs_render;
                    
                    // Re-render if any pane requested it
                    if needs_render {
                        self.render()?;
                    }
                }
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

