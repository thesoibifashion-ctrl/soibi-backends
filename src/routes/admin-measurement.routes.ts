import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createAdminMeasurement, deleteAdminMeasurement, listAdminMeasurements, updateAdminMeasurement } from '../controllers/measurement.controller.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));
router.get('/', listAdminMeasurements);
router.post('/', createAdminMeasurement);
router.patch('/:id', updateAdminMeasurement);
router.delete('/:id', deleteAdminMeasurement);
export default router;
