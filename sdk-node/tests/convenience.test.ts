import { describe, it, expect } from 'vitest';
import { GatewayClient } from '../src/client.js';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server.js';
import { mockHealth, mockScanAllow, mockScanBlock } from './mocks/handlers.js';

describe('convenience', () => {
  describe('isHealthy', () => {
    it('should return true when health returns healthy', async () => {
      const client = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test' });
      const result = await client.isHealthy();
      expect(result).toBe(true);
    });

    it('should return false when health throws a network error', async () => {
      server.use(
        http.get('http://localhost:8082/health', () => {
          return HttpResponse.error();
        }),
      );
      const failFastClient = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test', maxRetries: 0 });
      const result = await failFastClient.isHealthy();
      expect(result).toBe(false);
    });

    it('should return false when health returns unhealthy status', async () => {
      server.use(
        http.get('http://localhost:8082/health', () => {
          return HttpResponse.json({ ...mockHealth, status: 'unhealthy' }, { status: 200 });
        }),
      );
      const client = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test' });
      const result = await client.isHealthy();
      expect(result).toBe(false);
    });
  });

  describe('isSafe', () => {
    it('should return true when scan verdict is allow', async () => {
      const client = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test' });
      const result = await client.isSafe('safe text');
      expect(result).toBe(true);
    });

    it('should return false when scan verdict is block', async () => {
      server.use(
        http.post('http://localhost:8082/v1/scan', () => {
          return HttpResponse.json(mockScanBlock, { status: 200 });
        }),
      );
      const client = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test' });
      const result = await client.isSafe('bad text');
      expect(result).toBe(false);
    });

    it('should throw when scan throws a network error', async () => {
      server.use(
        http.post('http://localhost:8082/v1/scan', () => {
          return HttpResponse.error();
        }),
      );
      const failFastClient = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test', maxRetries: 0 });
      await expect(failFastClient.isSafe('test')).rejects.toThrow();
    });
  });
});
