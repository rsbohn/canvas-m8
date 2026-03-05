# Fixing Canvas M8 Network Access

## Problem
Connection timeout from happy (Windows) to canvasm8 (NixOS):
```
curl: (28) Failed to connect to 172.16.10.50 port 6809 after 21065 ms
```

## Cause
NixOS firewall is blocking incoming connections on port 6809.

## Solution: Open Port 6809 in NixOS Firewall

### Step 1: Edit NixOS Configuration

```bash
# On canvasm8, edit the configuration
sudo nano /etc/nixos/configuration.nix
```

### Step 2: Add Port 6809 to Allowed Ports

Find the firewall section (around line with `networking.firewall`) and add:

```nix
# Open ports in the firewall.
networking.firewall.allowedTCPPorts = [ 6809 ];
# networking.firewall.allowedUDPPorts = [ ... ];
```

If there are already ports listed, add 6809 to the list:

```nix
networking.firewall.allowedTCPPorts = [ 22 80 443 6809 ];
```

### Step 3: Rebuild NixOS Configuration

```bash
# Apply the changes
sudo nixos-rebuild switch
```

This will:
1. Update the firewall rules
2. Open port 6809 for incoming TCP connections
3. Take effect immediately

### Step 4: Test from Happy

```bash
# From happy (PowerShell or WSL)
curl http://172.16.10.50:6809/api/health
```

Should return:
```json
{"status":"ok"}
```

## Alternative: Temporary Firewall Rule

If you want to test before making permanent changes:

```bash
# On canvasm8, temporarily allow port 6809
sudo iptables -I INPUT -p tcp --dport 6809 -j ACCEPT

# Test from happy
# If it works, make it permanent in configuration.nix
```

**Note:** This temporary rule will be lost on reboot. Use the NixOS configuration method for persistence.

## Alternative: SSH Tunnel (No Firewall Changes Needed)

If you don't want to open the firewall, use SSH tunnel from happy:

### From PowerShell on Happy:

```powershell
# Install OpenSSH client if not already installed
# Settings > Apps > Optional Features > OpenSSH Client

# Create SSH tunnel (use port 8809 since 6809 is in use on happy)
ssh -L 8809:localhost:6809 user@172.16.10.50

# Then access at:
# http://localhost:8809
```

### From WSL/Linux on Happy:

```bash
ssh -L 8809:localhost:6809 user@172.16.10.50
```

Then open browser to: `http://localhost:8809`

## Verification Commands

### On Grumpy (check firewall status):

```bash
# Check if port is in allowed list
sudo iptables -L INPUT -n | grep 6809

# Check NixOS firewall config
grep -A 5 "firewall" /etc/nixos/configuration.nix

# Verify server is listening
ss -tlnp | grep 6809
```

### From Happy (test connectivity):

```powershell
# Test basic connectivity
Test-NetConnection -ComputerName 172.16.10.50 -Port 6809

# Or with curl
curl http://172.16.10.50:6809/api/health
```

## Recommended Solution

**Best approach:** Open the port in NixOS configuration

1. Edit `/etc/nixos/configuration.nix`
2. Add `6809` to `networking.firewall.allowedTCPPorts`
3. Run `sudo nixos-rebuild switch`
4. Test from happy

This is the cleanest and most permanent solution for NixOS.

## Full NixOS Configuration Example

```nix
{ config, pkgs, ... }:

{
  # ... other config ...

  networking = {
    hostName = "canvasm8";
    networkmanager.enable = true;
    
    # Open ports for canvas-m8
    firewall = {
      enable = true;
      allowedTCPPorts = [ 
        22    # SSH
        6809  # Canvas M8
      ];
    };
  };

  # ... rest of config ...
}
```

---

**Next Steps:**
1. Open port 6809 in NixOS firewall configuration
2. Run `sudo nixos-rebuild switch`
3. Test from happy: `curl http://172.16.10.50:6809/api/health`
4. Open browser to: `http://172.16.10.50:6809`
