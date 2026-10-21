const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('./src/generated/prisma');

async function audit() {
  const prisma = new PrismaClient();
  const schemaPath = 'prisma/schema.prisma';
  const migrationsDir = 'prisma/migrations';
  
  const prismaSchema = fs.readFileSync(schemaPath, 'utf8');
  
  const models = [...prismaSchema.matchAll(/model\s+(\w+)\s+\{/g)].map(m => m[1]);
  const enums = [...prismaSchema.matchAll(/enum\s+(\w+)\s+\{/g)].map(m => m[1]);
  
  const migrations = fs.readdirSync(migrationsDir).filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory()).sort();
  
  let modelCreationMap = {};
  let enumCreationMap = {};
  
  for (const mig of migrations) {
    const sqlPath = path.join(migrationsDir, mig, 'migration.sql');
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf8');
      const tableMatches = [...sql.matchAll(/CREATE TABLE\s+"?(\w+)"?/gi)].map(m => m[1]);
      for (const t of tableMatches) {
        if (!modelCreationMap[t]) modelCreationMap[t] = mig;
      }
      const enumMatches = [...sql.matchAll(/CREATE TYPE\s+"?(\w+)"?\s+AS ENUM/gi)].map(m => m[1]);
      for (const e of enumMatches) {
        if (!enumCreationMap[e]) enumCreationMap[e] = mig;
      }
    }
  }
  
  const criticalModels = [
    'Patient', 'Prescription', 'Product', 'ProductBatch', 'Stock', 
    'StockMovement', 'StockIssueRequest', 'MedicationLog', 'ServiceContract', 
    'Admission', 'User', 'Tenant', 'Unit'
  ];
  
  const pgTables = await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  const physicalExistence = {};
  for (const t of pgTables) {
    physicalExistence[t.table_name] = true;
  }
  
  let appliedMigrations = [];
  try {
    appliedMigrations = await prisma.$queryRawUnsafe("SELECT migration_name, applied_steps_count, rolled_back_at, finished_at, checksum FROM _prisma_migrations ORDER BY started_at ASC");
  } catch(e) {}
  
  let rowCounts = {};
  for (const m of criticalModels) {
    if (physicalExistence[m]) {
      try {
        const res = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${m}"`);
        rowCounts[m] = Number(res[0].count);
      } catch(e) {
        rowCounts[m] = 'Error';
      }
    } else {
      rowCounts[m] = 'Table not found';
    }
  }
  
  console.log('--- MODELS WITHOUT MIGRATION ---');
  const missingModels = models.filter(m => !modelCreationMap[m]);
  console.log('Count:', missingModels.length);
  //console.log(missingModels);
  
  console.log('\n--- ENUMS WITHOUT MIGRATION ---');
  const missingEnums = enums.filter(e => !enumCreationMap[e]);
  console.log('Count:', missingEnums.length);
  //console.log(missingEnums);
  
  console.log('\n--- CRITICAL MODELS ---');
  for (const m of criticalModels) {
    console.log(`Model: ${m}`);
    console.log(`  Schema: ${models.includes(m)}`);
    console.log(`  Migrated: ${modelCreationMap[m] || 'NO'}`);
    console.log(`  Physical: ${!!physicalExistence[m]}`);
  }
  
  console.log('\n--- APPLIED MIGRATIONS ---');
  for (const m of appliedMigrations) {
    console.log(`${m.migration_name} | applied:${m.applied_steps_count} | rolled_back:${m.rolled_back_at} | finished:${m.finished_at}`);
  }
  
  console.log('\n--- ROW COUNTS ---');
  console.log(rowCounts);
  
  await prisma.$disconnect();
}
audit().catch(console.error);
