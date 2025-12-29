import { PlatformConfig } from 'homebridge';

export const PLATFORM_NAME = 'TuyaPoolHeatPump';
export const PLUGIN_NAME = 'homebridge-tuya-pool-heater';

// Tuya API Endpoints by region
export const TUYA_ENDPOINTS: Record<string, string> = {
  us: 'https://openapi.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  cn: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
};

// Default polling interval in milliseconds
export const DEFAULT_POLL_INTERVAL = 30000;

// Temperature scaling factor (Tuya stores temps as value * 10)
export const TEMP_SCALE = 10;

// Temperature ranges per mode (in Celsius)
export const TEMP_RANGES = {
  heating: { min: 5, max: 55 },
  cooling: { min: 5, max: 35 },
  auto: { min: 5, max: 40 },
} as const;

// Tuya DP codes for pool heat pumps
export const DP_CODES = {
  SWITCH: 'switch',
  MODE: 'mode',
  TEMP_CURRENT: 'temp_current',
  SET_HEATING_TEMP: 'set_heating_temp',
  SET_COOLING_TEMP: 'set_cold_temp',
  SET_AUTO_TEMP: 'set_auto_temp',
} as const;

// Tuya mode values
export const TUYA_MODES = {
  AUTO: 'Auto',
  HEATING_SMART: 'Heating_Smart',
  HEATING_POWERFUL: 'Heating_Powerful',
  HEATING_SILENT: 'Heating_Silent',
  COOLING_SMART: 'Cooling_Smart',
  COOLING_POWERFUL: 'Cooling_Powerful',
  COOLING_SILENT: 'Cooling_Silent',
} as const;

export type TuyaMode = typeof TUYA_MODES[keyof typeof TUYA_MODES];

// Accessory types
export type AccessoryType = 'thermostat' | 'heatercooler';

// Temperature range configuration
export interface TempRangeConfig {
  min: number;
  max: number;
}

// Device configuration
export interface DeviceConfig {
  id: string;
  name: string;
  accessoryType: AccessoryType;
  heatingRange?: TempRangeConfig;
  coolingRange?: TempRangeConfig;
  autoRange?: TempRangeConfig;
}

// Plugin options
export interface PluginOptions {
  accessId: string;
  accessKey: string;
  endpoint: string;
  username: string;
  password: string;
  countryCode: number;
  pollInterval?: number;
}

// Full platform configuration
export interface TuyaPoolHeatPumpConfig extends PlatformConfig {
  options: PluginOptions;
  devices: DeviceConfig[];
}

// Tuya device status
export interface TuyaDeviceStatus {
  code: string;
  value: boolean | number | string;
}

// Parsed heat pump state
export interface HeatPumpState {
  active: boolean;
  mode: TuyaMode;
  currentTemperature: number;
  targetHeatingTemperature: number;
  targetCoolingTemperature: number;
  targetAutoTemperature: number;
}

// Helper to check if mode is heating
export function isHeatingMode(mode: string): boolean {
  return mode.toLowerCase().includes('heating');
}

// Helper to check if mode is cooling
export function isCoolingMode(mode: string): boolean {
  return mode.toLowerCase().includes('cooling');
}

// Helper to check if mode is auto
export function isAutoMode(mode: string): boolean {
  return mode.toLowerCase() === 'auto';
}

// Convert Tuya temperature to Celsius
export function tuyaTempToCelsius(value: number): number {
  return value / TEMP_SCALE;
}

// Convert Celsius to Tuya temperature
export function celsiusToTuyaTemp(value: number): number {
  return Math.round(value * TEMP_SCALE);
}
