import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { TuyaPoolHeatPumpPlatform } from './platform';
import {
  DeviceConfig,
  DP_CODES,
  TuyaDeviceStatus,
  tuyaTempToCelsius,
  celsiusToTuyaTemp,
  isHeatingMode,
  isCoolingMode,
  TUYA_MODES,
  TEMP_RANGES,
} from './settings';

export class ThermostatAccessory {
  private service: Service;
  private readonly platform: TuyaPoolHeatPumpPlatform;
  private readonly accessory: PlatformAccessory;
  private readonly deviceConfig: DeviceConfig;

  // Cached state
  private currentTemperature = 20;
  private targetTemperature = 25;
  private currentHeatingCoolingState = 0; // OFF
  private targetHeatingCoolingState = 0; // OFF

  // Debounce polling after commands
  private lastCommandTime = 0;
  private readonly commandDebounceMs = 10000; // Ignore polls for 10 seconds after command

  constructor(
    platform: TuyaPoolHeatPumpPlatform,
    accessory: PlatformAccessory,
    deviceConfig: DeviceConfig,
  ) {
    this.platform = platform;
    this.accessory = accessory;
    this.deviceConfig = deviceConfig;

    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Tuya')
      .setCharacteristic(this.platform.Characteristic.Model, 'Pool Heat Pump')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, deviceConfig.id);

    // Get or create Thermostat service
    this.service = this.accessory.getService(this.platform.Service.Thermostat)
      || this.accessory.addService(this.platform.Service.Thermostat);

    this.service.setCharacteristic(this.platform.Characteristic.Name, deviceConfig.name);

    // Set temperature display units to Celsius
    this.service.setCharacteristic(
      this.platform.Characteristic.TemperatureDisplayUnits,
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS,
    );

    // Configure CurrentTemperature
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({
        minValue: -10,
        maxValue: 60,
        minStep: 0.1,
      })
      .onGet(this.getCurrentTemperature.bind(this));

    // Configure TargetTemperature
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .setProps({
        minValue: 5,
        maxValue: 55,
        minStep: 1,
      })
      .onGet(this.getTargetTemperature.bind(this))
      .onSet(this.setTargetTemperature.bind(this));

