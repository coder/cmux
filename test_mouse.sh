#!/bin/bash

echo "Testing cmux mouse-based focus"
echo "================================"
echo ""
echo "When the TUI starts:"
echo "1. Move your mouse over different panes"
echo "2. The pane under the mouse should have a THICK border (━━━)"
echo "3. Other panes should have a THIN border (───)"
echo "4. Press 'q' or ESC to exit"
echo ""
echo "Starting in 3 seconds..."
sleep 3

cargo run --quiet -- test-layout

echo ""
echo "Test complete."