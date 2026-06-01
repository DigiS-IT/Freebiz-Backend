/// <reference types="node" />
import { PrismaClient, UserRole, ServiceType, ServiceMode, SubscriptionStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create Super Admin
  const superAdminPassword = await bcrypt.hash('123456', 12);
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
  const spPassword = await bcrypt.hash('123456', 12);
  const existingSpUser = await prisma.user.findUnique({
    where: { phone: '8888888888' },
  });

  if (!existingSpUser) {
    const spProfile = await prisma.serviceProviderProfile.create({
      data: {
        businessName: 'Super Service Provider',
        users: {
          create: {
            phone: '8888888888',
            email: 'sp@freebiz.com',
            password: spPassword,
            role: UserRole.SP_SUPER_ADMIN,
            mustChangePassword: true,
          },
        },
        services: {
          create: [
            {
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
              media: {
                create: [
                  { mediaType: 'PHOTO', mediaUrl: '/uploads/sample/spa1.jpg', order: 0 },
                ],
              },
            },
            {
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
            },
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
      include: {
        services: true,
      },
    });
    console.log('✅ Super SP created:', spProfile.id);
  } else {
    const existingUser = await prisma.user.findUnique({
      where: { phone: '8888888888' },
      select: { serviceProviderId: true }
    });
    if (existingUser?.serviceProviderId) {
      await prisma.serviceProviderProfile.update({
        where: { id: existingUser.serviceProviderId },
        data: { businessName: 'Super Service Provider' }
      });
    }
    await prisma.user.update({
      where: { phone: '8888888888' },
      data: {
        email: 'sp@freebiz.com',
        password: spPassword,
      },
    });
    console.log('ℹ️ Super SP user already exists, updated business name, email to sp@freebiz.com and password to 123456.');
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
