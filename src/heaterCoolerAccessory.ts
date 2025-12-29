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
} from './settings';

export class HeaterCoolerAccessory {
  private service: Service;
  private readonly platform: TuyaPoolHeatPumpPlatform;
  private readonly accessory: PlatformAccessory;
  private readonly deviceConfig: DeviceConfig;

  // Cached state
  private active = false;
  private currentTemperature = 20;
  private heatingThresholdTemperature = 28;
  private coolingThresholdTemperature = 20;
  private currentHeaterCoolerState = 0; // INACTIVE
  private targetHeaterCoolerState = 0; // AUTO

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

    // Get or create HeaterCooler service
    this.service = this.accessory.getService(this.platform.Service.HeaterCooler)
      || this.accessory.addService(this.platform.Service.HeaterCooler);

    this.service.setCharacteristic(this.platform.Characteristic.Name, deviceConfig.name);

    // Configure Active
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    // Configure CurrentTemperature
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({
        minValue: -10,
        maxValue: 60,
        minStep: 0.1,
      })
      .onGet(this.getCurrentTemperature.bind(this));

    // Configure CurrentHeaterCoolerState (read-only)
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.getCurrentHeaterCoolerState.bind(this));

    // Configure TargetHeaterCoolerState
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .onGet(this.getTargetHeaterCoolerState.bind(this))
      .onSet(this.setTargetHeaterCoolerState.bind(this));

    // Configure HeatingThresholdTemperature
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: 5,
        maxValue: 55,
        minStep: 1,
      })
      .onGet(this.getHeatingThresholdTemperature.bind(this))
      .onSet(this.setHeatingThresholdTemperature.bind(this));

    // Configure CoolingThresholdTemperature
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .setProps({
        minValue: 5,
        maxValue: 35,
        minStep: 1,
      })
      .onGet(this.getCoolingThresholdTemperature.bind(this))
      .onSet(this.setCoolingThresholdTemperature.bind(this));

    // Register for status updates
    this.platform.registerStatusCallback(this.deviceConfig.id, (status) => {
      this.updateState(status);
    });

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

    for (const dp of status) {
      switch (dp.code) {
        case DP_CODES.SWITCH:
          this.active = dp.value as boolean;
          this.service.updateCharacteristic(
            this.platform.Characteristic.Active,
            this.active
              ? this.platform.Characteristic.Active.ACTIVE
              : this.platform.Characteristic.Active.INACTIVE,
          );

          if (!this.active) {
            this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
            this.service.updateCharacteristic(
              this.platform.Characteristic.CurrentHeaterCoolerState,
              this.currentHeaterCoolerState,
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
          this.heatingThresholdTemperature = tuyaTempToCelsius(dp.value as number);
          this.service.updateCharacteristic(
            this.platform.Characteristic.HeatingThresholdTemperature,
            this.heatingThresholdTemperature,
          );
          break;

        case DP_CODES.SET_COOLING_TEMP:
          this.coolingThresholdTemperature = tuyaTempToCelsius(dp.value as number);
          this.service.updateCharacteristic(
            this.platform.Characteristic.CoolingThresholdTemperature,
            this.coolingThresholdTemperature,
          );
          break;

        case DP_CODES.MODE:
          this.updateModeFromTuya(dp.value as string);
          break;
      }
    }
  }

  private updateModeFromTuya(mode: string): void {
    if (!this.active) {
      this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    } else if (isHeatingMode(mode)) {
      this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
      this.targetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
    } else if (isCoolingMode(mode)) {
      this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
      this.targetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.COOL;
    } else {
      // Auto mode - determine current state based on current vs target temp
      if (this.currentTemperature < this.heatingThresholdTemperature) {
        this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
      } else if (this.currentTemperature > this.coolingThresholdTemperature) {
        this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
      } else {
        this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
      }
      this.targetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
    }

    this.service.updateCharacteristic(
      this.platform.Characteristic.CurrentHeaterCoolerState,
      this.currentHeaterCoolerState,
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.TargetHeaterCoolerState,
      this.targetHeaterCoolerState,
    );
  }

  // Handlers
  async getActive(): Promise<CharacteristicValue> {
    return this.active
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
  }

  async setActive(value: CharacteristicValue): Promise<void> {
    const active = value === this.platform.Characteristic.Active.ACTIVE;
    this.platform.log.info(`Setting active to ${active}`);
    this.lastCommandTime = Date.now();

    const success = await this.platform.tuyaApi.sendCommand(
      this.deviceConfig.id,
      DP_CODES.SWITCH,
      active,
    );

    if (success) {
      this.active = active;
    }
  }

  async getCurrentTemperature(): Promise<CharacteristicValue> {
    return this.currentTemperature;
  }

  async getCurrentHeaterCoolerState(): Promise<CharacteristicValue> {
    return this.currentHeaterCoolerState;
  }

  async getTargetHeaterCoolerState(): Promise<CharacteristicValue> {
    return this.targetHeaterCoolerState;
  }

  async setTargetHeaterCoolerState(value: CharacteristicValue): Promise<void> {
    const state = value as number;
    this.platform.log.info(`Setting target heater/cooler state to ${state}`);
    this.lastCommandTime = Date.now();

    let mode: string;
    switch (state) {
      case this.platform.Characteristic.TargetHeaterCoolerState.HEAT:
        mode = TUYA_MODES.HEATING_SMART;
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        mode = TUYA_MODES.COOLING_SMART;
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.AUTO:
      default:
        mode = TUYA_MODES.AUTO;
        break;
    }

    const success = await this.platform.tuyaApi.sendCommand(
      this.deviceConfig.id,
      DP_CODES.MODE,
      mode,
    );

    if (success) {
      this.targetHeaterCoolerState = state;
    }
  }

  async getHeatingThresholdTemperature(): Promise<CharacteristicValue> {
    return this.heatingThresholdTemperature;
  }

  async setHeatingThresholdTemperature(value: CharacteristicValue): Promise<void> {
    const temp = value as number;
    this.platform.log.info(`Setting heating threshold temperature to ${temp}°C`);
    this.lastCommandTime = Date.now();

    const tuyaTemp = celsiusToTuyaTemp(temp);

    const success = await this.platform.tuyaApi.sendCommand(
      this.deviceConfig.id,
      DP_CODES.SET_HEATING_TEMP,
      tuyaTemp,
    );

    if (success) {
      this.heatingThresholdTemperature = temp;
    }
  }

  async getCoolingThresholdTemperature(): Promise<CharacteristicValue> {
    return this.coolingThresholdTemperature;
  }

  async setCoolingThresholdTemperature(value: CharacteristicValue): Promise<void> {
    const temp = value as number;
    this.platform.log.info(`Setting cooling threshold temperature to ${temp}°C`);
    this.lastCommandTime = Date.now();

    const tuyaTemp = celsiusToTuyaTemp(temp);

    const success = await this.platform.tuyaApi.sendCommand(
      this.deviceConfig.id,
      DP_CODES.SET_COOLING_TEMP,
      tuyaTemp,
    );

    if (success) {
      this.coolingThresholdTemperature = temp;
    }
  }
}
