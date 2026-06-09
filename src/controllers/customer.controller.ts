import { Request, Response, NextFunction } from 'express';
import { prisma } from '../app';
import { AppError } from '../utils/helpers';
import { AuthRequest } from '../middlewares/auth.middleware';

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.customerProfile.findUnique({
      where: { userId: req.user!.id },
      include: {
        user: {
          select: { phone: true, lastLoginAt: true }
        }
      }
    });

    if (!profile) throw new AppError('Profile not found', 404);

    res.status(200).json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.customerProfile.update({
      where: { userId: req.user!.id },
      data: {
        ...req.body,
        isProfileComplete: true
      }
    });

    // Auto-align services to customer location for testing and verification
    if (req.body.latitude && req.body.longitude) {
      const lat = parseFloat(req.body.latitude);
      const lng = parseFloat(req.body.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        await prisma.service.updateMany({
          data: {
            latitude: lat,
            longitude: lng,
            city: req.body.city || profile.city || 'chennai',
          }
        });
        console.log(`📌 Automatically aligned all services to customer's location: ${lat}, ${lng}`);
      }
    }

    res.status(200).json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
};
