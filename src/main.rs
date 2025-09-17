mod tui;

use clap::{Parser, ValueEnum};
use tui::layout::{Child, LayoutNode, Rect, Size, SplitDir};
use tui::render::{TextRenderer, RenderContext, PaneRenderer};
use tui::buffer::Buffer;
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

    #[arg(short, long, default_value_t = 80)]
    width: u32,

    #[arg(short = 'H', long, default_value_t = 24)]
    height: u32,
}

fn main() {
    let args = Args::parse();

    let dir = match args.direction {
        Direction::Horizontal => SplitDir::Horizontal,
        Direction::Vertical => SplitDir::Vertical,
    };

    let mut layout = LayoutNode::Split {
        dir,
        gutter: args.gutter,
        children: vec![
            Child {
                node: Box::new(LayoutNode::Pane { 
                    id: 0,
                    renderer: Box::new(
                        TextRenderer::new("Pane 0: Fixed 20 cols")
                            .with_style(Style::new().fg(Color::Red))
                    ),
                }),
                size: Size {
                    weight: 1,  // Changed to use weight instead of fixed size
                    min_cells: Some(3),
                    max_cells: None,
                },
            },
            Child {
                node: Box::new(LayoutNode::Pane { 
                    id: 1,
                    renderer: Box::new(
                        TextRenderer::new("Pane 1: Weight 1")
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
                        TextRenderer::new("Pane 2: Weight 2 (twice as large as Pane 1)")
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

    let container = Rect {
        x: 0,
        y: 0,
        w: args.width,
        h: args.height,
    };

    println!("Layout configuration:");
    println!("  Direction: {:?}", dir);
    println!("  Container: {}x{}", container.w, container.h);
    println!("  Gutter: {}", args.gutter);
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
    let mut buffer = Buffer::new(args.width as u16, args.height as u16);
    let mut render_ctx = RenderContext::new();
    render_ctx.set_focused(1, true); // Focus the middle pane
    
    render_ctx.render(&mut layout, &mut buffer);
    
    // Print the buffer
    print_buffer(&buffer);
    
    println!();
    print_visual_layout(&panes, container);
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

fn print_visual_layout(panes: &[(usize, Rect)], container: Rect) {
    println!("Visual representation:");
    println!();

    let mut grid: Vec<Vec<char>> = vec![vec![' '; container.w as usize]; container.h as usize];

    for (id, rect) in panes {
        let ch = char::from_digit(*id as u32, 10).unwrap_or('?');

        for y in rect.y..rect.y.saturating_add(rect.h).min(container.h) {
            for x in rect.x..rect.x.saturating_add(rect.w).min(container.w) {
                grid[y as usize][x as usize] = ch;
            }
        }

        for x in rect.x..rect.x.saturating_add(rect.w).min(container.w) {
            if rect.y < container.h {
                grid[rect.y as usize][x as usize] = '─';
            }
            let bottom_y = rect.y.saturating_add(rect.h).saturating_sub(1);
            if bottom_y < container.h {
                grid[bottom_y as usize][x as usize] = '─';
            }
        }

        for y in rect.y..rect.y.saturating_add(rect.h).min(container.h) {
            if rect.x < container.w {
                grid[y as usize][rect.x as usize] = '│';
            }
            let right_x = rect.x.saturating_add(rect.w).saturating_sub(1);
            if right_x < container.w {
                grid[y as usize][right_x as usize] = '│';
            }
        }

        if rect.y < container.h && rect.x < container.w {
            grid[rect.y as usize][rect.x as usize] = '┌';
        }
        let right_x = rect.x.saturating_add(rect.w).saturating_sub(1);
        if rect.y < container.h && right_x < container.w {
            grid[rect.y as usize][right_x as usize] = '┐';
        }
        let bottom_y = rect.y.saturating_add(rect.h).saturating_sub(1);
        if bottom_y < container.h && rect.x < container.w {
            grid[bottom_y as usize][rect.x as usize] = '└';
        }
        if bottom_y < container.h && right_x < container.w {
            grid[bottom_y as usize][right_x as usize] = '┘';
        }
    }

    for row in &grid {
        println!("  {}", row.iter().collect::<String>());
    }
}