import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  beginGoogleOAuth,
  completeGoogleOAuth,
  getMe,
  login,
  register,
} from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/google', beginGoogleOAuth);
router.get('/google/callback', completeGoogleOAuth);
router.get('/me', requireAuth, getMe);

export default router;
