import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  beginGoogleOAuth,
  completeGoogleOAuth,
  getMe,
  requestCode,
  verifyCode,
} from '../controllers/auth.controller.js';

const router = Router();

router.post('/request-code', requestCode);
router.post('/verify-code', verifyCode);
router.get('/google', beginGoogleOAuth);
router.get('/google/callback', completeGoogleOAuth);
router.get('/me', requireAuth, getMe);

export default router;
