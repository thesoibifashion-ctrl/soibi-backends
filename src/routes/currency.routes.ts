import { Router } from 'express'; import { listCurrencies } from '../controllers/currency.controller.js';
const router = Router(); router.get('/', listCurrencies); export default router;
