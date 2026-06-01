import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../app';
import { AppError, validateQRData } from '../utils/helpers';
import { AuthRequest } from '../middlewares/auth.middleware';

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
      select: { serviceProviderId: true, role: true },
    });

    if (!spUser?.serviceProviderId) {
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

    // Validation checks
    const today = new Date().toISOString().split('T')[0];

    // Check if QR belongs to this SP's service
    if (booking.service.serviceProviderId !== spUser.serviceProviderId) {
      return res.status(200).json({
        success: false,
        valid: false,
        message: 'QR code is not valid for this service.',
      });
    }

    // Check booking date
    if (booking.bookingDate.toISOString().split('T')[0] !== today) {
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

    // Check if cancelled or rejected
    if (booking.status === 'CANCELLED' || booking.status === 'REJECTED') {
      return res.status(200).json({
        success: false,
        valid: false,
        message: 'This booking has been cancelled or rejected.',
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

      // Verify SP owns this service
      const spUser = await tx.user.findUnique({
        where: { id: spUserId },
        select: { serviceProviderId: true },
      });

      if (!spUser || booking.service.serviceProviderId !== spUser.serviceProviderId) {
        throw new AppError('Unauthorized action', 403);
      }

      // Final validation
      if (booking.qrCode?.isUsed) {
        throw new AppError('This QR code has already been redeemed', 400);
      }

      const today = new Date().toISOString().split('T')[0];
      if (booking.bookingDate.toISOString().split('T')[0] !== today) {
        throw new AppError('QR code expired', 400);
      }

      // Update booking status
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'USED',
          usedAt: new Date(),
        },
      });

      // Update QR code
      await tx.qRCode.update({
        where: { bookingId },
        data: {
          isUsed: true,
          scannedAt: new Date(),
          scannedByUserId: spUserId,
        },
      });

      return updatedBooking;
    });

    res.status(200).json({
      success: true,
      message: 'QR code accepted. Service marked as used.',
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
