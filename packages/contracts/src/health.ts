export interface HealthData {
  service: 'api';
  status: 'ok';
  timestamp: string;
}

export interface ReadinessData {
  checks: {
    database: 'up';
  };
  service: 'api';
  status: 'ready';
  timestamp: string;
}
