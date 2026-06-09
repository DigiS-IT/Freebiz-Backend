import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    console.log(`User: ${u.email || u.phone} (${u.role})`);
    const pwds = ['123456', 'SpAdmin123!', 'Admin123!', 'Employee123!'];
    for (const pwd of pwds) {
      if (u.password) {
        const isMatch = await bcrypt.compare(pwd, u.password);
        if (isMatch) {
          console.log(`  -> Password matches: "${pwd}"`);
        }
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
