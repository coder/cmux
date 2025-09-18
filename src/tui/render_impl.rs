//! Basic renderer implementations.

use super::buffer::Buffer;
use super::render::{PaneRenderer, PaneContext};

/// A no-op renderer for testing.
pub struct NoopRenderer;

impl PaneRenderer for NoopRenderer {
    fn render(&mut self, _ctx: &PaneContext, _buffer: &mut Buffer) {
        // Do nothing
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::geom::Rect;

    #[test]
    fn test_noop_renderer() {
        let mut renderer = NoopRenderer;
        let mut buffer = Buffer::new(10, 10);
        let ctx = PaneContext {
            id: 0,
            rect: Rect { x: 0, y: 0, w: 10, h: 10 },
            focused: false,
        };
        
        renderer.render(&ctx, &mut buffer);
        // Should complete without error
    }
}