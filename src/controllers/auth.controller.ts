import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../app';
import { AppError, generateOtp } from '../utils/helpers';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendSms } from '../config/sms';
import { admin } from '../config/firebase';
import { sendMail } from '../utils/mail';

// ============================================
// CUSTOMER OTP LOGIN
// ============================================

export const sendOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone } = req.body;
    
    // Normalize to last 10 digits for database consistency
    const normalizedPhone = phone.length >= 10 ? phone.substring(phone.length - 10) : phone;

    // Generate OTP (force '123456' for local development mock numbers)
    const isMock = normalizedPhone.includes('9999999999') || 
                   normalizedPhone.includes('1234567890') || 
                   normalizedPhone.includes('0000000000') || 
                   normalizedPhone.includes('8888888888') ||
                   normalizedPhone.includes('8248387253') || 
                   normalizedPhone.includes('9159387253') || 
                   normalizedPhone.includes('9159384606');
    const otp = isMock ? '123456' : generateOtp();
    const expiresAt = new Date(Date.now() + parseInt(process.env.OTP_EXPIRY_MINUTES || '5') * 60 * 1000);

    // Find or create user
    let user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });

    if (!user) {
      user = await prisma.user.create({
        data: { phone: normalizedPhone, role: 'CUSTOMER' },
      });
    }

    if (user.role !== 'CUSTOMER') {
      throw new AppError('This phone number is registered as a Service Provider. Please use SP login.', 400);
    }

    // Invalidate previous OTPs
    await prisma.otp.updateMany({
      where: { phone: normalizedPhone, isVerified: false },
      data: { isVerified: true }, // Mark as "used" to invalidate
    });

    // Create new OTP
    await prisma.otp.create({
      data: {
        userId: user.id,
        phone: normalizedPhone,
        code: otp,
        purpose: 'LOGIN',
        expiresAt,
      },
    });

    // Send OTP via SMS
    await sendSms(normalizedPhone, `Your FreeBiz verification code is: ${otp}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: { phone },
    });
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, otp, name, age, gender } = req.body;

    let verifiedPhone = phone.length >= 10 ? phone.substring(phone.length - 10) : phone;

    // Check if OTP is a Firebase ID Token (starts with JWT header 'eyJ')
    if (otp && otp.startsWith('eyJ')) {
      // Initialize Firebase if not already initialized
      if (!admin.apps.length) {
        throw new AppError('Firebase Admin SDK is not initialized', 500);
      }

      // Verify Firebase ID Token
      const decodedToken = await admin.auth().verifyIdToken(otp);
      const rawPhone = decodedToken.phone_number || '';
      
      if (!rawPhone) {
        throw new AppError('Firebase token does not contain a valid phone number', 400);
      }

      // Normalize phone number to last 10 digits for database consistency
      verifiedPhone = rawPhone.length >= 10 ? rawPhone.substring(rawPhone.length - 10) : rawPhone;

      // Standardize/normalize phone comparisons (matching suffix to tolerate varying country codes)
      const inputPhone = phone.length >= 10 ? phone.substring(phone.length - 10) : phone;
      if (phone && !verifiedPhone.endsWith(inputPhone)) {
        throw new AppError('Verified Firebase phone number does not match submitted phone number', 400);
      }

      // Store Firebase OTP verification check-in in the database for tracking
      await prisma.otp.create({
        data: {
          phone: verifiedPhone,
          code: otp.substring(otp.length - 6), // store signature trace
          purpose: 'LOGIN',
          isVerified: true,
          expiresAt: new Date(),
        },
      });

    } else {
      // Fallback: Traditional Database OTP Verification
      const normalizedInputPhone = phone.length >= 10 ? phone.substring(phone.length - 10) : phone;
      verifiedPhone = normalizedInputPhone;

      const validOtp = await prisma.otp.findFirst({
        where: {
          phone: normalizedInputPhone,
          code: otp,
          purpose: 'LOGIN',
          isVerified: false,
          expiresAt: { gt: new Date() },
        },
      });

      if (!validOtp) {
        throw new AppError('Invalid or expired OTP', 400);
      }

      // Mark OTP as verified
      await prisma.otp.update({
        where: { id: validOtp.id },
        data: { isVerified: true },
      });
    }

    // Get or create user
    let user = await prisma.user.findUnique({
      where: { phone: verifiedPhone },
      include: { customerProfile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { phone: verifiedPhone, role: 'CUSTOMER' },
        include: { customerProfile: true },
      });
    }

    // Create or update customer profile
    let customerProfile = user.customerProfile;
    
    if (!customerProfile) {
      customerProfile = await prisma.customerProfile.create({
        data: {
          userId: user.id,
          name: name || 'User',
          age: age ? parseInt(age) : null,
          gender: gender || null,
        },
      });
    } else if (name || age || gender) {
      customerProfile = await prisma.customerProfile.update({
        where: { id: customerProfile.id },
        data: {
          ...(name && { name }),
          ...(age && { age: parseInt(age) }),
          ...(gender && { gender }),
        },
      });
    }

    // Generate JWT tokens
    const tokens = generateTokens(user.id, user.phone, user.role, false);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          role: user.role,
          profile: customerProfile,
        },
        ...tokens,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SP / SUPER ADMIN LOGIN
// ============================================

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, password } = req.body;

    // Find user by ID, phone, or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: userId },
          { phone: userId },
          { email: userId }
        ]
      },
      include: {
        serviceProvider: true,
        superAdminProfile: true,
      },
    });

    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    if (user.role === 'CUSTOMER') {
      throw new AppError('Please use OTP login for customer accounts', 400);
    }

    if (!user.isActive) {
      throw new AppError('Your account has been disabled. Please contact support.', 403);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password!);
    if (!isPasswordValid) {
      throw new AppError('Invalid credentials', 401);
    }

    // Generate tokens
    const tokens = generateTokens(user.id, user.phone, user.role, user.mustChangePassword);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    let profileData = {};

    if (user.role === 'SUPER_ADMIN') {
      profileData = user.superAdminProfile || {};
    } else {
      profileData = {
        serviceProviderId: user.serviceProviderId,
        businessName: user.serviceProvider?.businessName,
        isDisabled: user.serviceProvider?.isDisabled,
      };
    }

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
          ...profileData,
        },
        ...tokens,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// PASSWORD CHANGE
// ============================================

export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.password) {
      throw new AppError('User not found or no password set', 404);
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new AppError('Current password is incorrect', 400);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and reset mustChangePassword flag
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// TOKEN REFRESH
// ============================================

export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400);
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as {
      id: string;
      phone: string;
      role: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, phone: true, role: true, isActive: true, mustChangePassword: true },
    });

    if (!user || !user.isActive) {
      throw new AppError('User not found or account is disabled', 401);
    }

    const tokens = generateTokens(user.id, user.phone, user.role, user.mustChangePassword);

    res.status(200).json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid refresh token', 401));
    } else {
      next(error);
    }
  }
};

// ============================================
// GET CURRENT USER
// ============================================

export const getCurrentUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        customerProfile: true,
        serviceProvider: true,
        superAdminProfile: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    let profile = null;

    switch (user.role) {
      case 'CUSTOMER':
        profile = user.customerProfile;
        break;
      case 'SUPER_ADMIN':
        profile = user.superAdminProfile;
        break;
      case 'SP_SUPER_ADMIN':
      case 'MOBILE_SP':
        profile = {
          serviceProviderId: user.serviceProviderId,
          businessName: user.serviceProvider?.businessName,
          isDisabled: user.serviceProvider?.isDisabled,
        };
        break;
    }

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        profile,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// LOGOUT
// ============================================

export const logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

// ============================================
// MAGIC LINK LOGIN
// ============================================

export const magicLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    // Find the user in database by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        serviceProvider: true,
        superAdminProfile: true,
      },
    });

    if (!user) {
      throw new AppError('No account found with this email address.', 404);
    }

    if (!user.isActive) {
      throw new AppError('Your account has been disabled. Please contact support.', 403);
    }

    // Firebase Auth REST API check
    const webApiKey = process.env.FIREBASE_WEB_API_KEY;
    if (webApiKey) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      // Pass user email in query parameters to ensure we have it during verification on any device
      const continueUrl = `${frontendUrl}/login/magic-verify?email=${encodeURIComponent(email)}`;

      const firebaseRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${webApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'EMAIL_SIGNIN',
          email,
          continueUrl,
          canHandleCodeInApp: true,
        }),
      });

      if (!firebaseRes.ok) {
        const errorData = await firebaseRes.json() as any;
        throw new AppError(errorData.error?.message || 'Failed to send Firebase magic link', 400);
      }

      return res.status(200).json({
        success: true,
        message: 'Magic link sent successfully. Please check your inbox.',
      });
    }

    // Fallback: Generate a temporary magic link token (expires in 15 mins)
    const magicToken = jwt.sign(
      { userId: user.id, purpose: 'magic-link' },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' }
    );

    // Build the frontend Magic Link verification URL (Next.js runs on PORT 3001)
    // Build the frontend Magic Link verification URL (Next.js runs on PORT 3001)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const magicLink = `${frontendUrl}/login/magic-verify?token=${magicToken}`;

    // Send the email
    const subject = 'Your FreeBiz Sign-In Magic Link';
    const html = `
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 10px;">
        <tr>
          <td align="center">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
              
              <!-- Header Section -->
              <tr>
                <td align="center" style="padding: 30px 40px 20px 40px; border-bottom: 1px solid #f1f5f9;">
                  <div style="display: inline-block; padding: 10px; border-radius: 12px; background: linear-gradient(135deg, #34d399, #14b8a6); margin-bottom: 15px;">
                    <span style="font-size: 24px; color: #ffffff; font-weight: bold; line-height: 1;">FB</span>
                  </div>
                  <h2 style="color: #0f172a; font-weight: 800; font-size: 24px; margin: 0; letter-spacing: -0.025em;">FreeBiz</h2>
                  <p style="color: #059669; font-size: 11px; font-weight: 700; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.1em;">Service Marketplace</p>
                </td>
              </tr>

              <!-- Content Section -->
              <tr>
                <td style="padding: 40px;">
                  <p style="font-size: 16px; color: #334155; line-height: 1.6; margin: 0 0 16px 0;">Hello,</p>
                  <p style="font-size: 16px; color: #334155; line-height: 1.6; margin: 0 0 30px 0;">We received a request to log in to your FreeBiz account securely. Please click the button below to sign in:</p>
                  
                  <!-- CTA Button -->
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 30px 0;">
                    <tr>
                      <td align="center">
                        <a href="${magicLink}" target="_blank" style="background-color: #059669; color: #ffffff !important; padding: 14px 32px; text-decoration: none !important; font-weight: 700; border-radius: 12px; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.2), 0 2px 4px -1px rgba(5, 150, 105, 0.1);">Sign In to FreeBiz</a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 10px 0;">Alternatively, you can copy and paste the following link directly into your web browser:</p>
                  <p style="font-size: 12px; color: #0284c7; word-break: break-all; background-color: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; margin: 0 0 30px 0;">
                    <a href="${magicLink}" target="_blank" style="color: #0284c7 !important; text-decoration: underline;">${magicLink}</a>
                  </p>
                  
                  <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0;">This secure link is valid for <strong>15 minutes</strong>. If you did not request this login, you can safely ignore this email.</p>
                </td>
              </tr>

              <!-- Footer Section -->
              <tr>
                <td align="center" style="padding: 24px 40px; background-color: #f8fafc; border-top: 1px solid #f1f5f9;">
                  <p style="color: #94a3b8; font-size: 12px; margin: 0;">&copy; 2025 FreeBiz. All rights reserved.</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    `;

    await sendMail(email, subject, html);

    res.status(200).json({
      success: true,
      message: 'Magic link sent successfully. Please check your inbox.',
    });
  } catch (error) {
    next(error);
  }
};

export const magicVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, email } = req.body;

    let userEmail = email;
    const isJwt = token.startsWith('eyJ') && token.split('.').length === 3;

    if (!isJwt) {
      const webApiKey = process.env.FIREBASE_WEB_API_KEY;
      if (!webApiKey) {
        throw new AppError('Firebase Web API Key is not configured on the server.', 500);
      }
      if (!email) {
        throw new AppError('Email is required for Firebase verification.', 400);
      }

      // Verify the oobCode using Firebase REST API
      const firebaseRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${webApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          oobCode: token,
        }),
      });

      if (!firebaseRes.ok) {
        const errorData = await firebaseRes.json() as any;
        throw new AppError(errorData.error?.message || 'Invalid or expired Magic Link.', 401);
      }
    } else {
      // Verify token as JWT
      let decoded: any;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET!);
      } catch (err) {
        throw new AppError('Invalid or expired Magic Link token.', 401);
      }

      if (decoded.purpose !== 'magic-link') {
        throw new AppError('Invalid token purpose.', 400);
      }

      // Find user from decoded JWT
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });
      if (!dbUser) {
        throw new AppError('User not found.', 404);
      }
      userEmail = dbUser.email!;
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      include: {
        serviceProvider: true,
        superAdminProfile: true,
      },
    });

    if (!user) {
      throw new AppError('User not found with this email.', 404);
    }

    if (!user.isActive) {
      throw new AppError('Your account has been disabled. Please contact support.', 403);
    }

    // Generate tokens
    const tokens = generateTokens(user.id, user.phone, user.role, user.mustChangePassword);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    let profileData = {};
    if (user.role === 'SUPER_ADMIN') {
      profileData = user.superAdminProfile || {};
    } else {
      profileData = {
        serviceProviderId: user.serviceProviderId,
        businessName: user.serviceProvider?.businessName,
        isDisabled: user.serviceProvider?.isDisabled,
      };
    }

    res.status(200).json({
      success: true,
      message: 'Magic Link login successful',
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
          ...profileData,
        },
        ...tokens,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// HELPERS
// ============================================

const generateTokens = (userId: string, phone: string, role: string, mustChangePassword: boolean) => {
  const accessToken = jwt.sign(
    { id: userId, phone, role, mustChangePassword },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any }
  );

  const refreshToken = jwt.sign(
    { id: userId, phone, role },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any }
  );

  return { accessToken, refreshToken };
};
