//! Event loop module for processing terminal events with double-click detection.

use std::io;
use std::collections::HashMap;
use tokio::sync::mpsc;
use tokio::time::{Duration, Instant};
use crossterm::event::{self, Event as CrosstermEvent, KeyEvent, MouseEvent as CrosstermMouseEvent};
use super::render::{Event as RenderEvent, KeyEvent as RenderKeyEvent, MouseEvent, MouseEventKind, MouseButton, KeyCode, KeyModifiers};
use super::geom::Point;

const DOUBLE_CLICK_TIMEOUT: Duration = Duration::from_millis(300);
const MAX_DOUBLE_CLICK_DISTANCE: u16 = 3; // pixels

/// Events that have been processed by the event loop, including double-click detection.
#[derive(Debug, Clone)]
pub enum ProcessedEvent {
    /// A render event to forward to panes
    Render(RenderEvent),
    /// Animation tick for periodic updates (cursor blink, etc.)
    Animation,
    /// Request to quit the application
    Quit,
}

/// Tracks click state for double-click and triple-click detection.
#[derive(Debug, Clone)]
struct ClickState {
    last_click_time: Instant,
    last_click_pos: Point,
    double_click_time: Option<Instant>,
    double_click_pos: Option<Point>,
}

/// Processes raw crossterm events and detects patterns like double-clicks.
pub struct EventProcessor {
    click_states: HashMap<MouseButton, ClickState>,
}

impl EventProcessor {
    pub fn new() -> Self {
        Self {
            click_states: HashMap::new(),
        }
    }

    /// Process a crossterm event into zero or more processed events.
    pub fn process_event(&mut self, event: CrosstermEvent) -> Vec<ProcessedEvent> {
        match event {
            CrosstermEvent::Key(key_event) => {
                // Check for quit keys first
                if key_event.code == crossterm::event::KeyCode::Char('q') 
                    || key_event.code == crossterm::event::KeyCode::Esc {
                    vec![ProcessedEvent::Quit]
                } else {
                    vec![ProcessedEvent::Render(RenderEvent::Key(convert_key_event(key_event)))]
                }
            }
            CrosstermEvent::Mouse(mouse_event) => {
                self.process_mouse_event(mouse_event)
            }
            CrosstermEvent::Resize(width, height) => {
                vec![ProcessedEvent::Render(RenderEvent::Resize(width, height))]
            }
            _ => vec![], // Ignore other events
        }
    }

