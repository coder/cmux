# Quick Start: cmux Web Interface

## What's New

The `web-interface` branch adds full web browser support to cmux. You can now run cmux as:

1. **Desktop App** (Electron) - Original experience, unchanged
2. **Web App** (Browser) - New! Run in any modern browser with multi-user support

Both modes use the same codebase and automatically detect which environment they're running in.

## Try It Now (Development)

### Prerequisites

- Node.js 18+ or Bun
- Git
- API keys for Anthropic and/or OpenAI

### Setup

```bash
# Clone the web-interface branch
git clone -b web-interface https://github.com/coder/cmux.git
cd cmux

# Install dependencies
npm install  # or: bun install

# Set up environment variables
cp .env.example .env
# Edit .env and add your API keys:
# ANTHROPIC_API_KEY=your-key-here
# OPENAI_API_KEY=your-key-here
```

### Running in Web Mode

**Terminal 1 - Start Backend Server:**
```bash
cd server
bun install
bun run dev
```

**Terminal 2 - Start Frontend Dev Server:**
```bash
npm run dev  # or: bun run dev
```

**Access the App:**
Open http://localhost:5173 in your browser

**Default Login:**
- Username: `admin`
- Password: `admin`

### Running in Electron Mode (Desktop)

Nothing changed! Works exactly as before:

```bash
npm run dev  # Starts Electron app
```

## Key Differences: Web vs Desktop

| Feature | Desktop (Electron) | Web (Browser) |
|---------|-------------------|---------------|
| Authentication | None needed | Username/Password |
| File System | Direct access | Server-side only |
| Terminal | Native system terminal | Web terminal (future) |
| Multi-user | Single user | Multiple users |
| Deployment | Download installer | Host on server |
| Updates | Manual download | Always latest |

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Browser/Electron                │
│  ┌───────────────────────────────────────────┐  │
│  │         React Application                 │  │
│  │  (No changes to existing components!)    │  │
│  └───────────────┬───────────────────────────┘  │
│                  │                               │
│                  ├─ Detects Environment          │
│                  │                               │
│          ┌───────┴───────┐                       │
│          │               │                       │
│    ┌─────▼─────┐   ┌────▼─────┐                 │
│    │ Electron  │   │ WebSocket│                 │
│    │    IPC    │   │  Client  │                 │
│    └─────┬─────┘   └────┬─────┘                 │
└──────────┼──────────────┼───────────────────────┘
           │              │
    ┌──────▼──────┐  ┌────▼──────────┐
    │  Electron   │  │   Node.js     │
    │Main Process │  │ Web Server    │
    └─────────────┘  └───┬───────────┘
                         │
                    ┌────▼────────┐
                    │ IPC Handlers│
                    │  (Shared!)  │
                    └─────────────┘
```

The beauty of this architecture:
- **Same IPC handlers** work for both WebSocket and Electron IPC
- **Same React components** work in both modes
- **Zero conditional logic** in application code
- **Environment auto-detection** happens once at startup

## Production Deployment

See [WEB_INTERFACE.md](./WEB_INTERFACE.md) for:
- Docker configuration
- Kubernetes manifests
- nginx reverse proxy setup
- Security best practices
- Environment variables
- Database integration

## Common Tasks

### Create a New User

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "newuser", "password": "securepass123"}'
```

### Check Server Health

```bash
curl http://localhost:3000/health
```

### View WebSocket Connections

Check server logs for:
```
Client connected: user=username, session=session-id
WebSocket closed
```

## Troubleshooting

### "WebSocket connection failed"

1. Make sure backend server is running on port 3000
2. Check browser console for specific error
3. Verify token in localStorage: `localStorage.getItem('cmux_token')`

### "Authentication failed"

1. Clear localStorage: `localStorage.clear()`
2. Refresh page and try logging in again
3. Check server logs for auth errors

### "Stream not updating"

1. Check WebSocket is connected (browser dev tools → Network → WS)
2. Look for subscription messages in WebSocket frames
3. Server logs should show "Client connected"

### Port Already in Use

```bash
# Change backend port
export PORT=3001
cd server && bun run dev

# Change frontend port
export CMUX_VITE_PORT=5174
npm run dev
```

## Development Tips

### Hot Reload

- Frontend: Vite provides instant HMR
- Backend: tsx watch restarts server on changes
- WebSocket: Automatically reconnects after server restart

### Debugging WebSocket

1. Open browser dev tools → Network tab
2. Filter by "WS" (WebSocket)
3. Click on websocket connection
4. View frames being sent/received

### Testing Both Modes

Test in Electron:
```bash
npm run start  # Builds and launches Electron app
```

Test in Web:
```bash
# Terminal 1
cd server && bun run dev

# Terminal 2  
npm run dev

# Open http://localhost:5173
```

## What's Next?

See the [Future Enhancements](./WEB_INTERFACE.md#future-enhancements) section for planned features:

- Database integration
- SSO support
- Team workspaces
- Web-based terminal
- Performance optimizations
- And more!

## Feedback

This is a new feature - please report issues or suggestions!

- GitHub Issues: https://github.com/coder/cmux/issues
- Branch: `web-interface`

## Learn More

Detailed documentation:
- [WEB_INTERFACE.md](./WEB_INTERFACE.md) - Complete technical documentation
- [AGENTS.md](./AGENTS.md) - Development setup
- [README.md](./README.md) - Main project documentation
