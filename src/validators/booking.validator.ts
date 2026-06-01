import { z } from 'zod';

export const createBookingSchema = z.object({
  serviceId: z.string().uuid('Invalid service ID'),
  bookingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .refine((date) => {
      const bookingDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return bookingDate >= today;
    }, 'Booking date must be today or in the future'),
});

export const cancelBookingSchema = z.object({
  reason: z
    .string()
    .min(10, 'Please provide a reason (at least 10 characters)')
    .max(500, 'Reason is too long'),
});

export const scanQRSchema = z.object({
  qrData: z.string().min(1, 'QR data is required'),
});

export const acceptQRSchema = z.object({
  bookingId: z.string().uuid('Invalid booking ID'),
});

export const rejectQRSchema = z.object({
  bookingId: z.string().uuid('Invalid booking ID'),
  reason: z
    .string()
    .min(5, 'Please provide a rejection reason')
    .max(500, 'Reason is too long'),
});
