import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { Logger } from 'homebridge';
import { PluginOptions, TuyaDeviceStatus } from './settings';

interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  expireTime: number;
  uid: string;
}

interface TuyaResponse<T> {
  success: boolean;
  code: number;
  msg: string;
  result: T;
  t: number;
  tid: string;
}

export class TuyaApi {
  private readonly client: AxiosInstance;
  private tokenInfo: TokenInfo | null = null;
  private readonly options: PluginOptions;
  private readonly log: Logger;

  constructor(options: PluginOptions, log: Logger) {
    this.options = options;
    this.log = log;
    this.client = axios.create({
      baseURL: options.endpoint,
      timeout: 10000,
    });
  }

  // Generate HMAC-SHA256 signature
  private sign(
    method: string,
    path: string,
    query: Record<string, string> = {},
    body: string = '',
    timestamp: string,
    accessToken: string = '',
  ): string {
    // Parse path and query if query is in path
    let basePath = path;
    const mergedQuery = { ...query };

    if (path.includes('?')) {
      const [p, q] = path.split('?');
      basePath = p;
      if (q) {
        q.split('&').forEach(param => {
          const [key, value] = param.split('=');
          if (key && value !== undefined) {
            mergedQuery[key] = value;
          }
        });
      }
    }

    const contentHash = crypto.createHash('sha256').update(body).digest('hex');

    const queryString = Object.keys(mergedQuery)
      .sort()
      .map(key => `${key}=${mergedQuery[key]}`)
      .join('&');

    const url = queryString ? `${basePath}?${queryString}` : basePath;

    const stringToSign = [
      method.toUpperCase(),
      contentHash,
      '',
      url,
    ].join('\n');

    const signStr = this.options.accessId + accessToken + timestamp + stringToSign;

    return crypto
      .createHmac('sha256', this.options.accessKey)
      .update(signStr)
      .digest('hex')
      .toUpperCase();
  }

  // Make authenticated API request
  private async request<T>(
    method: string,
    path: string,
    query: Record<string, string> = {},
    body: Record<string, unknown> = {},
  ): Promise<T> {
    const timestamp = Date.now().toString();
    const bodyStr = Object.keys(body).length > 0 ? JSON.stringify(body) : '';

    const accessToken = this.tokenInfo?.accessToken || '';
    const sign = this.sign(method, path, query, bodyStr, timestamp, accessToken);

    const headers: Record<string, string> = {
      't': timestamp,
      'client_id': this.options.accessId,
      'sign': sign,
      'sign_method': 'HMAC-SHA256',
    };

    if (accessToken) {
      headers['access_token'] = accessToken;
    }

    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
    }

    const queryString = Object.keys(query)
      .sort()
      .map(key => `${key}=${query[key]}`)
      .join('&');

    const url = queryString ? `${path}?${queryString}` : path;

