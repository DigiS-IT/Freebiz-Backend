import { Router } from 'express';
import authRoutes from './auth.routes';
import customerRoutes from './customer.routes';
import serviceRoutes from './service.routes';
import bookingRoutes from './booking.routes';
import qrRoutes from './qr.routes';
import ratingRoutes from './rating.routes';
import spPortalRoutes from './sp-portal.routes';
import adminRoutes from './admin.routes';
import uploadRoutes from './upload.routes';

const router = Router();

// Public routes
router.use('/auth', authRoutes);

// Upload routes (requires auth)
router.use('/upload', uploadRoutes);

// Customer routes (requires customer auth)
router.use('/customer', customerRoutes);

// Service routes (public browsing, auth for booking)
router.use('/services', serviceRoutes);

// Booking routes (requires customer auth)
router.use('/bookings', bookingRoutes);

// QR Code routes (requires SP auth)
router.use('/qr', qrRoutes);

// Rating routes (requires customer auth)
router.use('/ratings', ratingRoutes);

// SP Portal routes (requires SP auth)
router.use('/sp-portal', spPortalRoutes);

// Admin routes (requires super admin auth)
router.use('/admin', adminRoutes);

export default router;
