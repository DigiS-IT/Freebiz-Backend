require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query) => {
  return new Promise((resolve) => rl.question(query, resolve));
};

async function main() {
  console.log('\n👤 --- Create / Update Super Admin ---');
  const phone = await askQuestion('Enter Phone Number (e.g. 9876543210): ');
  if (!phone.trim()) {
    console.error('❌ Phone number is required.');
    process.exit(1);
  }

  const email = await askQuestion('Enter Email (e.g. admin@freebiz.com): ');
  const name = await askQuestion('Enter Name (e.g. FreeBiz Admin): ');
  const password = await askQuestion('Enter Password: ');
  if (!password.trim()) {
    console.error('❌ Password is required.');
    process.exit(1);
  }

  const trimmedPhone = phone.trim();
  const trimmedEmail = email.trim() || null;
  const adminName = name.trim() || 'FreeBiz Super Admin';
  const hashedPassword = await bcrypt.hash(password.trim(), 12);

  // Check if phone or email already belongs to a user
  const existingByPhone = await prisma.user.findUnique({ where: { phone: trimmedPhone } });
  const existingByEmail = trimmedEmail ? await prisma.user.findUnique({ where: { email: trimmedEmail } }) : null;

  if (existingByPhone && existingByEmail && existingByPhone.id !== existingByEmail.id) {
    console.error(
      `❌ Conflict: Phone '${trimmedPhone}' belongs to user ID (${existingByPhone.id}), ` +
      `but email '${trimmedEmail}' belongs to a different user ID (${existingByEmail.id}).`
    );
    console.error('Please resolve or delete the duplicate record first.');
    process.exit(1);
  }

  const targetUser = existingByPhone || existingByEmail;
  let user;

  if (targetUser) {
    console.log(`ℹ️  Existing user found (ID: ${targetUser.id}). Updating to Super Admin...`);
    user = await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        phone: trimmedPhone,
        email: trimmedEmail,
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isActive: true,
        mustChangePassword: false,
        superAdminProfile: {
          upsert: {
            create: { name: adminName },
            update: { name: adminName },
          },
        },
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        phone: trimmedPhone,
        email: trimmedEmail,
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isActive: true,
        mustChangePassword: false,
        superAdminProfile: {
          create: { name: adminName },
        },
      },
    });
  }

  console.log(`\n✅ Super Admin created/updated successfully!`);
  console.log(`- User ID: ${user.id}`);
  console.log(`- Phone:   ${user.phone}`);
  console.log(`- Email:   ${user.email || 'N/A'}`);
  console.log(`- Role:    ${user.role}`);
}

main()
  .catch((e) => {
    console.error('❌ Error creating Super Admin:', e);
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
