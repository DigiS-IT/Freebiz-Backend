import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../app';
import { AppError } from '../utils/helpers';
import { UserRole, SubscriptionStatus } from '@prisma/client';

// ============================================
// ADMIN DASHBOARD
// ============================================
export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Platform-wide counts
    const totalCustomers = await prisma.customerProfile.count();
    const totalProviders = await prisma.serviceProviderProfile.count();
    const totalBookings = await prisma.booking.count();

    const freeBookings = await prisma.booking.count({
      where: { service: { serviceType: 'FREE' } },
    });
    const discountedBookings = await prisma.booking.count({
      where: { service: { serviceType: 'DISCOUNTED' } },
    });

    const bookedCount = await prisma.booking.count({ where: { status: 'BOOKED' } });
    const usedCount = await prisma.booking.count({ where: { status: 'USED' } });
    const expiredCount = await prisma.booking.count({ where: { status: 'EXPIRED' } });
    const cancelledCount = await prisma.booking.count({ where: { status: 'CANCELLED' } });

    // 2. Last 6 Months Registrations & Bookings
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyCustomers = await prisma.customerProfile.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    });

    const monthlyProviders = await prisma.serviceProviderProfile.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    });

    const monthlyBookings = await prisma.booking.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      include: { service: true },
    });

    // Build array of last 6 months in format YYYY-MM
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }

    const customerMonthly = months.map((m) => ({
      month: m,
      count: monthlyCustomers.filter((c) => c.createdAt && c.createdAt.toISOString().startsWith(m)).length,
    }));

    const providerMonthly = months.map((m) => ({
      month: m,
      count: monthlyProviders.filter((p) => p.createdAt && p.createdAt.toISOString().startsWith(m)).length,
    }));

    const bookingMonthly = months.map((m) => {
      const monthBookings = monthlyBookings.filter((b) => b.createdAt.toISOString().slice(0, 7) === m);
      return {
        month: m,
        free: monthBookings.filter((b) => b.service.serviceType === 'FREE').length,
        discounted: monthBookings.filter((b) => b.service.serviceType === 'DISCOUNTED').length,
      };
    });

    // 3. Top performing service providers by booking count
    const providers = await prisma.serviceProviderProfile.findMany({
      include: {
        services: {
          include: { bookings: true },
        },
      },
    });

    const topSPs = providers
      .map((sp) => ({
        id: sp.id,
        name: sp.businessName,
        city: sp.services[0]?.city || 'Unknown',
        totalBookings: sp.services.reduce((acc, s) => acc + s.bookings.length, 0),
        activeServices: sp.services.filter((s) => s.isActive).length,
      }))
      .sort((a, b) => b.totalBookings - a.totalBookings)
      .slice(0, 5);

    // 4. Service Distribution: bookings per service name across all providers
    const allServices = await prisma.service.findMany({
      include: { bookings: true },
    });

    const serviceDistributionMap = new Map<string, number>();
    allServices.forEach((s) => {
      const name = s.serviceType === 'FREE' ? 'Free Service' : 'Discounted Service';
      serviceDistributionMap.set(name, (serviceDistributionMap.get(name) || 0) + s.bookings.length);
    });

    const serviceDistribution = Array.from(serviceDistributionMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // 5. Customer Demographics
    const males = await prisma.customerProfile.count({ where: { gender: 'Male' } });
    const females = await prisma.customerProfile.count({ where: { gender: 'Female' } });
    const others = await prisma.customerProfile.count({ where: { gender: 'Other' } });
    const totalWithGender = males + females + others;
    const gender = [
      { label: 'Male', pct: totalWithGender > 0 ? Math.round((males / totalWithGender) * 100) : 55, color: 'bg-teal-500' },
      { label: 'Female', pct: totalWithGender > 0 ? Math.round((females / totalWithGender) * 100) : 40, color: 'bg-rose-500' },
      { label: 'Other', pct: totalWithGender > 0 ? Math.round((others / totalWithGender) * 100) : 5, color: 'bg-amber-500' },
    ];

    const age18_25 = await prisma.customerProfile.count({ where: { age: { gte: 18, lte: 25 } } });
    const age26_35 = await prisma.customerProfile.count({ where: { age: { gte: 26, lte: 35 } } });
    const age36_45 = await prisma.customerProfile.count({ where: { age: { gte: 36, lte: 45 } } });
    const age46Plus = await prisma.customerProfile.count({ where: { age: { gte: 46 } } });
    const totalWithAge = age18_25 + age26_35 + age36_45 + age46Plus;
    const ageGroups = [
      { label: '18-25', pct: totalWithAge > 0 ? Math.round((age18_25 / totalWithAge) * 100) : 30 },
      { label: '26-35', pct: totalWithAge > 0 ? Math.round((age26_35 / totalWithAge) * 100) : 35 },
      { label: '36-45', pct: totalWithAge > 0 ? Math.round((age36_45 / totalWithAge) * 100) : 20 },
      { label: '46+', pct: totalWithAge > 0 ? Math.round((age46Plus / totalWithAge) * 100) : 15 },
    ];

    const cityGroups = await prisma.customerProfile.groupBy({
      by: ['city'],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 5,
    });
    const cities = cityGroups
      .filter((cg) => cg.city)
      .map((cg) => ({
        name: cg.city as string,
        count: cg._count.id,
      }));
    if (cities.length === 0) {
      cities.push(
        { name: 'Bangalore', count: 0 },
        { name: 'Mumbai', count: 0 },
        { name: 'Delhi', count: 0 }
      );
    }

    const demographics = { gender, ageGroups, cities };

    // 6. Booking Conversion Funnel
    const totalSlotsCount = await prisma.serviceSlot.aggregate({
      _sum: {
        totalCount: true,
      },
    });
    const totalSlotsVal = totalSlotsCount._sum.totalCount || 0;
    const bookedVal = await prisma.booking.count();
    const usedVal = await prisma.booking.count({ where: { status: 'USED' } });
    const ratedVal = await prisma.rating.count();

    const conversionFunnel = [
      { label: 'Total Slots', count: totalSlotsVal, pct: 100 },
      { label: 'Booked', count: bookedVal, pct: totalSlotsVal > 0 ? Math.round((bookedVal / totalSlotsVal) * 100) : 70 },
      { label: 'Used', count: usedVal, pct: bookedVal > 0 ? Math.round((usedVal / bookedVal) * 100) : 70 },
      { label: 'Rated', count: ratedVal, pct: usedVal > 0 ? Math.round((ratedVal / usedVal) * 100) : 56 },
    ];

    // 7. Revenue Growth Trend
    const subscriptions = await prisma.subscription.findMany({
      orderBy: { startDate: 'asc' },
    });
    const revenueMap = new Map<string, number>();
    subscriptions.forEach((s) => {
      const monthKey = s.startDate.toISOString().slice(0, 7);
      revenueMap.set(monthKey, (revenueMap.get(monthKey) || 0) + 2999);
    });
    let runningSum = 0;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const revenueGrowth = Array.from(revenueMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, rev]) => {
        runningSum += rev;
        const [year, m] = month.split('-');
        const monthName = monthNames[parseInt(m) - 1] + ' ' + year.slice(2);
        return {
          month: monthName,
          revenue: rev,
          growth: runningSum,
        };
      });

    // 8. Top Booking Services
    const topServices = await prisma.service.findMany({
      include: {
        bookings: true,
        serviceProvider: true,
      },
    });
    const formattedTopServices = topServices
      .map((s) => ({
        name: s.serviceType === 'FREE' ? 'Free Service' : 'Discounted Service',
        type: s.serviceType.toLowerCase(),
        spName: s.serviceProvider.businessName,
        bookingsCount: s.bookings.length,
      }))
      .sort((a, b) => b.bookingsCount - a.bookingsCount)
      .slice(0, 5);

    // 9. Sparkline last 7 days registrations
    const sparkline: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dEnd = new Date(d);
      dEnd.setDate(dEnd.getDate() + 1);

      const count = await prisma.customerProfile.count({
        where: {
          createdAt: {
            gte: d,
            lt: dEnd,
          },
        },
      });
      sparkline.push(count);
    }

    res.status(200).json({
      success: true,
      overview: {
        totalCustomers,
        totalProviders,
        totalBookings,
        freeBookings,
        discountedBookings,
        bookedCount,
        usedCount,
        expiredCount,
        cancelledCount,
      },
      customerMonthly,
      providerMonthly,
      bookingMonthly,
      topSPs,
      serviceDistribution,
      demographics,
      conversionFunnel,
      revenueGrowth,
      topServices: formattedTopServices,
      sparkline,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SERVICE PROVIDERS
// ============================================
export const getProviders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search } = req.query;

    const whereClause: any = {};
    if (search) {
      whereClause.businessName = { contains: search as string, mode: 'insensitive' };
    }

    const providers = await prisma.serviceProviderProfile.findMany({
      where: whereClause,
      include: {
        users: true,
        services: { include: { slots: true } },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = providers.map((p) => {
      const spUser = p.users[0];
      const service = p.services[0];
      const activeSub = p.subscriptions[0];

      return {
        id: p.id,
        name: p.businessName,
        businessEmail: p.businessEmail || spUser?.email || '',
        primaryContact: p.primaryContact || '',
        secondaryContact: p.secondaryContact || '',
        address: p.address || service?.address || '',
        city: p.city || service?.city || 'No City',
        latitude: p.latitude || service?.latitude || null,
        longitude: p.longitude || service?.longitude || null,
        contactNumber: service?.contactNumber || spUser?.phone || 'No Contact',
        isActive: !p.isDisabled,
        registeredOn: p.createdAt.toISOString(),
        services: p.services.map((s) => ({
          id: s.id,
          name: s.serviceType === 'FREE' ? 'Free Service' : 'Discounted Service',
          type: s.serviceType.toLowerCase(),
          discountPercentage: s.discountPercentage,
        })),
        subscription: activeSub
          ? {
              startDate: activeSub.startDate.toISOString().split('T')[0],
              endDate: activeSub.endDate.toISOString().split('T')[0],
              isActive: activeSub.status === SubscriptionStatus.ACTIVE && activeSub.endDate >= new Date(),
            }
          : null,
      };
    });

    res.status(200).json({ success: true, providers: formatted });
  } catch (error) {
    next(error);
  }
};

// Create a new SP Super Admin User (Super Service Provider)
export const createProvider = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, password, businessName, businessEmail, primaryContact, secondaryContact, address, city, latitude, longitude } = req.body;

    if (!phone || !password || !businessName?.trim() || !businessEmail?.trim() || !address?.trim() || !city?.trim() || latitude === undefined || longitude === undefined) {
      throw new AppError('Phone, password, business name, business email, address, city, latitude, and longitude are all required', 400);
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { phone } });
    if (existingUser) {
      throw new AppError('A user with this phone number already exists', 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create Service Provider Profile unconditionally
    const profile = await prisma.serviceProviderProfile.create({
      data: {
        businessName: businessName.trim(),
        businessEmail: businessEmail.trim(),
        primaryContact: primaryContact?.trim() || null,
        secondaryContact: secondaryContact?.trim() || null,
        address: address.trim(),
        city: city.trim(),
        latitude: parseFloat(latitude.toString()),
        longitude: parseFloat(longitude.toString()),
      },
    });

    // Create User record with role SP_SUPER_ADMIN linked to the profile
    const newUser = await prisma.user.create({
      data: {
        phone,
        password: hashedPassword,
        role: UserRole.SP_SUPER_ADMIN,
        mustChangePassword: true,
        isActive: true,
        serviceProviderId: profile.id,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Super Service Provider user created successfully',
      data: {
        id: newUser.id,
        phone: newUser.phone,
        role: newUser.role,
        createdAt: newUser.createdAt,
        serviceProviderId: newUser.serviceProviderId,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Enable/Disable Service Provider Profile
export const updateProviderActive = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { spId, isActive } = req.body;

    if (!spId) {
      throw new AppError('spId is required', 400);
    }

    const updated = await prisma.serviceProviderProfile.update({
      where: { id: spId },
      data: {
        isDisabled: !isActive,
        disabledAt: isActive ? null : new Date(),
      },
    });

    res.status(200).json({
      success: true,
      message: `Provider successfully ${isActive ? 'activated' : 'deactivated'}`,
      provider: {
        id: updated.id,
        name: updated.businessName,
        isActive: !updated.isDisabled,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// CUSTOMERS
// ============================================
export const getCustomers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search } = req.query;

    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { user: { phone: { contains: search as string } } },
      ];
    }

    const customers = await prisma.customerProfile.findMany({
      where: whereClause,
      include: {
        user: true,
        bookings: {
          include: { service: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.user?.phone || 'No Phone',
      age: c.age,
      gender: c.gender,
      city: c.city || 'Unknown',
      registeredOn: c.createdAt.toISOString(),
      bookings: c.bookings.map((b) => ({
        bookingId: b.bookingCode,
        serviceName: b.service?.serviceType === 'FREE' ? 'Free Service' : 'Discounted Service',
        serviceType: b.service?.serviceType.toLowerCase() || 'free',
        date: b.bookingDate.toISOString().split('T')[0],
        status: b.status.toLowerCase(),
      })),
    }));

    res.status(200).json({ success: true, customers: formatted });
  } catch (error) {
    next(error);
  }
};

// ============================================
// REVENUE & SUBSCRIPTIONS
// ============================================
export const getRevenue = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptions = await prisma.subscription.findMany({
      include: {
        serviceProvider: {
          include: { users: true, services: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = subscriptions.map((s) => {
      const sp = s.serviceProvider;
      const user = sp.users[0];
      const service = sp.services[0];

      return {
        id: s.id,
        spId: s.serviceProviderId,
        spName: sp.businessName,
        spContact: service?.contactNumber || user?.phone || 'No Contact',
        spCity: service?.city || 'No City',
        startDate: s.startDate.toISOString().split('T')[0],
        endDate: s.endDate.toISOString().split('T')[0],
        isActive: s.status === SubscriptionStatus.ACTIVE && s.endDate >= new Date(),
      };
    });

    res.status(200).json({ success: true, subscriptions: formatted });
  } catch (error) {
    next(error);
  }
};

export const createSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { spId, startDate, endDate } = req.body;

    if (!spId || !startDate || !endDate) {
      throw new AppError('spId, startDate, and endDate are required', 400);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isActive = end >= today;

    const subscription = await prisma.subscription.create({
      data: {
        serviceProviderId: spId,
        startDate: start,
        endDate: end,
        status: isActive ? SubscriptionStatus.ACTIVE : SubscriptionStatus.EXPIRED,
      },
    });

    res.status(201).json({ success: true, subscription });
  } catch (error) {
    next(error);
  }
};

export const updateSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subscriptionId, startDate, endDate, isActive } = req.body;

    if (!subscriptionId) {
      throw new AppError('subscriptionId is required', 400);
    }

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        ...(start && { startDate: start }),
        ...(end && { endDate: end }),
        ...(isActive !== undefined && { status: isActive ? SubscriptionStatus.ACTIVE : SubscriptionStatus.EXPIRED }),
      },
    });

    res.status(200).json({ success: true, subscription: updated });
  } catch (error) {
    next(error);
  }
};
