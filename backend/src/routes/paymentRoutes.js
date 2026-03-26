'use strict';

const express = require('express');
const router = express.Router();
const {
  getPaymentInstructions,
  createPaymentIntent,
  verifyPayment,
  syncAllPayments,
  finalizePayments,
  getStudentPayments,
  getAcceptedAssets,
  getPaymentLimitsEndpoint,
  getOverpayments,
  getStudentBalance,
  getSuspiciousPayments,
  getPendingPayments,
  getRetryQueue,
  getExchangeRates,
  getAllPayments,
  getDeadLetterJobs,
  retryDeadLetterJob,
  lockPaymentForUpdate,
  unlockPayment,
} = require('../controllers/paymentController');

const {
  validateStudentIdParam,
  validateCreatePaymentIntent,
  validateVerifyPayment,
} = require('../middleware/validate');
const { resolveSchool } = require('../middleware/schoolContext');
const idempotency = require('../middleware/idempotency');

// All payment routes require school context
router.use(resolveSchool);

// ── Static routes (before parameterized ones) ────────────────────────────────
router.get('/accepted-assets',               getAcceptedAssets);
router.get('/limits',                        getPaymentLimitsEndpoint);
router.get('/overpayments',                  getOverpayments);
router.get('/suspicious',                    getSuspiciousPayments);
router.get('/pending',                       getPendingPayments);
router.get('/retry-queue',                   getRetryQueue);
router.get('/exchange-rates',                getExchangeRates);

// ── Collection routes ────────────────────────────────────────────────────────
router.get('/',                              getAllPayments);

// ── Dead Letter Queue endpoints ──────────────────────────────────────────────
router.get('/dead-letter-queue',             getDeadLetterJobs);
router.post('/dead-letter-queue/:id/retry',  retryDeadLetterJob);

// ── POST routes (mutating operations) ────────────────────────────────────────
router.post('/intents',                      idempotency, validateCreatePaymentIntent, createPaymentIntent);
router.post('/verify',                       idempotency, validateVerifyPayment, verifyPayment);
router.post('/sync',                         syncAllPayments);
router.post('/finalize',                     finalizePayments);

// ── Parameterized routes (must come last) ────────────────────────────────────
router.get('/students/:studentId/balance',   validateStudentIdParam, getStudentBalance);
router.get('/students/:studentId/instructions', validateStudentIdParam, getPaymentInstructions);
router.get('/students/:studentId',           validateStudentIdParam, getStudentPayments);

// ── Payment locking mechanism ────────────────────────────────────────────────
router.patch('/:paymentId/lock',             lockPaymentForUpdate);
router.patch('/:paymentId/unlock',           unlockPayment);

module.exports = router;
