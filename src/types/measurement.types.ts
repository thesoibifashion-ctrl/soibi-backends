export interface Measurement {
  id: string;
  title: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductMeasurement {
  id: string;
  measurementId: string;
  title: string;
  value: string;
  imageUrl: string;
  sortOrder: number;
}

export interface ProductMeasurementInput {
  measurementId: string;
  value: string;
  sortOrder?: number;
}

export interface UpdateProductMeasurementInput {
  value?: string;
  sortOrder?: number;
}

export interface CreateMeasurementInput {
  title: string;
  imageUrl: string;
}

export interface UpdateMeasurementInput {
  title?: string;
  imageUrl?: string;
}
