import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/helpers';

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

export const errorHandler = async (err: Error, req: Request, res: Response, next: NextFunction) => {
  let error = err;

  if (!(err instanceof AppError)) {
    error = new AppError(
      process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
      500
    );
  }

  const appError = error as AppError;

  // Log error for debugging
  console.error('Error:', {
    message: appError.message,
    statusCode: appError.statusCode,
    code: appError.code,
    stack: process.env.NODE_ENV === 'development' ? appError.stack : undefined,
  });

  // Send error response
  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code || 'INTERNAL_ERROR',
      message: appError.message,
      details: appError.details || undefined,
    },
  });

  next();
};
