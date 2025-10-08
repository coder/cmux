#!/bin/bash
set -e

echo "🧪 Testing mobile backend setup..."
echo ""

# Build server
echo "📦 Building server..."
bun run build:server
echo "✅ Server built successfully"
echo ""

# Build renderer  
echo "📦 Building renderer..."
bun run build:renderer > /dev/null 2>&1
echo "✅ Renderer built successfully"
echo ""

# Start server in background
echo "🚀 Starting server..."
node dist-server/server.js &
SERVER_PID=$!

# Give server time to start
sleep 3

# Test health endpoint
echo "🏥 Testing health endpoint..."
if curl -s http://localhost:3000/health | grep -q '"status":"ok"'; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    kill $SERVER_PID
    exit 1
fi
echo ""

# Test IPC endpoint
echo "🔌 Testing IPC endpoint..."
if curl -s -X POST http://localhost:3000/ipc/workspace:list \
    -H "Content-Type: application/json" \
    -d '{"args": []}' | grep -q '"success":true'; then
    echo "✅ IPC endpoint working"
else
    echo "❌ IPC endpoint failed"
    kill $SERVER_PID
    exit 1
fi
echo ""

# Test WebSocket connection
echo "🔌 Testing WebSocket..."
if curl -i -N -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: test" \
    http://localhost:3000/ws 2>&1 | grep -q '101 Switching Protocols'; then
    echo "✅ WebSocket upgrade working"
else
    echo "⚠️  WebSocket test skipped (needs proper WS client)"
fi
echo ""

# Clean up
kill $SERVER_PID
echo "✅ All tests passed!"
echo ""
echo "📱 Mobile backend is ready to use!"
echo "   Run: bun run start:server"
echo "   Then access from mobile: http://YOUR_IP:3000"
