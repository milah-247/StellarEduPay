'use strict';

// Must set required env vars before app is loaded
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.SCHOOL_WALLET_ADDRESS = 'GTEST123';

const request = require('supertest');

// Mock dependencies
jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue(true),
  Schema: class {
    constructor() { this.index = jest.fn(); }
  },
  model: jest.fn().mockReturnValue({}),
}));

jest.mock('../backend/src/config/retryQueueSetup', () => ({
  initializeRetryQueue: jest.fn(),
  setupMonitoring: jest.fn(),
}));

jest.mock('../backend/src/services/retryService', () => ({
  queueForRetry: jest.fn().mockResolvedValue(undefined),
  startRetryWorker: jest.fn(),
  stopRetryWorker: jest.fn(),
  isRetryWorkerRunning: jest.fn().mockReturnValue(false),
}));

jest.mock('../backend/src/services/transactionService', () => ({
  startPolling: jest.fn(),
  stopPolling: jest.fn(),
}));

jest.mock('../backend/src/services/consistencyScheduler', () => ({
  startConsistencyScheduler: jest.fn(),
}));

const app = require('../backend/src/app');

describe('Metrics API', () => {
  test('GET /api/metrics returns metrics snapshot', async () => {
    const res = await request(app).get('/api/metrics');
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('collectedAt');
    expect(res.body).toHaveProperty('windowMinutes', 60);
    expect(res.body).toHaveProperty('operations');
    expect(res.body).toHaveProperty('stellarLatency');
    expect(res.body).toHaveProperty('paymentOutcomes');
    expect(res.body).toHaveProperty('retryQueue');
  });

  test('GET /api/metrics?window=30 returns 30-minute window', async () => {
    const res = await request(app).get('/api/metrics?window=30');
    
    expect(res.status).toBe(200);
    expect(res.body.windowMinutes).toBe(30);
  });

  test('GET /api/metrics?window=invalid returns 400', async () => {
    const res = await request(app).get('/api/metrics?window=invalid');
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'INVALID_WINDOW');
  });

  test('GET /api/metrics?window=-1 returns 400', async () => {
    const res = await request(app).get('/api/metrics?window=-1');
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'INVALID_WINDOW');
  });
});

describe('Metrics Service', () => {
  const metricsService = require('../backend/src/services/metricsService');
  
  beforeEach(() => {
    // Reset metrics state between tests
    metricsService.cleanup();
  });

  test('records operation metrics correctly', () => {
    metricsService.record('testOperation', 100, 'success');
    
    const snapshot = metricsService.getSnapshot(60);
    expect(snapshot.operations.testOperation).toMatchObject({
      total: 1,
      success: 1,
      failure: 0,
      successRate: 100
    });
  });

  test('records payment outcomes with deduplication', () => {
    const txHash = 'test-tx-hash';
    
    metricsService.recordPaymentOutcome('valid', false, txHash);
    metricsService.recordPaymentOutcome('valid', false, txHash); // Duplicate
    
    const snapshot = metricsService.getSnapshot(60);
    expect(snapshot.paymentOutcomes.valid).toBe(1);
  });

  test('records retry events correctly', () => {
    metricsService.recordRetryEvent('queued');
    metricsService.recordRetryEvent('resolved');
    
    const snapshot = metricsService.getSnapshot(60);
    expect(snapshot.retryQueue.retryQueued).toBe(1);
    expect(snapshot.retryQueue.retryResolved).toBe(1);
    expect(snapshot.retryQueue.currentDepth).toBe(0);
  });
});