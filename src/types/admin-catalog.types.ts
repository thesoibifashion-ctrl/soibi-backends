import type { ProductImage } from './catalog.types.js';
import type { ProductMeasurement, ProductMeasurementInput } from './measurement.types.js';
import type { ProductPrice, ProductPriceInput } from './currency.types.js';

export type CatalogStatus = 'draft' | 'published' | 'archived';

export interface CreateProductColorInput {
  name: string;
  hex: string;
}

export interface CreateProductMaterialInput {
  name: string;
}

// All fields are optional to support incomplete draft products.
// The service validates that published products have name, slug, and basePrice.
export interface CreateProductInput {
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  category?: string | null;
  gender?: 'male' | 'female' | 'unisex' | null;
  basePrice?: number | null;
  isCustomizable?: boolean | null;
  status?: CatalogStatus;
  isFeatured?: boolean | null;
  isHero?: boolean | null;
  sortOrder?: number | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  colors?: CreateProductColorInput[];
  materials?: CreateProductMaterialInput[];
  sizes?: number[];
  measurements?: ProductMeasurementInput[];
  prices?: ProductPriceInput[];
}

export type UpdateProductInput = CreateProductInput;

export interface AdminProduct {
  id: string;
  name: string | null;
  slug: string | null;
  description: string | null;
  category: string | null;
  gender: 'male' | 'female' | 'unisex' | null;
  basePrice: number | null;
  isCustomizable: boolean | null;
  status: CatalogStatus;
  isFeatured: boolean | null;
  isHero: boolean | null;
  sortOrder: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductDetails extends AdminProduct {
  colors: import('./catalog.types.js').ColorRef[];
  materials: import('./catalog.types.js').MaterialRef[];
  sizes: number[];
  measurements: ProductMeasurement[];
  prices: ProductPrice[];
}

export interface AdminProductCatalogueItem extends AdminProductDetails {
  images: import('./catalog.types.js').ProductImage[];
  collections: import('./catalog.types.js').CollectionRef[];
}

export interface CreateProductImageInput {
  imageUrl: string;
  imagePublicId: string;
  altText?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
}

export interface CreateCollectionInput {
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  imagePublicId?: string | null;
  status: CatalogStatus;
  isFeatured: boolean;
  sortOrder?: number;
}

export type UpdateCollectionInput = Partial<CreateCollectionInput>;

export interface AdminCollection extends CreateCollectionInput {
  id: string;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ManagedProductImage = ProductImage;

export interface ProductCollectionAssignmentInput {
  collectionId: string;
}

export interface CreateProductVariantInput {
  sizeLabel?: string | null;
  sizeValue?: number | null;
  sku?: string | null;
  priceAdjustment?: number;
  colorId?: string | null;
  isAvailable?: boolean;
  sortOrder?: number;
}

export type UpdateProductVariantInput = CreateProductVariantInput;

export interface ManagedProductVariant {
  id: string;
  productId: string;
  colorId: string | null;
  sizeLabel: string | null;
  sizeValue: number | null;
  sku: string | null;
  priceAdjustment: number;
  isAvailable: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
