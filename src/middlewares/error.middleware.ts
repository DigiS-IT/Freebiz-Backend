import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/helpers';

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

export const errorHandler = async (err: Error, req: Request, res: Response, next: NextFunction) => {
  let error = err;

  // Handle Prisma unique constraint violation (P2002)
  if (err.name === 'PrismaClientKnownRequestError' && (err as any).code === 'P2002') {
    const targetFields = (err as any).meta?.target;
    let fieldStr = 'field';
    if (Array.isArray(targetFields) && targetFields.length > 0) {
      fieldStr = targetFields.join(', ');
    } else if (typeof targetFields === 'string') {
      fieldStr = targetFields;
    }
    error = new AppError(
      `A Service Provider record with this ${fieldStr} already exists in another service. Please enter a unique ${fieldStr}.`,
      400,
      'DUPLICATE_ENTRY'
    );
  } else if (!(err instanceof AppError)) {
    error = new AppError(
      process.env.NODE_ENV === 'development' ? err.message : (err.message || 'Something went wrong'),
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

  // Send error response with top-level message & structured error object
  res.status(appError.statusCode || 500).json({
    success: false,
    message: appError.message,
    error: {
      code: appError.code || 'INTERNAL_ERROR',
      message: appError.message,
      details: appError.details || undefined,
    },
  });

  next();
};
