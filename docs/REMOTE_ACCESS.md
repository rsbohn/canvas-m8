# Accessing Canvas M8 from Happy

## Current Setup

- **Server:** canvasm8 (172.16.10.50)
- **Port:** 6809
- **Status:** ✅ Server is listening on all network interfaces (*:6809)

## Quick Access

### Option 1: Direct Network Access (Recommended)

From happy, simply open your browser to:

```
http://172.16.10.50:6809
```

Or if you have hostname resolution configured:

```
http://canvasm8:6809
```

This should work immediately since the server is already listening on all interfaces.

### Test from Happy

```bash
# From happy, test if the server is reachable
curl http://172.16.10.50:6809/api/health

# Should return: {"status":"ok"}
```

## Alternative Options

### Option 2: SSH Tunnel (if direct access doesn't work)

From happy, create an SSH tunnel:

```bash
# Forward local port 6809 to canvasm8's 6809
ssh -L 6809:localhost:6809 user@172.16.10.50

# Then access at:
# http://localhost:6809
```

### Option 3: SSH Tunnel with Custom Port

If port 6809 is already in use on happy:

```bash
# Forward local port 8080 to canvasm8's 6809
ssh -L 8080:localhost:6809 user@172.16.10.50

# Then access at:
# http://localhost:8080
```

### Option 4: Reverse SSH Tunnel (from canvasm8)

If you want happy to access without SSH from happy:

```bash
# From canvasm8, run:
ssh -R 6809:localhost:6809 user@happy

# Then from happy, access:
# http://localhost:6809
```

## Hostname Configuration (Optional)

### Add to /etc/hosts on happy

```bash
# On happy, add this line:
echo "172.16.10.50 canvasm8" | sudo tee -a /etc/hosts

# Then access at:
# http://canvasm8:6809
```

### Or use mDNS/Avahi (if configured)

```bash
# Access using .local domain
http://canvasm8.local:6809
```

## Troubleshooting

### If direct access doesn't work:

1. **Check connectivity from happy:**
   ```bash
   ping 172.16.10.50
   telnet 172.16.10.50 6809
   # or
   nc -zv 172.16.10.50 6809
   ```

2. **Check if firewall is blocking on canvasm8:**
   ```bash
   # On canvasm8
   sudo iptables -L -n | grep 6809
   sudo firewall-cmd --list-ports
   ```

3. **Open firewall port if needed (on canvasm8):**
   ```bash
   # For iptables
   sudo iptables -I INPUT -p tcp --dport 6809 -j ACCEPT
   
   # For firewalld
   sudo firewall-cmd --add-port=6809/tcp --permanent
   sudo firewall-cmd --reload
   ```

4. **Check the server is still running:**
   ```bash
   # On canvasm8
   ss -tlnp | grep 6809
   ```

## Security Considerations

### Making it public-facing (NOT recommended for localhost dev)

If you want to expose this beyond your local network:

```bash
# Use nginx reverse proxy on canvasm8
sudo apt install nginx  # or your package manager

# Create /etc/nginx/sites-available/canvas-m8:
server {
    listen 80;
    server_name canvasm8.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:6809;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Enable and restart
sudo ln -s /etc/nginx/sites-available/canvas-m8 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Use Caddy (simpler alternative)

```bash
# Install Caddy
# Create Caddyfile:
canvasm8.yourdomain.com {
    reverse_proxy localhost:6809
}

# Run
caddy run
```

## Canvas M8 Configuration

The server is already configured to listen on all interfaces. If you need to change the port:

```bash
# Set PORT environment variable
export PORT=8080

# Or modify in canvas-m8
cd /home/rsbohn/build/canvas-m8
PORT=8080 npm start
```

## WebSocket Support

The server supports WebSocket on `/sync` endpoint. When accessing remotely, the WebSocket will automatically connect to the same host/port.

## CLI Access from Happy

You can also use the `m8` CLI from happy:

```bash
# Set the server URL
export M8_URL=http://172.16.10.50:6809

# Add a note
m8 note "Hello from happy!"

# Get summary
m8 summary

# List snapshots
m8 snapshots
```

Or add to your shell profile on happy:

```bash
# Add to ~/.bashrc or ~/.zshrc on happy
export M8_URL=http://172.16.10.50:6809
alias m8='ssh user@172.16.10.50 /path/to/canvas-m8/bin/m8.js'
```

## Recommended: Direct Network Access

Since the server is already listening on all interfaces, **Option 1** (direct access via IP) should work immediately. Just open your browser on happy to:

**http://172.16.10.50:6809**

---

**Quick Test:**

```bash
# From happy, run this command:
curl -s http://172.16.10.50:6809/api/health && echo " ✅ Server is accessible!"
```

If you see `{"status":"ok"}` - you're all set! Just open the URL in your browser.