    fn process_mouse_event(&mut self, event: CrosstermMouseEvent) -> Vec<ProcessedEvent> {
        use crossterm::event::MouseEventKind as CTMouseKind;
        
        let mouse_pos = Point::new(event.column, event.row);
        let now = Instant::now();

        match event.kind {
            CTMouseKind::Down(ct_button) => {
                let button = convert_mouse_button(ct_button);
                let mut events = Vec::new();

                if let Some(click_state) = self.click_states.get(&button) {
                    let time_diff = now.duration_since(click_state.last_click_time);
                    let pos_diff = mouse_pos.distance_to(click_state.last_click_pos);

                    // Check for triple-click first
                    if let (Some(double_time), Some(double_pos)) = (click_state.double_click_time, click_state.double_click_pos) {
                        let triple_time_diff = now.duration_since(double_time);
                        let triple_pos_diff = mouse_pos.distance_to(double_pos);

                        if triple_time_diff <= DOUBLE_CLICK_TIMEOUT && triple_pos_diff <= MAX_DOUBLE_CLICK_DISTANCE {
                            // This is a triple-click
                            events.push(ProcessedEvent::Render(RenderEvent::Mouse(MouseEvent {
                                x: event.column,
                                y: event.row,
                                kind: MouseEventKind::TripleClick(button),
                            })));

                            // Remove click state after triple-click
                            self.click_states.remove(&button);
                            return events;
                        }
                    }

                    // Check for double-click
                    if time_diff <= DOUBLE_CLICK_TIMEOUT && pos_diff <= MAX_DOUBLE_CLICK_DISTANCE {
                        // This is a double-click
                        events.push(ProcessedEvent::Render(RenderEvent::Mouse(MouseEvent {
                            x: event.column,
                            y: event.row,
                            kind: MouseEventKind::DoubleClick(button),
                        })));

                        // Update state to track this double-click for potential triple-click
                        self.click_states.insert(button, ClickState {
                            last_click_time: now,
                            last_click_pos: mouse_pos,
                            double_click_time: Some(now),
                            double_click_pos: Some(mouse_pos),
                        });
                        return events;
                    }
                }

                // Regular click - update state and emit Down event
                self.click_states.insert(button, ClickState {
                    last_click_time: now,
                    last_click_pos: mouse_pos,
                    double_click_time: None,
                    double_click_pos: None,
                });

                events.push(ProcessedEvent::Render(RenderEvent::Mouse(MouseEvent {
                    x: event.column,
                    y: event.row,
                    kind: MouseEventKind::Down(button),
                })));

                events
            }
            CTMouseKind::Up(ct_button) => {
                let button = convert_mouse_button(ct_button);
                vec![ProcessedEvent::Render(RenderEvent::Mouse(MouseEvent {
                    x: event.column,
                    y: event.row,
                    kind: MouseEventKind::Up(button),
                }))]
            }
            CTMouseKind::Drag(ct_button) => {
                let button = convert_mouse_button(ct_button);
                vec![ProcessedEvent::Render(RenderEvent::Mouse(MouseEvent {
                    x: event.column,
                    y: event.row,
                    kind: MouseEventKind::Drag(button),
                }))]
            }
            CTMouseKind::Moved => {
                vec![ProcessedEvent::Render(RenderEvent::Mouse(MouseEvent {
                    x: event.column,
                    y: event.row,
                    kind: MouseEventKind::Moved,
                }))]
            }
            CTMouseKind::ScrollDown => {
                vec![ProcessedEvent::Render(RenderEvent::Mouse(MouseEvent {
                    x: event.column,
                    y: event.row,
                    kind: MouseEventKind::ScrollDown,
                }))]
            }
            CTMouseKind::ScrollUp => {
                vec![ProcessedEvent::Render(RenderEvent::Mouse(MouseEvent {
                    x: event.column,
                    y: event.row,
                    kind: MouseEventKind::ScrollUp,
                }))]
            }
            _ => vec![], // Handle other mouse events if needed
        }
    }

}

/// Handle for managing the background event loop task.
pub struct EventLoopHandle {
    _task_handle: tokio::task::JoinHandle<()>,
    receiver: mpsc::UnboundedReceiver<ProcessedEvent>,
    shutdown_sender: mpsc::UnboundedSender<()>,
}

impl EventLoopHandle {
    /// Start the event loop in a background task.
    pub fn start() -> io::Result<Self> {
        let (sender, receiver) = mpsc::unbounded_channel();
        let (shutdown_sender, mut shutdown_receiver) = mpsc::unbounded_channel();
        
        let task_handle = tokio::task::spawn_blocking(move || {
            let mut processor = EventProcessor::new();
            let mut last_animation = Instant::now();
            const ANIMATION_INTERVAL: Duration = Duration::from_millis(100);
            
            loop {
                // Check for shutdown signal
                if shutdown_receiver.try_recv().is_ok() {
                    break;
                }
                
                // Poll for events with a small timeout
                match event::poll(Duration::from_millis(50)) {
                    Ok(true) => {
                        match event::read() {
                            Ok(event) => {
                                let processed_events = processor.process_event(event);
                                for processed_event in processed_events {
                                    if sender.send(processed_event).is_err() {
                                        // Receiver dropped, time to exit
                                        return;
                                    }
                                }
                            }
                            Err(_) => {
                                // Error reading event, continue
                                continue;
                            }
                        }
                    }
                    Ok(false) => {
                        // No event available, check if we need to send animation tick
                        let now = Instant::now();
                        if now.duration_since(last_animation) >= ANIMATION_INTERVAL {
                            last_animation = now;
                            if sender.send(ProcessedEvent::Animation).is_err() {
                                // Receiver dropped, time to exit
                                return;
                            }
                        }
                    }
                    Err(_) => {
                        // Error polling, continue
                        continue;
                    }
                }
            }
        });

        Ok(Self {
            _task_handle: task_handle,
            receiver,
            shutdown_sender,
        })
    }

    /// Receive the next processed event.
    pub async fn recv(&mut self) -> Option<ProcessedEvent> {
        self.receiver.recv().await
    }
    
    /// Shutdown the event loop.
    pub fn shutdown(&self) {
        let _ = self.shutdown_sender.send(());
    }
}

impl Drop for EventLoopHandle {
    fn drop(&mut self) {
        // Send shutdown signal
        self.shutdown();
        // The task should exit gracefully when it receives the shutdown signal
    }
}

