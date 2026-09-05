require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createSuperAdmin() {
  const args = process.argv.slice(2);

  // Defaults: jayasimmacse / Admin@123
  // Can be customized via CLI args: [username] [password] [email] [name]
  // or via ENV: ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_EMAIL, ADMIN_NAME
  const username = args[0] || process.env.ADMIN_USERNAME || process.env.ADMIN_PHONE || 'jayasimmacse';
  const rawPassword = args[1] || process.env.ADMIN_PASSWORD || 'Admin@123';
  const email = args[2] || process.env.ADMIN_EMAIL || 'jayasimmacse@gmail.com';
  const name = args[3] || process.env.ADMIN_NAME || 'Jayasimma Super Admin';

  console.log('====================================================');
  console.log('      FreeBie Super Admin Creation / Update Script   ');
  console.log('====================================================');
  console.log(`👤 Username / Login ID: ${username}`);
  console.log(`📧 Email:               ${email}`);
  console.log(`🏷️  Display Name:        ${name}`);
  console.log(`🔑 Password:            ${rawPassword ? '********' : 'Not set'}`);
  console.log('====================================================');

  try {
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    // Check if user already exists by phone/username or email
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: username },
          { email: email },
        ],
      },
      include: {
        superAdminProfile: true,
      },
    });

    let adminUser;
    if (existingUser) {
      console.log(`ℹ️  User already exists (ID: ${existingUser.id}). Updating to Super Admin...`);
      adminUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          phone: username,
          email: email,
          password: hashedPassword,
          role: 'SUPER_ADMIN',
          isActive: true,
          mustChangePassword: false,
          superAdminProfile: {
            upsert: {
              create: { name },
              update: { name },
            },
          },
        },
        include: {
          superAdminProfile: true,
        },
      });
    } else {
      console.log('ℹ️  Creating new Super Admin user...');
      adminUser = await prisma.user.create({
        data: {
          phone: username,
          email: email,
          password: hashedPassword,
          role: 'SUPER_ADMIN',
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
    }

    console.log('\n✅ Super Admin created / updated successfully!');
    console.log(`🆔 User ID:     ${adminUser.id}`);
    console.log(`👤 Login ID:    ${adminUser.phone}`);
    console.log(`📧 Email:       ${adminUser.email}`);
    console.log(`🛡️  Role:        ${adminUser.role}`);
    console.log('----------------------------------------------------');
    console.log('You can now log in to the Web Portal with:');
    console.log(` Role:      Super Admin`);
    console.log(` Username:  ${username} (or ${email})`);
    console.log(` Password:  ${rawPassword}`);
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('❌ Failed to create/update Super Admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createSuperAdmin();
