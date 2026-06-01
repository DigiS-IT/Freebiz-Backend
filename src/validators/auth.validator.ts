import { z } from 'zod';

export const sendOtpSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
});

export const verifyOtpSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  otp: z.string().min(6, 'OTP must be at least 6 characters'),
  name: z.string().optional(),
  age: z.string().optional(),
  gender: z.string().optional(),
});

export const loginSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain one uppercase letter')
    .regex(/[0-9]/, 'Must contain one number')
    .regex(/[!@#\$&*~]/, 'Must contain one special character'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const magicLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['sp', 'superadmin']).optional(),
});

export const magicVerifySchema = z.object({
  token: z.string().min(1, 'Token is required'),
});
