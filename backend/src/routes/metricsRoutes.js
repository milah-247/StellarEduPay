'use strict';

/**
 * Metrics Routes
 * 
 * API endpoints for payment processing metrics.
 */

const express = require('express');
const { getMetrics } = require('../controllers/metricsController');

const router = express.Router();

// GET /api/metrics - Get payment processing metrics snapshot
router.get('/', getMetrics);

module.exports = router;