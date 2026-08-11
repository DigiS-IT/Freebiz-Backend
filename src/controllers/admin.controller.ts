import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/helpers';
import { UserRole, SubscriptionStatus } from '@prisma/client';

// ============================================
// ADMIN DASHBOARD & DEMOGRAPHICS HELPERS
// ============================================

const KNOWN_STATE_CITY_MAP: Record<string, string[]> = {
  'Tamil Nadu': ['Chennai', 'Palavakkam, Chennai', 'Maduravoyal, Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Trichy', 'Tirunelveli', 'Erode', 'Vellore'],
  'Karnataka': ['Bangalore', 'Bengaluru', 'Mysore', 'Mangalore', 'Hubli'],
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik'],
  'Telangana': ['Hyderabad', 'Warangal'],
  'Delhi': ['Delhi', 'New Delhi', 'Noida', 'Gurgaon'],
  'Kerala': ['Kochi', 'Thiruvananthapuram', 'Calicut'],
};

async function getDemographicsHelper(selectedState?: string, selectedCitiesStr?: string) {
  let selectedCities: string[] = [];
  if (selectedCitiesStr && selectedCitiesStr !== 'ALL' && selectedCitiesStr.trim() !== '') {
    selectedCities = selectedCitiesStr.split(',').map((c) => c.trim()).filter(Boolean);
  }

  // 1. Build list of states & stateCityMap from CustomerProfile DB + Known Mappings
  const allProfiles = await prisma.customerProfile.findMany({
    select: { city: true, state: true, address: true },
  });

  const stateCityMap: Record<string, Set<string>> = {};

  // Seed known state map
  Object.entries(KNOWN_STATE_CITY_MAP).forEach(([st, cities]) => {
    stateCityMap[st] = new Set(cities);
  });

  // Populate from DB records
  allProfiles.forEach((p) => {
    let st = p.state;
    const city = p.city;
    if (!st && city) {
      for (const [knownState, knownCities] of Object.entries(KNOWN_STATE_CITY_MAP)) {
        if (knownCities.some((kc) => city.toLowerCase().includes(kc.toLowerCase()) || kc.toLowerCase().includes(city.toLowerCase()))) {
          st = knownState;
          break;
        }
      }
    }
    if (!st) st = 'Tamil Nadu';
    if (!stateCityMap[st]) stateCityMap[st] = new Set();
    if (city) stateCityMap[st].add(city);
  });

  const formattedStateCityMap: Record<string, string[]> = {};
  Object.keys(stateCityMap).sort().forEach((st) => {
    formattedStateCityMap[st] = Array.from(stateCityMap[st]).sort();
  });
  const statesList = Object.keys(formattedStateCityMap);

  // 2. Build Prisma filter condition
  const where: any = {};

  if (selectedCities.length > 0) {
    where.city = { in: selectedCities };
  } else if (selectedState && selectedState !== 'ALL') {
    const citiesForState = formattedStateCityMap[selectedState] || [];
    where.OR = [
      { state: selectedState },
      { city: { in: citiesForState } },
    ];
  }

  // 3. Query gender counts
  const males = await prisma.customerProfile.count({ where: { ...where, gender: 'Male' } });
  const females = await prisma.customerProfile.count({ where: { ...where, gender: 'Female' } });
  const others = await prisma.customerProfile.count({ where: { ...where, gender: 'Other' } });
  const totalWithGender = males + females + others;
  const gender = [
    { label: 'Male', pct: totalWithGender > 0 ? Math.round((males / totalWithGender) * 100) : 0, count: males, color: 'bg-teal-500' },
    { label: 'Female', pct: totalWithGender > 0 ? Math.round((females / totalWithGender) * 100) : 0, count: females, color: 'bg-rose-500' },
    { label: 'Other', pct: totalWithGender > 0 ? Math.round((others / totalWithGender) * 100) : 0, count: others, color: 'bg-amber-500' },
  ];

  // 4. Query age groups counts
  const age18_25 = await prisma.customerProfile.count({ where: { ...where, age: { gte: 18, lte: 25 } } });
  const age26_35 = await prisma.customerProfile.count({ where: { ...where, age: { gte: 26, lte: 35 } } });
  const age36_45 = await prisma.customerProfile.count({ where: { ...where, age: { gte: 36, lte: 45 } } });
  const age46Plus = await prisma.customerProfile.count({ where: { ...where, age: { gte: 46 } } });
  const totalWithAge = age18_25 + age26_35 + age36_45 + age46Plus;
  const ageGroups = [
    { label: '18-25', pct: totalWithAge > 0 ? Math.round((age18_25 / totalWithAge) * 100) : 0, count: age18_25 },
    { label: '26-35', pct: totalWithAge > 0 ? Math.round((age26_35 / totalWithAge) * 100) : 0, count: age26_35 },
    { label: '36-45', pct: totalWithAge > 0 ? Math.round((age36_45 / totalWithAge) * 100) : 0, count: age36_45 },
    { label: '46+', pct: totalWithAge > 0 ? Math.round((age46Plus / totalWithAge) * 100) : 0, count: age46Plus },
  ];

  // 5. Query top cities
  const cityGroups = await prisma.customerProfile.groupBy({
    by: ['city'],
    where: { ...where, city: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  const cities = cityGroups
    .filter((cg) => cg.city)
    .map((cg) => ({
      name: cg.city as string,
      count: cg._count.id,
    }));

  const totalFilteredCustomers = await prisma.customerProfile.count({ where });

  return {
    states: statesList,
    stateCityMap: formattedStateCityMap,
    demographics: {
      gender,
      ageGroups,
      cities,
      totalCustomers: totalFilteredCustomers,
      selectedState: selectedState || 'ALL',
      selectedCities,
    },
  };
}

export const getDemographics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stateFilter = (req.query.state as string) || 'ALL';
    const citiesFilter = req.query.cities as string;
    const result = await getDemographicsHelper(stateFilter, citiesFilter);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

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
        users: { select: { phone: true, email: true } },
        services: {
          include: { bookings: true },
        },
      },
    });

    const grandTotalBookings = Math.max(1, totalBookings);

    const topSPs = providers
      .map((sp) => {
        const totalB = sp.services.reduce((acc, s) => acc + s.bookings.length, 0);
        return {
          id: sp.id,
          name: sp.businessName,
          ownerName: sp.users[0]?.phone ? `SP-${sp.users[0].phone.slice(-4)}` : 'Business Owner',
          city: sp.city || sp.services[0]?.city || 'Chennai',
          totalBookings: totalB,
          contributionPct: grandTotalBookings > 0 ? Math.round((totalB / grandTotalBookings) * 100) : 0,
          activeServices: sp.services.filter((s) => s.isActive).length,
        };
      })
      .sort((a, b) => b.totalBookings - a.totalBookings)
      .slice(0, 5);

    // 4. Service Distribution: Free Services, Discounted Services, Other Services
    const allServices = await prisma.service.findMany({
      include: { bookings: true },
    });

    const freeCount = allServices.filter((s) => s.serviceType === 'FREE').length;
    const discountedCount = allServices.filter((s) => s.serviceType === 'DISCOUNTED').length;
    const otherCount = allServices.filter((s) => s.serviceType !== 'FREE' && s.serviceType !== 'DISCOUNTED').length;
    const totalSvcCount = Math.max(1, freeCount + discountedCount + otherCount);

    const serviceDistribution = [
      { name: 'Free Services', count: freeCount, pct: Math.round((freeCount / totalSvcCount) * 100), color: '#10B981' },
      { name: 'Discounted Services', count: discountedCount, pct: Math.round((discountedCount / totalSvcCount) * 100), color: '#3B82F6' },
      { name: 'Other Services', count: otherCount, pct: Math.round((otherCount / totalSvcCount) * 100), color: '#F59E0B' },
    ];

    // 5. Customer Demographics (Gender, Age Groups, City Distribution from Database with State/City filtering)
    const stateFilter = (req.query.state as string) || 'ALL';
    const citiesFilter = req.query.cities as string;
    const demoResult = await getDemographicsHelper(stateFilter, citiesFilter);
    const demographics = demoResult.demographics;
    const states = demoResult.states;
    const stateCityMap = demoResult.stateCityMap;

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
      { label: 'Booked', count: bookedVal, pct: totalSlotsVal > 0 ? Math.round((bookedVal / totalSlotsVal) * 100) : 0 },
      { label: 'Used', count: usedVal, pct: bookedVal > 0 ? Math.round((usedVal / bookedVal) * 100) : 0 },
      { label: 'Rated', count: ratedVal, pct: usedVal > 0 ? Math.round((ratedVal / usedVal) * 100) : 0 },
    ];

    // 7. Revenue Growth Trend directly from Subscriptions table in Database
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

    // 8. Detailed Top Booking Services directly from Service & Booking tables in Database
    const topServices = await prisma.service.findMany({
      include: {
        bookings: true,
        serviceProvider: true,
      },
    });

    const formattedTopServices = await Promise.all(
      topServices
        .map(async (s) => {
          // Query last 7 days bookings per day for this service from DB
          const trend: number[] = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            const dEnd = new Date(d);
            dEnd.setDate(dEnd.getDate() + 1);

            const dayCount = await prisma.booking.count({
              where: {
                serviceId: s.id,
                createdAt: { gte: d, lt: dEnd },
              },
            });
            trend.push(dayCount);
          }

          return {
            id: s.id,
            name: s.serviceDetail.split(' - ')[0] || (s.serviceType === 'FREE' ? 'Free Service Pass' : 'Discounted Service Session'),
            spName: s.serviceProvider.businessName,
            description: s.specialInstructions || s.serviceDetail || 'Service offered by provider',
            type: s.serviceType,
            bookingsCount: s.bookings.length,
            trend,
          };
        })
    );

    const sortedTopServices = formattedTopServices
      .sort((a, b) => b.bookingsCount - a.bookingsCount)
      .slice(0, 6);

    // 9. Sparkline last 7 days registrations directly from CustomerProfile table in Database
    const sparkline: number[] = [];
    const sparkline7Days: { date: string; count: number }[] = [];

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
      const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
      sparkline7Days.push({ date: dateLabel, count });
    }

    // 10. Recent Activities Stream directly from Booking & Service tables in Database
    const recentBookings = await prisma.booking.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true } },
        service: { select: { serviceDetail: true, serviceProvider: { select: { businessName: true } } } },
      },
    });

    const recentServices = await prisma.service.findMany({
      take: 4,
      orderBy: { createdAt: 'desc' },
      include: { serviceProvider: { select: { businessName: true } } },
    });

    const recentActivities = [
      ...recentBookings.map((b) => ({
        id: `act-b-${b.id}`,
        type: b.status === 'USED' ? 'CONFIRMED_CHECKIN' : 'CREATED_BOOKING',
        title: b.status === 'USED' 
          ? `Booking Confirmed & Claimed by ${b.service.serviceProvider.businessName}`
          : `New Booking Created by ${b.customer.name}`,
        subtitle: `${b.service.serviceDetail} • Code: ${b.bookingCode}`,
        time: b.createdAt.toISOString(),
        icon: b.status === 'USED' ? 'CheckCircle' : 'Ticket',
        badgeColor: b.status === 'USED' ? 'emerald' : 'sky',
      })),
      ...recentServices.map((s) => ({
        id: `act-s-${s.id}`,
        type: 'CREATED_SERVICE',
        title: `New Service Listed by ${s.serviceProvider.businessName}`,
        subtitle: `${s.serviceDetail} (${s.serviceType})`,
        time: s.createdAt.toISOString(),
        icon: 'PlusCircle',
        badgeColor: 'amber',
      })),
    ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8);

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
      states,
      stateCityMap,
      conversionFunnel,
      revenueGrowth,
      topServices: sortedTopServices,
      sparkline,
      sparkline7Days,
      recentActivities,
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
      let daysRemaining = 0;
      if (activeSub?.endDate) {
        const diffTime = new Date(activeSub.endDate).getTime() - new Date().getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

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
              id: activeSub.id,
              startDate: activeSub.startDate.toISOString().split('T')[0],
              endDate: activeSub.endDate.toISOString().split('T')[0],
              isActive: activeSub.status === SubscriptionStatus.ACTIVE && activeSub.endDate >= new Date(),
              daysRemaining,
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
    const { phone, password, businessName, businessEmail, primaryContact, secondaryContact, address, city, latitude, longitude, startDate, endDate } = req.body;

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
        email: businessEmail ? businessEmail.trim() : null,
        password: hashedPassword,
        role: UserRole.SP_SUPER_ADMIN,
        mustChangePassword: true,
        isActive: true,
        serviceProviderId: profile.id,
      },
    });

    // Create initial subscription if startDate and endDate are provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.subscription.create({
        data: {
          serviceProviderId: profile.id,
          startDate: start,
          endDate: end,
          status: end >= today ? SubscriptionStatus.ACTIVE : SubscriptionStatus.EXPIRED,
        },
      });
    }

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