/// Convert crossterm KeyEvent to our KeyEvent
fn convert_key_event(key: KeyEvent) -> RenderKeyEvent {
    use crossterm::event::{KeyCode as CTKeyCode, KeyModifiers as CTKeyModifiers};
    
    RenderKeyEvent {
        code: match key.code {
            CTKeyCode::Char(c) => KeyCode::Char(c),
            CTKeyCode::Enter => KeyCode::Enter,
            CTKeyCode::Tab => KeyCode::Tab,
            CTKeyCode::Backspace => KeyCode::Backspace,
            CTKeyCode::Delete => KeyCode::Delete,
            CTKeyCode::Left => KeyCode::Left,
            CTKeyCode::Right => KeyCode::Right,
            CTKeyCode::Up => KeyCode::Up,
            CTKeyCode::Down => KeyCode::Down,
            CTKeyCode::Home => KeyCode::Home,
            CTKeyCode::End => KeyCode::End,
            CTKeyCode::PageUp => KeyCode::PageUp,
            CTKeyCode::PageDown => KeyCode::PageDown,
            CTKeyCode::F(n) => KeyCode::F(n),
            CTKeyCode::Esc => KeyCode::Esc,
            _ => KeyCode::Char(' '), // Default fallback
        },
        modifiers: KeyModifiers {
            shift: key.modifiers.contains(CTKeyModifiers::SHIFT),
            ctrl: key.modifiers.contains(CTKeyModifiers::CONTROL),
            alt: key.modifiers.contains(CTKeyModifiers::ALT),
        },
    }
}

