import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPostgis() {
  console.log('🔍 Checking PostgreSQL and PostGIS status...\n');

  try {
    // 1. Check PostgreSQL connection & version
    const versionResult = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version();`;
    console.log('✅ PostgreSQL Connected:');
    console.log(`   ${versionResult[0]?.version}\n`);

    // 2. Check if PostGIS extension is installed & enabled in the active DB
    const installedExt = await prisma.$queryRaw<Array<{ extname: string; extversion: string }>>`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname = 'postgis';
    `;

    if (installedExt.length > 0) {
      console.log('🎉 PostGIS is INSTALLED and ACTIVE!');
      console.log(`   Extension version: ${installedExt[0].extversion}`);

      try {
        const fullVersion = await prisma.$queryRaw<Array<{ postgis_full_version: string }>>`
          SELECT postgis_full_version();
        `;
        console.log(`   Details: ${fullVersion[0]?.postgis_full_version}\n`);
      } catch {
        // Ignore if full version fails
      }
      return;
    }

    console.log('⚠️  PostGIS extension is NOT currently enabled in this database.\n');

    // 3. Check if PostGIS binaries are available to be enabled
    try {
      const availableExt = await prisma.$queryRaw<Array<{ name: string; default_version: string }>>`
        SELECT name, default_version 
        FROM pg_available_extensions 
        WHERE name = 'postgis';
      `;

      if (availableExt.length > 0) {
        console.log('💡 PostGIS binaries ARE available on your PostgreSQL server!');
        console.log(`   Default available version: ${availableExt[0].default_version}`);
        console.log('   You can enable it by running in psql or pgAdmin:');
        console.log('   👉  CREATE EXTENSION postgis;\n');
      } else {
        console.log('❌ PostGIS binaries are NOT installed on your PostgreSQL server.');
        console.log('   To install PostGIS:');
        console.log('   - Windows: Run "Application Stack Builder" -> select PostgreSQL 18 -> Spatial Extensions -> PostGIS.');
        console.log('   - Note: The FreeBiz backend automatically falls back to pure SQL Haversine calculations if PostGIS is not installed.\n');
      }
    } catch (e: any) {
      console.log('   Could not inspect pg_available_extensions:', e.message);
    }
  } catch (error: any) {
    console.error('❌ Connection failed:', error.message);
    console.log('   Check your DATABASE_URL in .env to ensure credentials and host are correct.');
  } finally {
    await prisma.$disconnect();
  }
}

checkPostgis();
