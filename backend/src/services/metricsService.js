'use strict';

/**
 * Payment Processing Metrics Collector
 * 
 * Lightweight observability for StellarEduPay payment operations.
 * Collects timing, success/failure rates, and payment outcome metrics.
 */

const logger = require('../utils/logger').child('MetricsService');

// Configuration from environment variables
const METRICS_RETENTION_MINUTES = parseInt(process.env.METRICS_RETENTION_MINUTES || '60', 10);
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory data structures
let dataPoints = [];
let paymentOutcomeCounters = {
  valid: 0,
  underpaid: 0,
  overpaid: 0,
  unknown: 0,
  suspicious: 0,
  seenTxHashes: new Set()
};
let retryCounters = {
  retryQueued: 0,
  retryResolved: 0,
  retryDeadLetter: 0
};

// Cleanup interval reference
let cleanupInterval = null;

/**
 * MetricDataPoint structure
 * @typedef {Object} MetricDataPoint
 * @property {string} name - Operation name (e.g., "syncPayments", "stellar_horizon")
 * @property {number} durationMs - Elapsed time in milliseconds
 * @property {'success'|'failure'} status - Operation outcome
 * @property {string|null} errorCode - Error code if status is 'failure'
 * @property {Date} recordedAt - Timestamp for windowing and retention
 */

/**
 * Record a completed operation data point
 * @param {string} name - Operation name
 * @param {number} durationMs - Duration in milliseconds
 * @param {'success'|'failure'} status - Operation outcome
 * @param {string|null} errorCode - Error code if failure
 */
function record(name, durationMs, status, errorCode = null) {
  try {
    const dataPoint = {
      name,
      durationMs: Math.max(0, durationMs), // Ensure non-negative
      status,
      errorCode,
      recordedAt: new Date()
    };
    
    dataPoints.push(dataPoint);
    
    logger.debug('Metric recorded', {
      name,
      durationMs,
      status,
      errorCode
    });
  } catch (error) {
    logger.warn('Failed to record metric', {
      name,
      durationMs,
      status,
      error: error.message
    });
  }
}

/**
 * Record a payment outcome with deduplication
 * @param {string} feeValidationStatus - 'valid', 'underpaid', 'overpaid', 'unknown'
 * @param {boolean} isSuspicious - Whether payment is flagged as suspicious
 * @param {string} txHash - Transaction hash for deduplication
 */
function recordPaymentOutcome(feeValidationStatus, isSuspicious, txHash) {
  try {
    // Deduplicate on txHash
    if (paymentOutcomeCounters.seenTxHashes.has(txHash)) {
      return;
    }
    
    paymentOutcomeCounters.seenTxHashes.add(txHash);
    
    // Increment appropriate counter
    if (paymentOutcomeCounters.hasOwnProperty(feeValidationStatus)) {
      paymentOutcomeCounters[feeValidationStatus]++;
    }
    
    if (isSuspicious) {
      paymentOutcomeCounters.suspicious++;
    }
    
    logger.debug('Payment outcome recorded', {
      feeValidationStatus,
      isSuspicious,
      txHash
    });
  } catch (error) {
    logger.warn('Failed to record payment outcome', {
      feeValidationStatus,
      isSuspicious,
      txHash,
      error: error.message
    });
  }
}

/**
 * Record a retry queue event
 * @param {'queued'|'resolved'|'dead_letter'} eventType - Type of retry event
 */
function recordRetryEvent(eventType) {
  try {
    switch (eventType) {
      case 'queued':
        retryCounters.retryQueued++;
        break;
      case 'resolved':
        retryCounters.retryResolved++;
        break;
      case 'dead_letter':
        retryCounters.retryDeadLetter++;
        break;
      default:
        logger.warn('Unknown retry event type', { eventType });
        return;
    }
    
    logger.debug('Retry event recorded', { eventType });
  } catch (error) {
    logger.warn('Failed to record retry event', {
      eventType,
      error: error.message
    });
  }
}

/**
 * Calculate percentiles from an array of numbers
 * @param {number[]} values - Array of numeric values
 * @param {number} percentile - Percentile to calculate (0-100)
 * @returns {number|null} Percentile value or null if no data
 */
