import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/helpers';
import { AuthRequest } from '../middlewares/auth.middleware';

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.customerProfile.findUnique({
      where: { userId: req.user!.id },
      include: {
        user: {
          select: { id: true, name: true, phone: true, lastLoginAt: true }
        }
      }
    });

    if (!profile) throw new AppError('Profile not found', 404);

    // Provide fullName alias so both name and fullName work everywhere
    const profileData = {
      ...profile,
      fullName: profile.name || profile.user?.name || 'Customer',
    };

    res.status(200).json({ success: true, data: profileData });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const name = req.body.name?.trim();

    // Synchronize name to User model as well
    if (name) {
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { name },
      });
    }

    const profile = await prisma.customerProfile.upsert({
      where: { userId: req.user!.id },
      update: {
        ...req.body,
        ...(name ? { name } : {}),
        isProfileComplete: true,
      },
      create: {
        userId: req.user!.id,
        name: name || 'User',
        ...req.body,
        isProfileComplete: true,
      },
      include: {
        user: {
          select: { id: true, name: true, phone: true, lastLoginAt: true }
        }
      }
    });

    const profileData = {
      ...profile,
      fullName: profile.name || profile.user?.name || 'Customer',
    };

    res.status(200).json({ success: true, data: profileData });
  } catch (error) {
    next(error);
  }
};
