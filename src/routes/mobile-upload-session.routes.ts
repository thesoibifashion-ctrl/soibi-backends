import { Router } from 'express';
import { createSession, patchSession, readSession } from '../controllers/mobile-upload-session.controller.js';

const router = Router();

router.post('/', createSession);
router.get('/:sessionId', readSession);
router.patch('/:sessionId', patchSession);

export default router;
