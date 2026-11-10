import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  beginGoogleOAuth,
  completeGoogleOAuth,
  getMe,
  requestCode,
  verifyCode,
  patchMe,
  refresh,
  logout,
} from '../controllers/auth.controller.js';
import { authRateLimit } from '../middleware/auth-rate-limit.js';

const router = Router();

router.post('/request-code', authRateLimit(5, 15 * 60 * 1000), requestCode);
router.post('/verify-code', authRateLimit(10), verifyCode);
router.post('/refresh', authRateLimit(30), refresh);
router.post('/logout', authRateLimit(30), logout);
router.get('/google', authRateLimit(10), beginGoogleOAuth);
router.get('/google/callback', authRateLimit(10), completeGoogleOAuth);
router.get('/me', requireAuth, getMe);
router.patch('/me', requireAuth, patchMe);

export default router;
