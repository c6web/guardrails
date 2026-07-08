export interface GatewayHealth {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  data_db: boolean;
  log_db: boolean;
  cache_loaded_at: string | null;
  cache_next_reload_at: string | null;
  cache_next_reload_in: string | null;
  detection_degraded: boolean;
}
