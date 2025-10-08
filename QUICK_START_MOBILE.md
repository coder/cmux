# 📱 Quick Start: Using cmux from Your iPhone

## TL;DR

```bash
# On your computer:
bun run build:server && bun run build:renderer
bun run start:server

# On your iPhone:
# Open Safari and go to: http://YOUR_COMPUTER_IP:3000
```

---

## Step-by-Step Guide

### 1️⃣ Install Dependencies (First Time Only)

```bash
cd /path/to/cmux
bun install
```

### 2️⃣ Build the Application

```bash
bun run build:server && bun run build:renderer
```

This takes about 20-30 seconds.

### 3️⃣ Start the Server

```bash
bun run start:server
```

You should see:
```
🚀 cmux server running at http://0.0.0.0:3000

📱 Access from your iPhone:
   1. Make sure your iPhone and computer are on the same WiFi network
   2. Find your computer's local IP address
   3. Open Safari and navigate to: http://YOUR_COMPUTER_IP:3000
```

### 4️⃣ Find Your Computer's IP Address

**macOS:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
# Look for something like: inet 192.168.1.100
```

**Linux:**
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# Look for something like: inet 192.168.1.100
```

**Windows:**
```bash
ipconfig
# Look for "IPv4 Address" under your WiFi adapter
# Something like: 192.168.1.100
```

### 5️⃣ Access from iPhone

1. Make sure your iPhone is on the **same WiFi network** as your computer
2. Open **Safari** on your iPhone
3. Type in the address bar: `http://192.168.1.100:3000` (use your computer's actual IP)
4. Hit Go

🎉 **You're done!** The cmux interface should load in your browser.

---

## Quick Test

Run the automated test script:

```bash
./test-mobile-backend.sh
```

This will:
- Build everything
- Start the server
- Test all endpoints
- Verify everything works

---

## Troubleshooting

### "Cannot connect" error

✅ **Check:** Are both devices on the same WiFi?
✅ **Check:** Is the server actually running?
✅ **Check:** Did you use the correct IP address?
✅ **Try:** Access from your computer first: `http://localhost:3000`

### Firewall blocking connections

**macOS:**
```bash
# Allow incoming connections on port 3000
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add node
```

**Linux (ufw):**
```bash
sudo ufw allow 3000/tcp
```

**Windows:**
- Windows Defender Firewall → Advanced Settings
- Inbound Rules → New Rule
- Port → TCP → 3000
- Allow the connection

### Wrong IP address?

**Quick way to find the right IP:**

```bash
# On macOS/Linux, this usually works:
ifconfig en0 | grep "inet " | awk '{print $2}'
```

Or just Google: "what is my local IP address [your OS]"

---

## Advanced Usage

### Custom Port

```bash
PORT=8080 bun run start:server
# Then access: http://YOUR_IP:8080
```

### Development Mode (Hot Reload)

```bash
# Terminal 1
bun run dev:server:backend

# Terminal 2  
bun run dev:renderer

# Terminal 3
node dist-server/server.js
```

### Environment Variables

Create a `.env` file:
```bash
PORT=3000
HOST=0.0.0.0
ANTHROPIC_API_KEY=your-key-here
```

---

## What Works

✅ Full UI access from mobile
✅ Real-time streaming (WebSocket)
✅ All workspace operations
✅ Chat with AI models
✅ File operations
✅ Git integration
✅ Multi-workspace support

## What Doesn't Work

❌ Native file picker dialogs
❌ "Open Terminal" button
❌ Keyboard shortcuts that conflict with Safari
❌ Desktop notifications

---

## Pro Tips

💡 **Add to Home Screen**: In Safari, tap Share → Add to Home Screen for an app-like experience

💡 **Keep Server Running**: Use `screen` or `tmux` to keep the server running in the background:
```bash
screen -S cmux
bun run start:server
# Press Ctrl+A then D to detach
# Reconnect with: screen -r cmux
```

💡 **Auto-start on Boot**: Add to your system's startup scripts (varies by OS)

💡 **Use a Static IP**: Configure your router to give your computer a static IP so you don't have to look it up every time

---

## Getting Help

If something doesn't work:

1. Check the server logs in your terminal
2. Check the browser console (Safari → Develop → Show Web Inspector)
3. Run the test script: `./test-mobile-backend.sh`
4. Read the full docs: `MOBILE_BACKEND.md`

---

## That's It!

You're all set to use cmux from your iPhone. Enjoy coding on mobile! 🚀
