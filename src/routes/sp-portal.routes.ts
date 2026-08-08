import { Router } from 'express';
import * as spController from '../controllers/sp-portal.controller';
import * as serviceController from '../controllers/service.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { spOnly, spSuperAdminOnly } from '../middlewares/role.middleware';

const router = Router();

// Statistics & Bookings
router.get('/dashboard', authenticate, spOnly, spController.getSpDashboard);
router.get('/stats', authenticate, spOnly, spController.getSpStats);
router.get('/bookings', authenticate, spOnly, spController.getSpBookings);

// Profile setup and management
router.post('/profile', authenticate, spSuperAdminOnly, spController.createSpProfile);
router.get('/profile', authenticate, spOnly, spController.getSpProfile);
router.post('/staff', authenticate, spSuperAdminOnly, spController.createSpUser);
router.get('/staff', authenticate, spSuperAdminOnly, spController.getSpUsers);
router.put('/staff/:userId/password', authenticate, spSuperAdminOnly, spController.updateSpUserPassword);

// Slot management
router.get('/slots', authenticate, spOnly, spController.getSpSlots);
router.post('/slots', authenticate, spOnly, spController.createSpSlot);
router.put('/slots', authenticate, spOnly, spController.updateSpSlot);

// Services management
router.get('/services', authenticate, spOnly, spController.getSpSlots);
router.post('/services', authenticate, spOnly, serviceController.createService);
router.put('/services/:id', authenticate, spOnly, serviceController.updateService);
router.delete('/services/:id', authenticate, spOnly, serviceController.deleteService);

export default router;
