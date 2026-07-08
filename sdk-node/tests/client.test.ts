import { describe, it, expect, beforeEach } from 'vitest';
import { GatewayClient } from '../src/client.js';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server.js';
import { mockHealth } from './mocks/handlers.js';

beforeEach(() => {
  delete process.env['GATEWAY_URL'];
  delete process.env['GATEWAY_API_KEY'];
});

describe('GatewayClient constructor', () => {
  it('should read defaults from env vars', () => {
    process.env['GATEWAY_URL'] = 'http://localhost:8082';
    process.env['GATEWAY_API_KEY'] = 'ak_test_key';
    const client = new GatewayClient();
    expect(client).toBeInstanceOf(GatewayClient);
  });

  it('should use explicit options overriding env vars', () => {
    process.env['GATEWAY_URL'] = 'http://wrong-url:9999';
    const client = new GatewayClient({ baseUrl: 'http://localhost:8082' });
    expect(client).toBeInstanceOf(GatewayClient);
  });

  it('should strip trailing slash from baseUrl', async () => {
    const client = new GatewayClient({ baseUrl: 'http://localhost:8082/', apiKey: 'test' });
    const result = await client.health();
    expect(result.status).toBe('healthy');
  });
});
