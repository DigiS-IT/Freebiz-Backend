require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const readline = require('readline');

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query) => {
  return new Promise((resolve) => rl.question(query, resolve));
};

async function deleteSuperAdmin() {
  try {
    console.log('\n🗑️  --- Delete Super Admin ---');

    let identifier = process.argv[2];
    if (!identifier) {
      identifier = await askQuestion('Enter Email, Phone number, or User ID to delete: ');
    }

    identifier = identifier ? identifier.trim() : '';

    if (!identifier) {
      console.error('❌ An Email, Phone, or ID is required.');
      process.exit(1);
    }

    // Find the user first
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier },
          { id: identifier },
        ],
      },
      include: {
        superAdminProfile: true,
      },
    });

    if (!user) {
      console.log(`❌ No user found matching '${identifier}'.`);
      return;
    }

    console.log('\nFound user:');
    console.log(`  - ID:    ${user.id}`);
    console.log(`  - Role:  ${user.role}`);
    console.log(`  - Name:  ${user.superAdminProfile?.name || user.name || 'N/A'}`);
    console.log(`  - Phone: ${user.phone}`);
    console.log(`  - Email: ${user.email || 'N/A'}`);

    const confirm = await askQuestion('\n⚠️ Are you sure you want to permanently delete this user? (yes/no): ');
    if (confirm.trim().toLowerCase() !== 'yes') {
      console.log('Action cancelled.');
      return;
    }

    // Delete user (cascade will delete superAdminProfile automatically)
    await prisma.user.delete({
      where: { id: user.id },
    });

    console.log(`\n✅ Super Admin (${user.phone} / ${user.email}) successfully deleted!`);
  } catch (error) {
    console.error('❌ Error deleting Super Admin:', error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

deleteSuperAdmin();
