#!/bin/bash

echo "Testing cmux TUI with alternate screen..."
echo "The screen should clear and show 4 panes (one is nested)."
echo "Press 'q' or ESC to exit."
echo ""
echo "Starting in 3 seconds..."
sleep 3

cargo run --quiet -- test-layout

echo ""
echo "Test complete. You should be back at the original terminal."