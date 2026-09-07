import { Router } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import {
  addCartItem,
  clearCart,
  deleteCartItem,
  getCart,
  getCartHistory,
  getCartHistoryItem,
  submitCart,
  updateCartItem,
  submitCartReceipt,
  updateCartDetails,
} from '../controllers/cart.controller.js';

const router = Router();

// Only submission supports a one-time guest checkout. All cart-management
// endpoints remain authenticated and operate on the customer's active cart.
router.post('/submit', optionalAuth, submitCart);
router.use(requireAuth);
router.get('/', getCart);
router.patch('/', updateCartDetails);
router.get('/history', getCartHistory);
router.get('/history/:id', getCartHistoryItem);
router.patch('/history/:id/receipt', submitCartReceipt);
router.post('/items', addCartItem);
router.patch('/items/:id', updateCartItem);
router.delete('/items/:id', deleteCartItem);
router.delete('/', clearCart);

export default router;
