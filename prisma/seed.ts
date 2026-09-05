/// <reference types="node" />
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create / Update Super Admin (jayasimmacse)
  const superAdminPassword = await bcrypt.hash('Admin@123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { phone: 'jayasimmacse' },
    update: {
      email: 'jayasimmacse@gmail.com',
      password: superAdminPassword,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      mustChangePassword: false,
      superAdminProfile: {
        upsert: {
          create: {
            name: 'Jayasimma Super Admin',
          },
          update: {
            name: 'Jayasimma Super Admin',
          },
        },
      },
    },
    create: {
      phone: 'jayasimmacse',
      email: 'jayasimmacse@gmail.com',
      password: superAdminPassword,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      mustChangePassword: false,
      superAdminProfile: {
        create: {
          name: 'Jayasimma Super Admin',
        },
      },
    },
  });
  console.log('✅ Super Admin created (jayasimmacse):', superAdmin.id);

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

