//! N-way split layout engine for terminal user interfaces.
//!
//! This module provides a flexible layout system that can split rectangular areas
//! into multiple panes with configurable sizes, weights, and constraints.
//!
//! # Example
//! ```ignore
//! use tui::layout::{LayoutNode, SplitDir, Child, Size, Rect};
//! use tui::text_pane::TextPane;
//! 
//! let layout = LayoutNode::Split {
//!     dir: SplitDir::Horizontal,
//!     gutter: 2,
//!     children: vec![
//!         Child {
//!             node: Box::new(LayoutNode::Pane { 
//!                 id: 0,
//!                 renderer: Box::new(TextPane::new("Hello")),
//!             }),
//!             size: Size {
//!                 weight: 1,
//!                 min_cells: Some(10),
//!                 max_cells: None,
//!             },
//!         },
//!     ],
//! };
//! ```

/// Direction of a split in the layout.
#[derive(Debug, Clone, Copy)]
pub enum SplitDir {
    /// Split horizontally (left-to-right)
    Horizontal,
    /// Split vertically (top-to-bottom)
    Vertical,
}

/// A rectangular area with position and dimensions.
#[derive(Debug, Clone, Copy)]
pub struct Rect {
    /// X coordinate (column)
    pub x: u32,
    /// Y coordinate (row)
    pub y: u32,
    /// Width in cells
    pub w: u32,
    /// Height in cells
    pub h: u32,
}

impl Rect {
    /// Check if the given position is within this rectangle.
    pub fn contains(&self, x: u16, y: u16) -> bool {
        let x = x as u32;
        let y = y as u32;
        x >= self.x && x < self.x + self.w && y >= self.y && y < self.y + self.h
    }
}

/// Size configuration for a child in a split layout.
///
/// The `weight` field determines the relative proportion of space allocated
/// to this child. A weight of 0 means the child will get exactly its min/max
/// constraints. Otherwise, available space is distributed proportionally
/// according to weights.
#[derive(Debug, Clone, Copy)]
pub struct Size {
    /// Relative weight for proportional sizing (0 = fixed size)
    pub weight: u16,
    /// Minimum size in cells along the split axis
    pub min_cells: Option<u16>,
    /// Maximum size in cells along the split axis
    pub max_cells: Option<u16>,
}

/// A child node in a split layout.
pub struct Child {
    /// The nested layout node
    pub node: Box<LayoutNode>,
    /// Size configuration for this child
    pub size: Size,
}

use super::render::PaneRenderer;

/// A layout node that can either be a split container or a leaf pane.
pub enum LayoutNode {
    /// A container that splits its area among children
    Split {
        /// Direction to split
        dir: SplitDir,
        /// Space between children in pixels
        gutter: u32,
        /// Child nodes (must be non-empty)
        children: Vec<Child>,
    },
    /// A leaf node representing a single pane
    Pane {
        /// Identifier for this pane
        id: usize,
        /// Renderer for this pane
        renderer: Box<dyn PaneRenderer>,
    },
}

impl LayoutNode {
    /// Compute the layout and return a list of (pane_id, rect) pairs.
    ///
    /// This recursively walks the layout tree and computes the position and
    /// size of each leaf node (pane) within the given container rectangle.
    pub fn compute(&self, rect: Rect) -> Vec<(usize, Rect)> {
        let mut out = Vec::new();
        self.compute_into(rect, &mut out);
        out
    }

