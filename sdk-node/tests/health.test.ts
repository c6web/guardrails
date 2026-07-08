import { describe, it, expect } from 'vitest';
import { GatewayClient } from '../src/client.js';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server.js';
import { mockHealth, mockUnhealthy } from './mocks/handlers.js';

const client = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test' });

describe('health', () => {
  it('should return GatewayHealth for a healthy gateway', async () => {
    const result = await client.health();
    expect(result.status).toBe('healthy');
    expect(result.data_db).toBe(true);
    expect(result.timestamp).toBeDefined();
  });

  it('should return unhealthy status when gateway is unhealthy', async () => {
    server.use(
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockUnhealthy, { status: 200 });
      }),
    );
    const result = await client.health();
    expect(result.status).toBe('unhealthy');
  });

  it('should not send Authorization header on health request', async () => {
    let authHeader: string | null = null;
    server.use(
      http.get('http://localhost:8082/health', ({ request }) => {
        authHeader = request.headers.get('Authorization');
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    await client.health();
    expect(authHeader).toBeNull();
  });
});
