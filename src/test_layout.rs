use crate::tui::buffer::Buffer;
use crate::tui::layout::{Child, LayoutNode, Size, SplitDir};
use crate::tui::geom::Rect;
use crate::tui::render::RenderContext;
use crate::tui::text_pane::TextPane;
use crate::tui::screen::Screen;
use crate::tui::style::{Style, Color};

pub fn create_test_layout(dir: SplitDir, gutter: u32) -> LayoutNode {
    LayoutNode::Split {
        dir,
        gutter,
        children: vec![
            Child {
                node: Box::new(LayoutNode::Pane { 
                    id: 0,
                    renderer: Box::new(
                        TextPane::new("Pane 0: Left/Top\n\nClick and drag to select text. Double-click to select words. Triple-click to select lines.\n\nPress Ctrl+C (or Cmd+C on macOS) to copy selected text to clipboard.\n\nPress 'q' or ESC to quit")
                            .with_style(Style::new().fg(Color::Red))
                    ),
                }),
                size: Size {
                    weight: 1,
                    min_cells: Some(3),
                    max_cells: None,
                },
            },
            Child {
                node: Box::new(LayoutNode::Pane { 
                    id: 1,
                    renderer: Box::new(
                        TextPane::new("Pane 1: Middle\n\nEach pane has independent text selection.\n\nTry different click types:\n• Single: character selection\n• Double: word selection  \n• Triple: line selection")
                            .with_style(Style::new().fg(Color::Green))
                    ),
                }),
                size: Size {
                    weight: 1,
                    min_cells: Some(5),
                    max_cells: None,
                },
            },
            Child {
                node: Box::new(LayoutNode::Split {
                    dir: SplitDir::Vertical,
                    gutter: 1,
                    children: vec![
                        Child {
                            node: Box::new(LayoutNode::Pane {
                                id: 2,
                                renderer: Box::new(
                                    TextPane::new("Pane 2: Top (Nested)\n\nEach pane tracks its own selection state independently.")
                                        .with_style(Style::new().fg(Color::Blue))
                                ),
                            }),
                            size: Size {
                                weight: 1,
                                min_cells: Some(3),
                                max_cells: None,
                            },
                        },
                        Child {
                            node: Box::new(LayoutNode::Pane {
                                id: 3,
                                renderer: Box::new(
                                    TextPane::new("Pane 3: Bottom (Nested)\n\nSelection highlighting uses reversed colors for visibility.")
                                        .with_style(Style::new().fg(Color::Magenta))
                                ),
                            }),
                            size: Size {
                                weight: 1,
                                min_cells: Some(3),
                                max_cells: None,
                            },
                        },
                    ],
                }),
                size: Size {
                    weight: 2,
                    min_cells: Some(5),
                    max_cells: None,
                },
            },
        ],
    }
}

pub async fn run_test_layout(dir: SplitDir, gutter: u32, demo: bool, capture_mouse: bool) -> Result<(), Box<dyn std::error::Error>> {
    let layout = create_test_layout(dir, gutter);

    if demo {
        run_demo_mode(layout, dir, gutter);
    } else {
        let mut screen = Screen::new(layout);
        screen.set_capture_mouse(capture_mouse);
        screen.run().await?;
    }
    
    Ok(())
}

fn run_demo_mode(layout: LayoutNode, dir: SplitDir, gutter: u32) {
    let (width, height) = crossterm::terminal::size().unwrap_or((80, 24));
    let container = Rect {
        x: 0,
        y: 0,
        w: width as u32,
        h: height as u32,
    };

    println!("Layout configuration:");
    println!("  Direction: {:?}", dir);
    println!("  Container: {}x{}", container.w, container.h);
    println!("  Gutter: {}", gutter);
    println!();

    let panes = layout.compute(container);

    println!("Computed pane rectangles:");
    for (id, rect) in &panes {
        println!(
            "  Pane {}: x={}, y={}, w={}, h={}",
            id, rect.x, rect.y, rect.w, rect.h
        );
    }
    println!();

    println!("Rendered output:");
    let mut buffer = Buffer::new(width, height);
    let mut render_ctx = RenderContext::new();
    
    // Set focus to pane 0 by default
    render_ctx.set_focused_pane(0);
    println!("(Default focus on Pane 0 - click on other panes to change focus)");
    
    let mut layout_mut = layout;
    render_ctx.render(&mut layout_mut, &mut buffer);
    
    print_buffer(&buffer);
}

fn print_buffer(buffer: &Buffer) {
    for y in 0..buffer.height {
        for x in 0..buffer.width {
            if let Some(cell) = buffer.get(x, y) {
                print!("{}", cell.ch);
            }
        }
        println!();
    }
}