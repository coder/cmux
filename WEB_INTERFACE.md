# cmux Web Interface

This branch adds production-ready web interface support to cmux, allowing it to run as a standalone web application without Electron.

## Architecture

### Overview

The web interface maintains full compatibility with the existing Electron architecture while adding:

1. **Node.js/Express Server** (`server/`) - Replaces Electron main process
2. **WebSocket Communication** - Replaces IPC with real-time bidirectional messaging
3. **JWT Authentication** - Multi-user support with secure token-based auth
4. **Session Management** - Isolated workspaces per user
5. **Web Client Adapter** (`src/web/`) - Browser-compatible API layer

### Key Components

#### Server (`server/src/`)

- **`index.ts`** - Main server entry point, HTTP + WebSocket setup
- **`websocket.ts`** - WebSocket manager that maps messages to IPC handlers
- **`auth.ts`** - JWT-based authentication with bcrypt password hashing
- **`sessions.ts`** - Session lifecycle management

#### Web Client (`src/web/`)

- **`websocket-client.ts`** - WebSocket adapter that implements `IPCApi` interface
- **`LoginPage.tsx`** - Authentication UI for web browsers
- **`main-web.tsx`** - Entry point that detects Electron vs Web and initializes appropriately

## Running the Web Interface

### Development

```bash
# Terminal 1: Start the web server
cd server
bun install
bun run dev

# Terminal 2: Start Vite dev server (for frontend)
cd ..
npm run dev  # or make dev
```

The application will be available at:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`
- WebSocket: `ws://localhost:3000/ws`

Default credentials in development mode:
- Username: `admin`
- Password: `admin`

### Production

```bash
# Build the frontend
npm run build

# Build and start the server
cd server
bun install --production
bun run build
bun run start
```

The server serves both the API and static frontend files on port 3000.

## Environment Variables

### Server Configuration

```bash
# Server
PORT=3000                    # HTTP server port
HOST=0.0.0.0                 # Server host (0.0.0.0 for external access)
NODE_ENV=production          # Environment mode

# Authentication
JWT_SECRET=your-secret-here  # Secret for signing JWTs (REQUIRED in production)
JWT_EXPIRES_IN=7d            # Token expiration time

# AI Provider Keys (same as Electron version)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

### Frontend Configuration

```bash
# Vite dev server
CMUX_VITE_PORT=5173          # Frontend dev server port
CMUX_VITE_PREVIEW_PORT=4173  # Preview server port
```

## Authentication

### JWT-Based Auth

The web interface uses JSON Web Tokens (JWT) for authentication:

1. User logs in with username/password
2. Server validates credentials and returns JWT
3. Client stores JWT in localStorage
4. WebSocket connection authenticates with JWT via query parameter
5. All subsequent requests include JWT in Authorization header

### User Management

In development, there's a default admin user. In production:

- Users can self-register via `/auth/register`
- User data stored in-memory (replace with database in production)
- Password hashing with bcrypt (10 rounds)

### Production Security Considerations

**CRITICAL: Change these in production:**

1. **JWT_SECRET** - Use a strong, random secret
2. **User Storage** - Replace in-memory Map with a proper database
3. **HTTPS** - Always use HTTPS in production (required for secure WebSocket)
4. **Rate Limiting** - Add rate limiting on auth endpoints
5. **Password Policy** - Enforce strong password requirements

## WebSocket Protocol

### Message Format

```typescript
interface WebSocketMessage {
  id: string;                    // Unique request/response ID
  type: 'request' | 'response' | 'event';
  channel?: string;              // IPC channel name
  args?: unknown[];              // Request arguments
  result?: unknown;              // Response data
  error?: string;                // Error message (if any)
}
```

### Request/Response Flow

```typescript
// Client sends request
{
  id: "req-123",
  type: "request",
  channel: "workspace:create",
  args: ["/path/to/project", "feature-branch", "main"]
}

// Server responds
{
  id: "req-123",
  type: "response",
  result: { workspaceId: "abc123", ... }
}
```

### Event Broadcasting

```typescript
// Server broadcasts chat messages
{
  id: "event-456",
  type: "event",
  channel: "workspace:chat:abc123",
  result: { role: "assistant", content: "...", ... }
}
```

## Compatibility

### Dual Mode Support

The application automatically detects whether it's running in Electron or a web browser:

```typescript
const isElectron = typeof window !== 'undefined' && 'api' in window;

if (isElectron) {
  // Use Electron IPC via preload script
  const api = window.api;
} else {
  // Use WebSocket adapter
  await wsClient.connect(token);
  const api = wsClient.createAPI();
}
```

### API Compatibility

The `WebSocketClient.createAPI()` method returns an object that implements the exact same `IPCApi` interface as the Electron preload script. This means:

- ✅ All existing React components work without modification
- ✅ No conditional code needed in application logic
- ✅ Same developer experience in both modes

### Feature Parity

All core features work in web mode:

- ✅ Project management
- ✅ Workspace creation/deletion/renaming
- ✅ AI agent interactions (streaming, interrupts, resume)
- ✅ Chat history
- ✅ Git operations
- ✅ File operations
- ✅ Bash execution

**Web-specific limitations:**

- ❌ Native file system dialogs (use HTML file input instead)
- ❌ System terminal integration (terminal opened in browser)
- ❌ Window title changes (uses document.title instead)

## Deployment

### Docker

Create a `Dockerfile`:

```dockerfile
FROM oven/bun:1 AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
COPY server/package.json ./server/
RUN bun install --frozen-lockfile
RUN cd server && bun install --frozen-lockfile

