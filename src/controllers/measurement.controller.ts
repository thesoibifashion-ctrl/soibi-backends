import type { NextFunction, Request, Response } from 'express';
import {
  addMeasurement,
  addProductMeasurementAssignment,
  editMeasurement,
  editProductMeasurementAssignment,
  getAllMeasurements,
  getProductMeasurementAssignments,
  removeMeasurement,
  removeProductMeasurementAssignment,
} from '../services/measurement.service.js';
import { AppError } from '../utils/AppError.js';
import { HttpStatus } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';
import { createMeasurementSchema, productMeasurementAssignmentSchema, updateMeasurementSchema, updateProductMeasurementSchema } from '../validators/measurement.validator.js';

function parse<T>(result: { success: boolean; data?: T; error?: { issues: { message: string }[] } }): T {
  if (!result.success) throw AppError.badRequest(result.error?.issues[0]?.message ?? 'Invalid request body');
  return result.data as T;
}

export async function listAdminMeasurements(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, 'Measurements retrieved', await getAllMeasurements()); } catch (err) { next(err); }
}
export async function createAdminMeasurement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, 'Measurement created', await addMeasurement(parse(createMeasurementSchema.safeParse(req.body))), HttpStatus.CREATED); } catch (err) { next(err); }
}
export async function updateAdminMeasurement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, 'Measurement updated', await editMeasurement(req.params['id'] as string, parse(updateMeasurementSchema.safeParse(req.body)))); } catch (err) { next(err); }
}
export async function deleteAdminMeasurement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { await removeMeasurement(req.params['id'] as string); sendSuccess(res, 'Measurement deleted'); } catch (err) { next(err); }
}
export async function listAdminProductMeasurements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, 'Product measurements retrieved', await getProductMeasurementAssignments(req.params['productId'] as string)); } catch (err) { next(err); }
}
export async function createAdminProductMeasurement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, 'Product measurement assigned', await addProductMeasurementAssignment(req.params['productId'] as string, parse(productMeasurementAssignmentSchema.safeParse(req.body))), HttpStatus.CREATED); } catch (err) { next(err); }
}
export async function updateAdminProductMeasurement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, 'Product measurement updated', await editProductMeasurementAssignment(req.params['productId'] as string, req.params['measurementId'] as string, parse(updateProductMeasurementSchema.safeParse(req.body)))); } catch (err) { next(err); }
}
export async function deleteAdminProductMeasurement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { await removeProductMeasurementAssignment(req.params['productId'] as string, req.params['measurementId'] as string); sendSuccess(res, 'Product measurement deleted'); } catch (err) { next(err); }
}