    fn compute_into(&self, rect: Rect, out: &mut Vec<(usize, Rect)>) {
        match self {
            LayoutNode::Pane { id, .. } => {
                out.push((*id, rect));
            }
            LayoutNode::Split { dir, gutter, children } => {
                let n = children.len() as u32;
                let axis_len = match dir {
                    SplitDir::Horizontal => rect.w,
                    SplitDir::Vertical => rect.h,
                };
                let total_gutters = gutter.saturating_mul(n.saturating_sub(1));
                let avail = axis_len.saturating_sub(total_gutters);

                let mut total_weight = 0u32;
                for c in children {
                    total_weight += c.size.weight as u32;
                }
                if total_weight == 0 {
                    total_weight = children.len() as u32;
                }

                let mut sizes: Vec<u32> = Vec::with_capacity(children.len());
                for c in children {
                    let weight = if c.size.weight > 0 {
                        c.size.weight as u32
                    } else {
                        1
                    };
                    let target = (avail as u64 * weight as u64 / total_weight as u64) as u32;
                    let min = c.size.min_cells.unwrap_or(0) as u32;
                    let max = c.size.max_cells.map(|m| m as u32).unwrap_or(u32::MAX);
                    let clamped = target.clamp(min, max);
                    sizes.push(clamped);
                }

                let sum_now: u32 = sizes.iter().sum();
                if sum_now > avail {
                    let mut idxs: Vec<usize> = (0..sizes.len()).collect();
                    idxs.sort_by_key(|&i| std::cmp::Reverse(sizes[i]));
                    let mut over = sum_now - avail;
                    for i in idxs {
                        if over == 0 {
                            break;
                        }
                        let min_i = children[i].size.min_cells.unwrap_or(0) as u32;
                        let take = (sizes[i] - min_i).min(over);
                        sizes[i] -= take;
                        over -= take;
                    }
                } else if sum_now < avail {
                    let idxs: Vec<usize> = (0..sizes.len()).collect();
                    let mut under = avail - sum_now;
                    for i in idxs.iter().copied().cycle() {
                        if under == 0 {
                            break;
                        }
                        let max_i = children[i].size.max_cells.map(|m| m as u32).unwrap_or(u32::MAX);
                        if sizes[i] < max_i {
                            sizes[i] += 1;
                            under -= 1;
                        }
                    }
                }

                let mut cursor = match dir {
                    SplitDir::Horizontal => rect.x,
                    SplitDir::Vertical => rect.y,
                };
                for (i, (c, len)) in children.iter().zip(sizes.into_iter()).enumerate() {
                    let r = match dir {
                        SplitDir::Horizontal => Rect {
                            x: cursor,
                            y: rect.y,
                            w: len,
                            h: rect.h,
                        },
                        SplitDir::Vertical => Rect {
                            x: rect.x,
                            y: cursor,
                            w: rect.w,
                            h: len,
                        },
                    };
                    c.node.compute_into(r, out);
                    cursor = cursor.saturating_add(len);
                    if i + 1 != children.len() {
                        cursor = cursor.saturating_add(*gutter);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::render::NoopRenderer;

    #[test]
    fn test_single_pane() {
        let layout = LayoutNode::Pane { 
            id: 42,
            renderer: Box::new(NoopRenderer),
        };

        let rect = Rect {
            x: 0,
            y: 0,
            w: 100,
            h: 50,
        };

        let panes = layout.compute(rect);
        assert_eq!(panes.len(), 1);
        assert_eq!(panes[0].0, 42);
        assert_eq!(panes[0].1.x, 0);
        assert_eq!(panes[0].1.y, 0);
        assert_eq!(panes[0].1.w, 100);
        assert_eq!(panes[0].1.h, 50);
    }

    #[test]
    fn test_horizontal_split_equal_weights() {
        let layout = LayoutNode::Split {
            dir: SplitDir::Horizontal,
            gutter: 0,
            children: vec![
                Child {
                    node: Box::new(LayoutNode::Pane { 
                        id: 1,
                        renderer: Box::new(NoopRenderer),
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: None,
                        max_cells: None,
                    },
                },
                Child {
                    node: Box::new(LayoutNode::Pane { 
                        id: 2,
                        renderer: Box::new(NoopRenderer),
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: None,
                        max_cells: None,
                    },
                },
            ],
        };

        let rect = Rect {
            x: 0,
            y: 0,
            w: 100,
            h: 50,
        };

        let panes = layout.compute(rect);
        assert_eq!(panes.len(), 2);
        
        assert_eq!(panes[0].0, 1);
        assert_eq!(panes[0].1.x, 0);
        assert_eq!(panes[0].1.w, 50);
        
        assert_eq!(panes[1].0, 2);
        assert_eq!(panes[1].1.x, 50);
        assert_eq!(panes[1].1.w, 50);
    }

    #[test]
    fn test_vertical_split_with_weights() {
        let layout = LayoutNode::Split {
            dir: SplitDir::Vertical,
            gutter: 0,
            children: vec![
                Child {
                    node: Box::new(LayoutNode::Pane { 
                        id: 1,
                        renderer: Box::new(NoopRenderer),
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: None,
                        max_cells: None,
                    },
                },
                Child {
                    node: Box::new(LayoutNode::Pane { 
                        id: 2,
                        renderer: Box::new(NoopRenderer),
                    }),
                    size: Size {
                        weight: 2,
                        min_cells: None,
                        max_cells: None,
                    },
                },
            ],
        };

        let rect = Rect {
            x: 10,
            y: 10,
            w: 90,
            h: 90,
        };

        let panes = layout.compute(rect);
        assert_eq!(panes.len(), 2);
        
        assert_eq!(panes[0].0, 1);
        assert_eq!(panes[0].1.y, 10);
        assert_eq!(panes[0].1.h, 30);
        
        assert_eq!(panes[1].0, 2);
        assert_eq!(panes[1].1.y, 40);
        assert_eq!(panes[1].1.h, 60);
    }

    #[test]
    fn test_gutter() {
        let layout = LayoutNode::Split {
            dir: SplitDir::Horizontal,
            gutter: 10,
            children: vec![
                Child {
                    node: Box::new(LayoutNode::Pane { 
                        id: 1,
                        renderer: Box::new(NoopRenderer),
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: None,
                        max_cells: None,
                    },
                },
                Child {
                    node: Box::new(LayoutNode::Pane { 
                        id: 2,
                        renderer: Box::new(NoopRenderer),
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: None,
                        max_cells: None,
                    },
                },
            ],
        };

        let rect = Rect {
            x: 0,
            y: 0,
            w: 110,
            h: 50,
        };

        let panes = layout.compute(rect);
        assert_eq!(panes.len(), 2);
        
        assert_eq!(panes[0].1.x, 0);
        assert_eq!(panes[0].1.w, 50);
        
        assert_eq!(panes[1].1.x, 60);
        assert_eq!(panes[1].1.w, 50);
    }

    #[test]
    fn test_min_max_constraints() {
        let layout = LayoutNode::Split {
            dir: SplitDir::Horizontal,
            gutter: 0,
            children: vec![
                Child {
                    node: Box::new(LayoutNode::Pane { 
                        id: 1,
                        renderer: Box::new(NoopRenderer),
                    }),
                    size: Size {
                        weight: 0,
                        min_cells: Some(20),
                        max_cells: Some(20),
                    },
                },
                Child {
                    node: Box::new(LayoutNode::Pane { 
                        id: 2,
                        renderer: Box::new(NoopRenderer),
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: Some(10),
                        max_cells: None,
                    },
                },
            ],
        };

        let rect = Rect {
            x: 0,
            y: 0,
            w: 100,
            h: 50,
        };

        let panes = layout.compute(rect);
        assert_eq!(panes.len(), 2);
        
        assert_eq!(panes[0].1.w, 20);
        assert_eq!(panes[1].1.w, 80);
    }

    #[test]
    fn test_nested_splits() {
        let layout = LayoutNode::Split {
            dir: SplitDir::Horizontal,
            gutter: 0,
            children: vec![
                Child {
                    node: Box::new(LayoutNode::Pane { 
                        id: 1,
                        renderer: Box::new(NoopRenderer),
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: None,
                        max_cells: None,
                    },
                },
                Child {
                    node: Box::new(LayoutNode::Split {
                        dir: SplitDir::Vertical,
                        gutter: 0,
                        children: vec![
                            Child {
                                node: Box::new(LayoutNode::Pane { 
                        id: 2,
                        renderer: Box::new(NoopRenderer),
                    }),
                                size: Size {
                                    weight: 1,
                                    min_cells: None,
                                    max_cells: None,
                                },
                            },
                            Child {
                                node: Box::new(LayoutNode::Pane { 
                                    id: 3,
                                    renderer: Box::new(NoopRenderer),
                                }),
                                size: Size {
                                    weight: 1,
                                    min_cells: None,
                                    max_cells: None,
                                },
                            },
                        ],
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: None,
                        max_cells: None,
                    },
                },
            ],
        };

        let rect = Rect {
            x: 0,
            y: 0,
            w: 100,
            h: 100,
        };

        let panes = layout.compute(rect);
        assert_eq!(panes.len(), 3);
        
        assert_eq!(panes[0].0, 1);
        assert_eq!(panes[0].1.w, 50);
        assert_eq!(panes[0].1.h, 100);
        
        assert_eq!(panes[1].0, 2);
        assert_eq!(panes[1].1.x, 50);
        assert_eq!(panes[1].1.h, 50);
        
        assert_eq!(panes[2].0, 3);
        assert_eq!(panes[2].1.x, 50);
        assert_eq!(panes[2].1.y, 50);
        assert_eq!(panes[2].1.h, 50);
    }

    #[test]
    fn test_three_way_split() {
        let layout = LayoutNode::Split {
            dir: SplitDir::Horizontal,
            gutter: 2,
            children: vec![
                Child {
                    node: Box::new(LayoutNode::Pane { 
                        id: 0,
                        renderer: Box::new(NoopRenderer),
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: None,
                        max_cells: None,
                    },
                },
                Child {
                    node: Box::new(LayoutNode::Pane { 
                        id: 1,
                        renderer: Box::new(NoopRenderer),
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: None,
                        max_cells: None,
                    },
                },
                Child {
                    node: Box::new(LayoutNode::Pane { 
                        id: 2,
                        renderer: Box::new(NoopRenderer),
                    }),
                    size: Size {
                        weight: 1,
                        min_cells: None,
                        max_cells: None,
                    },
                },
            ],
        };

        let rect = Rect {
            x: 0,
            y: 0,
            w: 104,
            h: 50,
        };

        let panes = layout.compute(rect);
        assert_eq!(panes.len(), 3);
        
        let total_width: u32 = panes.iter().map(|(_, r)| r.w).sum();
        let total_gutters = 2 * 2;
        assert_eq!(total_width + total_gutters, 104);
    }
}