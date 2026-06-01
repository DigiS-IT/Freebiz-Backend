import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Feeding Users into Postgres Database...');
  
  // 1. Get or Create the Service Provider Profile
  let spProfile = await prisma.serviceProviderProfile.findFirst({
    where: { businessName: 'Super Service Provider' }
  });

  if (!spProfile) {
    spProfile = await prisma.serviceProviderProfile.create({
      data: {
        businessName: 'Super Service Provider',
      }
    });
    console.log(`✅ Created Service Provider Profile: "${spProfile.businessName}" (ID: ${spProfile.id})`);
  } else {
    console.log(`ℹ️ Found existing Service Provider Profile: "${spProfile.businessName}" (ID: ${spProfile.id})`);
  }

  const hashedPassword = async (pwd: string) => {
    return await bcrypt.hash(pwd, 12);
  };

  // Define the credentials
  const adminPhone = '9876543210';
  const adminEmail = 'admin@freebiz.com';
  const adminPasswordText = 'Admin123!';

  const spAdminPhone = '8888888888';
  const spAdminEmail = 'sp@freebiz.com';
  const spAdminPasswordText = 'SpAdmin123!';

  const spEmpPhone = '6666666666';
  const spEmpEmail = 'employee@freebiz.com';
  const spEmpPasswordText = 'Employee123!';

  // Hash passwords
  const adminPasswordHash = await hashedPassword(adminPasswordText);
  const spAdminPasswordHash = await hashedPassword(spAdminPasswordText);
  const spEmpPasswordHash = await hashedPassword(spEmpPasswordText);

  // 2. Insert Super Admin User
  const superAdmin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {
      email: adminEmail,
      password: adminPasswordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      phone: adminPhone,
      email: adminEmail,
      password: adminPasswordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      mustChangePassword: false,
      superAdminProfile: {
        create: {
          name: 'FreeBiz Super Admin',
        }
      }
    }
  });
  console.log(`\n👑 1. SUPER_ADMIN User Inserted:`);
  console.log(`   - Phone: ${superAdmin.phone}`);
  console.log(`   - Email: ${superAdmin.email}`);
  console.log(`   - Password: ${adminPasswordText} (Hashed in DB)`);

  // 3. Insert Service Provider Admin User
  const spAdmin = await prisma.user.upsert({
    where: { phone: spAdminPhone },
    update: {
      email: spAdminEmail,
      password: spAdminPasswordHash,
      role: UserRole.SP_SUPER_ADMIN,
      serviceProviderId: spProfile.id,
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      phone: spAdminPhone,
      email: spAdminEmail,
      password: spAdminPasswordHash,
      role: UserRole.SP_SUPER_ADMIN,
      serviceProviderId: spProfile.id,
      isActive: true,
      mustChangePassword: false,
    }
  });
  console.log(`\n🏢 2. SP_SUPER_ADMIN (Service Provider Admin) User Inserted:`);
  console.log(`   - Phone: ${spAdmin.phone}`);
  console.log(`   - Email: ${spAdmin.email}`);
  console.log(`   - Password: ${spAdminPasswordText} (Hashed in DB)`);
  console.log(`   - Linked SP: ${spProfile.businessName}`);

  // 4. Insert Service Provider Employee User
  const spEmployee = await prisma.user.upsert({
    where: { phone: spEmpPhone },
    update: {
      email: spEmpEmail,
      password: spEmpPasswordHash,
      role: UserRole.MOBILE_SP,
      serviceProviderId: spProfile.id,
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      phone: spEmpPhone,
      email: spEmpEmail,
      password: spEmpPasswordHash,
      role: UserRole.MOBILE_SP,
      serviceProviderId: spProfile.id,
      isActive: true,
      mustChangePassword: false,
    }
  });
  console.log(`\n👷 3. MOBILE_SP (Service Provider Employee) User Inserted:`);
  console.log(`   - Phone: ${spEmployee.phone}`);
  console.log(`   - Email: ${spEmployee.email}`);
  console.log(`   - Password: ${spEmpPasswordText} (Hashed in DB)`);
  console.log(`   - Linked SP: ${spProfile.businessName}`);

  console.log('\n🎉 All users have been successfully inserted/updated in the Postgres database!');
}

main()
  .catch((e) => {
    console.error('❌ Error feeding users:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
