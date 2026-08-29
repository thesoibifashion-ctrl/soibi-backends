import {
  findPublishedProducts,
  findAllProductsForAdmin,
  findProductBySlug,
  findFeaturedProducts,
  findHeroProducts,
  createProduct,
  updateProductById,
  softDeleteProductById,
  createProductImage,
  deleteProductImageById,
  assignProductToCollection,
  removeProductFromCollection,
  createProductVariant,
  updateProductVariantById,
  deleteProductVariantById,
  type ProductFilter,
  recordProductView,
  getProductPricesForAdmin,
  replaceProductPricesById,
  upsertProductPrice,
  removeProductPrice,
} from '../repositories/product.repository.js';
import { AppError } from '../utils/AppError.js';
import type { Product, ProductSummary } from '../types/catalog.types.js';
import type {
  AdminProduct,
  AdminProductDetails,
  AdminProductCatalogueItem,
  CreateProductImageInput,
  CreateProductInput,
  ManagedProductImage,
  CreateProductVariantInput,
  ManagedProductVariant,
  UpdateProductVariantInput,
  UpdateProductInput,
} from '../types/admin-catalog.types.js';
import type { ProductPrice, ProductPriceInput } from '../types/currency.types.js';

export async function getAllProducts(filters?: ProductFilter): Promise<ProductSummary[]> {
  return findPublishedProducts(filters);
}

export async function getAllProductsForAdmin(): Promise<AdminProductCatalogueItem[]> {
  return findAllProductsForAdmin();
}

export async function getProductBySlug(slug: string): Promise<Product> {
  const product = await findProductBySlug(slug);
  if (!product) throw AppError.notFound(`Product not found: ${slug}`);
  // Daily upsert keeps anonymous view tracking compact; never block product delivery on analytics.
  recordProductView(product.id).catch((err: unknown) => console.error('[product] Failed to record view:', err));
  return product;
}

export async function getFeaturedProducts(): Promise<ProductSummary[]> {
  return findFeaturedProducts();
}

export async function getHeroProducts(): Promise<ProductSummary[]> {
  return findHeroProducts();
}

export async function createManagedProduct(input: CreateProductInput): Promise<AdminProductDetails> {
  if (input.status === 'published') {
    assertPublishableProduct(input);
  }
  return createProduct(input);
}

export async function updateManagedProduct(
  id: string,
  input: UpdateProductInput,
): Promise<AdminProductDetails> {
  if (input.status === 'published') {
    // Fetch current product to check existing values
    const current = await updateProductById(id, {});
    if (!current) throw AppError.notFound('Product not found');
    const name = input.name !== undefined ? input.name : current.name;
    const slug = input.slug !== undefined ? input.slug : current.slug;
    const basePrice = input.basePrice !== undefined ? input.basePrice : current.basePrice;
    assertPublishableProduct({
      name,
      slug,
      basePrice,
      isCustomizable: input.isCustomizable !== undefined ? input.isCustomizable : current.isCustomizable,
      isFeatured: input.isFeatured !== undefined ? input.isFeatured : current.isFeatured,
      isHero: input.isHero !== undefined ? input.isHero : current.isHero,
      sortOrder: input.sortOrder !== undefined ? input.sortOrder : current.sortOrder,
    });
  }
  const product = await updateProductById(id, input);
  if (!product) throw AppError.notFound('Product not found');
  return product;
}

function assertPublishableProduct(input: CreateProductInput): void {
  if (!input.name) throw AppError.badRequest('name is required to publish a product');
  if (!input.slug) throw AppError.badRequest('slug is required to publish a product');
  if (input.basePrice == null) throw AppError.badRequest('basePrice is required to publish a product');
  if (input.isCustomizable == null) throw AppError.badRequest('isCustomizable is required to publish a product');
  if (input.isFeatured == null) throw AppError.badRequest('isFeatured is required to publish a product');
  if (input.isHero == null) throw AppError.badRequest('isHero is required to publish a product');
  if (input.sortOrder == null) throw AppError.badRequest('sortOrder is required to publish a product');
}

export async function removeManagedProduct(id: string): Promise<void> {
  const deleted = await softDeleteProductById(id);
  if (!deleted) throw AppError.notFound('Product not found');
}

export async function addManagedProductImage(
  productId: string,
  input: CreateProductImageInput,
): Promise<ManagedProductImage> {
  const image = await createProductImage(productId, input);
  if (!image) throw AppError.notFound('Product not found');
  return image;
}

export async function removeManagedProductImage(productId: string, imageId: string): Promise<void> {
  const deleted = await deleteProductImageById(productId, imageId);
  if (!deleted) throw AppError.notFound('Product image not found');
}

export async function assignManagedProductToCollection(
  productId: string,
  collectionId: string,
): Promise<void> {
  const assigned = await assignProductToCollection(productId, collectionId);
  if (!assigned) throw AppError.conflict('Product is already assigned to this collection or does not exist');
}

export async function removeManagedProductFromCollection(
  productId: string,
  collectionId: string,
): Promise<void> {
  const removed = await removeProductFromCollection(productId, collectionId);
  if (!removed) throw AppError.notFound('Product collection assignment not found');
}

export async function addManagedProductVariant(
  productId: string,
  input: CreateProductVariantInput,
): Promise<ManagedProductVariant> {
  const variant = await createProductVariant(productId, input);
  if (!variant) throw AppError.notFound('Product not found');
  return variant;
}

export async function updateManagedProductVariant(
  productId: string,
  variantId: string,
  input: UpdateProductVariantInput,
): Promise<ManagedProductVariant> {
  const variant = await updateProductVariantById(productId, variantId, input);
  if (!variant) throw AppError.notFound('Product variant not found');
  return variant;
}

export async function removeManagedProductVariant(
  productId: string,
  variantId: string,
): Promise<void> {
  const removed = await deleteProductVariantById(productId, variantId);
  if (!removed) throw AppError.notFound('Product variant not found');
}

export async function getManagedProductPrices(productId: string): Promise<ProductPrice[]> {
  const prices = await getProductPricesForAdmin(productId);
  if (!prices) throw AppError.notFound('Product not found');
  return prices;
}
export async function replaceManagedProductPrices(productId: string, prices: ProductPriceInput[]): Promise<ProductPrice[]> {
  const result = await replaceProductPricesById(productId, prices);
  if (!result) throw AppError.notFound('Product not found');
  return result;
}
export async function addOrUpdateManagedProductPrice(productId: string, price: ProductPriceInput): Promise<ProductPrice> {
  const result = await upsertProductPrice(productId, price);
  if (!result) throw AppError.notFound('Product not found');
  return result;
}
export async function removeManagedProductPrice(productId: string, currencyId: string): Promise<void> {
  if (!await removeProductPrice(productId, currencyId)) throw AppError.notFound('Product price not found');
}
