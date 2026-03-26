'use strict';

/**
 * Metrics Controller
 * 
 * Handles HTTP requests for payment processing metrics.
 */

const metricsService = require('../services/metricsService');
const logger = require('../utils/logger').child('MetricsController');

/**
 * GET /api/metrics
 * Returns a snapshot of payment processing metrics
 */
async function getMetrics(req, res) {
  try {
    // Parse and validate window parameter
    let windowMinutes = 60; // default
    
    if (req.query.window) {
      const parsed = parseInt(req.query.window, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return validationError(res, {
          field: 'window',
          value: req.query.window,
          message: 'Must be a positive integer representing minutes'
        }, 'Invalid window parameter');
      }
      windowMinutes = parsed;
    }
    
    // Get metrics snapshot
    const snapshot = metricsService.getSnapshot(windowMinutes);
    
    return success(res, snapshot, 'Metrics retrieved successfully');
  } catch (error) {
    logger.error('Failed to get metrics snapshot', {
      error: error.message,
      query: req.query
    });
    
    return serverError(res, 'Failed to retrieve metrics');
  }
}

module.exports = {
  getMetrics
};