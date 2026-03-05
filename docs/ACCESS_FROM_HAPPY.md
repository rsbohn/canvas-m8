# Accessing Canvas M8 from Happy (Port 6809 Already in Use)

## Problem
Port 6809 is already in use on happy, so we need to use a different local port.

## Solution: SSH Tunnel with Different Port

### Option 1: Use Port 8809 (Recommended)

From happy, run:

```bash
ssh -L 8809:localhost:6809 user@172.16.10.50
```

Then access canvas-m8 at:
```
http://localhost:8809
```

### Option 2: Use Port 6810

From happy, run:

```bash
ssh -L 6810:localhost:6809 user@172.16.10.50
```

Then access at:
```
http://localhost:6810
```

### Option 3: Use Any Available Port

Pick any unused port (like 8080, 8888, 9000, etc.):

```bash
# Example with port 8080
ssh -L 8080:localhost:6809 user@172.16.10.50

# Access at: http://localhost:8080
```

## Persistent Background Tunnel

To keep the tunnel running in the background:

```bash
# Run in background with autossh (if available)
autossh -M 0 -f -N -L 8809:localhost:6809 user@172.16.10.50

# Or with regular ssh
ssh -f -N -L 8809:localhost:6809 user@172.16.10.50

# Access at: http://localhost:8809
```

Kill the background tunnel when done:
```bash
# Find the ssh process
ps aux | grep "ssh.*8809"

# Kill it
pkill -f "ssh.*8809.*6809"
```

## One-Line Access Script

Create a helper script on happy:

```bash
# Create ~/bin/canvas-m8-tunnel.sh
cat > ~/bin/canvas-m8-tunnel.sh << 'EOF'
#!/bin/bash
PORT=${1:-8809}
echo "Starting SSH tunnel: localhost:$PORT -> canvasm8:6809"
echo "Access canvas-m8 at: http://localhost:$PORT"
ssh -L $PORT:localhost:6809 user@172.16.10.50
EOF

chmod +x ~/bin/canvas-m8-tunnel.sh

# Usage:
~/bin/canvas-m8-tunnel.sh          # Uses port 8809
~/bin/canvas-m8-tunnel.sh 8080     # Uses custom port
```

## Shell Alias

Add to your `~/.bashrc` or `~/.zshrc` on happy:

```bash
# Canvas M8 access
alias canvas-m8='ssh -L 8809:localhost:6809 user@172.16.10.50 && echo "Access at http://localhost:8809"'

# Then just run:
canvas-m8
```

## CLI Access with Custom Port

If you want to use the `m8` CLI from happy:

```bash
# Set up tunnel first
ssh -f -N -L 8809:localhost:6809 user@172.16.10.50

# Then use m8 via SSH
export M8_URL=http://localhost:8809
ssh user@172.16.10.50 /path/to/canvas-m8/bin/m8.js note "Hello from happy"

# Or create an alias
alias m8='ssh user@172.16.10.50 /path/to/canvas-m8/bin/m8.js'
```

## Check What's Using Port 6809 on Happy

If you're curious what's using the port:

```bash
# On happy
sudo lsof -i :6809
# or
sudo ss -tlnp | grep 6809
```

## Recommended Setup

**Quick one-time access:**
```bash
ssh -L 8809:localhost:6809 user@172.16.10.50
# Open browser to http://localhost:8809
```

**Persistent background tunnel:**
```bash
ssh -f -N -L 8809:localhost:6809 user@172.16.10.50
# Runs in background, just open http://localhost:8809 anytime
```

**Kill background tunnel when done:**
```bash
pkill -f "ssh.*8809.*6809"
```

## Direct Network Access (Alternative)

If you don't want to use SSH tunneling, you can still access directly via IP (bypassing the port conflict on happy):

```
http://172.16.10.50:6809
```

This works because you're accessing canvasm8's port directly, not using a local port on happy.

---

**Quick Start:**

```bash
# On happy, run this:
ssh -L 8809:localhost:6809 user@172.16.10.50

# Open browser to:
# http://localhost:8809
```

That's it! ✅
