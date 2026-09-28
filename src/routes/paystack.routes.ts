import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import {
  initializePayment,
  verifyPayment,
  paystackWebhook,
} from '../controllers/paystack.controller.js';

const router = Router();

// Webhook must receive the raw body for signature verification.
// Express parses JSON globally in app.ts, so req.body is already the parsed
// object — we re-stringify it in the controller for the HMAC check.
router.post('/webhook', paystackWebhook);

// Initialize: optionalAuth so both authenticated customers and guests can pay.
router.post('/initialize', optionalAuth, initializePayment);

// Verify: public — frontend calls this after Paystack redirects back.
router.get('/verify/:reference', verifyPayment);

export default router;
