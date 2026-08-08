import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Syncing Service Provider business emails to User email records...');

  const spProfiles = await prisma.serviceProviderProfile.findMany({
    where: {
      businessEmail: {
        not: null,
      },
    },
    include: {
      users: true,
    },
  });

  let updatedCount = 0;

  for (const profile of spProfiles) {
    if (!profile.businessEmail) continue;

    const email = profile.businessEmail.trim().toLowerCase();

    for (const user of profile.users) {
      if (!user.email || user.email.toLowerCase() !== email) {
        await prisma.user.update({
          where: { id: user.id },
          data: { email },
        });
        console.log(`✅ Updated User (${user.phone}) email -> ${email} (SP: ${profile.businessName})`);
        updatedCount++;
      }
    }
  }

  console.log(`\n🎉 Synchronization complete! Total users updated: ${updatedCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Error syncing emails:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
