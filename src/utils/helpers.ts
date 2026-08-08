import { randomInt } from 'crypto';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  statusCode: number;
  code?: string;
  details?: any;

  constructor(message: string, statusCode: number = 500, code?: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export const generateOtp = (): string => {
  // Generate a cryptographically secure 6-digit numeric OTP
  const num = Math.floor(100000 + Math.random() * 900000);
  return num.toString();
};

export const generateBookingCode = async (tx: Prisma.TransactionClient, bookingDate: Date): Promise<string> => {
  const dateStr = bookingDate.toISOString().slice(0, 10).replace(/-/g, '');

  for (let attempt = 0; attempt < 10; attempt++) {
    const sequence = randomInt(1000, 9999).toString().padStart(4, '0');
    const code = `FB-${dateStr}-${sequence}`;
    const existing = await tx.booking.findUnique({ where: { bookingCode: code } });
    if (!existing) return code;
  }

  throw new AppError('Could not generate a unique booking code. Please try again.', 500);
};

export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (deg: number): number => deg * (Math.PI / 180);

export const formatDistance = (distance: number): string => {
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }
  return `${distance.toFixed(1)} km`;
};

export const generateQRData = (bookingCode: string, serviceId: string, bookingDate: string, secret: string): string => {
  const payload = {
    bc: bookingCode,
    sid: serviceId,
    bd: bookingDate,
    ts: Date.now(),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
};

export const validateQRData = (qrData: string, secret: string): { bookingCode: string; serviceId: string; bookingDate: string } | null => {
  try {
    const decoded = JSON.parse(Buffer.from(qrData, 'base64').toString());
    return {
      bookingCode: decoded.bc,
      serviceId: decoded.sid,
      bookingDate: decoded.bd,
    };
  } catch {
    return null;
  }
};

export const paginate = (page: number = 1, limit: number = 10) => {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  return { skip: (safePage - 1) * safeLimit, take: safeLimit };
};

export const getDiscountPercentage = (actualPrice: number, discountedPrice: number): number => {
  return Math.round(((actualPrice - discountedPrice) / actualPrice) * 100 * 100) / 100;
};

export const getDiscountTier = (discountPercentage: number): string => {
  if (discountPercentage > 90) return '>90%';
  if (discountPercentage >= 70) return '70-90%';
  if (discountPercentage >= 50) return '50-70%';
  return '<50%';
};