// Update Service Provider Profile & Status
export const updateProvider = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      spId,
      isActive,
      businessName,
      businessEmail,
      primaryContact,
      secondaryContact,
      address,
      city,
      latitude,
      longitude,
      newPassword,
    } = req.body;

    if (!spId) {
      throw new AppError('spId is required', 400);
    }

    const updateData: any = {};

    if (isActive !== undefined) {
      updateData.isDisabled = !isActive;
      updateData.disabledAt = isActive ? null : new Date();
    }

    if (businessName !== undefined && businessName !== null) updateData.businessName = businessName.trim();
    if (businessEmail !== undefined && businessEmail !== null) updateData.businessEmail = businessEmail.trim();
    if (primaryContact !== undefined && primaryContact !== null) updateData.primaryContact = primaryContact.trim();
    if (secondaryContact !== undefined && secondaryContact !== null) updateData.secondaryContact = secondaryContact.trim();
    if (address !== undefined && address !== null) updateData.address = address.trim();
    if (city !== undefined && city !== null) updateData.city = city.trim();
    if (latitude !== undefined && latitude !== null && latitude !== '') updateData.latitude = parseFloat(latitude.toString());
    if (longitude !== undefined && longitude !== null && longitude !== '') updateData.longitude = parseFloat(longitude.toString());

    const updated = await prisma.serviceProviderProfile.update({
      where: { id: spId },
      data: updateData,
    });

    // Update password for user account(s) if newPassword is provided
    let passwordUpdated = false;
    if (newPassword && typeof newPassword === 'string' && newPassword.trim()) {
      if (newPassword.trim().length < 6) {
        throw new AppError('New password must be at least 6 characters', 400);
      }
      const hashedPassword = await bcrypt.hash(newPassword.trim(), 12);
      
      const spProfile = await prisma.serviceProviderProfile.findUnique({ where: { id: spId } });
      const phonesToMatch = [spProfile?.primaryContact, spProfile?.secondaryContact].filter(Boolean) as string[];
      const emailsToMatch = [spProfile?.businessEmail].filter(Boolean) as string[];

      await prisma.user.updateMany({
        where: {
          OR: [
            { serviceProviderId: spId },
            ...(phonesToMatch.length > 0 ? [{ phone: { in: phonesToMatch } }] : []),
            ...(emailsToMatch.length > 0 ? [{ email: { in: emailsToMatch } }] : []),
          ],
        },
        data: {
          password: hashedPassword,
          mustChangePassword: false,
        },
      });
      passwordUpdated = true;
    }

    // Sync User record phone & email if primaryContact or businessEmail provided
    if (primaryContact || businessEmail) {
      const userUpdate: any = {};
      if (primaryContact && primaryContact.trim()) userUpdate.phone = primaryContact.trim();
      if (businessEmail && businessEmail.trim()) userUpdate.email = businessEmail.trim();

      if (Object.keys(userUpdate).length > 0) {
        await prisma.user.updateMany({
          where: { serviceProviderId: spId },
          data: userUpdate,
        });
      }
    }

    // Sync updated address/city/contact/lat/lng to associated Service records if provided
    if (address || city || primaryContact || latitude || longitude) {
      await prisma.service.updateMany({
        where: { serviceProviderId: spId },
        data: {
          ...(address && { address: address.trim() }),
          ...(city && { city: city.trim() }),
          ...(primaryContact && { contactNumber: primaryContact.trim() }),
          ...(latitude && { latitude: parseFloat(latitude.toString()) }),
          ...(longitude && { longitude: parseFloat(longitude.toString()) }),
        },
      });
    }

    res.status(200).json({
      success: true,
      message: passwordUpdated
        ? 'Service Provider details and password updated successfully'
        : isActive !== undefined && Object.keys(updateData).length === 2
        ? `Provider successfully ${isActive ? 'activated' : 'deactivated'}`
        : 'Service Provider profile updated successfully',
      provider: {
        id: updated.id,
        name: updated.businessName,
        businessEmail: updated.businessEmail,
        primaryContact: updated.primaryContact,
        secondaryContact: updated.secondaryContact,
        address: updated.address,
        city: updated.city,
        latitude: updated.latitude,
        longitude: updated.longitude,
        isActive: !updated.isDisabled,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateProviderActive = updateProvider;

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
      email: c.user?.email || null,
      address: c.address || null,
      profilePicture: c.profilePicture || null,
      isProfileComplete: c.isProfileComplete,
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
