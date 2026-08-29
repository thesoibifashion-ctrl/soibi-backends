// ─── Primitives ───────────────────────────────────────────────────────────────

export interface ProductImage {
  id: string;
  imageUrl: string;
  imagePublicId: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface CollectionRef {
  id: string;
  name: string;
  slug: string;
}

export interface MaterialRef {
  id: string;
  name: string;
  slug: string;
}

export interface ColorRef {
  id: string;
  name: string;
  hexCode: string | null;
  hex: string | null;
}

export interface ProductVariant {
  id: string;
  sizeLabel: string | null;
  sizeValue: number | null;
  sku: string | null;
  priceAdjustment: number;
  isAvailable: boolean;
  sortOrder: number;
  color: ColorRef | null;
}

export interface ProductMeasurement {
  id: string;
  measurementId: string;
  title: string;
  value: string;
  imageUrl: string;
  sortOrder: number;
}

export interface ProductPrice {
  currencyId: string;
  currency: string;
  name: string;
  symbol: string;
  amount: number;
}

// ─── Product ──────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  gender: 'male' | 'female' | 'unisex' | null;
  basePrice: number;
  isCustomizable: boolean;
  isFeatured: boolean;
  isHero: boolean;
  sortOrder: number;
  metaTitle: string | null;
  metaDescription: string | null;
  images: ProductImage[];
  collections: CollectionRef[];
  materials: MaterialRef[];
  colors: ColorRef[];
  sizes: number[];
  measurements: ProductMeasurement[];
  prices: ProductPrice[];
  variants: ProductVariant[];
}

export type ProductSummary = Omit<Product, 'variants'>;

// ─── Collection ───────────────────────────────────────────────────────────────

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  imagePublicId: string | null;
  status: string;
  isFeatured: boolean;
  sortOrder: number;
  productCount: number;
}

export interface CollectionWithProducts extends Collection {
  products: ProductSummary[];
}

// ─── Material ─────────────────────────────────────────────────────────────────

export interface Material {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
}

// ─── Color ────────────────────────────────────────────────────────────────────

export interface Color {
  id: string;
  name: string;
  hexCode: string | null;
  imageUrl: string | null;
}
