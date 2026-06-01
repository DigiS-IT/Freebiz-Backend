import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../app';
import { AppError } from '../utils/helpers';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    phone: string;
    role: string;
    isActive: boolean;
    mustChangePassword: boolean;
    serviceProviderId?: string | null;
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Please provide a valid authentication token', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      phone: string;
      role: string;
      mustChangePassword: boolean;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, phone: true, role: true, isActive: true, mustChangePassword: true, serviceProviderId: true },
    });

    if (!user || !user.isActive) {
      throw new AppError('User not found or account is disabled', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid or expired token', 401));
    } else {
      next(error);
    }
  }
};

export const optionalAuthenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      phone: string;
      role: string;
      mustChangePassword: boolean;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, phone: true, role: true, isActive: true, mustChangePassword: true, serviceProviderId: true },
    });

    if (user && user.isActive) {
      req.user = user;
    }
    next();
  } catch (error) {
    next(); // Continue without auth for optional routes
  }
};

// Role-based access control
export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Please authenticate first', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }

    // Check if password change is required (except for customers)
    if (req.user.mustChangePassword && req.user.role !== 'CUSTOMER') {
      return next(new AppError('Please change your password before continuing', 403, 'PASSWORD_CHANGE_REQUIRED'));
    }

    next();
  };
};

// Check if SP subscription is active
export const requireActiveSubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role === 'SP_SUPER_ADMIN' || req.user?.role === 'MOBILE_SP') {
      if (!req.user.serviceProviderId) {
        return next(new AppError('Service provider profile not found', 404));
      }

      const spProfile = await prisma.serviceProviderProfile.findUnique({
        where: { id: req.user.serviceProviderId },
        include: {
          subscriptions: {
            where: {
              status: 'ACTIVE',
              startDate: { lte: new Date() },
              endDate: { gte: new Date() },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!spProfile || spProfile.subscriptions.length === 0) {
        return next(new AppError('Your subscription has expired. Please contact FreeBiz support.', 403, 'SUBSCRIPTION_EXPIRED'));
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};
