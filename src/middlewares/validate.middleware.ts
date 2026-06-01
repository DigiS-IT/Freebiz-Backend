import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../utils/helpers';

export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        const errors = result.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors);
      }
      
      req.body = result.data;
      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else if (error instanceof ZodError) {
        next(new AppError('Validation failed', 400, 'VALIDATION_ERROR'));
      } else {
        next(error);
      }
    }
  };
};