    // Configure CurrentHeatingCoolingState (read-only)
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentHeatingCoolingState.bind(this));

    // Configure TargetHeatingCoolingState
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.getTargetHeatingCoolingState.bind(this))
      .onSet(this.setTargetHeatingCoolingState.bind(this));

    // Register for status updates
    this.platform.registerStatusCallback(this.deviceConfig.id, (status) => {
      this.updateState(status);
    });

    // Log configured temperature ranges
    this.platform.log.info(`Device ${deviceConfig.name} temperature ranges:`);
    this.platform.log.info(`  Heating: ${JSON.stringify(deviceConfig.heatingRange ?? 'using default')}`);
    this.platform.log.info(`  Cooling: ${JSON.stringify(deviceConfig.coolingRange ?? 'using default')}`);
    this.platform.log.info(`  Auto: ${JSON.stringify(deviceConfig.autoRange ?? 'using default')}`);

    // Initial status fetch
    this.fetchInitialStatus();
  }

  private async fetchInitialStatus(): Promise<void> {
    try {
      const status = await this.platform.tuyaApi.getDeviceStatus(this.deviceConfig.id);
      this.updateState(status);
    } catch (error) {
      this.platform.log.error('Failed to fetch initial status:', error);
    }
  }

  private updateState(status: TuyaDeviceStatus[]): void {
    // Ignore polled updates briefly after sending a command to avoid race conditions
    if (Date.now() - this.lastCommandTime < this.commandDebounceMs) {
      this.platform.log.debug('Ignoring polled state update (recent command sent)');
      return;
    }

    // Process MODE first so temperature updates use correct mode
    const modeDP = status.find(dp => dp.code === DP_CODES.MODE);
    if (modeDP) {
      this.updateModeFromTuya(modeDP.value as string);
    }

    for (const dp of status) {
      switch (dp.code) {
        case DP_CODES.SWITCH:
          if (!dp.value) {
            this.currentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
            this.targetHeatingCoolingState = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
            this.service.updateCharacteristic(
              this.platform.Characteristic.CurrentHeatingCoolingState,
              this.currentHeatingCoolingState,
            );
            this.service.updateCharacteristic(
              this.platform.Characteristic.TargetHeatingCoolingState,
              this.targetHeatingCoolingState,
            );
          }
          break;

        case DP_CODES.TEMP_CURRENT:
          this.currentTemperature = tuyaTempToCelsius(dp.value as number);
          this.service.updateCharacteristic(
            this.platform.Characteristic.CurrentTemperature,
            this.currentTemperature,
          );
          break;

        case DP_CODES.SET_HEATING_TEMP:
          if (isHeatingMode(this.currentModeString)) {
            this.targetTemperature = tuyaTempToCelsius(dp.value as number);
            this.service.updateCharacteristic(
              this.platform.Characteristic.TargetTemperature,
              this.targetTemperature,
            );
          }
          break;

        case DP_CODES.SET_COOLING_TEMP:
          if (isCoolingMode(this.currentModeString)) {
            this.targetTemperature = tuyaTempToCelsius(dp.value as number);
            this.service.updateCharacteristic(
              this.platform.Characteristic.TargetTemperature,
              this.targetTemperature,
            );
          }
          break;

        case DP_CODES.SET_AUTO_TEMP:
          if (this.currentModeString === TUYA_MODES.AUTO) {
            this.targetTemperature = tuyaTempToCelsius(dp.value as number);
            this.service.updateCharacteristic(
              this.platform.Characteristic.TargetTemperature,
              this.targetTemperature,
            );
          }
          break;

        case DP_CODES.MODE:
          // Already processed above
          break;
      }
    }
  }

  private currentModeString = 'Auto';

  private getTempRange(): { min: number; max: number } {
    if (isHeatingMode(this.currentModeString)) {
      return this.deviceConfig.heatingRange ?? TEMP_RANGES.heating;
    } else if (isCoolingMode(this.currentModeString)) {
      return this.deviceConfig.coolingRange ?? TEMP_RANGES.cooling;
    }
    return this.deviceConfig.autoRange ?? TEMP_RANGES.auto;
  }

  private updateModeFromTuya(mode: string): void {
    this.currentModeString = mode;

    if (isHeatingMode(mode)) {
      this.currentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      this.targetHeatingCoolingState = this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
    } else if (isCoolingMode(mode)) {
      this.currentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
      this.targetHeatingCoolingState = this.platform.Characteristic.TargetHeatingCoolingState.COOL;
    } else {
      this.currentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      this.targetHeatingCoolingState = this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
    }

    // Update temperature range based on mode
    const range = this.getTempRange();
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .setProps({
        minValue: range.min,
        maxValue: range.max,
        minStep: 1,
      });

    // Clamp current target temp to new range
    if (this.targetTemperature > range.max) {
      this.targetTemperature = range.max;
      this.service.updateCharacteristic(
        this.platform.Characteristic.TargetTemperature,
        this.targetTemperature,
      );
    } else if (this.targetTemperature < range.min) {
      this.targetTemperature = range.min;
      this.service.updateCharacteristic(
        this.platform.Characteristic.TargetTemperature,
        this.targetTemperature,
      );
    }

    this.service.updateCharacteristic(
      this.platform.Characteristic.CurrentHeatingCoolingState,
      this.currentHeatingCoolingState,
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.TargetHeatingCoolingState,
      this.targetHeatingCoolingState,
    );
  }

  // Handlers
  async getCurrentTemperature(): Promise<CharacteristicValue> {
    return this.currentTemperature;
  }

  async getTargetTemperature(): Promise<CharacteristicValue> {
    return this.targetTemperature;
  }

  async setTargetTemperature(value: CharacteristicValue): Promise<void> {
    const originalTemp = value as number;

    // Clamp to valid range for current mode
    const range = this.getTempRange();
    const temp = Math.max(range.min, Math.min(range.max, originalTemp));

    this.platform.log.info(`Setting target temperature: requested ${originalTemp}°C, clamped to ${temp}°C (range: ${range.min}-${range.max}, mode: ${this.currentModeString})`);

    const tuyaTemp = celsiusToTuyaTemp(temp);

    // Determine which DP to use based on current mode
    let dpCode: string = DP_CODES.SET_HEATING_TEMP;
    if (isCoolingMode(this.currentModeString)) {
      dpCode = DP_CODES.SET_COOLING_TEMP;
    } else if (!isHeatingMode(this.currentModeString)) {
      // Auto mode (not heating and not cooling)
      dpCode = DP_CODES.SET_AUTO_TEMP;
    }

    this.lastCommandTime = Date.now();
    const success = await this.platform.tuyaApi.sendCommand(
      this.deviceConfig.id,
      dpCode,
      tuyaTemp,
    );

    if (success) {
      this.targetTemperature = temp;
    }
  }

  async getCurrentHeatingCoolingState(): Promise<CharacteristicValue> {
    return this.currentHeatingCoolingState;
  }

  async getTargetHeatingCoolingState(): Promise<CharacteristicValue> {
    return this.targetHeatingCoolingState;
  }

  async setTargetHeatingCoolingState(value: CharacteristicValue): Promise<void> {
    const state = value as number;
    this.platform.log.info(`Setting target heating/cooling state to ${state}`);
    this.lastCommandTime = Date.now();

    if (state === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
      // Turn off
      await this.platform.tuyaApi.sendCommand(this.deviceConfig.id, DP_CODES.SWITCH, false);
      this.targetHeatingCoolingState = state;
      this.currentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      return;
    }

    // Turn on if needed
    await this.platform.tuyaApi.sendCommand(this.deviceConfig.id, DP_CODES.SWITCH, true);

    // Set mode
    let mode: string;
    switch (state) {
      case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
        mode = TUYA_MODES.HEATING_SMART;
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
        mode = TUYA_MODES.COOLING_SMART;
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
      default:
        mode = TUYA_MODES.AUTO;
        break;
    }

    await this.platform.tuyaApi.sendCommand(this.deviceConfig.id, DP_CODES.MODE, mode);
    this.targetHeatingCoolingState = state;
    this.currentModeString = mode; // Update immediately so temperature commands use correct DP
  }
}
