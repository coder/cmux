<!-- Keep this file in sync with:
     - src/components/VimTextArea.tsx (implementation)
     - src/utils/vim.ts (core logic)
     - src/utils/vim.test.ts (test suite)
-->

# Vim Mode

cmux includes a built-in Vim mode for the chat input, providing familiar Vim-style editing for power users.

## Enabling Vim Mode

Vim mode is always enabled. Press **ESC** to enter normal mode from insert mode.

## Modes

### Insert Mode (Default)
- This is the default mode when typing in the chat input
- Type normally, all characters are inserted
- Press **ESC** or **Ctrl-[** to enter normal mode

### Normal Mode
- Command mode for navigation and editing
- Indicated by "NORMAL" text above the input
- Pending commands are shown (e.g., "NORMAL d" when delete is pending)
- Press **i**, **a**, **I**, **A**, **o**, or **O** to return to insert mode

## Navigation

### Basic Movement
- **h** - Move left one character
- **j** - Move down one line
- **k** - Move up one line
- **l** - Move right one character

### Word Movement
- **w** - Move forward to start of next word
- **W** - Move forward to start of next WORD (whitespace-separated)
- **b** - Move backward to start of previous word
- **B** - Move backward to start of previous WORD
- **e** - Move to end of word (not yet implemented)

### Line Movement
- **0** - Move to beginning of line
- **$** - Move to end of line
- **Home** - Same as **0**
- **End** - Same as **$**

### Column Preservation
When moving up/down with **j**/**k**, the cursor attempts to stay in the same column position. If a line is shorter, the cursor moves to the end of that line, but will return to the original column on longer lines.

## Entering Insert Mode

- **i** - Insert at cursor
- **a** - Append after cursor
- **I** - Insert at beginning of line
- **A** - Append at end of line
- **o** - Open new line below and insert
- **O** - Open new line above and insert

## Editing Commands

### Simple Edits
- **x** - Delete character under cursor
- **p** - Paste after cursor
- **P** - Paste before cursor

### Undo/Redo
- **u** - Undo last change
- **Ctrl-r** - Redo

### Line Operations
- **dd** - Delete line (yank to clipboard)
- **yy** - Yank (copy) line
- **cc** - Change line (delete and enter insert mode)

## Operators + Motions

Vim's power comes from combining operators with motions. All operators work with all motions:

### Operators
- **d** - Delete
- **c** - Change (delete and enter insert mode)
- **y** - Yank (copy)

### Motions
- **w** - To next word
- **b** - To previous word
- **$** - To end of line
- **0** - To beginning of line

### Examples
- **dw** - Delete to next word
- **d$** - Delete to end of line
- **cw** - Change to next word
- **c0** - Change to beginning of line
- **y$** - Yank to end of line
- **yy** - Yank line (doubled operator)

### Shortcuts
- **D** - Same as **d$** (delete to end of line)
- **C** - Same as **c$** (change to end of line)

## Text Objects

Text objects let you operate on semantic units:

### Inner Word (iw)
- **diw** - Delete inner word (word under cursor)
- **ciw** - Change inner word
- **yiw** - Yank inner word

Text objects work from anywhere within the word - you don't need to be at the start.

## Visual Feedback

### Cursor
- **Insert mode**: Thin blinking cursor
- **Normal mode**: Solid block cursor (no blinking)
- The cursor is always visible, even on empty text

### Mode Indicator
- Shows current mode above the input
- Shows pending commands (e.g., "NORMAL d" when waiting for motion)
- Fixed height to prevent layout shifts

## Keybind Conflicts

### ESC Key
ESC is used for:
1. Exiting Vim normal mode (highest priority)
2. NOT used for canceling edits (use **Ctrl-Q** instead)
3. NOT used for interrupting streams (use **Ctrl-C** instead)

### Other Keybinds
When command palette or other popups are open, Vim mode automatically defers to them for navigation keys like Tab, Arrow keys, etc.

## Tips

1. **Learn operators + motions**: Instead of memorizing every command, learn the operators (d, c, y) and motions (w, b, $, 0). They combine naturally.

2. **Use text objects**: `ciw` to change a word is more reliable than `cw` because it works from anywhere in the word.

3. **Visual feedback**: Watch the mode indicator - it shows you exactly what command is being composed.

4. **Column preservation**: When navigating up/down, your column position is preserved across lines of different lengths.

## Not Yet Implemented

Features that may be added in the future:
- **e**, **ge** - End of word motions
- **f{char}**, **t{char}** - Find character motions
- **i"**, **i'**, **i(**, **i[**, **i{** - More text objects
- **2w**, **3dd**, **5x** - Count prefixes
- **Visual mode** - Character, line, and block selection
- **Macros** - Recording and replaying command sequences
- **Marks** - Named cursor positions
