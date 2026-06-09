import { PrismaClient, UserRole, SubscriptionStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

async function main() {
  console.log('\n🏢 --- Create / Update Service Provider & Admin ---');
  const phone = await askQuestion('Enter SP Admin Phone Number (e.g. 8888888888): ');
  if (!phone.trim()) {
    console.error('❌ Phone number is required.');
    process.exit(1);
  }

  const email = await askQuestion('Enter Email (e.g. sp@freebiz.com): ');
  const password = await askQuestion('Enter Password: ');
  if (!password.trim()) {
    console.error('❌ Password is required.');
    process.exit(1);
  }

  const businessName = await askQuestion('Enter Business Name (e.g. Super Service Provider): ');
  if (!businessName.trim()) {
    console.error('❌ Business Name is required.');
    process.exit(1);
  }

  const address = await askQuestion('Enter Business Address: ');
  const city = await askQuestion('Enter City: ');
  const latStr = await askQuestion('Enter Latitude (default 12.9716): ');
  const lngStr = await askQuestion('Enter Longitude (default 77.5946): ');

  const latitude = parseFloat(latStr.trim()) || 12.9716;
  const longitude = parseFloat(lngStr.trim()) || 77.5946;

  const hashedPassword = await bcrypt.hash(password.trim(), 12);

  // 1. Create or Update the Service Provider Profile
  let spProfile = await prisma.serviceProviderProfile.findFirst({
    where: { businessName: businessName.trim() }
  });

  if (!spProfile) {
    spProfile = await prisma.serviceProviderProfile.create({
      data: {
        businessName: businessName.trim(),
        businessEmail: email.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        latitude,
        longitude,
        isDisabled: false,
        subscriptions: {
          create: {
            startDate: new Date(),
            endDate: new Date(new Date().setMonth(new Date().getMonth() + 12)), // 12 months subscription
            status: SubscriptionStatus.ACTIVE,
          },
        },
      },
    });
    console.log(`✅ Created Service Provider Profile: "${spProfile.businessName}"`);
  } else {
    spProfile = await prisma.serviceProviderProfile.update({
      where: { id: spProfile.id },
      data: {
        businessEmail: email.trim() || spProfile.businessEmail,
        address: address.trim() || spProfile.address,
        city: city.trim() || spProfile.city,
        latitude,
        longitude,
      },
    });
    console.log(`ℹ️ Updated existing Service Provider Profile: "${spProfile.businessName}"`);
  }

  // 2. Create or Update the Admin User for this Service Provider
  const user = await prisma.user.upsert({
    where: { phone: phone.trim() },
    update: {
      email: email.trim() || null,
      password: hashedPassword,
      role: UserRole.SP_SUPER_ADMIN,
      serviceProviderId: spProfile.id,
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      phone: phone.trim(),
      email: email.trim() || null,
      password: hashedPassword,
      role: UserRole.SP_SUPER_ADMIN,
      serviceProviderId: spProfile.id,
      isActive: true,
      mustChangePassword: false,
    },
  });

  console.log(`\n✅ Service Provider Admin user created/updated successfully!`);
  console.log(`- User ID/Phone: ${user.phone}`);
  console.log(`- Email: ${user.email}`);
  console.log(`- Role: ${user.role}`);
  console.log(`- Linked SP: ${spProfile.businessName}`);
}

main()
  .catch((e) => {
    console.error('❌ Error creating Service Provider:', e);
  })
  .finally(() => {
    rl.close();
    prisma.$disconnect();
  });
