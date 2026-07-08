/**
 * Health check example — demonstrates health() for full gateway status
 * and isHealthy() for a quick boolean check.
 */

import { GatewayClient } from '@c6web/guardrails';

const client = new GatewayClient();

// Full health status
const status = await client.health();
console.log('Status:', status.status);
console.log('Data DB:', status.data_db);
console.log('Log DB:', status.log_db);
console.log('Detection degraded:', status.detection_degraded);

// Quick boolean check
const healthy = await client.isHealthy();
console.log('Is healthy:', healthy);
