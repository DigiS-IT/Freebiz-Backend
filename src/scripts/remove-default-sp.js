require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function removeDefaultServiceProvider() {
  console.log('====================================================');
  console.log('  Removing Default / Sample Service Provider Admin  ');
  console.log('====================================================');

  try {
    const targetPhones = ['8888888888', '6666666666'];
    const targetEmails = ['sp@freebiz.com', 'employee@freebiz.com'];
    const targetBusinessNames = ['Super Service Provider'];

    const spUsers = await prisma.user.findMany({
      where: {
        OR: [
          { phone: { in: targetPhones } },
          { email: { in: targetEmails } },
        ],
      },
      select: {
        id: true,
        phone: true,
        email: true,
        role: true,
        serviceProviderId: true,
      },
    });

    const spProfileIds = new Set();
    for (const u of spUsers) {
      if (u.serviceProviderId) {
        spProfileIds.add(u.serviceProviderId);
      }
    }

    const namedProfiles = await prisma.serviceProviderProfile.findMany({
      where: {
        businessName: { in: targetBusinessNames },
      },
      select: { id: true },
    });

    for (const p of namedProfiles) {
      spProfileIds.add(p.id);
    }

    const profileIdList = Array.from(spProfileIds);

    if (profileIdList.length === 0 && spUsers.length === 0) {
      console.log('ℹ️ No default Service Provider admin or profile found in database.');
      return;
    }

    console.log(`Found ${spUsers.length} default SP user(s) and ${profileIdList.length} SP profile(s).`);

    if (profileIdList.length > 0) {
      const services = await prisma.service.findMany({
        where: { serviceProviderId: { in: profileIdList } },
        select: { id: true },
      });
      const serviceIds = services.map((s) => s.id);

      if (serviceIds.length > 0) {
        const bookings = await prisma.booking.findMany({
          where: { serviceId: { in: serviceIds } },
          select: { id: true },
        });
        const bookingIds = bookings.map((b) => b.id);

        if (bookingIds.length > 0) {
          await prisma.qRCode.deleteMany({ where: { bookingId: { in: bookingIds } } });
          await prisma.rating.deleteMany({ where: { bookingId: { in: bookingIds } } });
          await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
          console.log(`✓ Deleted ${bookingIds.length} booking(s) associated with default SP.`);
        }

        await prisma.service.updateMany({
          where: { parentId: { in: serviceIds } },
          data: { parentId: null },
        });

        await prisma.serviceSlot.deleteMany({ where: { serviceId: { in: serviceIds } } });
        await prisma.serviceMedia.deleteMany({ where: { serviceId: { in: serviceIds } } });
        await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
        console.log(`✓ Deleted ${serviceIds.length} service(s) associated with default SP.`);
      }

      await prisma.subscription.deleteMany({ where: { serviceProviderId: { in: profileIdList } } });
      await prisma.serviceProviderProfile.deleteMany({ where: { id: { in: profileIdList } } });
      console.log(`✓ Deleted ${profileIdList.length} default Service Provider profile(s).`);
    }

    const userIds = spUsers.map((u) => u.id);
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      console.log(`✓ Deleted default users: ${spUsers.map((u) => `${u.phone} (${u.role})`).join(', ')}`);
    }

    console.log('\n✅ Default Service Provider admin and records successfully removed!');
  } catch (error) {
    console.error('❌ Error removing default Service Provider:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

removeDefaultServiceProvider();
