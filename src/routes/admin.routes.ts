import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { superAdminOnly } from '../middlewares/role.middleware';

const router = Router();

// Dashboard analytics
router.get('/dashboard', authenticate, superAdminOnly, adminController.getDashboard);
router.get('/demographics', authenticate, superAdminOnly, adminController.getDemographics);

// Providers management
router.get('/providers', authenticate, superAdminOnly, adminController.getProviders);
router.post('/providers', authenticate, superAdminOnly, adminController.createProvider);
router.put('/providers', authenticate, superAdminOnly, adminController.updateProvider);

// Customers management
router.get('/customers', authenticate, superAdminOnly, adminController.getCustomers);

// Revenue & Subscriptions management
router.get('/revenue', authenticate, superAdminOnly, adminController.getRevenue);
router.post('/revenue', authenticate, superAdminOnly, adminController.createSubscription);
router.put('/revenue', authenticate, superAdminOnly, adminController.updateSubscription);

// Subscription Expiry Tracking & Automated Email Reminders
router.get('/expiry', authenticate, superAdminOnly, adminController.getExpiryTracking);
router.post('/expiry/send-reminders', authenticate, superAdminOnly, adminController.sendExpiryReminders);

export default router;
