import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  createAdminProduct,
  listAdminProducts,
  createAdminProductImage,
  createAdminProductVariant,
  deleteAdminProduct,
  deleteAdminProductImage,
  deleteAdminProductVariant,
  assignAdminProductCollection,
  removeAdminProductCollection,
  updateAdminProduct,
  updateAdminProductVariant,
  listAdminProductPrices,
  replaceAdminProductPrices,
  createAdminProductPrice,
  updateAdminProductPrice,
  deleteAdminProductPrice,
} from '../controllers/product.controller.js';
import {
  createAdminProductMeasurement,
  deleteAdminProductMeasurement,
  listAdminProductMeasurements,
  updateAdminProductMeasurement,
} from '../controllers/measurement.controller.js';

const router = Router();

router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));

router.get('/', listAdminProducts);
router.post('/', createAdminProduct);
router.get('/:id/prices', listAdminProductPrices);
router.put('/:id/prices', replaceAdminProductPrices);
router.post('/:id/prices', createAdminProductPrice);
router.patch('/:id/prices/:currencyId', updateAdminProductPrice);
router.delete('/:id/prices/:currencyId', deleteAdminProductPrice);
router.get('/:productId/measurements', listAdminProductMeasurements);
router.post('/:productId/measurements', createAdminProductMeasurement);
router.patch('/:productId/measurements/:measurementId', updateAdminProductMeasurement);
router.delete('/:productId/measurements/:measurementId', deleteAdminProductMeasurement);
router.patch('/:id', updateAdminProduct);
router.delete('/:id', deleteAdminProduct);
router.post('/:id/images', createAdminProductImage);
router.delete('/:id/images/:imageId', deleteAdminProductImage);
router.post('/:id/collections', assignAdminProductCollection);
router.delete('/:id/collections/:collectionId', removeAdminProductCollection);
router.post('/:id/variants', createAdminProductVariant);
router.patch('/:id/variants/:variantId', updateAdminProductVariant);
router.delete('/:id/variants/:variantId', deleteAdminProductVariant);

export default router;
