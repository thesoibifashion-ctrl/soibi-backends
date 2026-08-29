import type { ProductSummary } from './catalog.types.js';

export interface Favorite {
  id: string;
  productId: string;
  createdAt: string;
  // Favorites retain their established lightweight product payload.
  product: Omit<ProductSummary, 'sizes' | 'measurements'>;
}
