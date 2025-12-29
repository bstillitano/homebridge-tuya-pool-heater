# homebridge-tuya-pool-heater

[![npm](https://img.shields.io/npm/v/homebridge-tuya-pool-heater/latest?label=latest)](https://www.npmjs.com/package/homebridge-tuya-pool-heater)
[![GitHub release](https://img.shields.io/github/release/bstillitano/homebridge-tuya-pool-heater.svg)](https://github.com/bstillitano/homebridge-tuya-pool-heater/releases)
[![npm](https://img.shields.io/npm/dt/homebridge-tuya-pool-heater)](https://www.npmjs.com/package/homebridge-tuya-pool-heater)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Control your Tuya-based pool heat pump with Apple HomeKit using Homebridge.

## Table of Contents

- [Features](#features)
- [Supported Devices](#supported-devices)
- [Installation](#installation)
- [Tuya IoT Platform Setup](#tuya-iot-platform-setup)
- [Configuration](#configuration)
- [Accessory Types](#accessory-types)
- [Temperature Ranges](#temperature-ranges)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Thermostat or HeaterCooler mode** - Choose how the device appears in HomeKit
- **Proper temperature handling** - Correctly handles Tuya's temperature scaling (×10)
- **Full mode support** - Maps heat pump modes (Heating, Cooling, Auto) to HomeKit
- **Multiple devices** - Support for multiple heat pumps
- **Configurable temperature ranges** - Set custom min/max temperatures per mode
- **Automatic reconnection** - Recovers gracefully from network issues
- **Homebridge UI** - Easy configuration through the Homebridge Config UI X

## Supported Devices

This plugin is designed for Tuya-based pool heat pumps that use the following DP (Data Point) codes:

| DP Code | Description | Type |
|---------|-------------|------|
| `switch` | Power on/off | Boolean |
| `mode` | Operating mode | Enum |
| `temp_current` | Current water temperature | Integer (×10) |
| `set_heating_temp` | Heating target temperature | Integer (×10) |
| `set_cold_temp` | Cooling target temperature | Integer (×10) |
| `set_auto_temp` | Auto mode target temperature | Integer (×10) |

### Supported Modes

| Mode Value | Description |
|------------|-------------|
| `Auto` | Automatic heating/cooling |
| `Heating_Smart` | Smart heating mode |
| `Heating_Powerful` | Powerful heating mode |
| `Heating_Silent` | Silent heating mode |
| `Cooling_Smart` | Smart cooling mode |
| `Cooling_Powerful` | Powerful cooling mode |
| `Cooling_Silent` | Silent cooling mode |

> **Note:** Your device may not support all modes. The plugin will use the `_Smart` variants when setting modes from HomeKit.

## Installation

### Via Homebridge UI (Recommended)

1. Open the Homebridge Config UI X
2. Navigate to the Plugins tab
3. Search for `homebridge-tuya-pool-heater`
4. Click **Install**
5. Configure the plugin through the settings UI

### Via npm

```bash
npm install -g homebridge-tuya-pool-heater
```

Then configure the plugin in your `config.json` file.

## Tuya IoT Platform Setup

Before using this plugin, you need to set up a Tuya IoT Platform project:

### Step 1: Create a Tuya Developer Account

1. Go to [Tuya IoT Platform](https://platform.tuya.com)
2. Create an account or sign in

### Step 2: Create a Cloud Project

1. Navigate to **Cloud** → **Development** → **Create Cloud Project**
2. Fill in the project details:
   - **Project Name:** Any name (e.g., "Homebridge")
   - **Industry:** Smart Home
   - **Development Method:** Smart Home
   - **Data Center:** Select your region (must match your app region)

### Step 3: Get Your Credentials

1. In your project, go to **Overview**
2. Note your **Access ID** (also called Client ID)
3. Note your **Access Secret** (also called Client Secret)

### Step 4: Link Your Tuya App Account

1. In your project, go to **Devices** → **Link Tuya App Account**
2. Click **Add App Account**
3. Open your Tuya/Smart Life app on your phone
4. Go to **Profile** → **Settings** (gear icon) → **Scan QR Code**
5. Scan the QR code displayed on the Tuya IoT Platform

### Step 5: Find Your Device ID

1. After linking, your devices will appear in the **Devices** tab
2. Find your pool heat pump and note the **Device ID**

### API Endpoints by Region

| Region | Endpoint |
|--------|----------|
| Americas | `https://openapi.tuyaus.com` |
| Europe | `https://openapi.tuyaeu.com` |
| China | `https://openapi.tuyacn.com` |
| India | `https://openapi.tuyain.com` |

> **Important:** Use the endpoint that matches the data center you selected when creating your cloud project.

## Configuration

### Via Homebridge UI

The easiest way to configure the plugin is through the Homebridge Config UI X. After installation, click the **Settings** button on the plugin card to open the configuration form.

### Manual Configuration

Add the following to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "TuyaPoolHeatPump",
      "name": "Pool Heat Pump",
      "options": {
        "accessId": "YOUR_ACCESS_ID",
        "accessKey": "YOUR_ACCESS_SECRET",
        "endpoint": "https://openapi.tuyaus.com",
        "username": "your-email@example.com",
        "password": "your-tuya-app-password",
        "countryCode": 1,
        "pollInterval": 30000
      },
      "devices": [
        {
          "id": "YOUR_DEVICE_ID",
          "name": "Pool Heat Pump",
          "accessoryType": "thermostat",
          "heatingRange": {
            "min": 20,
            "max": 40
          },
          "coolingRange": {
            "min": 15,
            "max": 30
          },
          "autoRange": {
            "min": 18,
            "max": 35
          }
        }
      ]
    }
  ]
}
```

### Platform Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `platform` | Yes | - | Must be `TuyaPoolHeatPump` |
| `name` | Yes | - | Display name for the platform |
| `options.accessId` | Yes | - | Your Tuya IoT Platform Access ID |
| `options.accessKey` | Yes | - | Your Tuya IoT Platform Access Secret |
| `options.endpoint` | Yes | - | API endpoint for your region |
| `options.username` | Yes | - | Your Tuya/Smart Life app username (email) |
| `options.password` | Yes | - | Your Tuya/Smart Life app password |
| `options.countryCode` | Yes | - | Your country calling code (e.g., 1 for US, 44 for UK, 61 for AU) |
| `options.pollInterval` | No | 30000 | How often to poll for status updates (in milliseconds) |

### Device Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `id` | Yes | - | Tuya device ID |
| `name` | Yes | - | Display name in HomeKit |
| `accessoryType` | Yes | `thermostat` | `thermostat` or `heatercooler` |
| `heatingRange.min` | No | 5 | Minimum heating temperature (°C) |
| `heatingRange.max` | No | 55 | Maximum heating temperature (°C) |
| `coolingRange.min` | No | 5 | Minimum cooling temperature (°C) |
| `coolingRange.max` | No | 35 | Maximum cooling temperature (°C) |
| `autoRange.min` | No | 5 | Minimum auto mode temperature (°C) |
| `autoRange.max` | No | 40 | Maximum auto mode temperature (°C) |

## Accessory Types

### Thermostat

The **Thermostat** accessory type provides a familiar thermostat interface in HomeKit:

- **Current Temperature** - Real-time water temperature
- **Target Temperature** - Desired temperature setpoint
- **Current State** - Shows if currently heating, cooling, or idle
- **Target State** - Off, Heat, Cool, or Auto mode

This is the recommended option for most users as it provides a simple, intuitive interface.

### HeaterCooler

The **HeaterCooler** accessory type provides separate heating and cooling threshold controls:

- **Active** - Power on/off
- **Current Temperature** - Real-time water temperature
- **Heating Threshold** - Temperature at which heating activates
- **Cooling Threshold** - Temperature at which cooling activates
- **Current State** - Idle, Heating, or Cooling
- **Target State** - Heat, Cool, or Auto mode

Choose this option if you want independent control over heating and cooling thresholds.

## Temperature Ranges

Temperature ranges can be customized per device to match your heat pump's capabilities. The ranges are mode-specific:

- **Heating Range** - Applied when in any heating mode
- **Cooling Range** - Applied when in any cooling mode
- **Auto Range** - Applied when in auto mode

When you change modes in HomeKit, the temperature slider will adjust to show the appropriate range. Note that the Home app caches these values, so you may need to close and reopen the accessory detail view to see updated ranges after changing modes.

## Troubleshooting

### Device not showing up

1. Verify your Tuya credentials are correct
2. Check that the device ID is correct (find it in the Tuya IoT Platform)
3. Ensure your Tuya app account is linked in the IoT Platform
4. Check Homebridge logs for error messages

### Authentication errors ("sign invalid")

1. Verify your Access ID and Access Secret are correct
2. Ensure you're using the correct API endpoint for your region
3. Check that your username and password match your Tuya/Smart Life app
4. Verify the country code is correct

### Temperature showing wrong values

This plugin handles Tuya's temperature scaling (values stored as temp × 10). If temperatures appear incorrect, please [open an issue](https://github.com/bstillitano/homebridge-tuya-pool-heater/issues).

### Commands not working

1. Check that your device is online in the Tuya/Smart Life app
2. Verify the device supports the mode you're trying to set
3. Check Homebridge logs for API error messages

### Frequent disconnections

The plugin includes automatic reconnection logic with retry attempts. If you experience frequent disconnections:

1. Check your network stability
2. Increase the `pollInterval` to reduce API calls
3. Verify your Tuya IoT Platform project hasn't exceeded API limits

### HomeKit shows stale data after commands

The plugin includes a 10-second debounce after sending commands to prevent poll responses from overwriting your changes. If you still see issues, try increasing the `pollInterval`.

## Error Codes

| Error | Meaning | Solution |
|-------|---------|----------|
| `sign invalid` | HMAC signature mismatch | Check Access ID and Access Secret |
| `token invalid` | Authentication token expired | Plugin will auto-refresh; restart if persistent |
| `permission deny` | API permission issue | Ensure device is linked in Tuya IoT Platform |
| `device offline` | Device not connected | Check device's WiFi connection |

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a new branch for your feature or bug fix
3. Make your changes and add tests if applicable
4. Run `npm test` to ensure all tests pass
5. Commit your changes with a clear commit message
6. Push to your fork and submit a pull request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/bstillitano/homebridge-tuya-pool-heater.git
cd homebridge-tuya-pool-heater

# Install dependencies
npm install

# Build the plugin
npm run build

# Run tests
npm test

# Watch mode for development
npm run watch
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have feature requests, please [open an issue](https://github.com/bstillitano/homebridge-tuya-pool-heater/issues) on GitHub.

## Acknowledgments

- [Homebridge](https://homebridge.io/) - HomeKit support for the impatient
- [Tuya IoT Platform](https://platform.tuya.com) - Cloud API access