# Build frontend
COPY . .
RUN bun run build

# Build server
WORKDIR /app/server
RUN bun run build

# Production image
FROM oven/bun:1-slim
WORKDIR /app

# Copy built assets
COPY --from=base /app/dist ./dist
COPY --from=base /app/server/dist ./server/dist
COPY --from=base /app/server/package.json ./server/
COPY --from=base /app/server/node_modules ./server/node_modules

WORKDIR /app/server

EXPOSE 3000
CMD ["bun", "run", "start"]
```

### Kubernetes

Sample deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cmux-web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cmux-web
  template:
    metadata:
      labels:
        app: cmux-web
    spec:
      containers:
      - name: cmux
        image: your-registry/cmux-web:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: cmux-secrets
              key: jwt-secret
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: cmux-secrets
              key: anthropic-api-key
---
apiVersion: v1
kind: Service
metadata:
  name: cmux-web
spec:
  selector:
    app: cmux-web
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

### Reverse Proxy (nginx)

```nginx
upstream cmux_backend {
    server localhost:3000;
}

server {
    listen 80;
    server_name cmux.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cmux.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # WebSocket support
    location /ws {
        proxy_pass http://cmux_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # API and static files
    location / {
        proxy_pass http://cmux_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Testing

### Manual Testing Checklist

- [ ] Login/Register flow
- [ ] WebSocket connection establishment
- [ ] Create project
- [ ] Create workspace
- [ ] Send message to agent
- [ ] Stream response (check real-time updates)
- [ ] Interrupt stream
- [ ] Resume stream
- [ ] Create multiple workspaces
- [ ] Switch between workspaces
- [ ] Rename workspace
- [ ] Delete workspace
- [ ] Logout and re-login (session persistence)
- [ ] WebSocket reconnection after disconnect
- [ ] Multi-tab support (same user, different tabs)

### Automated Tests

Run existing test suite (should pass for both modes):

```bash
npm run test
npm run test:integration
npm run test:e2e
```

## Performance Considerations

### WebSocket Connection Pooling

The server maintains a pool of WebSocket connections. Consider:

- Max connections per user
- Idle connection timeouts
- Memory usage with many concurrent users

### Session Storage

Current implementation uses in-memory storage. For production:

- Use Redis for session storage
- Implement session cleanup
- Consider session affinity for load balancing

### File System Operations

Git operations and file I/O happen server-side. Consider:

- Concurrent operation limits
- Disk space per user
- Workspace cleanup policies

## Migration from Electron

### For End Users

1. Export any important workspace data
2. Log in to web interface
3. Re-create projects and workspaces
4. Import saved data if needed

Workspace data is isolated by user, so existing Electron workspaces won't automatically appear in the web interface.

### For Developers

No code changes needed! The application detects its environment and uses the appropriate API layer automatically.

## Troubleshooting

### WebSocket Connection Fails

- Check that server is running and accessible
- Verify JWT token is valid (check browser console)
- Check browser console for CORS errors
- Ensure WebSocket endpoint matches server configuration

### Authentication Issues

- Clear localStorage and try again
- Check server logs for auth errors
- Verify JWT_SECRET is set correctly
- Check token expiration time

### Stream Interruptions

- WebSocket connections may drop on network issues
- Client automatically reconnects with exponential backoff
- Streams should resume automatically after reconnection

### Performance Issues

- Check server resources (CPU, memory, disk)
- Monitor WebSocket connection count
- Check for memory leaks in long-running sessions
- Review git repository sizes (large repos slow down operations)

## Future Enhancements

### Planned Features

- [ ] Database integration (PostgreSQL/MySQL)
- [ ] Redis for session storage
- [ ] Rate limiting and abuse prevention
- [ ] User roles and permissions
- [ ] Team workspaces (shared access)
- [ ] Audit logging
- [ ] Metrics and monitoring (Prometheus)
- [ ] Horizontal scaling support
- [ ] SSO integration (OAuth2, SAML)
- [ ] File upload for projects (drag-and-drop)
- [ ] Web-based terminal (xterm.js)

### Performance Optimizations

- [ ] Message compression (WebSocket)
- [ ] Delta streaming for large responses
- [ ] Client-side caching
- [ ] Lazy loading of workspace history
- [ ] Connection pooling for database
- [ ] CDN for static assets

## Contributing

When contributing to the web interface:

1. Maintain API compatibility with Electron version
2. Test in both Electron and Web modes
3. Follow existing code patterns
4. Add tests for new features
5. Update documentation

## License

Same as main cmux project: AGPL-3.0
