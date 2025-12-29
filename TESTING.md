# Local Testing on QNAP NAS with Docker

This guide covers how to test the plugin locally when Homebridge is running in Docker on a QNAP NAS.

## Prerequisites

- SSH enabled on QNAP (Control Panel → Network & File Services → Telnet / SSH)
- Access to Homebridge UI terminal

## Steps

### 1. Build and Pack the Plugin

On your development machine:

```bash
cd ~/homebridge-tuya-pool-heatpump
npm install
npm run build
npm pack
```

This creates `homebridge-tuya-pool-heatpump-1.0.0.tgz`.

### 2. Copy to NAS

```bash
scp ~/homebridge-tuya-pool-heatpump/homebridge-tuya-pool-heatpump-1.0.0.tgz user@NAS_IP:/tmp/
```

### 3. Copy into Docker Container

SSH into the NAS:

```bash
ssh user@NAS_IP
```

Find the Homebridge container ID:

```bash
docker ps | grep homebridge
```

Copy the tarball into the container (replace `CONTAINER_ID` with actual ID):

```bash
docker cp /tmp/homebridge-tuya-pool-heatpump-1.0.0.tgz CONTAINER_ID:/tmp/
```

### 4. Install the Plugin

In the **Homebridge UI terminal** (Menu → Terminal):

```bash
cd /homebridge
npm install /tmp/homebridge-tuya-pool-heatpump-1.0.0.tgz
```

Note: Install locally (without `-g`) so it gets added to Homebridge's package.json.

### 5. Configure and Restart

1. Restart Homebridge (power icon in UI)
2. Go to **Plugins** → **Tuya Pool Heat Pump** → **Settings**
3. Configure your Tuya credentials and device
4. Save and restart Homebridge

## Updating the Plugin

To test changes, repeat steps 1-5:

```bash
# On dev machine
npm run build
npm pack

# Copy to NAS
scp ~/homebridge-tuya-pool-heatpump/homebridge-tuya-pool-heatpump-1.0.0.tgz user@NAS_IP:/tmp/

# SSH to NAS and copy into container
ssh user@NAS_IP
docker cp /tmp/homebridge-tuya-pool-heatpump-1.0.0.tgz CONTAINER_ID:/tmp/

# In Homebridge terminal
cd /homebridge
npm install /tmp/homebridge-tuya-pool-heatpump-1.0.0.tgz
```

Then restart Homebridge.

## Troubleshooting

### "Connection refused" when using SCP
Enable SSH on QNAP: Control Panel → Network & File Services → Telnet / SSH → Enable SSH

### File not found in container
Don't copy to the mounted volume directly - use `docker cp` to copy into the container's `/tmp/` directory.

### Permission denied
Use `sudo` for commands on the NAS when accessing Docker volumes.

### Plugin not showing in list
Make sure to install locally (without `-g` flag) so it gets added to Homebridge's package.json.

## Cleanup

Once testing is complete and the plugin is working:

### Remove temporary files

On NAS (SSH session):
```bash
rm /tmp/homebridge-tuya-pool-heatpump-1.0.0.tgz
```

In Homebridge terminal:
```bash
rm /tmp/homebridge-tuya-pool-heatpump-1.0.0.tgz
```

On your Mac (optional):
```bash
rm ~/homebridge-tuya-pool-heatpump/homebridge-tuya-pool-heatpump-1.0.0.tgz
```

### Remove old plugin config

If your pool heat pump was previously configured in `@homebridge-plugins/homebridge-tuya`, remove it from that plugin's device list to avoid duplicates.

### Clear duplicate accessories

If the device shows up twice in HomeKit:
1. Homebridge UI → Settings (gear icon)
2. Remove Single Cached Accessory
3. Select the duplicate accessory
