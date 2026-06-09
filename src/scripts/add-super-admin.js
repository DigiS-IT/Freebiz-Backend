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

  const hashedPassword = await bcrypt.hash(password.trim(), 12);

  const user = await prisma.user.upsert({
    where: { phone: phone.trim() },
    update: {
      email: email.trim() || null,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      phone: phone.trim(),
      email: email.trim() || null,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      isActive: true,
      mustChangePassword: false,
      superAdminProfile: {
        create: {
          name: name.trim() || 'FreeBiz Super Admin',
        },
      },
    },
  });

  console.log(`\n✅ Super Admin created/updated successfully!`);
  console.log(`- User ID/Phone: ${user.phone}`);
  console.log(`- Email: ${user.email}`);
  console.log(`- Role: ${user.role}`);
}

main()
  .catch((e) => {
    console.error('❌ Error creating Super Admin:', e);
  })
  .finally(() => {
    rl.close();
    prisma.$disconnect();
  });
