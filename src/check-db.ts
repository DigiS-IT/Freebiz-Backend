import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('Database Check:');
  console.log('Database URL:', process.env.DATABASE_URL);

  try {
    const usersCount = await prisma.user.count();
    console.log(`\n1. User count: ${usersCount}`);
    const users = await prisma.user.findMany({
      take: 5,
      select: { id: true, phone: true, role: true, email: true },
    });
    console.log('Sample Users:', JSON.stringify(users, null, 2));

    const spCount = await prisma.serviceProviderProfile.count();
    console.log(`\n2. ServiceProviderProfile count: ${spCount}`);
    const spProfiles = await prisma.serviceProviderProfile.findMany({
      take: 5,
      select: { id: true, businessName: true, isDisabled: true },
    });
    console.log('Sample SP Profiles:', JSON.stringify(spProfiles, null, 2));

    const serviceCount = await prisma.service.count();
    console.log(`\n3. Service count: ${serviceCount}`);
    const services = await prisma.service.findMany({
      take: 5,
      include: {
        media: true,
      },
    });
    console.log('Sample Services:', JSON.stringify(services, null, 2));

    const mediaCount = await prisma.serviceMedia.count();
    console.log(`\n4. ServiceMedia count: ${mediaCount}`);
    const media = await prisma.serviceMedia.findMany({
      take: 5,
    });
    console.log('Sample Media:', JSON.stringify(media, null, 2));

  } catch (error: any) {
    console.error('Error checking database:', error.message || error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
