export type GalleryCategory = string;

export interface GalleryImage {
  id: string;
  title: string | null;
  imageUrl: string;
  imagePublicId: string;
  category: GalleryCategory;
  sortOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGalleryImageInput {
  title?: string | null;
  imageUrl: string;
  imagePublicId: string;
  category: GalleryCategory;
  sortOrder?: number;
  isPublished?: boolean;
}
