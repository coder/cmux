#!/bin/bash

echo "Testing mouse focus with different positions..."
echo ""

# Test pane 0 (left)
echo "=== Mouse in Pane 0 (left) ==="
cargo run -- test-layout --demo 2>&1 | grep -E "Simulated|^┏|^┃|^┗" | head -5

# Modify test_layout.rs temporarily for pane 1
sed -i.bak 's/let mouse_x = 10;  \/\/ Well within pane 0/let mouse_x = 25;  \/\/ Well within pane 1/' src/test_layout.rs
sed -i.bak 's/should focus Pane 0/should focus Pane 1/' src/test_layout.rs

echo ""
echo "=== Mouse in Pane 1 (middle) ==="
cargo run -- test-layout --demo 2>&1 | grep -E "Simulated|^│|^└" | head -5

# Restore
mv src/test_layout.rs.bak src/test_layout.rs

echo ""
echo "Done. Thick borders (━┃┏┗┓┛) indicate focused pane."