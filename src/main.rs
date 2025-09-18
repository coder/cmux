mod tui;
mod test_layout;

use clap::{Parser, Subcommand, ValueEnum};
use tui::layout::SplitDir;

#[derive(Debug, Clone, Copy, ValueEnum)]
enum Direction {
    Horizontal,
    Vertical,
}

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Test the layout engine with a sample layout
    TestLayout {
        #[arg(short, long, value_enum, default_value = "horizontal")]
        direction: Direction,

        #[arg(short, long, default_value_t = 2)]
        gutter: u32,

        /// Run in demo mode (don't use alternate screen)
        #[arg(short = 'D', long)]
        demo: bool,
        
        /// Disable mouse support (keeps terminal text selection working)
        /// When enabled, click-to-focus works but terminal text selection is disabled
        #[arg(long)]
        no_mouse: bool,
    },
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    match args.command {
        Some(Commands::TestLayout { direction, gutter, demo, no_mouse }) => {
            let dir = match direction {
                Direction::Horizontal => SplitDir::Horizontal,
                Direction::Vertical => SplitDir::Vertical,
            };

            if let Err(e) = test_layout::run_test_layout(dir, gutter, demo, !no_mouse).await {
                eprintln!("Error: {}", e);
                std::process::exit(1);
            }
        }
        None => {
            eprintln!("cmux: Terminal multiplexer");
            eprintln!();
            eprintln!("No command specified. Use --help for usage information.");
            eprintln!();
            eprintln!("Available commands:");
            eprintln!("  test-layout    Test the layout engine with a sample layout");
            std::process::exit(1);
        }
    }
}