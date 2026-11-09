import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError, generateBookingCode, generateQRData, paginate } from '../utils/helpers';
import { generateQRCode } from '../utils/qr-generator';
import { AuthRequest } from '../middlewares/auth.middleware';
import { getSlotCapacityForDate } from '../utils/slot-schedule';

// ============================================
// CREATE BOOKING
// ============================================

export const createBooking = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serviceId, bookingDate } = req.body;
    const requestedTimeStart = req.body.bookingTimeStart as string | undefined;
    const registrationCount = Number(req.body.registrationCount ?? 1);
    if (!Number.isInteger(registrationCount) || registrationCount < 1) {
      throw new AppError('Registration count must be a positive whole number', 400);
    }
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

      if (!service || !service.isActive || service.isDeleted) {
        throw new AppError('This service is no longer valid. Please select another service.', 400);
      }

      if (service.serviceProvider.isDisabled) {
        throw new AppError('This service is currently unavailable', 400);
      }

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Service" WHERE "id" = ${serviceId} FOR UPDATE`);

      // Check if booking date is within an active slot
      let slot = await tx.serviceSlot.findFirst({
        where: {
          serviceId,
          isActive: true,
          isDeleted: false,
          startDate: { lte: new Date(bookingDate) },
          endDate: { gte: new Date(bookingDate) },
        },
      });

      if (!slot) {
        const configuredSlot = await tx.serviceSlot.findFirst({
          where: { serviceId, isDeleted: false },
          select: { id: true },
        });
        if (configuredSlot) {
          throw new AppError('This service is outside its configured availability dates', 400);
        }
        // Auto-provision a default 1-year slot with dailyCount 50 so service is bookable immediately
        const defaultStart = new Date(bookingDate);
        defaultStart.setDate(defaultStart.getDate() - 30);
        const defaultEnd = new Date(bookingDate);
        defaultEnd.setDate(defaultEnd.getDate() + 365);
        slot = await tx.serviceSlot.create({
          data: {
            serviceId,
            startDate: defaultStart,
            endDate: defaultEnd,
            dailyCount: 50,
            totalCount: 50 * 365,
            isActive: true,
          },
        });
      }

      if (registrationCount > slot.perPersonMaxRegistration) {
        throw new AppError(`You can register at most ${slot.perPersonMaxRegistration} people for this service`, 400);
      }

      // Serialize reservations for this service slot to prevent concurrent requests
      // from both claiming the same remaining capacity.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ServiceSlot" WHERE "id" = ${slot.id} FOR UPDATE`);

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

      // Respect the provider's weekday schedule and generated interval capacity.
      const dateCapacity = getSlotCapacityForDate(slot, new Date(bookingDate));
      if (dateCapacity <= 0) {
        throw new AppError('This service is not available on the selected date', 400);
      }

      let bookingTimeStart: string | null = null;
      let bookingTimeEnd: string | null = null;
      if (Array.isArray(slot.weeklySchedule) && Array.isArray(slot.timeSlots)) {
        const weekday = new Date(bookingDate).getUTCDay();
        const dayOptions = (slot.timeSlots as any[])
          .filter((item) => item.weekday === weekday && Number(item.capacity) > 0)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        const reservations = await tx.booking.groupBy({
          by: ['bookingTimeStart'],
          where: {
            slotId: slot.id,
            bookingDate: new Date(bookingDate),
            status: { not: 'CANCELLED' },
          },
          _sum: { registrationCount: true },
        });
        const reservedByTime = new Map(
          reservations.map((item) => [item.bookingTimeStart ?? '', item._sum.registrationCount ?? 0]),
        );
        let unassignedReservations = reservedByTime.get('') ?? 0;
        for (const option of dayOptions) {
          const previouslyAssigned = Math.min(Number(option.capacity), unassignedReservations);
          unassignedReservations -= previouslyAssigned;
          reservedByTime.set(
            option.startTime,
            (reservedByTime.get(option.startTime) ?? 0) + previouslyAssigned,
          );
        }
        const chosen = requestedTimeStart
          ? dayOptions.find((item) => item.startTime === requestedTimeStart)
          : dayOptions.find((item) =>
              Number(item.capacity) - (reservedByTime.get(item.startTime) ?? 0) >= registrationCount,
            );
        if (!chosen) {
          throw new AppError('The selected time is not available. Please choose another time.', 400);
        }
        const reservedAtTime = reservedByTime.get(chosen.startTime) ?? 0;
        if (reservedAtTime + registrationCount > Number(chosen.capacity)) {
          throw new AppError('There are not enough registrations available for this time', 400);
        }
        bookingTimeStart = chosen.startTime;
        bookingTimeEnd = chosen.endTime;
      }

      // Check available capacity for the selected date.
      const bookedCountForDate = await tx.booking.aggregate({
        where: {
          slotId: slot.id,
          bookingDate: new Date(bookingDate),
          status: { not: 'CANCELLED' },
        },
        _sum: { registrationCount: true },
      });

      const reservedCount = bookedCountForDate._sum.registrationCount ?? 0;
      if (reservedCount + registrationCount > dateCapacity) {
        throw new AppError('No slots available for the selected date', 400);
      }

      // Generate booking code
      const bookingCode = await generateBookingCode(tx, new Date(bookingDate));

      // Create booking
      const booking = await tx.booking.create({
        data: {
          bookingCode,
          customerId: customer.id,
          serviceId,
          slotId: slot.id,
          bookingDate: new Date(bookingDate),
          registrationCount,
          bookingTimeStart,
          bookingTimeEnd,
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

    const VALID_STATUSES = ['BOOKED', 'USED', 'EXPIRED', 'CANCELLED', 'REJECTED'];
    if (status && status !== 'ALL') {
      if (!VALID_STATUSES.includes(status as string)) {
        throw new AppError(`Invalid status filter. Allowed values: ${VALID_STATUSES.join(', ')}, ALL`, 400);
      }
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
