# Mobile Backend Setup

This setup allows you to run cmux with the backend on your computer and access the frontend from your iPhone (or any mobile device).

## Architecture

- **Backend**: HTTP/WebSocket server running on your computer
  - Wraps the existing IpcMain service
  - Exposes IPC handlers as HTTP endpoints
  - Broadcasts events via WebSocket

- **Frontend**: Web application that works in any browser
  - Automatically detects if running in Electron or web mode
  - Uses HTTP/WebSocket instead of IPC when in web mode
  - Same UI and functionality as the desktop app

## Setup Instructions

### 1. Build the Application

```bash
# Build both server and renderer
bun run build:server
bun run build:renderer
```

### 2. Start the Server

```bash
bun run start:server
```

The server will start on `http://0.0.0.0:3000` by default.

### 3. Find Your Computer's Local IP

**On macOS/Linux:**
```bash
ifconfig | grep "inet "
# Look for something like: inet 192.168.1.XXX
```

**On Windows:**
```bash
ipconfig
# Look for "IPv4 Address" under your active network adapter
```

### 4. Access from Your iPhone

1. Make sure your iPhone and computer are on the same WiFi network
2. Open Safari on your iPhone
3. Navigate to: `http://YOUR_COMPUTER_IP:3000`
4. The app should load and work just like the desktop version!

## Development Mode

For development with hot reload:

```bash
# Terminal 1: Start the backend with watch mode
bun run dev:server:backend

# Terminal 2: Start the renderer dev server
bun run dev:renderer

# Terminal 3: Start the HTTP/WebSocket server
node dist-server/server.js
```

## Environment Variables

- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 0.0.0.0)

## Architecture Details

### Server (src/server.ts)

- Express server for HTTP endpoints
- WebSocket server for real-time events
- Adapts Electron's `ipcMain` to HTTP/WebSocket
- Serves the built renderer files

### Web API Client (src/server/webApi.ts)

- Replaces Electron IPC with HTTP/WebSocket calls
- Implements the same `IPCApi` interface
- Handles reconnection and subscription management

### API Provider (src/server/apiProvider.ts)

- Detects if running in Electron or web mode
- Injects the appropriate API (Electron IPC or Web API)
- Transparent to the rest of the application

## IPC to HTTP/WebSocket Mapping

- **IPC invoke** → `POST /ipc/<channel>` with JSON body: `{"args": [...]}`
- **IPC send** → WebSocket message: `{"channel": "...", "args": [...]}`
- **IPC on** → WebSocket subscription with message filtering

## Limitations

- File system dialogs (e.g., selecting directories) may not work on mobile
- Some features that rely on native OS integrations may have limited functionality
- The "Open Terminal" feature won't work from mobile devices

## Troubleshooting

### Cannot connect from iPhone

- Verify both devices are on the same WiFi network
- Check if firewall is blocking port 3000
- Try accessing from your computer's browser first: `http://localhost:3000`

### WebSocket connection fails

- Check browser console for errors
- Verify the server is running
- Try restarting the server

### API calls fail

- Check the server logs for errors
- Verify the backend is properly built: `bun run build:server`
- Make sure you have the required environment variables set (e.g., API keys)

## Security Notes

- The server listens on all interfaces (`0.0.0.0`) to allow mobile access
- Consider using HTTPS in production environments
- Add authentication if exposing to untrusted networks
- The current setup is designed for local network use only
