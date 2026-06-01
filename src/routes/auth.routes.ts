import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import { sendOtpSchema, verifyOtpSchema, loginSchema, changePasswordSchema, magicLoginSchema, magicVerifySchema } from '../validators/auth.validator';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// Customer OTP Login
router.post('/customer/send-otp', validateRequest(sendOtpSchema), authController.sendOtp);
router.post('/customer/verify-otp', validateRequest(verifyOtpSchema), authController.verifyOtp);

// SP/Super Admin Login
router.post('/login', validateRequest(loginSchema), authController.login);
router.post('/magic-login', validateRequest(magicLoginSchema), authController.magicLogin);
router.post('/magic-verify', validateRequest(magicVerifySchema), authController.magicVerify);
router.post('/change-password', authenticate, validateRequest(changePasswordSchema), authController.changePassword);

// Token refresh
router.post('/refresh-token', authController.refreshToken);

// Get current user profile
router.get('/me', authenticate, authController.getCurrentUser);

// Logout
router.post('/logout', authenticate, authController.logout);

export default router;
