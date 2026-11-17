import { Router } from 'express';
import * as spController from '../controllers/sp-portal.controller';
import * as serviceController from '../controllers/service.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { spOnly, spSuperAdminOnly, spOrSuperAdmin } from '../middlewares/role.middleware';

const router: Router = Router();

// Statistics & Bookings
router.get('/dashboard', authenticate, spOnly, spController.getSpDashboard);
router.get('/stats', authenticate, spOnly, spController.getSpStats);
router.get('/bookings', authenticate, spOnly, spController.getSpBookings);
router.post('/bookings/:id/cancel', authenticate, spOnly, spController.cancelSpBooking);

// Profile setup and management
router.post('/profile', authenticate, spSuperAdminOnly, spController.createSpProfile);
router.get('/profile', authenticate, spOrSuperAdmin, spController.getSpProfile);
router.put('/profile', authenticate, spOnly, spController.updateSpProfile);
router.patch('/profile', authenticate, spOnly, spController.updateSpProfile);
router.post('/staff', authenticate, spSuperAdminOnly, spController.createSpUser);
router.get('/staff', authenticate, spSuperAdminOnly, spController.getSpUsers);
router.put('/staff/:userId', authenticate, spSuperAdminOnly, spController.updateSpUser);
router.delete('/staff/:userId', authenticate, spSuperAdminOnly, spController.deleteSpUser);
router.put('/staff/:userId/password', authenticate, spSuperAdminOnly, spController.updateSpUserPassword);

// Slot management
router.get('/slots', authenticate, spOrSuperAdmin, spController.getSpSlots);
router.post('/slots', authenticate, spOrSuperAdmin, spController.createSpSlot);
router.put('/slots', authenticate, spOrSuperAdmin, spController.updateSpSlot);

// Services management
router.get('/services', authenticate, spOrSuperAdmin, spController.getSpSlots);
router.post('/services', authenticate, spOrSuperAdmin, serviceController.createService);
router.put('/services/:id', authenticate, spOrSuperAdmin, serviceController.updateService);
router.delete('/services/:id', authenticate, spOrSuperAdmin, serviceController.deleteService);

export default router;
