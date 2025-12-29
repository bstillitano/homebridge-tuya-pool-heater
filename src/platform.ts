import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  Service,
  Characteristic,
} from 'homebridge';

import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  TuyaPoolHeatPumpConfig,
  DeviceConfig,
  DEFAULT_POLL_INTERVAL,
  TuyaDeviceStatus,
} from './settings';
import { TuyaApi } from './tuyaApi';
import { ThermostatAccessory } from './thermostatAccessory';
import { HeaterCoolerAccessory } from './heaterCoolerAccessory';

type StatusCallback = (status: TuyaDeviceStatus[]) => void;

export class TuyaPoolHeatPumpPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  public readonly api: API;
  public readonly log: Logger;
  public readonly config: TuyaPoolHeatPumpConfig;
  public tuyaApi!: TuyaApi;

  private readonly pollInterval: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly statusCallbacks: Map<string, StatusCallback> = new Map();

  constructor(log: Logger, config: TuyaPoolHeatPumpConfig, api: API) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.pollInterval = config.options?.pollInterval || DEFAULT_POLL_INTERVAL;

    this.log.debug('Finished initializing platform:', config.name);

    api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });

    api.on('shutdown', () => {
      this.log.debug('Homebridge is shutting down');
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  async discoverDevices(): Promise<void> {
    if (!this.config.options) {
      this.log.error('No options configured. Please configure the plugin.');
      return;
    }

    if (!this.config.devices || this.config.devices.length === 0) {
      this.log.warn('No devices configured. Please add devices in the config.');
      return;
    }

    // Initialize Tuya API
    this.tuyaApi = new TuyaApi(this.config.options, this.log);

    const authenticated = await this.authenticateWithRetry(3, 10000);
    if (!authenticated) {
      this.log.error('Failed to authenticate after retries. Will keep trying in background.');
      this.scheduleReconnect();
      return;
    }

    // Register devices
    for (const deviceConfig of this.config.devices) {
      this.registerDevice(deviceConfig);
    }

    // Start polling for status updates
    this.startPolling();
  }

  private async authenticateWithRetry(maxRetries: number, delayMs: number): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.tuyaApi.authenticate();
        return true;
      } catch (error) {
        this.log.warn(`Authentication attempt ${attempt}/${maxRetries} failed:`, error);
        if (attempt < maxRetries) {
          this.log.info(`Retrying in ${delayMs / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    return false;
  }

  private scheduleReconnect(): void {
    const reconnectDelay = 60000; // 1 minute
    this.log.info(`Scheduling reconnection attempt in ${reconnectDelay / 1000} seconds...`);

    setTimeout(async () => {
      this.log.info('Attempting to reconnect to Tuya API...');
      const authenticated = await this.authenticateWithRetry(3, 10000);
      if (authenticated) {
        this.log.info('Reconnection successful!');
        // Register devices if not already done
        for (const deviceConfig of this.config.devices) {
          this.registerDevice(deviceConfig);
        }
        this.startPolling();
      } else {
        this.scheduleReconnect();
      }
    }, reconnectDelay);
  }

  private registerDevice(deviceConfig: DeviceConfig): void {
    const uuid = this.api.hap.uuid.generate(deviceConfig.id);
    const existingAccessory = this.accessories.find(acc => acc.UUID === uuid);

    if (existingAccessory) {
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

      existingAccessory.context.device = deviceConfig;

      if (deviceConfig.accessoryType === 'thermostat') {
        new ThermostatAccessory(this, existingAccessory, deviceConfig);
      } else {
        new HeaterCoolerAccessory(this, existingAccessory, deviceConfig);
      }
    } else {
      this.log.info('Adding new accessory:', deviceConfig.name);

      const accessory = new this.api.platformAccessory(deviceConfig.name, uuid);
      accessory.context.device = deviceConfig;

      if (deviceConfig.accessoryType === 'thermostat') {
        new ThermostatAccessory(this, accessory, deviceConfig);
      } else {
        new HeaterCoolerAccessory(this, accessory, deviceConfig);
      }

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private startPolling(): void {
    this.log.info(`Starting status polling every ${this.pollInterval / 1000} seconds`);

    this.pollTimer = setInterval(async () => {
      for (const accessory of this.accessories) {
        const deviceConfig = accessory.context.device as DeviceConfig;
        if (deviceConfig) {
          try {
            await this.pollDeviceStatus(deviceConfig.id);
          } catch (error) {
            this.log.error(`Failed to poll device ${deviceConfig.id}:`, error);
          }
        }
      }
    }, this.pollInterval);
  }

  private async pollDeviceStatus(deviceId: string): Promise<void> {
    try {
      const status = await this.tuyaApi.getDeviceStatus(deviceId);
      this.log.debug(`Device ${deviceId} status:`, JSON.stringify(status));

      // Call registered callback for this device
      const callback = this.statusCallbacks.get(deviceId);
      if (callback) {
        callback(status);
      }
    } catch (error) {
      this.log.error(`Failed to get status for device ${deviceId}:`, error);
    }
  }

  public registerStatusCallback(deviceId: string, callback: StatusCallback): void {
    this.statusCallbacks.set(deviceId, callback);
  }
}
