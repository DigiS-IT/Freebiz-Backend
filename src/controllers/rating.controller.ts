import { Request, Response, NextFunction } from 'express';
import { prisma } from '../app';
import { AppError } from '../utils/helpers';
import { AuthRequest } from '../middlewares/auth.middleware';

// ============================================
// CREATE OR UPDATE RATING
// ============================================

export const createRating = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bookingId } = req.params;
    const { stars, review } = req.body;
    const userId = req.user!.id;

    // Get customer profile
    const customer = await prisma.customerProfile.findUnique({
      where: { userId },
    });

    if (!customer) {
      throw new AppError('Customer profile not found', 404);
    }

    // Get booking
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        customerId: customer.id,
        status: 'USED',
      },
    });

    if (!booking) {
      throw new AppError('Booking not found or not eligible for rating', 404);
    }

    // Check if already rated
    const existingRating = await prisma.rating.findUnique({
      where: { bookingId },
    });

    if (existingRating) {
      // Update existing rating
      const updated = await prisma.rating.update({
        where: { bookingId },
        data: { stars, review },
      });

      return res.status(200).json({
        success: true,
        message: 'Rating updated successfully',
        data: updated,
      });
    }

    // Create new rating
    const rating = await prisma.rating.create({
      data: {
        bookingId,
        customerId: customer.id,
        stars,
        review,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Rating submitted successfully',
      data: rating,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// GET RATING FOR BOOKING
// ============================================

export const getRating = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookingId } = req.params;

    const rating = await prisma.rating.findUnique({
      where: { bookingId },
    });

    res.status(200).json({
      success: true,
      data: rating,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// GET SERVICE RATINGS (For SP/Admin)
// ============================================

export const getServiceRatings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serviceId } = req.params;
    const { page = '1', limit = '10' } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [ratings, total, avgStars] = await Promise.all([
      prisma.rating.findMany({
        where: { booking: { serviceId } },
        include: {
          customer: {
            select: { name: true },
          },
          booking: {
            select: { bookingDate: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.rating.count({
        where: { booking: { serviceId } },
      }),
      prisma.rating.aggregate({
        where: { booking: { serviceId } },
        _avg: { stars: true },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        ratings,
        averageStars: avgStars._avg.stars || 0,
        totalRatings: total,
        pagination: {
          page: parseInt(page as string),
          limit: take,
          total,
          pages: Math.ceil(total / take),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
