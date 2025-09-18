#!/bin/bash

echo "Testing TextPane mouse selection"
echo "================================"
echo ""
echo "When the TUI starts:"
echo "1. Click and drag within a pane to select text"
echo "2. Selected text will be highlighted with reversed colors"
echo "3. Selection stays within pane boundaries"
echo "4. Hold Shift to use normal terminal text selection"
echo "5. Press 'q' or ESC to exit"
echo ""
echo "Starting in 3 seconds..."
sleep 3

cargo run --quiet -- test-layout

echo ""
echo "Test complete."