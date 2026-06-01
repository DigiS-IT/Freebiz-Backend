import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../app';
import { AppError, generateBookingCode, generateQRData, paginate } from '../utils/helpers';
import { generateQRCode } from '../utils/qr-generator';
import { AuthRequest } from '../middlewares/auth.middleware';

// ============================================
// CREATE BOOKING
// ============================================

export const createBooking = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serviceId, bookingDate } = req.body;
    const customerId = req.user!.id;

    const transaction = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Get customer profile
      const customer = await tx.customerProfile.findUnique({
        where: { userId: customerId },
      });

      if (!customer) {
        throw new AppError('Customer profile not found', 404);
      }

      // Get service with SP info
      const service = await tx.service.findUnique({
        where: { id: serviceId },
        include: {
          serviceProvider: {
            select: { isDisabled: true },
          },
        },
      });

      if (!service || !service.isActive) {
        throw new AppError('Service not found or unavailable', 404);
      }

      if (service.serviceProvider.isDisabled) {
        throw new AppError('This service is currently unavailable', 400);
      }

      // Check if booking date is within an active slot
      const slot = await tx.serviceSlot.findFirst({
        where: {
          serviceId,
          isActive: true,
          startDate: { lte: new Date(bookingDate) },
          endDate: { gte: new Date(bookingDate) },
        },
      });

      if (!slot) {
        throw new AppError('No available slots for the selected date', 400);
      }

      // Check max 2 bookings per day per customer
      const todayBookingsCount = await tx.booking.count({
        where: {
          customerId: customer.id,
          bookingDate: new Date(bookingDate),
          status: { in: ['BOOKED', 'USED'] },
        },
      });

      if (todayBookingsCount >= 2) {
        throw new AppError('You can book a maximum of 2 services per day', 400);
      }

      // Check if customer already booked this service for this date
      const existingBooking = await tx.booking.findFirst({
        where: {
          customerId: customer.id,
          serviceId,
          bookingDate: new Date(bookingDate),
          status: { in: ['BOOKED'] },
        },
      });

      if (existingBooking) {
        throw new AppError('You have already booked this service for this date', 400);
      }

      // Check available slots for the date
      const bookedCountForDate = await tx.booking.count({
        where: {
          slotId: slot.id,
          bookingDate: new Date(bookingDate),
          status: { not: 'CANCELLED' },
        },
      });

      if (bookedCountForDate >= slot.dailyCount) {
        throw new AppError('No slots available for the selected date', 400);
      }

      // Generate booking code
      const bookingCode = await generateBookingCode(new Date(bookingDate));

      // Create booking
      const booking = await tx.booking.create({
        data: {
          bookingCode,
          customerId: customer.id,
          serviceId,
          slotId: slot.id,
          bookingDate: new Date(bookingDate),
          status: 'BOOKED',
        },
        include: {
          service: {
            select: {
              serviceType: true,
              actualPrice: true,
              discountedPrice: true,
              discountPercentage: true,
              serviceProvider: {
                select: { businessName: true },
              },
            },
          },
        },
      });

      // Generate QR code
      const qrData = generateQRData(
        bookingCode,
        serviceId,
        bookingDate,
        process.env.QR_CODE_SECRET!
      );

      const qrFilename = `QR_${bookingCode}`;
      const qrImageUrl = await generateQRCode(qrData, qrFilename);

      // Create QR record
      await tx.qRCode.create({
        data: {
          bookingId: booking.id,
          qrData,
          qrImageUrl,
        },
      });

      return { booking, qrImageUrl };
    });

    res.status(201).json({
      success: true,
      message: 'Booking confirmed successfully',
      data: {
        booking: transaction.booking,
        qrCodeUrl: transaction.qrImageUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// GET MY BOOKINGS
// ============================================

export const getMyBookings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, page = '1', limit = '7' } = req.query;
    const customerId = req.user!.id;

    const customer = await prisma.customerProfile.findUnique({
      where: { userId: customerId },
    });

    if (!customer) {
      throw new AppError('Customer profile not found', 404);
    }

    const where: any = { customerId: customer.id };

    if (status && status !== 'ALL') {
      where.status = status;
    }

    const { skip, take } = paginate(parseInt(page as string), parseInt(limit as string));

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          service: {
            select: {
              serviceType: true,
              actualPrice: true,
              discountedPrice: true,
              discountPercentage: true,
              serviceProvider: {
                select: { businessName: true },
              },
            },
          },
          qrCode: {
            select: { qrImageUrl: true, isUsed: true },
          },
          rating: {
            select: { stars: true, review: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.booking.count({ where }),
    ]);

    // Group by status for counts
    const statusCounts = await prisma.booking.groupBy({
      by: ['status'],
      where: { customerId: customer.id },
      _count: { status: true },
    });

    const counts = {
      BOOKED: 0,
      USED: 0,
      EXPIRED: 0,
      CANCELLED: 0,
      REJECTED: 0,
    };

    statusCounts.forEach((item: any) => {
      counts[item.status as keyof typeof counts] = item._count.status;
    });

    res.status(200).json({
      success: true,
      data: {
        bookings,
        counts,
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

// ============================================
// GET BOOKING DETAIL
// ============================================

export const getBookingDetail = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const customerId = req.user!.id;

    const customer = await prisma.customerProfile.findUnique({
      where: { userId: customerId },
    });

    if (!customer) {
      throw new AppError('Customer profile not found', 404);
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id,
        customerId: customer.id,
      },
      include: {
        service: {
          include: {
            serviceProvider: {
              select: { businessName: true },
            },
          },
        },
        qrCode: true,
        rating: true,
      },
    });

    if (!booking) {
      throw new AppError('Booking not found', 404);
    }

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// CANCEL BOOKING
// ============================================

export const cancelBooking = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const customerId = req.user!.id;

    if (!reason) {
      throw new AppError('Cancellation reason is required', 400);
    }

    const customer = await prisma.customerProfile.findUnique({
      where: { userId: customerId },
    });

    if (!customer) {
      throw new AppError('Customer profile not found', 404);
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id,
        customerId: customer.id,
        status: 'BOOKED',
      },
    });

    if (!booking) {
      throw new AppError('Booking not found or cannot be cancelled', 404);
    }

    // Check if booking date has passed
    const today = new Date().toISOString().split('T')[0];
    if (booking.bookingDate < new Date(today)) {
      throw new AppError('Cannot cancel a booking for a past date', 400);
    }

    await prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason,
        cancelledAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
    });
  } catch (error) {
    next(error);
  }
};
