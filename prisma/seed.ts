/// <reference types="node" />
import { PrismaClient, UserRole, ServiceType, ServiceMode, SubscriptionStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create Super Admin
  const superAdminPassword = await bcrypt.hash('Admin123!', 12);
  const superAdmin = await prisma.user.upsert({
    where: { phone: '9876543210' },
    update: {
      password: superAdminPassword,
      mustChangePassword: false,
      email: 'admin@freebiz.com',
    },
    create: {
      phone: '9876543210',
      email: 'admin@freebiz.com',
      password: superAdminPassword,
      role: UserRole.SUPER_ADMIN,
      mustChangePassword: false,
      superAdminProfile: {
        create: {
          name: 'FreeBiz Super Admin',
        },
      },
    },
  });
  console.log('✅ Super Admin created:', superAdmin.id);

  // Create a sample SP
  const spPassword = await bcrypt.hash('SpAdmin123!', 12);
  const employeePassword = await bcrypt.hash('Employee123!', 12);
  const existingSpUser = await prisma.user.findUnique({
    where: { phone: '8888888888' },
  });

  if (!existingSpUser) {
    const spProfile = await prisma.serviceProviderProfile.create({
      data: {
        businessName: 'Super Service Provider',
        users: {
          create: [
            {
              phone: '8888888888',
              email: 'sp@freebiz.com',
              password: spPassword,
              role: UserRole.SP_SUPER_ADMIN,
              mustChangePassword: false,
            },
            {
              phone: '6666666666',
              email: 'employee@freebiz.com',
              password: employeePassword,
              role: UserRole.MOBILE_SP,
              mustChangePassword: false,
            }
          ],
        },
        subscriptions: {
          create: {
            startDate: new Date(),
            endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
            status: SubscriptionStatus.ACTIVE,
          },
        },
      },
    });

    const discountedService = await prisma.service.create({
      data: {
        serviceProviderId: spProfile.id,
        serviceType: ServiceType.DISCOUNTED,
        serviceDetail: 'Full body massage at 70% discount. Original price ₹2000, now just ₹600!',
        contactNumber: '8888888888',
        address: '123 MG Road, Koramangala',
        city: 'Bangalore',
        latitude: 12.9352,
        longitude: 77.6245,
        actualPrice: 2000,
        discountedPrice: 600,
        discountPercentage: 70,
        specialInstructions: 'Please carry a towel. Shower facility available.',
        termsAndConditions: 'Valid for new customers only. Advance booking required.',
        serviceMode: ServiceMode.IN_PERSON,
        media: {
          create: [
            { mediaType: 'PHOTO', mediaUrl: '/uploads/sample/massage1.jpg', order: 0 },
          ],
        },
        slots: {
          create: [
            {
              startDate: new Date(),
              endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
              dailyCount: 10,
              totalCount: 3650,
              isActive: true,
            }
          ]
        }
      },
    });

    const freeService = await prisma.service.create({
      data: {
        serviceProviderId: spProfile.id,
        serviceType: ServiceType.FREE,
        serviceDetail: 'Complimentary head massage for first-time customers. Experience our premium service at no cost!',
        contactNumber: '8888888888',
        address: '123 MG Road, Koramangala',
        city: 'Bangalore',
        latitude: 12.9352,
        longitude: 77.6245,
        specialInstructions: 'Please arrive 10 minutes early. Carry valid ID.',
        termsAndConditions: 'One free service per customer. Cannot be combined with other offers.',
        serviceMode: ServiceMode.IN_PERSON,
        parentId: discountedService.id,
        media: {
          create: [
            { mediaType: 'PHOTO', mediaUrl: '/uploads/sample/spa1.jpg', order: 0 },
          ],
        },
        slots: {
          create: [
            {
              startDate: new Date(),
              endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
              dailyCount: 10,
              totalCount: 3650,
              isActive: true,
            }
          ]
        }
      },
    });
    console.log('✅ Super SP created with linked Discounted & Free services and slots');
  } else {
    const existingUser = await prisma.user.findUnique({
      where: { phone: '8888888888' },
      select: { serviceProviderId: true }
    });
    if (existingUser?.serviceProviderId) {
      const spId = existingUser.serviceProviderId;
      await prisma.serviceProviderProfile.update({
        where: { id: spId },
        data: { businessName: 'Super Service Provider' }
      });

      // Find the discounted service and free service for this SP, and link them!
      const discountSvc = await prisma.service.findFirst({
        where: { serviceProviderId: spId, serviceType: ServiceType.DISCOUNTED }
      });
      const freeSvc = await prisma.service.findFirst({
        where: { serviceProviderId: spId, serviceType: ServiceType.FREE }
      });

      if (discountSvc && freeSvc) {
        await prisma.service.update({
          where: { id: freeSvc.id },
          data: { parentId: discountSvc.id }
        });
        console.log('🔗 Linked existing Free service to Discounted service in database.');
      }
    }
    if (existingUser?.serviceProviderId) {
      const spId = existingUser.serviceProviderId;
      await prisma.user.update({
        where: { phone: '8888888888' },
        data: {
          email: 'sp@freebiz.com',
          password: spPassword,
          role: UserRole.SP_SUPER_ADMIN,
          mustChangePassword: false,
        },
      });

      await prisma.user.upsert({
        where: { phone: '6666666666' },
        update: {
          email: 'employee@freebiz.com',
          password: employeePassword,
          role: UserRole.MOBILE_SP,
          serviceProviderId: spId,
          mustChangePassword: false,
        },
        create: {
          phone: '6666666666',
          email: 'employee@freebiz.com',
          password: employeePassword,
          role: UserRole.MOBILE_SP,
          serviceProviderId: spId,
          mustChangePassword: false,
        }
      });
    }
    console.log('ℹ️ Super SP and Employee users updated/created.');

    // Ensure all services have active slots
    const services = await prisma.service.findMany();
    for (const service of services) {
      const slotCount = await prisma.serviceSlot.count({
        where: { serviceId: service.id }
      });
      if (slotCount === 0) {
        await prisma.serviceSlot.create({
          data: {
            serviceId: service.id,
            startDate: new Date(),
            endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
            dailyCount: 10,
            totalCount: 3650,
            isActive: true,
          }
        });
        console.log(`✅ Created slots for service: ${service.id}`);
      }
    }
  }

  console.log('🌱 Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