    try {
      const response = await this.client.request<TuyaResponse<T>>({
        method,
        url,
        headers,
        data: bodyStr || undefined,
      });

      if (!response.data.success) {
        throw new Error(`Tuya API error: ${response.data.code} - ${response.data.msg}`);
      }

      return response.data.result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 'unknown';
        const data = error.response?.data;
        const errorMsg = data?.msg || error.message || 'Unknown error';
        this.log.error(`Tuya API request failed: [${status}] ${errorMsg}`);
        if (data) {
          this.log.debug('Response data:', JSON.stringify(data));
        }
        throw new Error(`Tuya API request failed: [${status}] ${errorMsg}`);
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      this.log.error('Tuya API request failed:', errMsg);
      throw new Error(`Tuya API request failed: ${errMsg}`);
    }
  }

  // Get access token using user credentials
  async authenticate(): Promise<void> {
    this.log.info('Authenticating with Tuya API...');

    try {
      // First, get a token using client credentials
      const timestamp = Date.now().toString();
      const path = '/v1.0/token?grant_type=1';
      const sign = this.sign('GET', path, {}, '', timestamp);

      const tokenResponse = await this.client.get<TuyaResponse<{
        access_token: string;
        refresh_token: string;
        expire_time: number;
        uid: string;
      }>>(path, {
        headers: {
          't': timestamp,
          'client_id': this.options.accessId,
          'sign': sign,
          'sign_method': 'HMAC-SHA256',
        },
      });

      if (!tokenResponse.data.success) {
        throw new Error(`Token request failed: ${tokenResponse.data.msg}`);
      }

      const tempToken = tokenResponse.data.result.access_token;

      // Hash password
      const passwordHash = crypto
        .createHash('md5')
        .update(this.options.password)
        .digest('hex');

      // Now authenticate with user credentials
      const authBody = {
        username: this.options.username,
        password: passwordHash,
        country_code: this.options.countryCode.toString(),
        schema: 'smartlife',
      };

      const authTimestamp = Date.now().toString();
      const authPath = '/v1.0/iot-01/associated-users/actions/authorized-login';
      const authBodyStr = JSON.stringify(authBody);
      const authSign = this.sign('POST', authPath, {}, authBodyStr, authTimestamp, tempToken);

      const authResponse = await this.client.post<TuyaResponse<{
        access_token: string;
        refresh_token: string;
        expire_time: number;
        uid: string;
      }>>(authPath, authBody, {
        headers: {
          't': authTimestamp,
          'client_id': this.options.accessId,
          'sign': authSign,
          'sign_method': 'HMAC-SHA256',
          'access_token': tempToken,
          'Content-Type': 'application/json',
        },
      });

      if (!authResponse.data.success) {
        throw new Error(`Authentication failed: ${authResponse.data.msg}`);
      }

      this.tokenInfo = {
        accessToken: authResponse.data.result.access_token,
        refreshToken: authResponse.data.result.refresh_token,
        expireTime: Date.now() + (authResponse.data.result.expire_time * 1000),
        uid: authResponse.data.result.uid,
      };

      this.log.info('Successfully authenticated with Tuya API');
    } catch (error) {
      this.log.error('Authentication failed:', error);
      throw error;
    }
  }

  // Check and refresh token if needed
  private async ensureToken(): Promise<void> {
    if (!this.tokenInfo) {
      await this.authenticate();
      return;
    }

    // Refresh if token expires in less than 5 minutes
    if (Date.now() > this.tokenInfo.expireTime - 300000) {
      this.log.info('Refreshing Tuya API token...');

      try {
        const result = await this.request<{
          access_token: string;
          refresh_token: string;
          expire_time: number;
          uid: string;
        }>('GET', `/v1.0/token/${this.tokenInfo.refreshToken}`);

        this.tokenInfo = {
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          expireTime: Date.now() + (result.expire_time * 1000),
          uid: result.uid,
        };

        this.log.info('Token refreshed successfully');
      } catch {
        // If refresh fails, re-authenticate
        this.log.warn('Token refresh failed, re-authenticating...');
        this.tokenInfo = null;
        await this.authenticate();
      }
    }
  }

  // Get device status
  async getDeviceStatus(deviceId: string): Promise<TuyaDeviceStatus[]> {
    await this.ensureToken();

    const result = await this.request<TuyaDeviceStatus[]>(
      'GET',
      `/v1.0/devices/${deviceId}/status`,
    );

    return result;
  }

  // Send command to device
  async sendCommand(
    deviceId: string,
    code: string,
    value: boolean | number | string,
  ): Promise<boolean> {
    await this.ensureToken();

    try {
      await this.request<boolean>(
        'POST',
        `/v1.0/devices/${deviceId}/commands`,
        {},
        {
          commands: [{ code, value }],
        },
      );

      this.log.debug(`Command sent: ${code} = ${value}`);
      return true;
    } catch (error) {
      this.log.error(`Failed to send command ${code}:`, error);
      return false;
    }
  }

  // Send multiple commands at once
  async sendCommands(
    deviceId: string,
    commands: Array<{ code: string; value: boolean | number | string }>,
  ): Promise<boolean> {
    await this.ensureToken();

    try {
      await this.request<boolean>(
        'POST',
        `/v1.0/devices/${deviceId}/commands`,
        {},
        { commands },
      );

      this.log.debug(`Commands sent: ${JSON.stringify(commands)}`);
      return true;
    } catch (error) {
      this.log.error('Failed to send commands:', error);
      return false;
    }
  }
}
