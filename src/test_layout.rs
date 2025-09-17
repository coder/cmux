use crate::tui::buffer::Buffer;
use crate::tui::layout::{Child, LayoutNode, Rect, Size, SplitDir};
use crate::tui::render::RenderContext;
use crate::tui::render_impl::TextRenderer;
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
                        TextRenderer::new("Pane 0: Left/Top\nPress 'q' or ESC to quit")
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
                        TextRenderer::new("Pane 1: Middle\nWeight 1")
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
                                    TextRenderer::new("Pane 2: Top\nNested in vertical split")
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
                                    TextRenderer::new("Pane 3: Bottom\nAlso nested")
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

pub async fn run_test_layout(dir: SplitDir, gutter: u32, demo: bool) -> Result<(), Box<dyn std::error::Error>> {
    let layout = create_test_layout(dir, gutter);

    if demo {
        run_demo_mode(layout, dir, gutter);
    } else {
        let mut screen = Screen::new(layout);
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
    
    let mut layout_mut = layout;
    
    // First render to populate pane_rects
    render_ctx.render(&mut layout_mut, &mut buffer);
    
    // Now simulate mouse position - let's put it in pane 0 (left)
    let mouse_x = 10;  // Well within pane 0 which goes from x=0 to x=18
    let mouse_y = 10;  // Middle of the screen vertically
    render_ctx.set_mouse_position(mouse_x, mouse_y);
    println!("(Simulated mouse at x={}, y={} for demo - should focus Pane 0)", mouse_x, mouse_y);
    
    // Re-render with mouse position
    buffer.clear();
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