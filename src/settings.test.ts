import {
  isHeatingMode,
  isCoolingMode,
  isAutoMode,
  tuyaTempToCelsius,
  celsiusToTuyaTemp,
  TUYA_MODES,
  TEMP_SCALE,
  TEMP_RANGES,
  DP_CODES,
} from './settings';

describe('Mode detection helpers', () => {
  describe('isHeatingMode', () => {
    it('should return true for Heating_Smart', () => {
      expect(isHeatingMode(TUYA_MODES.HEATING_SMART)).toBe(true);
    });

    it('should return true for Heating_Powerful', () => {
      expect(isHeatingMode(TUYA_MODES.HEATING_POWERFUL)).toBe(true);
    });

    it('should return true for Heating_Silent', () => {
      expect(isHeatingMode(TUYA_MODES.HEATING_SILENT)).toBe(true);
    });

    it('should return false for cooling modes', () => {
      expect(isHeatingMode(TUYA_MODES.COOLING_SMART)).toBe(false);
      expect(isHeatingMode(TUYA_MODES.COOLING_POWERFUL)).toBe(false);
      expect(isHeatingMode(TUYA_MODES.COOLING_SILENT)).toBe(false);
    });

    it('should return false for auto mode', () => {
      expect(isHeatingMode(TUYA_MODES.AUTO)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isHeatingMode('HEATING_SMART')).toBe(true);
      expect(isHeatingMode('heating_smart')).toBe(true);
    });
  });

  describe('isCoolingMode', () => {
    it('should return true for Cooling_Smart', () => {
      expect(isCoolingMode(TUYA_MODES.COOLING_SMART)).toBe(true);
    });

    it('should return true for Cooling_Powerful', () => {
      expect(isCoolingMode(TUYA_MODES.COOLING_POWERFUL)).toBe(true);
    });

    it('should return true for Cooling_Silent', () => {
      expect(isCoolingMode(TUYA_MODES.COOLING_SILENT)).toBe(true);
    });

    it('should return false for heating modes', () => {
      expect(isCoolingMode(TUYA_MODES.HEATING_SMART)).toBe(false);
      expect(isCoolingMode(TUYA_MODES.HEATING_POWERFUL)).toBe(false);
      expect(isCoolingMode(TUYA_MODES.HEATING_SILENT)).toBe(false);
    });

    it('should return false for auto mode', () => {
      expect(isCoolingMode(TUYA_MODES.AUTO)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isCoolingMode('COOLING_SMART')).toBe(true);
      expect(isCoolingMode('cooling_smart')).toBe(true);
    });
  });

  describe('isAutoMode', () => {
    it('should return true for Auto', () => {
      expect(isAutoMode(TUYA_MODES.AUTO)).toBe(true);
    });

    it('should return false for heating modes', () => {
      expect(isAutoMode(TUYA_MODES.HEATING_SMART)).toBe(false);
    });

    it('should return false for cooling modes', () => {
      expect(isAutoMode(TUYA_MODES.COOLING_SMART)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isAutoMode('AUTO')).toBe(true);
      expect(isAutoMode('auto')).toBe(true);
      expect(isAutoMode('Auto')).toBe(true);
    });
  });
});

describe('Temperature conversion helpers', () => {
  describe('tuyaTempToCelsius', () => {
    it('should divide by TEMP_SCALE (10)', () => {
      expect(tuyaTempToCelsius(250)).toBe(25);
      expect(tuyaTempToCelsius(200)).toBe(20);
      expect(tuyaTempToCelsius(355)).toBe(35.5);
    });

    it('should handle zero', () => {
      expect(tuyaTempToCelsius(0)).toBe(0);
    });

    it('should handle negative values', () => {
      expect(tuyaTempToCelsius(-50)).toBe(-5);
    });
  });

  describe('celsiusToTuyaTemp', () => {
    it('should multiply by TEMP_SCALE (10)', () => {
      expect(celsiusToTuyaTemp(25)).toBe(250);
      expect(celsiusToTuyaTemp(20)).toBe(200);
    });

    it('should round to nearest integer', () => {
      expect(celsiusToTuyaTemp(25.4)).toBe(254);
      expect(celsiusToTuyaTemp(25.5)).toBe(255);
      expect(celsiusToTuyaTemp(25.6)).toBe(256);
    });

    it('should handle zero', () => {
      expect(celsiusToTuyaTemp(0)).toBe(0);
    });

    it('should handle negative values', () => {
      expect(celsiusToTuyaTemp(-5)).toBe(-50);
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve integer celsius values', () => {
      const original = 28;
      const tuya = celsiusToTuyaTemp(original);
      const back = tuyaTempToCelsius(tuya);
      expect(back).toBe(original);
    });

    it('should preserve values at 0.1 precision', () => {
      const original = 28.5;
      const tuya = celsiusToTuyaTemp(original);
      const back = tuyaTempToCelsius(tuya);
      expect(back).toBe(original);
    });
  });
});

describe('Constants', () => {
  describe('TEMP_SCALE', () => {
    it('should be 10', () => {
      expect(TEMP_SCALE).toBe(10);
    });
  });

  describe('TEMP_RANGES', () => {
    it('should have valid heating range', () => {
      expect(TEMP_RANGES.heating.min).toBeLessThan(TEMP_RANGES.heating.max);
    });

    it('should have valid cooling range', () => {
      expect(TEMP_RANGES.cooling.min).toBeLessThan(TEMP_RANGES.cooling.max);
    });

    it('should have valid auto range', () => {
      expect(TEMP_RANGES.auto.min).toBeLessThan(TEMP_RANGES.auto.max);
    });
  });

  describe('DP_CODES', () => {
    it('should have all required codes', () => {
      expect(DP_CODES.SWITCH).toBe('switch');
      expect(DP_CODES.MODE).toBe('mode');
      expect(DP_CODES.TEMP_CURRENT).toBe('temp_current');
      expect(DP_CODES.SET_HEATING_TEMP).toBe('set_heating_temp');
      expect(DP_CODES.SET_COOLING_TEMP).toBe('set_cold_temp');
      expect(DP_CODES.SET_AUTO_TEMP).toBe('set_auto_temp');
    });
  });

  describe('TUYA_MODES', () => {
    it('should have all mode values', () => {
      expect(TUYA_MODES.AUTO).toBe('Auto');
      expect(TUYA_MODES.HEATING_SMART).toBe('Heating_Smart');
      expect(TUYA_MODES.HEATING_POWERFUL).toBe('Heating_Powerful');
      expect(TUYA_MODES.HEATING_SILENT).toBe('Heating_Silent');
      expect(TUYA_MODES.COOLING_SMART).toBe('Cooling_Smart');
      expect(TUYA_MODES.COOLING_POWERFUL).toBe('Cooling_Powerful');
      expect(TUYA_MODES.COOLING_SILENT).toBe('Cooling_Silent');
    });
  });
});
