import {
  createMeasurement,
  createProductMeasurement,
  deleteMeasurementById,
  deleteProductMeasurementById,
  findMeasurements,
  findProductMeasurements,
  updateMeasurementById,
  updateProductMeasurementById,
} from '../repositories/measurement.repository.js';
import type { CreateMeasurementInput, Measurement, ProductMeasurement, ProductMeasurementInput, UpdateMeasurementInput, UpdateProductMeasurementInput } from '../types/measurement.types.js';
import { AppError } from '../utils/AppError.js';

export async function getAllMeasurements(): Promise<Measurement[]> { return findMeasurements(); }
export async function addMeasurement(input: CreateMeasurementInput): Promise<Measurement> { return createMeasurement(input); }
export async function editMeasurement(id: string, input: UpdateMeasurementInput): Promise<Measurement> {
  const measurement = await updateMeasurementById(id, input);
  if (!measurement) throw AppError.notFound('Measurement not found');
  return measurement;
}
export async function removeMeasurement(id: string): Promise<void> {
  if (!await deleteMeasurementById(id)) throw AppError.notFound('Measurement not found');
}
export async function getProductMeasurementAssignments(productId: string): Promise<ProductMeasurement[]> {
  const assignments = await findProductMeasurements(productId);
  if (!assignments) throw AppError.notFound('Product not found');
  return assignments;
}
export async function addProductMeasurementAssignment(productId: string, input: ProductMeasurementInput): Promise<ProductMeasurement> {
  const assignment = await createProductMeasurement(productId, input);
  if (assignment === 'product_not_found') throw AppError.notFound('Product not found');
  if (assignment === 'measurement_not_found') throw AppError.notFound('Measurement not found');
  if (assignment === 'duplicate') throw AppError.conflict('Measurement is already assigned to this product');
  return assignment;
}
export async function editProductMeasurementAssignment(productId: string, measurementId: string, input: UpdateProductMeasurementInput): Promise<ProductMeasurement> {
  const productAssignments = await findProductMeasurements(productId);
  if (!productAssignments) throw AppError.notFound('Product not found');
  const assignment = await updateProductMeasurementById(productId, measurementId, input);
  if (!assignment) throw AppError.notFound('Product measurement assignment not found');
  return assignment;
}
export async function removeProductMeasurementAssignment(productId: string, measurementId: string): Promise<void> {
  const productAssignments = await findProductMeasurements(productId);
  if (!productAssignments) throw AppError.notFound('Product not found');
  if (!await deleteProductMeasurementById(productId, measurementId)) throw AppError.notFound('Product measurement assignment not found');
}
