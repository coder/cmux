mod tui;

use clap::{Parser, ValueEnum};
use tui::buffer::Buffer;
use tui::layout::{Child, LayoutNode, Rect, Size, SplitDir};
use tui::render::{TextRenderer, RenderContext};
use tui::screen::Screen;
use tui::style::{Style, Color};

#[derive(Debug, Clone, Copy, ValueEnum)]
enum Direction {
    Horizontal,
    Vertical,
}

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(short, long, value_enum, default_value = "horizontal")]
    direction: Direction,

    #[arg(short, long, default_value_t = 2)]
    gutter: u32,

    /// Run in demo mode (don't use alternate screen)
    #[arg(short = 'D', long)]
    demo: bool,
}

fn main() {
    let args = Args::parse();

    let dir = match args.direction {
        Direction::Horizontal => SplitDir::Horizontal,
        Direction::Vertical => SplitDir::Vertical,
    };

    let layout = LayoutNode::Split {
        dir,
        gutter: args.gutter,
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
                node: Box::new(LayoutNode::Pane { 
                    id: 2,
                    renderer: Box::new(
                        TextRenderer::new("Pane 2: Right/Bottom\nWeight 2 (twice as large as Pane 1)")
                            .with_style(Style::new().fg(Color::Blue))
                    ),
                }),
                size: Size {
                    weight: 2,
                    min_cells: Some(5),
                    max_cells: None,
                },
            },
        ],
    };

    if args.demo {
        // Demo mode - print to stdout without alternate screen
        demo_mode(layout, dir, args.gutter);
    } else {
        // Full TUI mode with alternate screen
        let mut screen = Screen::new(layout);
        if let Err(e) = screen.run() {
            eprintln!("Error running screen: {}", e);
            std::process::exit(1);
        }
    }
}

fn demo_mode(layout: LayoutNode, dir: SplitDir, gutter: u32) {
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

    // Render with the new rendering system
    println!("Rendered output:");
    let mut buffer = Buffer::new(width, height);
    let mut render_ctx = RenderContext::new();
    render_ctx.set_focused(1, true); // Focus the middle pane
    
    let mut layout_mut = layout;
    render_ctx.render(&mut layout_mut, &mut buffer);
    
    // Print the buffer
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