function calculatePercentile(values, percentile) {
  if (!values || values.length === 0) return null;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  
  if (index === Math.floor(index)) {
    return sorted[index];
  }
  
  const lower = sorted[Math.floor(index)];
  const upper = sorted[Math.ceil(index)];
  return lower + (upper - lower) * (index - Math.floor(index));
}

/**
 * Get aggregated metrics snapshot for a time window
 * @param {number} windowMinutes - Time window in minutes (default: 60)
 * @returns {Object} Metric snapshot
 */
function getSnapshot(windowMinutes = 60) {
  try {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    
    // Filter data points within the window
    const windowedPoints = dataPoints.filter(point => point.recordedAt >= windowStart);
    
    // Group by operation name
    const operationGroups = {};
    const stellarLatencyPoints = [];
    
    for (const point of windowedPoints) {
      if (point.name === 'stellar_horizon') {
        stellarLatencyPoints.push(point.durationMs);
      }
      
      if (!operationGroups[point.name]) {
        operationGroups[point.name] = {
          total: 0,
          success: 0,
          failure: 0,
          durations: []
        };
      }
      
      const group = operationGroups[point.name];
      group.total++;
      group.durations.push(point.durationMs);
      
      if (point.status === 'success') {
        group.success++;
      } else {
        group.failure++;
      }
    }
    
    // Build operations summary
    const operations = {};
    for (const [name, group] of Object.entries(operationGroups)) {
      operations[name] = {
        total: group.total,
        success: group.success,
        failure: group.failure,
        successRate: group.total > 0 ? (group.success / group.total) * 100 : null,
        p50Ms: calculatePercentile(group.durations, 50),
        p95Ms: calculatePercentile(group.durations, 95),
        p99Ms: calculatePercentile(group.durations, 99)
      };
    }
    
    // Calculate current retry queue depth
    const currentDepth = Math.max(0, 
      retryCounters.retryQueued - retryCounters.retryResolved - retryCounters.retryDeadLetter
    );
    
    return {
      collectedAt: new Date().toISOString(),
      windowMinutes,
      operations,
      stellarLatency: {
        p50Ms: calculatePercentile(stellarLatencyPoints, 50),
        p95Ms: calculatePercentile(stellarLatencyPoints, 95),
        p99Ms: calculatePercentile(stellarLatencyPoints, 99)
      },
      paymentOutcomes: {
        valid: paymentOutcomeCounters.valid,
        underpaid: paymentOutcomeCounters.underpaid,
        overpaid: paymentOutcomeCounters.overpaid,
        unknown: paymentOutcomeCounters.unknown,
        suspicious: paymentOutcomeCounters.suspicious
      },
      retryQueue: {
        retryQueued: retryCounters.retryQueued,
        retryResolved: retryCounters.retryResolved,
        retryDeadLetter: retryCounters.retryDeadLetter,
        currentDepth
      }
    };
  } catch (error) {
    logger.error('Failed to generate metrics snapshot', {
      error: error.message,
      windowMinutes
    });
    throw error;
  }
}

/**
 * Clean up old data points beyond retention window
 */
function cleanup() {
  try {
    const cutoff = new Date(Date.now() - METRICS_RETENTION_MINUTES * 60 * 1000);
    const initialCount = dataPoints.length;
    
    dataPoints = dataPoints.filter(point => point.recordedAt >= cutoff);
    
    const removedCount = initialCount - dataPoints.length;
    if (removedCount > 0) {
      logger.debug('Metrics cleanup completed', {
        removedCount,
        remainingCount: dataPoints.length,
        retentionMinutes: METRICS_RETENTION_MINUTES
      });
    }
  } catch (error) {
    logger.warn('Metrics cleanup failed', {
      error: error.message
    });
  }
}

/**
 * Start the cleanup interval
 */
function startCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  cleanupInterval = setInterval(cleanup, CLEANUP_INTERVAL_MS);
  logger.info('Metrics cleanup scheduled', {
    intervalMs: CLEANUP_INTERVAL_MS,
    retentionMinutes: METRICS_RETENTION_MINUTES
  });
}

/**
 * Stop the cleanup interval
 */
function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Metrics cleanup stopped');
  }
}

// Start cleanup on module load
startCleanup();

module.exports = {
  record,
  recordPaymentOutcome,
  recordRetryEvent,
  getSnapshot,
  cleanup,
  startCleanup,
  stopCleanup
};