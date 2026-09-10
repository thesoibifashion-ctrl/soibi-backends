import { HttpStatus, type HttpStatusCode } from '../types/api.types.js';

export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string) {
    return new AppError(message, HttpStatus.BAD_REQUEST);
  }

  static unauthorized(message: string) {
    return new AppError(message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message: string) {
    return new AppError(message, HttpStatus.FORBIDDEN);
  }

  static notFound(message: string) {
    return new AppError(message, HttpStatus.NOT_FOUND);
  }

  static conflict(message: string) {
    return new AppError(message, HttpStatus.CONFLICT);
  }

  static tooManyRequests(message: string) {
    return new AppError(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
