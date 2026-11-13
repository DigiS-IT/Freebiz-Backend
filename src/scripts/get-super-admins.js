require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function listSuperAdmins() {
  try {
    console.log('\n🔍 --- Fetching Super Admins ---');
    const admins = await prisma.user.findMany({
      where: {
        role: 'SUPER_ADMIN',
      },
      include: {
        superAdminProfile: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (admins.length === 0) {
      console.log('⚠️  No Super Admins found in the database.');
      return;
    }

    console.log(`\nFound ${admins.length} Super Admin(s):\n`);
    console.table(
      admins.map((admin) => ({
        ID: admin.id,
        Name: admin.superAdminProfile?.name || admin.name || 'N/A',
        Phone: admin.phone,
        Email: admin.email || 'N/A',
        Active: admin.isActive,
        CreatedAt: admin.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error('❌ Error fetching Super Admins:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listSuperAdmins();
