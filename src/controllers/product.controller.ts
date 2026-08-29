import type { Request, Response, NextFunction } from 'express';
import {
  getAllProducts,
  getAllProductsForAdmin,
  getProductBySlug,
  getFeaturedProducts,
  getHeroProducts,
  createManagedProduct,
  updateManagedProduct,
  removeManagedProduct,
  addManagedProductImage,
  removeManagedProductImage,
  addManagedProductVariant,
  assignManagedProductToCollection,
  removeManagedProductFromCollection,
  removeManagedProductVariant,
  updateManagedProductVariant,
  getManagedProductPrices,
  replaceManagedProductPrices,
  addOrUpdateManagedProductPrice,
  removeManagedProductPrice,
} from '../services/product.service.js';
import type { ProductFilter } from '../repositories/product.repository.js';
import { sendSuccess } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';
import { HttpStatus } from '../types/api.types.js';
import {
  createProductImageSchema,
  createProductSchema,
  updateProductSchema,
  createProductVariantSchema,
  productCollectionAssignmentSchema,
  updateProductVariantSchema,
  replaceProductPricesSchema,
  createProductPriceSchema,
  updateProductPriceSchema,
} from '../validators/admin-catalog.validator.js';

export async function listProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = req.query;
    const getString = (key: string): string | undefined => typeof query[key] === 'string' ? query[key] : undefined;
    const sort = getString('sort');
    if (sort && !['newest', 'price_asc', 'price_desc', 'size_asc', 'size_desc', 'collection_sort'].includes(sort)) throw AppError.badRequest('sort must be newest, price_asc, price_desc, size_asc, size_desc, or collection_sort');
    const gender = getString('gender');
    if (gender && !['male', 'female', 'unisex'].includes(gender)) throw AppError.badRequest('gender must be male, female, or unisex');
    const products = await getAllProducts({ color: getString('color'), collection: getString('collection'), category: getString('category'), size: getString('size'), material: getString('material'), gender: gender as 'male' | 'female' | 'unisex' | undefined, sort: sort as ProductFilter['sort'] });
    sendSuccess(res, 'Products retrieved', products);
  } catch (err) {
    next(err);
  }
}

export async function listAdminProducts(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, 'Products retrieved', await getAllProductsForAdmin());
  } catch (err) {
    next(err);
  }
}

export async function getFeatured(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const products = await getFeaturedProducts();
    sendSuccess(res, 'Featured products retrieved', products);
  } catch (err) {
    next(err);
  }
}

export async function getHero(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const products = await getHeroProducts();
    sendSuccess(res, 'Hero products retrieved', products);
  } catch (err) {
    next(err);
  }
}

export async function getProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await getProductBySlug(req.params['slug'] as string);
    sendSuccess(res, 'Product retrieved', product);
  } catch (err) {
    next(err);
  }
}

export async function createAdminProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }
    const product = await createManagedProduct(parsed.data);
    sendSuccess(res, 'Product created', product, HttpStatus.CREATED);
  } catch (err) {
    next(err);
  }
}

export async function updateAdminProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }
    const product = await updateManagedProduct(req.params['id'] as string, parsed.data);
    sendSuccess(res, 'Product updated', product);
  } catch (err) {
    next(err);
  }
}

export async function deleteAdminProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await removeManagedProduct(req.params['id'] as string);
    sendSuccess(res, 'Product deleted');
  } catch (err) {
    next(err);
  }
}

export async function createAdminProductImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createProductImageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }
    const image = await addManagedProductImage(req.params['id'] as string, parsed.data);
    sendSuccess(res, 'Product image created', image, HttpStatus.CREATED);
  } catch (err) {
    next(err);
  }
}

export async function deleteAdminProductImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await removeManagedProductImage(
      req.params['id'] as string,
      req.params['imageId'] as string,
    );
    sendSuccess(res, 'Product image deleted');
  } catch (err) {
    next(err);
  }
}

export async function assignAdminProductCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = productCollectionAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }
    await assignManagedProductToCollection(req.params['id'] as string, parsed.data.collectionId);
    sendSuccess(res, 'Product assigned to collection', {}, HttpStatus.CREATED);
  } catch (err) {
    next(err);
  }
}

export async function removeAdminProductCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await removeManagedProductFromCollection(
      req.params['id'] as string,
      req.params['collectionId'] as string,
    );
    sendSuccess(res, 'Product removed from collection');
  } catch (err) {
    next(err);
  }
}

export async function createAdminProductVariant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createProductVariantSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }
    const variant = await addManagedProductVariant(req.params['id'] as string, parsed.data);
    sendSuccess(res, 'Product variant created', variant, HttpStatus.CREATED);
  } catch (err) {
    next(err);
  }
}

export async function updateAdminProductVariant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = updateProductVariantSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }
    const variant = await updateManagedProductVariant(
      req.params['id'] as string,
      req.params['variantId'] as string,
      parsed.data,
    );
    sendSuccess(res, 'Product variant updated', variant);
  } catch (err) {
    next(err);
  }
}

export async function deleteAdminProductVariant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await removeManagedProductVariant(
      req.params['id'] as string,
      req.params['variantId'] as string,
    );
    sendSuccess(res, 'Product variant deleted');
  } catch (err) {
    next(err);
  }
}

export async function listAdminProductPrices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, 'Product prices retrieved', await getManagedProductPrices(req.params['id'] as string)); } catch (err) { next(err); }
}
export async function replaceAdminProductPrices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { const parsed = replaceProductPricesSchema.safeParse(req.body); if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body'); sendSuccess(res, 'Product prices updated', await replaceManagedProductPrices(req.params['id'] as string, parsed.data.prices)); } catch (err) { next(err); }
}
export async function createAdminProductPrice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { const parsed = createProductPriceSchema.safeParse(req.body); if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body'); sendSuccess(res, 'Product price saved', await addOrUpdateManagedProductPrice(req.params['id'] as string, parsed.data), HttpStatus.CREATED); } catch (err) { next(err); }
}
export async function updateAdminProductPrice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { const parsed = updateProductPriceSchema.safeParse(req.body); if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body'); sendSuccess(res, 'Product price updated', await addOrUpdateManagedProductPrice(req.params['id'] as string, { currencyId: req.params['currencyId'] as string, amount: parsed.data.amount })); } catch (err) { next(err); }
}
export async function deleteAdminProductPrice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { await removeManagedProductPrice(req.params['id'] as string, req.params['currencyId'] as string); sendSuccess(res, 'Product price removed'); } catch (err) { next(err); }
}
