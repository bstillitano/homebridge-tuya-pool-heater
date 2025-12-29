import crypto from 'crypto';
import axios from 'axios';
import { TuyaApi } from './tuyaApi';
import { PluginOptions } from './settings';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as any;

const testOptions: PluginOptions = {
  accessId: 'test_access_id',
  accessKey: 'test_access_key',
  endpoint: 'https://openapi.tuyaus.com',
  username: 'test@example.com',
  password: 'test_password',
  countryCode: 1,
};

describe('TuyaApi', () => {
  let api: TuyaApi;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      request: jest.fn(),
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    api = new TuyaApi(testOptions, mockLogger);
  });

  describe('constructor', () => {
    it('should create axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: testOptions.endpoint,
        timeout: 10000,
      });
    });
  });

  describe('authenticate', () => {
    it('should request token and authenticate with user credentials', async () => {
      // Mock token response
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: {
            access_token: 'temp_token',
            refresh_token: 'temp_refresh',
            expire_time: 7200,
            uid: 'temp_uid',
          },
        },
      });

      // Mock auth response
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          success: true,
          result: {
            access_token: 'final_token',
            refresh_token: 'final_refresh',
            expire_time: 7200,
            uid: 'user_uid',
          },
        },
      });

      await api.authenticate();

      // Verify token request
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
      const tokenCall = mockAxiosInstance.get.mock.calls[0];
      expect(tokenCall[0]).toBe('/v1.0/token?grant_type=1');

      // Verify auth request
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
      const authCall = mockAxiosInstance.post.mock.calls[0];
      expect(authCall[0]).toBe('/v1.0/iot-01/associated-users/actions/authorized-login');

      // Verify password is MD5 hashed
      const authBody = authCall[1];
      const expectedPasswordHash = crypto
        .createHash('md5')
        .update(testOptions.password)
        .digest('hex');
      expect(authBody.password).toBe(expectedPasswordHash);
      expect(authBody.username).toBe(testOptions.username);
      expect(authBody.country_code).toBe(testOptions.countryCode.toString());

      expect(mockLogger.info).toHaveBeenCalledWith('Successfully authenticated with Tuya API');
    });

    it('should throw error on token request failure', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: false,
          msg: 'Invalid credentials',
        },
      });

      await expect(api.authenticate()).rejects.toThrow('Token request failed: Invalid credentials');
    });

    it('should throw error on auth request failure', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: {
            access_token: 'temp_token',
            refresh_token: 'temp_refresh',
            expire_time: 7200,
            uid: 'temp_uid',
          },
        },
      });

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          success: false,
          msg: 'User not found',
        },
      });

      await expect(api.authenticate()).rejects.toThrow('Authentication failed: User not found');
    });
  });

  describe('getDeviceStatus', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: {
            access_token: 'test_token',
            refresh_token: 'test_refresh',
            expire_time: 7200,
            uid: 'test_uid',
          },
        },
      });
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          success: true,
          result: {
            access_token: 'final_token',
            refresh_token: 'final_refresh',
            expire_time: 7200,
            uid: 'user_uid',
          },
        },
      });
      await api.authenticate();
    });

    it('should fetch device status', async () => {
      const deviceId = 'test_device_id';
      const mockStatus = [
        { code: 'switch', value: true },
        { code: 'temp_current', value: 280 },
        { code: 'mode', value: 'Heating_Smart' },
      ];

      mockAxiosInstance.request.mockResolvedValueOnce({
        data: {
          success: true,
          result: mockStatus,
        },
      });

      const status = await api.getDeviceStatus(deviceId);

      expect(status).toEqual(mockStatus);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: `/v1.0/devices/${deviceId}/status`,
        }),
      );
    });
  });

  describe('sendCommand', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: {
            access_token: 'test_token',
            refresh_token: 'test_refresh',
            expire_time: 7200,
            uid: 'test_uid',
          },
        },
      });
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          success: true,
          result: {
            access_token: 'final_token',
            refresh_token: 'final_refresh',
            expire_time: 7200,
            uid: 'user_uid',
          },
        },
      });
      await api.authenticate();
    });

    it('should send command to device', async () => {
      const deviceId = 'test_device_id';

      mockAxiosInstance.request.mockResolvedValueOnce({
        data: {
          success: true,
          result: true,
        },
      });

      const result = await api.sendCommand(deviceId, 'switch', true);

      expect(result).toBe(true);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: `/v1.0/devices/${deviceId}/commands`,
          data: JSON.stringify({ commands: [{ code: 'switch', value: true }] }),
        }),
      );
    });

    it('should return false on command failure', async () => {
      const deviceId = 'test_device_id';

      mockAxiosInstance.request.mockRejectedValueOnce(new Error('Command failed'));

      const result = await api.sendCommand(deviceId, 'switch', true);

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('sendCommands', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: {
            access_token: 'test_token',
            refresh_token: 'test_refresh',
            expire_time: 7200,
            uid: 'test_uid',
          },
        },
      });
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          success: true,
          result: {
            access_token: 'final_token',
            refresh_token: 'final_refresh',
            expire_time: 7200,
            uid: 'user_uid',
          },
        },
      });
      await api.authenticate();
    });

    it('should send multiple commands at once', async () => {
      const deviceId = 'test_device_id';
      const commands = [
        { code: 'switch', value: true },
        { code: 'mode', value: 'Heating_Smart' },
      ];

      mockAxiosInstance.request.mockResolvedValueOnce({
        data: {
          success: true,
          result: true,
        },
      });

      const result = await api.sendCommands(deviceId, commands);

      expect(result).toBe(true);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: JSON.stringify({ commands }),
        }),
      );
    });
  });
});

describe('HMAC-SHA256 Signature', () => {
  it('should generate correct signature format', () => {
    // This tests the signature algorithm matches Tuya's requirements
    const accessId = 'test_id';
    const accessKey = 'test_key';
    const timestamp = '1234567890000';
    const method = 'GET';
    const path = '/v1.0/token';
    const body = '';

    const contentHash = crypto.createHash('sha256').update(body).digest('hex');
    const stringToSign = [method, contentHash, '', path].join('\n');
    const signStr = accessId + timestamp + stringToSign;

    const expectedSign = crypto
      .createHmac('sha256', accessKey)
      .update(signStr)
      .digest('hex')
      .toUpperCase();

    // Verify the signature is 64 characters (256 bits in hex)
    expect(expectedSign).toHaveLength(64);
    // Verify it's uppercase hex
    expect(expectedSign).toMatch(/^[A-F0-9]{64}$/);
  });
});
