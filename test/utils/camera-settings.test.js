import { stripAbilityFields } from '../../src/utils/camera-settings.js';

describe('Camera Settings Utils', () => {
  describe('stripAbilityFields', () => {
    test('should handle null input', () => {
      expect(stripAbilityFields(null)).toBeNull();
      expect(stripAbilityFields(undefined)).toBeNull();
    });

    test('should strip ability field from simple setting', () => {
      const input = {
        iso: {
          value: '1000',
          ability: ['100', '200', '400', '800', '1000']
        }
      };

      const expected = {
        iso: {
          value: '1000'
        }
      };

      expect(stripAbilityFields(input)).toEqual(expected);
    });

    test('should handle multiple settings', () => {
      const input = {
        iso: {
          value: '1000',
          ability: ['100', '200', '400', '800', '1000']
        },
        av: {
          value: 'f5.0',
          ability: ['f4.0', 'f5.0', 'f5.6']
        },
        wb: {
          value: 'daylight',
          ability: ['auto', 'daylight', 'cloudy']
        }
      };

      const expected = {
        iso: { value: '1000' },
        av: { value: 'f5.0' },
        wb: { value: 'daylight' }
      };

      expect(stripAbilityFields(input)).toEqual(expected);
    });

    test('should handle colortemperature with min/max/step ability', () => {
      const input = {
        colortemperature: {
          value: 5900,
          ability: {
            min: 2500,
            max: 10000,
            step: 100
          }
        }
      };

      const expected = {
        colortemperature: {
          value: 5900
        }
      };

      expect(stripAbilityFields(input)).toEqual(expected);
    });

    test('should handle nested objects without value field', () => {
      const input = {
        wbshift: {
          value: {
            ba: 0,
            mg: 0
          },
          ability: {
            ba: { min: -9, max: 9, step: 1 },
            mg: { min: -9, max: 9, step: 1 }
          }
        }
      };

      const expected = {
        wbshift: {
          value: {
            ba: 0,
            mg: 0
          }
        }
      };

      expect(stripAbilityFields(input)).toEqual(expected);
    });

    test('should handle complex nested picturestyle settings', () => {
      const input = {
        picturestyle_standard: {
          value: {
            sharpness_strength: 4,
            contrast: 0,
            saturation: 0
          },
          ability: {
            sharpness_strength: { min: 0, max: 7, step: 1 },
            contrast: { min: -4, max: 4, step: 1 },
            saturation: { min: -4, max: 4, step: 1 }
          }
        }
      };

      const expected = {
        picturestyle_standard: {
          value: {
            sharpness_strength: 4,
            contrast: 0,
            saturation: 0
          }
        }
      };

      expect(stripAbilityFields(input)).toEqual(expected);
    });

    test('should strip all ability fields from real camera settings', () => {
      const input = {
        iso: {
          value: '1000',
          ability: ['100', '200', '400', '800', '1000']
        },
        av: {
          value: 'f5.0',
          ability: ['f4.0', 'f5.0', 'f5.6']
        },
        wb: {
          value: 'colortemp',
          ability: ['auto', 'daylight', 'colortemp']
        },
        colortemperature: {
          value: 5900,
          ability: {
            min: 2500,
            max: 10000,
            step: 100
          }
        }
      };

      const result = stripAbilityFields(input);

      // No ability fields should remain
      expect(result.iso.ability).toBeUndefined();
      expect(result.av.ability).toBeUndefined();
      expect(result.wb.ability).toBeUndefined();
      expect(result.colortemperature.ability).toBeUndefined();

      // Values should remain
      expect(result.iso.value).toBe('1000');
      expect(result.av.value).toBe('f5.0');
      expect(result.wb.value).toBe('colortemp');
      expect(result.colortemperature.value).toBe(5900);
    });
  });
});
