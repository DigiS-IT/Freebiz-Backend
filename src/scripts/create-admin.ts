import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createAdminUser() {
  const args = process.argv.slice(2);
  const phone = args[0] || process.env.ADMIN_PHONE || '9884633224';
  const email = args[1] || process.env.ADMIN_EMAIL || 'psk@gmail.com';
  const rawPassword = args[2] || process.env.ADMIN_PASSWORD || '12345678';
  const name = args[3] || process.env.ADMIN_NAME || 'FreeBie Super Admin';

  console.log('🚀 Creating / Updating Super Admin user in database...');
  console.log(`📱 Phone: ${phone}`);
  console.log(`📧 Email: ${email}`);
  console.log(`👤 Name: ${name}`);

  try {
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    const adminUser = await prisma.user.upsert({
      where: { phone },
      update: {
        email,
        password: hashedPassword,
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        mustChangePassword: false,
        superAdminProfile: {
          upsert: {
            create: { name },
            update: { name },
          },
        },
      },
      create: {
        phone,
        email,
        password: hashedPassword,
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        mustChangePassword: false,
        superAdminProfile: {
          create: { name },
        },
      },
      include: {
        superAdminProfile: true,
      },
    });

    console.log('✅ Super Admin User created / updated successfully!');
    console.log(`🆔 User ID: ${adminUser.id}`);
    console.log(`📱 Phone: ${adminUser.phone}`);
    console.log(`📧 Email: ${adminUser.email}`);
    console.log(`🔑 Role: ${adminUser.role}`);
    console.log('--------------------------------------------------');
    console.log('You can now log in using these credentials on the Web Admin Portal.');
  } catch (error) {
    console.error('❌ Failed to create admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();
