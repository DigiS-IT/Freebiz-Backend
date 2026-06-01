import { Request, Response, NextFunction } from 'express';
import { prisma } from '../app';
import { AppError, calculateDistance, formatDistance, getDiscountTier, paginate } from '../utils/helpers';
import { AuthRequest } from '../middlewares/auth.middleware';

// ============================================
// GET SERVICES FOR CUSTOMER (With Location)
// ============================================

export const getServices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      serviceType,
      minDiscount,
      city,
      latitude,
      longitude,
      search,
      page = '1',
      limit = '20',
    } = req.query;

    // Build where clause
    const where: any = {
      isActive: true,
      serviceMode: 'IN_PERSON',
    };

    // Filter by service type
    if (serviceType === 'FREE') {
      where.serviceType = 'FREE';
    } else if (serviceType === 'DISCOUNTED') {
      where.serviceType = 'DISCOUNTED';
      
      // Filter by minimum discount percentage
      if (minDiscount) {
        const minDisc = parseFloat(minDiscount as string);
        where.discountPercentage = { gte: minDisc };
      }
    }

    // Filter by city
    if (city) {
      where.city = { equals: city as string, mode: 'insensitive' };
    }

    // Search by SP name or location
    if (search) {
      where.OR = [
        { serviceProvider: { businessName: { contains: search as string, mode: 'insensitive' } } },
        { address: { contains: search as string, mode: 'insensitive' } },
        { city: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    let serviceIds: string[] | null = null;
    let distanceMap: Record<string, { distance: number; distanceText: string }> = {};

    if (latitude && longitude) {
      const userLat = parseFloat(latitude as string);
      const userLng = parseFloat(longitude as string);

      if (!isNaN(userLat) && !isNaN(userLng)) {
        // Safe check and enable PostGIS extension in DB
        try {
          await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis;');
        } catch (e) {
          console.error('PostGIS extension check failed:', e);
        }

        try {
          // Pre-filter service IDs within a 10 km (10,000 meters) boundary using PostGIS directly in SQL
          const nearbyServices = await prisma.$queryRaw<any[]>`
            SELECT s.id, 
                   ST_DistanceSphere(
                     ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326),
                     ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)
                   ) AS distance
            FROM "Service" s
            JOIN "ServiceProviderProfile" sp ON s."serviceProviderId" = sp.id
            WHERE s."isActive" = true 
              AND sp."isDisabled" = false
              AND ST_DistanceSphere(
                    ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326),
                    ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)
                  ) <= 10000 -- 10km in meters
            ORDER BY distance ASC
          `;

          serviceIds = nearbyServices.map((s) => s.id);
          nearbyServices.forEach((s) => {
            const distKm = s.distance / 1000.0;
            distanceMap[s.id] = {
              distance: distKm,
              distanceText: distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`,
            };
          });

          // Enforce raw SQL filter inside Prisma where clause
          where.id = { in: serviceIds };
        } catch (e) {
          console.error('PostGIS raw query failed, falling back to memory calculations:', e);
        }
      }
    }

    const { skip, take } = paginate(parseInt(page as string), parseInt(limit as string));

    // Get services with slot info
    const services = await prisma.service.findMany({
      where,
      include: {
        serviceProvider: {
          select: { businessName: true, isDisabled: true },
        },
        media: {
          where: { mediaType: 'PHOTO' },
          orderBy: { order: 'asc' },
          take: 1,
          select: { mediaUrl: true },
        },
        slots: {
          where: {
            isActive: true,
            startDate: { lte: new Date() },
            endDate: { gte: new Date() },
          },
          select: {
            startDate: true,
            endDate: true,
            dailyCount: true,
            _count: {
              select: {
                bookings: {
                  where: {
                    bookingDate: { gte: new Date() },
                    status: { not: 'CANCELLED' },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    // Filter out disabled SPs and calculate distances
    let filteredServices = services
      .filter((s: any) => !s.serviceProvider.isDisabled)
      .map((s: any) => {
        let distance = null;
        let distanceText = null;

        if (distanceMap[s.id]) {
          distance = distanceMap[s.id].distance;
          distanceText = distanceMap[s.id].distanceText;
        } else if (latitude && longitude) {
          distance = calculateDistance(
            parseFloat(latitude as string),
            parseFloat(longitude as string),
            s.latitude,
            s.longitude
          );
          distanceText = formatDistance(distance);
        }

        // Calculate available slots for today
        const today = new Date().toISOString().split('T')[0];
        const todaySlot = s.slots.find(
          (slot: any) => today >= slot.startDate.toISOString().split('T')[0] &&
                   today <= slot.endDate.toISOString().split('T')[0]
        );

        const bookedToday = todaySlot?._count.bookings || 0;
        const dailyCount = todaySlot?.dailyCount || 0;
        const availableToday = Math.max(0, dailyCount - bookedToday);

        return {
          id: s.id,
          businessName: s.serviceProvider.businessName,
          serviceType: s.serviceType,
          serviceDetail: s.serviceDetail,
          contactNumber: s.contactNumber,
          address: s.address,
          city: s.city,
          latitude: s.latitude,
          longitude: s.longitude,
          specialInstructions: s.specialInstructions,
          termsAndConditions: s.termsAndConditions,
          // Discount info
          actualPrice: s.actualPrice,
          discountedPrice: s.discountedPrice,
          discountPercentage: s.discountPercentage,
          discountTier: s.discountPercentage ? getDiscountTier(s.discountPercentage) : null,
          // Media
          thumbnailUrl: s.media[0]?.mediaUrl || null,
          // Distance
          distance,
          distanceText,
          // Availability
          hasActiveSlot: s.slots.length > 0,
          availableToday,
          slotDates: s.slots.map((slot: any) => ({
            startDate: slot.startDate,
            endDate: slot.endDate,
            dailyCount: slot.dailyCount,
          })),
        };
      });

    // Sort by distance if coordinates provided
    if (latitude && longitude) {
      filteredServices.sort((a: any, b: any) => (a.distance || Infinity) - (b.distance || Infinity));
    }

    const total = await prisma.service.count({ where });

    res.status(200).json({
      success: true,
      data: {
        services: filteredServices,
        pagination: {
          page: parseInt(page as string),
          limit: take,
          total,
          pages: Math.ceil(total / take),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// GET SERVICE DETAIL FOR BOOKING
// ============================================

export const getServiceById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const service = await prisma.service.findUnique({
      where: { id },
      include: {
        serviceProvider: {
          select: { id: true, businessName: true, isDisabled: true },
        },
        media: {
          orderBy: { order: 'asc' },
        },
        slots: {
          where: {
            isActive: true,
            endDate: { gte: new Date() },
          },
          orderBy: { startDate: 'asc' },
        },
      },
    });

    if (!service || !service.isActive) {
      throw new AppError('Service not found', 404);
    }

    if (service.serviceProvider.isDisabled) {
      throw new AppError('This service is currently unavailable', 400);
    }

    // Build available dates map
    const availableDates: Record<string, number> = {};
    const today = new Date().toISOString().split('T')[0];

    for (const slot of service.slots) {
      const start = new Date(slot.startDate);
      const end = new Date(slot.endDate);
      const current = new Date(Math.max(start.getTime(), new Date(today).getTime()));

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        
        // Count bookings for this date
        const bookedCount = await prisma.booking.count({
          where: {
            slotId: slot.id,
            bookingDate: new Date(dateStr),
            status: { not: 'CANCELLED' },
          },
        });

        availableDates[dateStr] = slot.dailyCount - bookedCount;
        current.setDate(current.getDate() + 1);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        id: service.id,
        businessName: service.serviceProvider.businessName,
        serviceType: service.serviceType,
        serviceDetail: service.serviceDetail,
        contactNumber: service.contactNumber,
        address: service.address,
        city: service.city,
        latitude: service.latitude,
        longitude: service.longitude,
        specialInstructions: service.specialInstructions,
        termsAndConditions: service.termsAndConditions,
        actualPrice: service.actualPrice,
        discountedPrice: service.discountedPrice,
        discountPercentage: service.discountPercentage,
        discountTier: service.discountPercentage ? getDiscountTier(service.discountPercentage) : null,
        media: service.media,
        availableDates,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// GET HOME SCREEN CATEGORY COUNTS
// ============================================

export const getHomeCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { city } = req.query;

    const where: any = {
      isActive: true,
      serviceMode: 'IN_PERSON',
    };

    if (city) {
      where.city = city;
    }

    const [freeCount, highDiscount, medHighDiscount, medLowDiscount, lowDiscount] = await Promise.all([
      prisma.service.count({ where: { ...where, serviceType: 'FREE' } }),
      prisma.service.count({ where: { ...where, serviceType: 'DISCOUNTED', discountPercentage: { gt: 90 } } }),
      prisma.service.count({ where: { ...where, serviceType: 'DISCOUNTED', discountPercentage: { gte: 70, lte: 90 } } }),
      prisma.service.count({ where: { ...where, serviceType: 'DISCOUNTED', discountPercentage: { gte: 50, lt: 70 } } }),
      prisma.service.count({ where: { ...where, serviceType: 'DISCOUNTED', discountPercentage: { lt: 50 } } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        categories: [
          { key: 'FREE', label: 'Free Service', count: freeCount },
          { key: '>90%', label: '>90% Discount', count: highDiscount },
          { key: '70-90%', label: '70% – 90% Discount', count: medHighDiscount },
          { key: '50-70%', label: '50% – 70% Discount', count: medLowDiscount },
          { key: '<50%', label: '<50% Discount', count: lowDiscount },
        ],
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// UPLOAD / CREATE / UPDATE SERVICE DETAILS
// ============================================
export const createService = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const spId = req.user!.serviceProviderId;
    if (!spId) {
      throw new AppError('Service provider profile not found', 400);
    }

    const {
      serviceType,
      serviceDetail,
      contactNumber,
      address,
      city,
      latitude,
      longitude,
      specialInstructions,
      termsAndConditions,
      actualPrice,
      discountedPrice,
      parentId,
      media,
    } = req.body;

    let discountPercentage = null;
    if (serviceType === 'DISCOUNTED' && actualPrice && discountedPrice) {
      discountPercentage = Math.round(((actualPrice - discountedPrice) / actualPrice) * 100);
    }

    const service = await prisma.service.create({
      data: {
        serviceProviderId: spId,
        serviceType,
        serviceDetail,
        contactNumber,
        address,
        city,
        latitude: parseFloat(latitude.toString()),
        longitude: parseFloat(longitude.toString()),
        specialInstructions: specialInstructions || null,
        termsAndConditions: termsAndConditions || null,
        actualPrice: serviceType === 'FREE' ? null : parseFloat(actualPrice.toString()),
        discountedPrice: serviceType === 'FREE' ? null : parseFloat(discountedPrice.toString()),
        discountPercentage,
        parentId: serviceType === 'FREE' ? (parentId || null) : null,
      },
    });

    if (media && Array.isArray(media) && media.length > 0) {
      await prisma.serviceMedia.createMany({
        data: media.map((item: any, idx: number) => ({
          serviceId: service.id,
          mediaType: item.mediaType === 'VIDEO' ? 'VIDEO' : 'PHOTO',
          mediaUrl: item.mediaUrl,
          thumbnailUrl: item.thumbnailUrl || null,
          order: item.order ?? idx,
        })),
      });
    }

    const newService = await prisma.service.findUnique({
      where: { id: service.id },
      include: { media: true },
    });

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      data: newService,
    });
  } catch (error) {
    next(error);
  }
};

export const updateService = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const spId = req.user!.serviceProviderId;
    if (!spId) {
      throw new AppError('Service provider profile not found', 400);
    }

    const { id } = req.params;
    const {
      serviceType,
      serviceDetail,
      contactNumber,
      address,
      city,
      latitude,
      longitude,
      specialInstructions,
      termsAndConditions,
      actualPrice,
      discountedPrice,
      parentId,
      media,
    } = req.body;

    // Verify ownership
    const existingService = await prisma.service.findFirst({
      where: { id, serviceProviderId: spId }
    });

    if (!existingService) {
      throw new AppError('Service not found or unauthorized', 404);
    }

    let discountPercentage = null;
    if (serviceType === 'DISCOUNTED' && actualPrice && discountedPrice) {
      discountPercentage = Math.round(((actualPrice - discountedPrice) / actualPrice) * 100);
    }

    const service = await prisma.service.update({
      where: { id },
      data: {
        serviceType,
        serviceDetail,
        contactNumber,
        address,
        city,
        latitude: parseFloat(latitude.toString()),
        longitude: parseFloat(longitude.toString()),
        specialInstructions: specialInstructions || null,
        termsAndConditions: termsAndConditions || null,
        actualPrice: serviceType === 'FREE' ? null : parseFloat(actualPrice.toString()),
        discountedPrice: serviceType === 'FREE' ? null : parseFloat(discountedPrice.toString()),
        discountPercentage,
        parentId: serviceType === 'FREE' ? (parentId || null) : null,
      },
    });

    await prisma.serviceMedia.deleteMany({
      where: { serviceId: service.id },
    });

    if (media && Array.isArray(media) && media.length > 0) {
      await prisma.serviceMedia.createMany({
        data: media.map((item: any, idx: number) => ({
          serviceId: service.id,
          mediaType: item.mediaType === 'VIDEO' ? 'VIDEO' : 'PHOTO',
          mediaUrl: item.mediaUrl,
          thumbnailUrl: item.thumbnailUrl || null,
          order: item.order ?? idx,
        })),
      });
    }

    const updatedService = await prisma.service.findUnique({
      where: { id: service.id },
      include: { media: true },
    });

    res.status(200).json({
      success: true,
      message: 'Service updated successfully',
      data: updatedService,
    });
  } catch (error) {
    next(error);
  }
};

