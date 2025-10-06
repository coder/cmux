# Getting Started

## Installation

### Prerequisites

- [Bun](https://bun.sh) - JavaScript runtime and package manager
- Git

### Clone and Install

```bash
git clone https://github.com/ammarbandukwala/cmux.git
cd cmux
bun install
```

## Development

```bash
# Start development server
bun dev

# In another terminal, start Electron
bun start
```

## Building

```bash
# Build the application
bun run build

# Package for distribution
bun run dist:mac  # macOS
bun run dist:linux  # Linux
```

## Configuration

Configuration is stored in `~/.cmux/config.json` and includes:

- Active projects
- Workspace settings
- UI preferences
