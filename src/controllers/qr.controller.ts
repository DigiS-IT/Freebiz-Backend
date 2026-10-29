import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError, appDateKey, validateQRData } from '../utils/helpers';
import { AuthRequest } from '../middlewares/auth.middleware';

type ScanningUser = {
  serviceProviderId: string | null;
  role: string;
  createdByUser: {
    serviceProviderId: string | null;
    role: string;
    isActive: boolean;
  } | null;
};

const getAuthorizedProviderIds = (user: ScanningUser): Set<string> => {
  const ids = new Set<string>();
  if (user.serviceProviderId) ids.add(user.serviceProviderId);

  // Staff were created by the provider admin for that business. Use the
  // creator's current organization link too, in case the staff link is stale.
  if (
    user.role === 'MOBILE_SP' &&
    user.createdByUser?.role === 'SP_SUPER_ADMIN' &&
    user.createdByUser.isActive &&
    user.createdByUser.serviceProviderId
  ) {
    ids.add(user.createdByUser.serviceProviderId);
  }
  return ids;
};

// ============================================
// SCAN AND VALIDATE QR CODE
// ============================================

export const scanQRCode = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { qrData } = req.body;
    const spUserId = req.user!.id;

    // Get SP user's service provider ID
    const spUser = await prisma.user.findUnique({
      where: { id: spUserId },
      select: {
        serviceProviderId: true,
        role: true,
        createdByUser: {
          select: { serviceProviderId: true, role: true, isActive: true },
        },
      },
    });

    if (!spUser) {
      throw new AppError('Service provider not found', 404);
    }
    const authorizedProviderIds = getAuthorizedProviderIds(spUser);
    if (authorizedProviderIds.size === 0) {
      throw new AppError('Service provider not found', 404);
    }

    // Validate QR data format
    const decoded = validateQRData(qrData, process.env.QR_CODE_SECRET!);

    if (!decoded) {
      return res.status(200).json({
        success: false,
        valid: false,
        message: 'Invalid QR code.',
      });
    }

    // Find the booking
    const booking = await prisma.booking.findUnique({
      where: { bookingCode: decoded.bookingCode },
      include: {
        service: {
          select: {
            id: true,
            serviceProviderId: true,
            serviceType: true,
            serviceDetail: true,
            serviceProvider: {
              select: { businessName: true },
            },
          },
        },
        qrCode: true,
        customer: {
          select: { name: true },
        },
      },
    });

    if (!booking) {
      return res.status(200).json({
        success: false,
        valid: false,
        message: 'Invalid QR code.',
      });
    }

    if (!booking.qrCode) {
      return res.status(200).json({
        success: false,
        valid: false,
        message: 'No active QR code is associated with this booking.',
      });
    }

    const storedBookingDate = appDateKey(booking.bookingDate);
    if (
      decoded.serviceId !== booking.serviceId ||
      decoded.bookingDate !== storedBookingDate
    ) {
      return res.status(200).json({
        success: false,
        valid: false,
        message: 'This QR code does not match the booking details.',
      });
    }

    // Validation checks
    const today = appDateKey(new Date());

    // Check if QR belongs to this SP's service
    if (!authorizedProviderIds.has(booking.service.serviceProviderId)) {
      return res.status(200).json({
        success: false,
        valid: false,
        message: 'This booking is not linked to the organization for your provider account. Check that you are using the correct staff login.',
      });
    }

    // Check booking date
    if (storedBookingDate < today) {
      return res.status(200).json({
        success: false,
        valid: false,
        message: 'QR code expired.',
      });
    }

    // Check if already used
    if (booking.qrCode?.isUsed || booking.status === 'USED') {
      return res.status(200).json({
        success: false,
        valid: false,
        message: 'This QR code has already been redeemed.',
      });
    }

    // Only active bookings can be confirmed by the service provider.
    if (booking.status !== 'BOOKED') {
      return res.status(200).json({
        success: false,
        valid: false,
        message: `This booking is ${booking.status.toLowerCase()} and cannot be confirmed.`,
      });
    }

    // QR is valid
    return res.status(200).json({
      success: true,
      valid: true,
      message: 'Valid QR Code',
      data: {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        customerName: booking.customer.name,
        serviceName: booking.service.serviceDetail,
        bookingDate: storedBookingDate,
        serviceType: booking.service.serviceType,
        businessName: booking.service.serviceProvider.businessName,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// ACCEPT QR CODE (Mark as Used)
// ============================================

export const acceptQRCode = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bookingId } = req.body;
    const spUserId = req.user!.id;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Get booking with service info
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          service: {
            select: { serviceProviderId: true },
          },
          qrCode: true,
        },
      });

      if (!booking) {
        throw new AppError('Booking not found', 404);
      }

      if (booking.status !== 'BOOKED') {
        throw new AppError(
          booking.status === 'USED'
            ? 'This booking has already been confirmed.'
            : `This booking cannot be confirmed because its status is ${booking.status}.`,
          400,
        );
      }

      // Verify SP owns this service
      const spUser = await tx.user.findUnique({
        where: { id: spUserId },
        select: {
          serviceProviderId: true,
          role: true,
          createdByUser: {
            select: { serviceProviderId: true, role: true, isActive: true },
          },
        },
      });

      if (
        !spUser ||
        !getAuthorizedProviderIds(spUser).has(booking.service.serviceProviderId)
      ) {
        throw new AppError('Unauthorized action', 403);
      }

      // Final validation
      if (booking.qrCode?.isUsed) {
        throw new AppError('This QR code has already been redeemed', 400);
      }

      const today = appDateKey(new Date());
      const bookingDate = appDateKey(booking.bookingDate);
      if (bookingDate < today) {
        throw new AppError('QR code expired', 400);
      }
      if (!booking.qrCode) {
        throw new AppError('QR code record not found for this booking', 400);
      }

      // Conditional update prevents two concurrent scans from redeeming twice.
      const updatedBooking = await tx.booking.updateMany({
        where: { id: bookingId, status: 'BOOKED' },
        data: {
          status: 'USED',
          usedAt: new Date(),
        },
      });
      if (updatedBooking.count !== 1) {
        throw new AppError('This booking has already been confirmed.', 400);
      }

      // Update QR code
      await tx.qRCode.update({
        where: { bookingId },
        data: {
          isUsed: true,
          scannedAt: new Date(),
          scannedByUserId: spUserId,
        },
      });

      return { id: bookingId };
    });

    res.status(200).json({
      success: true,
      message: 'Customer confirmed. Booking marked as used.',
      data: { bookingId: result.id },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// REJECT QR CODE
// ============================================

export const rejectQRCode = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bookingId, reason } = req.body;
    const spUserId = req.user!.id;

    if (!reason) {
      throw new AppError('Rejection reason is required', 400);
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Get booking with service info
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          service: {
            select: { serviceProviderId: true },
          },
          qrCode: true,
        },
      });

      if (!booking) {
        throw new AppError('Booking not found', 404);
      }

      // Verify SP owns this service
      const spUser = await tx.user.findUnique({
        where: { id: spUserId },
        select: { serviceProviderId: true },
      });

      if (!spUser || booking.service.serviceProviderId !== spUser.serviceProviderId) {
        throw new AppError('Unauthorized action', 403);
      }

      // Final validation
      if (booking.qrCode?.isUsed || booking.status === 'USED') {
        throw new AppError('This QR code has already been redeemed', 400);
      }

      // Update booking status
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          rejectedAt: new Date(),
        },
      });

      return updatedBooking;
    });

    res.status(200).json({
      success: true,
      message: 'QR code rejected.',
      data: { bookingId: result.id },
    });
  } catch (error) {
    next(error);
  }
};
