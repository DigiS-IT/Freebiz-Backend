import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../app';
import { AppError } from '../utils/helpers';
import { AuthRequest } from '../middlewares/auth.middleware';

// Get SP Portal Stats
export const getSpStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const spId = req.user!.serviceProviderId;
    if (!spId) {
      return res.status(200).json({ success: true, data: [] });
    }
    
    const stats = await prisma.booking.groupBy({
      by: ['status'],
      where: { service: { serviceProviderId: spId } },
      _count: true
    });

    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

// Get SP Portal Bookings
export const getSpBookings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const spId = req.user!.serviceProviderId;
    if (!spId) {
      return res.status(200).json({ success: true, data: [] });
    }

    const bookings = await prisma.booking.findMany({
      where: { service: { serviceProviderId: spId } },
      include: {
        customer: {
          include: {
            user: { select: { phone: true, email: true } }
          }
        },
        service: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    next(error);
  }
};

// Create Service Provider Business Profile
export const createSpProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { businessName, businessEmail, address, city, latitude, longitude } = req.body;

    if (!businessName) {
      throw new AppError('Business name is required', 400);
    }

    // Check if user already has a service provider profile linked
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { serviceProviderId: true, role: true }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.role !== 'SP_SUPER_ADMIN') {
      throw new AppError('Only Super Service Providers can register a business profile', 403);
    }

    if (user.serviceProviderId) {
      throw new AppError('A service provider business profile is already registered under this account', 400);
    }

    // Create the Service Provider Profile
    const spProfile = await prisma.serviceProviderProfile.create({
      data: {
        businessName,
        businessEmail: businessEmail || null,
        address: address || null,
        city: city || null,
        latitude: latitude ? parseFloat(latitude.toString()) : null,
        longitude: longitude ? parseFloat(longitude.toString()) : null,
        isDisabled: false,
      }
    });

    // Link User to the Service Provider Profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { serviceProviderId: spProfile.id },
      include: { serviceProvider: true }
    });

    res.status(201).json({
      success: true,
      message: 'Business profile registered successfully',
      data: {
        spId: spProfile.id,
        businessName: spProfile.businessName,
        user: {
          id: updatedUser.id,
          phone: updatedUser.phone,
          role: updatedUser.role,
          serviceProviderId: updatedUser.serviceProviderId,
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get Service Provider Business Profile & Review Aggregates
export const getSpProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const spId = req.user!.serviceProviderId;

    if (!spId) {
      throw new AppError('Service provider profile not set up yet', 404);
    }

    const provider = await prisma.serviceProviderProfile.findUnique({
      where: { id: spId },
      include: {
        services: {
          include: {
            slots: true,
            bookings: {
              include: {
                rating: true,
                customer: true
              }
            }
          }
        },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });

    if (!provider) {
      throw new AppError('Provider profile not found', 404);
    }

    // Calculate slot counts and bookings counts
    const serviceCount = provider.services.length;
    const totalBookings = await prisma.booking.count({
      where: { service: { serviceProviderId: spId } }
    });

    // Calculate average rating
    const reviews = await prisma.rating.findMany({
      where: { booking: { service: { serviceProviderId: spId } } },
      select: { stars: true }
    });

    const totalReviews = reviews.length;
    const avgRating = totalReviews > 0
      ? Math.round((reviews.reduce((sum, r) => sum + r.stars, 0) / totalReviews) * 10) / 10
      : 0;

    res.status(200).json({
      success: true,
      data: {
        id: provider.id,
        businessName: provider.businessName,
        isDisabled: provider.isDisabled,
        registeredOn: provider.createdAt.toISOString(),
        serviceCount,
        totalBookings,
        avgRating,
        totalReviews,
        services: provider.services,
        subscription: provider.subscriptions[0] || null
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get SP slots and services
export const getSpSlots = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const spId = req.user!.serviceProviderId;
    if (!spId) {
      return res.status(200).json({ success: true, services: [] });
    }

    const services = await prisma.service.findMany({
      where: { serviceProviderId: spId },
      include: { 
        slots: { orderBy: { createdAt: 'desc' } },
        media: { orderBy: { order: 'asc' } },
      },
    });

    const formatted = services.map((s) => ({
      id: s.id,
      name: s.serviceType === 'FREE' ? 'Free Service' : 'Discounted Service',
      type: s.serviceType.toLowerCase(),
      description: s.serviceDetail,
      actualPrice: s.actualPrice,
      discountedPrice: s.discountedPrice,
      discountPercentage: s.discountPercentage,
      contactNumber: s.contactNumber,
      address: s.address,
      city: s.city,
      latitude: s.latitude,
      longitude: s.longitude,
      specialInstructions: s.specialInstructions,
      termsAndConditions: s.termsAndConditions,
      parentId: s.parentId,
      media: s.media.map(m => ({
        id: m.id,
        mediaType: m.mediaType,
        mediaUrl: m.mediaUrl,
        thumbnailUrl: m.thumbnailUrl,
        order: m.order,
      })),
      slots: s.slots.map(slot => ({
        id: slot.id,
        serviceId: slot.serviceId,
        fromDate: slot.startDate.toISOString().split('T')[0],
        toDate: slot.endDate.toISOString().split('T')[0],
        dailyCount: slot.dailyCount,
        totalCount: slot.totalCount,
      })),
    }));

    res.status(200).json({ success: true, services: formatted });
  } catch (error) {
    next(error);
  }
};

// Create a slot
export const createSpSlot = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const spId = req.user!.serviceProviderId;
    if (!spId) {
      throw new AppError('Service provider profile not found', 400);
    }

    const { serviceId, fromDate, toDate, dailyCount } = req.body;

    if (!serviceId || !fromDate || !toDate || !dailyCount) {
      throw new AppError('Missing required fields', 400);
    }

    // Verify service belongs to SP
    const service = await prisma.service.findFirst({
      where: { id: serviceId, serviceProviderId: spId }
    });

    if (!service) {
      throw new AppError('Service not found or unauthorized', 404);
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const totalCount = dailyCount * days;

    const slot = await prisma.serviceSlot.create({
      data: {
        serviceId,
        startDate: start,
        endDate: end,
        dailyCount,
        totalCount,
        isActive: true,
      },
    });

    res.status(201).json({
      success: true,
      slot: {
        id: slot.id,
        serviceId: slot.serviceId,
        fromDate: slot.startDate.toISOString().split('T')[0],
        toDate: slot.endDate.toISOString().split('T')[0],
        dailyCount: slot.dailyCount,
        totalCount: slot.totalCount,
      },
      totalCount
    });
  } catch (error) {
    next(error);
  }
};

// Update a slot
export const updateSpSlot = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const spId = req.user!.serviceProviderId;
    if (!spId) {
      throw new AppError('Service provider profile not found', 400);
    }

    const { slotId, dailyCount } = req.body;

    if (!slotId || dailyCount === undefined) {
      throw new AppError('Missing required fields', 400);
    }

    // Verify slot belongs to SP's service
    const slot = await prisma.serviceSlot.findFirst({
      where: {
        id: slotId,
        service: { serviceProviderId: spId }
      }
    });

    if (!slot) {
      throw new AppError('Slot not found or unauthorized', 404);
    }

    const start = new Date(slot.startDate);
    const end = new Date(slot.endDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const totalCount = dailyCount * days;

    const updated = await prisma.serviceSlot.update({
      where: { id: slotId },
      data: { dailyCount, totalCount },
    });

    res.status(200).json({
      success: true,
      slot: {
        id: updated.id,
        serviceId: updated.serviceId,
        fromDate: updated.startDate.toISOString().split('T')[0],
        toDate: updated.endDate.toISOString().split('T')[0],
        dailyCount: updated.dailyCount,
        totalCount: updated.totalCount,
      },
      totalCount
    });
  } catch (error) {
    next(error);
  }
};

// Create a new standard Service Provider user (MOBILE_SP / employee) under the Super SP's business profile
export const createSpUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const creatorId = req.user!.id;
    const spId = req.user!.serviceProviderId;

    if (!spId) {
      throw new AppError('You must register a business profile first before adding staff accounts', 400);
    }

    const { phone, password, email } = req.body;

    if (!phone || !password) {
      throw new AppError('Phone and password are required', 400);
    }

    // Check if user already exists with this phone number
    const existingUser = await prisma.user.findUnique({ where: { phone } });
    if (existingUser) {
      throw new AppError('A user with this phone number already exists', 400);
    }

    // Check if email already exists (if provided)
    if (email?.trim()) {
      const existingEmail = await prisma.user.findUnique({ where: { email: email.trim() } });
      if (existingEmail) {
        throw new AppError('A user with this email address already exists', 400);
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create standard Service Provider (MOBILE_SP) user
    const newUser = await prisma.user.create({
      data: {
        phone,
        email: email?.trim() || null,
        password: hashedPassword,
        role: UserRole.MOBILE_SP,
        serviceProviderId: spId,
        createdByUserId: creatorId,
        mustChangePassword: true,
        isActive: true,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Service provider user created successfully',
      data: {
        id: newUser.id,
        phone: newUser.phone,
        email: newUser.email,
        role: newUser.role,
        serviceProviderId: newUser.serviceProviderId,
        mustChangePassword: newUser.mustChangePassword,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get list of standard Service Provider users (staff) under the Super SP's business profile
export const getSpUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const spId = req.user!.serviceProviderId;

    if (!spId) {
      throw new AppError('You must register a business profile first', 400);
    }

    const users = await prisma.user.findMany({
      where: {
        serviceProviderId: spId,
        role: UserRole.MOBILE_SP,
      },
      select: {
        id: true,
        phone: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};


