import { Router } from 'express';
import * as spController from '../controllers/sp-portal.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { spOnly, spSuperAdminOnly } from '../middlewares/role.middleware';

const router = Router();

// Statistics & Bookings
router.get('/stats', authenticate, spOnly, spController.getSpStats);
router.get('/bookings', authenticate, spOnly, spController.getSpBookings);

// Profile setup and management
router.post('/profile', authenticate, spSuperAdminOnly, spController.createSpProfile);
router.get('/profile', authenticate, spOnly, spController.getSpProfile);
router.post('/staff', authenticate, spSuperAdminOnly, spController.createSpUser);
router.get('/staff', authenticate, spSuperAdminOnly, spController.getSpUsers);

// Slot management
router.get('/slots', authenticate, spOnly, spController.getSpSlots);
router.post('/slots', authenticate, spOnly, spController.createSpSlot);
router.put('/slots', authenticate, spOnly, spController.updateSpSlot);

export default router;
