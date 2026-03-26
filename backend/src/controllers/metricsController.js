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
        return res.status(400).json({
          error: 'Invalid window parameter. Must be a positive integer representing minutes.',
          code: 'INVALID_WINDOW'
        });
      }
      windowMinutes = parsed;
    }
    
    // Get metrics snapshot
    const snapshot = metricsService.getSnapshot(windowMinutes);
    
    res.status(200).json(snapshot);
  } catch (error) {
    logger.error('Failed to get metrics snapshot', {
      error: error.message,
      query: req.query
    });
    
    res.status(500).json({
      error: 'Internal server error while retrieving metrics',
      code: 'METRICS_ERROR'
    });
  }
}

module.exports = {
  getMetrics
};