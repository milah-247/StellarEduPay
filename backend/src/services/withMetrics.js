'use strict';

/**
 * Metrics Wrapper
 * 
 * Provides a wrapper function to automatically record timing and outcome metrics
 * for async operations without disrupting the original function behavior.
 */

const metricsService = require('./metricsService');
const logger = require('../utils/logger').child('WithMetrics');

/**
 * Wrap an async function to automatically record metrics
 * @param {string} operationName - Name of the operation for metrics
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function that records metrics
 */
async function withMetrics(operationName, fn) {
  const startTime = Date.now();
  
  try {
    const result = await fn();
    
    // Record success metric
    const duration = Date.now() - startTime;
    try {
      metricsService.record(operationName, duration, 'success');
    } catch (metricsError) {
      // Never let metrics errors affect the original operation
      logger.warn('Failed to record success metric', {
        operationName,
        duration,
        error: metricsError.message
      });
    }
    
    return result;
  } catch (error) {
    // Record failure metric
    const duration = Date.now() - startTime;
    try {
      metricsService.record(operationName, duration, 'failure', error.code || 'UNKNOWN');
    } catch (metricsError) {
      // Never let metrics errors affect the original operation
      logger.warn('Failed to record failure metric', {
        operationName,
        duration,
        errorCode: error.code || 'UNKNOWN',
        error: metricsError.message
      });
    }
    
    // Re-throw the original error unchanged
    throw error;
  }
}

module.exports = withMetrics;