/// Convert crossterm mouse button to our mouse button
fn convert_mouse_button(btn: crossterm::event::MouseButton) -> MouseButton {
    use crossterm::event::MouseButton as CTMouseButton;
    
    match btn {
        CTMouseButton::Left => MouseButton::Left,
        CTMouseButton::Right => MouseButton::Right,
        CTMouseButton::Middle => MouseButton::Middle,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_processor_quit_detection() {
        let mut processor = EventProcessor::new();
        
        // Test 'q' key
        let q_event = CrosstermEvent::Key(KeyEvent::new(
            crossterm::event::KeyCode::Char('q'),
            crossterm::event::KeyModifiers::NONE,
        ));
        let processed = processor.process_event(q_event);
        assert_eq!(processed.len(), 1);
        matches!(processed[0], ProcessedEvent::Quit);
        
        // Test Esc key  
        let esc_event = CrosstermEvent::Key(KeyEvent::new(
            crossterm::event::KeyCode::Esc,
            crossterm::event::KeyModifiers::NONE,
        ));
        let processed = processor.process_event(esc_event);
        assert_eq!(processed.len(), 1);
        matches!(processed[0], ProcessedEvent::Quit);
    }

    #[test]
    fn test_double_click_detection() {
        let mut processor = EventProcessor::new();
        
        // First click
        let click1 = CrosstermMouseEvent {
            kind: crossterm::event::MouseEventKind::Down(crossterm::event::MouseButton::Left),
            column: 10,
            row: 5,
            modifiers: crossterm::event::KeyModifiers::NONE,
        };
        let processed1 = processor.process_event(CrosstermEvent::Mouse(click1));
        assert_eq!(processed1.len(), 1);
        
        // Verify first click is a Down event
        if let ProcessedEvent::Render(RenderEvent::Mouse(mouse)) = &processed1[0] {
            assert_eq!(mouse.x, 10);
            assert_eq!(mouse.y, 5);
            matches!(mouse.kind, MouseEventKind::Down(MouseButton::Left));
        } else {
            panic!("Expected render mouse event");
        }
        
        // Second click at same location within timeout should trigger double-click
        let click2 = CrosstermMouseEvent {
            kind: crossterm::event::MouseEventKind::Down(crossterm::event::MouseButton::Left),
            column: 10,
            row: 5,
            modifiers: crossterm::event::KeyModifiers::NONE,
        };
        let processed2 = processor.process_event(CrosstermEvent::Mouse(click2));
        assert_eq!(processed2.len(), 1);
        
        // Verify second click triggers double-click
        if let ProcessedEvent::Render(RenderEvent::Mouse(mouse)) = &processed2[0] {
            assert_eq!(mouse.x, 10);
            assert_eq!(mouse.y, 5);
            matches!(mouse.kind, MouseEventKind::DoubleClick(MouseButton::Left));
        } else {
            panic!("Expected render mouse event");
        }
    }

    #[test]
    fn test_double_click_distance_threshold() {
        let mut processor = EventProcessor::new();
        
        // First click
        let click1 = CrosstermMouseEvent {
            kind: crossterm::event::MouseEventKind::Down(crossterm::event::MouseButton::Left),
            column: 10,
            row: 5,
            modifiers: crossterm::event::KeyModifiers::NONE,
        };
        processor.process_event(CrosstermEvent::Mouse(click1));
        
        // Second click too far away (should not trigger double-click)
        let click2 = CrosstermMouseEvent {
            kind: crossterm::event::MouseEventKind::Down(crossterm::event::MouseButton::Left),
            column: 20, // 10 pixels away, exceeds MAX_DOUBLE_CLICK_DISTANCE
            row: 5,
            modifiers: crossterm::event::KeyModifiers::NONE,
        };
        let processed2 = processor.process_event(CrosstermEvent::Mouse(click2));
        
        // Should be regular Down event, not double-click
        if let ProcessedEvent::Render(RenderEvent::Mouse(mouse)) = &processed2[0] {
            matches!(mouse.kind, MouseEventKind::Down(MouseButton::Left));
        } else {
            panic!("Expected render mouse event");
        }
    }

    #[test]
    fn test_different_mouse_buttons_independent() {
        let mut processor = EventProcessor::new();
        
        // Left click
        let left_click = CrosstermMouseEvent {
            kind: crossterm::event::MouseEventKind::Down(crossterm::event::MouseButton::Left),
            column: 10,
            row: 5,
            modifiers: crossterm::event::KeyModifiers::NONE,
        };
        processor.process_event(CrosstermEvent::Mouse(left_click));
        
        // Right click at same location should not trigger double-click
        let right_click = CrosstermMouseEvent {
            kind: crossterm::event::MouseEventKind::Down(crossterm::event::MouseButton::Right),
            column: 10,
            row: 5,
            modifiers: crossterm::event::KeyModifiers::NONE,
        };
        let processed = processor.process_event(CrosstermEvent::Mouse(right_click));
        
        // Should be regular Down event for right button
        if let ProcessedEvent::Render(RenderEvent::Mouse(mouse)) = &processed[0] {
            matches!(mouse.kind, MouseEventKind::Down(MouseButton::Right));
        } else {
            panic!("Expected render mouse event");
        }
    }

    #[test]
    fn test_triple_click_detection() {
        let mut processor = EventProcessor::new();
        
        // First click
        let click1 = CrosstermMouseEvent {
            kind: crossterm::event::MouseEventKind::Down(crossterm::event::MouseButton::Left),
            column: 10,
            row: 5,
            modifiers: crossterm::event::KeyModifiers::NONE,
        };
        let processed1 = processor.process_event(CrosstermEvent::Mouse(click1));
        assert_eq!(processed1.len(), 1);
        
        // Second click triggers double-click
        let click2 = CrosstermMouseEvent {
            kind: crossterm::event::MouseEventKind::Down(crossterm::event::MouseButton::Left),
            column: 10,
            row: 5,
            modifiers: crossterm::event::KeyModifiers::NONE,
        };
        let processed2 = processor.process_event(CrosstermEvent::Mouse(click2));
        assert_eq!(processed2.len(), 1);
        
        // Verify second click triggers double-click
        if let ProcessedEvent::Render(RenderEvent::Mouse(mouse)) = &processed2[0] {
            matches!(mouse.kind, MouseEventKind::DoubleClick(MouseButton::Left));
        } else {
            panic!("Expected double-click event");
        }
        
        // Third click triggers triple-click
        let click3 = CrosstermMouseEvent {
            kind: crossterm::event::MouseEventKind::Down(crossterm::event::MouseButton::Left),
            column: 10,
            row: 5,
            modifiers: crossterm::event::KeyModifiers::NONE,
        };
        let processed3 = processor.process_event(CrosstermEvent::Mouse(click3));
        assert_eq!(processed3.len(), 1);
        
        // Verify third click triggers triple-click
        if let ProcessedEvent::Render(RenderEvent::Mouse(mouse)) = &processed3[0] {
            matches!(mouse.kind, MouseEventKind::TripleClick(MouseButton::Left));
        } else {
            panic!("Expected triple-click event");
        }
    }

}