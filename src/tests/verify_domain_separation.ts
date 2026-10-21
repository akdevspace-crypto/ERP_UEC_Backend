import express from 'express';
import { prisma } from '../app/prisma.js';
import inventoryRoutes from '../modules/inventory/routes.js';
import { 
  medicalCategories, 
  foodRationCategories, 
  isCategoryInScope, 
  isAmbiguousCategory, 
  getCategoryDomain 
} from '../modules/inventory/inventoryScope.js';
import axios from 'axios';

const TENANT_ID = 'e083527d-cf59-4291-8c00-6adfba220c8e';

// Setup Express test harness with inventory routes
const app = express();
app.use(express.json());

let currentUser: any = {
  id: 'test-inv-mgr-id',
  email: 'uncf.inventory@unisenth.local',
  role: { id: 'role-mgr', name: 'Inventory Manager' },
  roleName: 'Inventory Manager',
  tenantId: TENANT_ID,
  unitId: null, // Facility-wide read capability when scope=all
  unitAccess: ['*'],
  permissions: [
    'Inventory Dashboard', 'Products', 'Inventory Products', 'Stock', 'Purchase Orders', 
    'Stock Issue Approval', 'Stock Issues', 'Physical Count', 'Inventory Reports'
  ]
};

app.use((req: any, res, next) => {
  req.user = currentUser;
  req.tenantId = currentUser?.tenantId;
  req.context = { unitId: req.headers['x-unit-id'] || currentUser?.unitId || null };
  next();
});

app.use('/api/v1', inventoryRoutes);

async function runVerification() {
  console.log('========================================================================');
  console.log('🧪 INVENTORY DOMAIN SEPARATION — AUTOMATED VERIFICATION SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string = '') {
    if (condition) {
      console.log(`  ✓ PASS: ${testName} ${detail ? `(${detail})` : ''}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // ----------------------------------------------------------------------
  // STEP 1: Pure Unit Classification Checks
  // ----------------------------------------------------------------------
  console.log('--- Step 1: Unit Classification & Boundary Logic ---');
  
  assert(isCategoryInScope('medicine', 'medical'), 'Medical category "medicine" allowed in medical');
  assert(isCategoryInScope('clinical', 'medical'), 'Medical category "clinical" allowed in medical');
  assert(isCategoryInScope('clinical-consumables', 'medical'), 'Medical category "clinical-consumables" allowed in medical');
  assert(!isCategoryInScope('ration', 'medical'), 'Food category "ration" rejected in medical');
  assert(!isCategoryInScope('stationary', 'medical'), 'Ambiguous category "stationary" rejected in medical');

  assert(isCategoryInScope('ration', 'food'), 'Food category "ration" allowed in food');
  assert(isCategoryInScope('fresh food', 'food'), 'Food category "fresh food" allowed in food');
  assert(isCategoryInScope('food & ration', 'food'), 'Food category "food & ration" allowed in food');
  assert(!isCategoryInScope('medicine', 'food'), 'Medical category "medicine" rejected in food');
  assert(!isCategoryInScope('stationary', 'food'), 'Ambiguous category "stationary" rejected in food');

  assert(isAmbiguousCategory('stationary'), 'Category "stationary" marked ambiguous');
  assert(isAmbiguousCategory('electrical'), 'Category "electrical" marked ambiguous');
  assert(isAmbiguousCategory('plumbing'), 'Category "plumbing" marked ambiguous');
  assert(isAmbiguousCategory('general'), 'Category "general" marked ambiguous');
  assert(isAmbiguousCategory('assets'), 'Category "assets" marked ambiguous');
  assert(!isAmbiguousCategory('medicine'), 'Category "medicine" not marked ambiguous');
  assert(!isAmbiguousCategory('ration'), 'Category "ration" not marked ambiguous');

  assert(getCategoryDomain('medicine') === 'medical', 'getCategoryDomain("medicine") returns "medical"');
  assert(getCategoryDomain('ration') === 'food', 'getCategoryDomain("ration") returns "food"');
  assert(getCategoryDomain('electrical') === 'ambiguous', 'getCategoryDomain("electrical") returns "ambiguous"');

  // ----------------------------------------------------------------------
  // STEP 2: Database Category Audit
  // ----------------------------------------------------------------------
  console.log('\n--- Step 2: Database Product Distribution Audit ---');
  const allProducts = await prisma.product.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true, category: true, unitId: true }
  });

  const medicalProducts = allProducts.filter(p => isCategoryInScope(p.category, 'medical'));
  const foodProducts = allProducts.filter(p => isCategoryInScope(p.category, 'food'));
  const ambiguousProducts = allProducts.filter(p => isAmbiguousCategory(p.category));

  console.log(`  Total Active Products in Tenant: ${allProducts.length}`);
  console.log(`  - Verified Medical: ${medicalProducts.length}`);
  console.log(`  - Verified Food & Ration: ${foodProducts.length}`);
  console.log(`  - Ambiguous / General Facility: ${ambiguousProducts.length}`);
  console.log('  - Sample IDs:', allProducts.slice(0, 3).map(p => ({ id: p.id, name: p.name, category: p.category })));

  const ambiguousCats = Array.from(new Set(ambiguousProducts.map(p => p.category)));
  console.log(`  - Ambiguous Category Names: ${JSON.stringify(ambiguousCats)}`);

  // Inspect available inventory tables
  const dbTables: any[] = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables WHERE table_schema='public'
  `;
  const tableNames = new Set(dbTables.map(t => String(t.table_name).toLowerCase()));
  console.log(`  - Database Table Count: ${dbTables.length} tables`);
  console.log(`  - Has PurchaseOrder: ${tableNames.has('purchaseorder')}`);
  console.log(`  - Has Purchase: ${tableNames.has('purchase')}`);
  console.log(`  - Has PhysicalAudit: ${tableNames.has('physicalaudit')}`);

  assert(medicalProducts.length > 0, 'Found medical products in DB', `${medicalProducts.length} items`);
  assert(foodProducts.length > 0, 'Found food/ration products in DB', `${foodProducts.length} items`);
  assert(medicalProducts.length + foodProducts.length + ambiguousProducts.length === allProducts.length,
    'All products categorized with 0 unhandled categories'
  );

  // ----------------------------------------------------------------------
  // STEP 3: API Endpoint Domain Isolation (Reads via Test Server)
  // ----------------------------------------------------------------------
  console.log('\n--- Step 3: API Endpoint Domain Scoping (Reads) ---');

  // Find authorized user in tenant
  const user = await prisma.user.findFirst({
    where: { 
      tenantId: TENANT_ID, 
      isDeleted: false,
      OR: [
        { role: { name: { contains: 'Admin', mode: 'insensitive' } } },
        { role: { name: { contains: 'Inventory', mode: 'insensitive' } } }
      ]
    },
    include: { role: true }
  }) || await prisma.user.findFirst({
    where: { tenantId: TENANT_ID, isDeleted: false },
    include: { role: true }
  });

  if (!user) {
    throw new Error('No active user found in tenant');
  }

  console.log(`  Using test user: ${user.email} (Role: ${user.role?.name || user.roleId})`);

  const jwtModule = await import('jsonwebtoken');
  const jwt = jwtModule.default || jwtModule;
  const token = jwt.sign(
    { id: user.id, tenantId: user.tenantId, roleId: user.roleId },
    process.env.JWT_SECRET || 'supersecretjwtkeyforerpsystem',
    { expiresIn: '1h' }
  );

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const client = axios.create({ 
    baseURL: `http://127.0.0.1:${port}/api/v1`,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  try {
    // 3a. GET /api/v1/product with x-inventory-domain: medical
    const resMedProd = await client.get('/product?scope=all', {
      headers: { 'x-inventory-domain': 'medical' }
    });

    assert(resMedProd.status === 200, 'GET /api/v1/product (medical) returns HTTP 200');
    const medItems: any[] = resMedProd.data.data || [];
    const nonMedInMed = medItems.filter(p => !isCategoryInScope(p.category, 'medical'));
    assert(medItems.length > 0, `Medical products retrieved (${medItems.length} products)`);
    assert(nonMedInMed.length === 0, 'Zero non-medical products returned under medical view', 
      nonMedInMed.length > 0 ? `Found: ${JSON.stringify(nonMedInMed.map(x => x.category))}` : '100% verified medical');

    // 3b. GET /api/v1/product with x-inventory-domain: food
    const resFoodProd = await client.get('/product?scope=all', {
      headers: { 'x-inventory-domain': 'food' }
    });

    assert(resFoodProd.status === 200, 'GET /api/v1/product (food) returns HTTP 200');
    const foodItems: any[] = resFoodProd.data.data || [];
    const nonFoodInFood = foodItems.filter(p => !isCategoryInScope(p.category, 'food'));
    assert(foodItems.length > 0, `Food products retrieved (${foodItems.length} products)`);
    assert(nonFoodInFood.length === 0, 'Zero non-food products returned under food view',
      nonFoodInFood.length > 0 ? `Found: ${JSON.stringify(nonFoodInFood.map(x => x.category))}` : '100% verified food');

    // 3c. GET /api/v1/product with query param ?domain=medical
    const resParamMed = await client.get('/product?scope=all&domain=medical');
    assert(resParamMed.status === 200, 'GET /api/v1/product?domain=medical returns HTTP 200');
    assert(resParamMed.data.data?.length === medItems.length, 'Query param ?domain=medical matches header filter count');

    // 3d. GET /api/v1/product with query param ?domain=food
    const resParamFood = await client.get('/product?scope=all&domain=food');
    assert(resParamFood.status === 200, 'GET /api/v1/product?domain=food returns HTTP 200');
    assert(resParamFood.data.data?.length === foodItems.length, 'Query param ?domain=food matches header filter count');

    // 3e. GET /api/v1/stock with medical vs food domain
    const resMedStock = await client.get('/stock?scope=all', {
      headers: { 'x-inventory-domain': 'medical' }
    });
    assert(resMedStock.status === 200, 'GET /api/v1/stock (medical) returns HTTP 200');
    const medStockItems: any[] = resMedStock.data.data || [];
    const nonMedStock = medStockItems.filter(s => !isCategoryInScope(s.product?.category || s.category, 'medical'));
    assert(nonMedStock.length === 0, 'Stock entries in medical view are 100% medical', `Count: ${medStockItems.length}`);

    const resFoodStock = await client.get('/stock?scope=all', {
      headers: { 'x-inventory-domain': 'food' }
    });
    assert(resFoodStock.status === 200, 'GET /api/v1/stock (food) returns HTTP 200');
    const foodStockItems: any[] = resFoodStock.data.data || [];
    const nonFoodStock = foodStockItems.filter(s => !isCategoryInScope(s.product?.category || s.category, 'food'));
    assert(nonFoodStock.length === 0, 'Stock entries in food view are 100% food', `Count: ${foodStockItems.length}`);

    // 3f. GET /api/v1/stock/valuation with medical vs food domain
    const resMedVal = await client.get('/stock/valuation?scope=all', {
      headers: { 'x-inventory-domain': 'medical' }
    });
    assert(resMedVal.status === 200, 'GET /api/v1/stock/valuation (medical) returns HTTP 200');
    const medValItems: any[] = resMedVal.data.data?.items || [];
    const nonMedVal = medValItems.filter(v => !isCategoryInScope(v.category, 'medical'));
    assert(nonMedVal.length === 0, 'Valuation items in medical view are 100% medical', `Count: ${medValItems.length}`);

    const resFoodVal = await client.get('/stock/valuation?scope=all', {
      headers: { 'x-inventory-domain': 'food' }
    });
    assert(resFoodVal.status === 200, 'GET /api/v1/stock/valuation (food) returns HTTP 200');
    const foodValItems: any[] = resFoodVal.data.data?.items || [];
    const nonFoodVal = foodValItems.filter(v => !isCategoryInScope(v.category, 'food'));
    assert(nonFoodVal.length === 0, 'Valuation items in food view are 100% food', `Count: ${foodValItems.length}`);

    // 3g. GET /api/v1/purchase with medical vs food domain
    const resMedPurchases = await client.get('/purchase?scope=all', {
      headers: { 'x-inventory-domain': 'medical' }
    });
    assert(resMedPurchases.status === 200, 'GET /api/v1/purchase (medical) returns HTTP 200');
    const medPurchases: any[] = resMedPurchases.data.data || [];
    const nonMedPurchases = medPurchases.filter(p => !isCategoryInScope(p.product?.category || p.category, 'medical'));
    assert(nonMedPurchases.length === 0, 'Purchases in medical view are 100% medical', `Count: ${medPurchases.length}`);

    const resFoodPurchases = await client.get('/purchase?scope=all', {
      headers: { 'x-inventory-domain': 'food' }
    });
    assert(resFoodPurchases.status === 200, 'GET /api/v1/purchase (food) returns HTTP 200');
    const foodPurchases: any[] = resFoodPurchases.data.data || [];
    const nonFoodPurchases = foodPurchases.filter(p => !isCategoryInScope(p.product?.category || p.category, 'food'));
    assert(nonFoodPurchases.length === 0, 'Purchases in food view are 100% food', `Count: ${foodPurchases.length}`);

    // 3h. GET /api/v1/stock/batches with medical vs food domain
    const resMedBatches = await client.get('/stock/batches?scope=all', {
      headers: { 'x-inventory-domain': 'medical' }
    });
    assert(resMedBatches.status === 200, 'GET /api/v1/stock/batches (medical) returns HTTP 200');
    const medBatches: any[] = resMedBatches.data.data || [];
    const nonMedBatches = medBatches.filter(b => !isCategoryInScope(b.product?.category, 'medical'));
    assert(nonMedBatches.length === 0, 'Batches in medical view are 100% medical', `Count: ${medBatches.length}`);

    const resFoodBatches = await client.get('/stock/batches?scope=all', {
      headers: { 'x-inventory-domain': 'food' }
    });
    assert(resFoodBatches.status === 200, 'GET /api/v1/stock/batches (food) returns HTTP 200');
    const foodBatches: any[] = resFoodBatches.data.data || [];
    const nonFoodBatches = foodBatches.filter(b => !isCategoryInScope(b.product?.category, 'food'));
    assert(nonFoodBatches.length === 0, 'Batches in food view are 100% food', `Count: ${foodBatches.length}`);

    // Conditional check for multi-item PurchaseOrder table if present in DB
    if (tableNames.has('purchaseorder')) {
      const resMedPO = await client.get('/purchase-orders?scope=all', {
        headers: { 'x-inventory-domain': 'medical' }
      });
      assert(resMedPO.status === 200, 'GET /api/v1/purchase-orders (medical) returns HTTP 200');

      const resFoodPO = await client.get('/purchase-orders?scope=all', {
        headers: { 'x-inventory-domain': 'food' }
      });
      assert(resFoodPO.status === 200, 'GET /api/v1/purchase-orders (food) returns HTTP 200');
    }

    // Conditional check for physical audit table if present in DB
    if (tableNames.has('physicalaudit')) {
      const resMedAudit = await client.get('/physical-audit?scope=all', {
        headers: { 'x-inventory-domain': 'medical' }
      });
      assert(resMedAudit.status === 200, 'GET /api/v1/physical-audit (medical) returns HTTP 200');

      const resFoodAudit = await client.get('/physical-audit?scope=all', {
        headers: { 'x-inventory-domain': 'food' }
      });
      assert(resFoodAudit.status === 200, 'GET /api/v1/physical-audit (food) returns HTTP 200');
    }

    // ----------------------------------------------------------------------
    // STEP 4: Authoritative Backend Enforcement on Mutations (Security)
    // ----------------------------------------------------------------------
    console.log('\n--- Step 4: Authoritative Backend Mutation Enforcement ---');

    // 4a. Attempt to create a Food product while domain is 'medical' -> REJECT 400
    try {
      await client.post('/product', {
        name: 'Illegal Food Product Under Medical View',
        category: 'ration',
        unit: 'Kg',
        minStockLevel: 10
      }, {
        headers: { 'x-inventory-domain': 'medical' }
      });
      assert(false, 'Creating Food product under medical domain rejected with HTTP 400');
    } catch (err: any) {
      assert(err.response?.status === 400, 'Creating Food product under medical domain rejected with HTTP 400', err.response?.data?.message);
    }

    // 4b. Attempt to create a Medical product while domain is 'food' -> REJECT 400
    try {
      await client.post('/product', {
        name: 'Illegal Medical Product Under Food View',
        category: 'medicine',
        unit: 'Strips',
        minStockLevel: 10
      }, {
        headers: { 'x-inventory-domain': 'food' }
      });
      assert(false, 'Creating Medical product under food domain rejected with HTTP 400');
    } catch (err: any) {
      assert(err.response?.status === 400, 'Creating Medical product under food domain rejected with HTTP 400', err.response?.data?.message);
    }

    // 4c. Attempt to create an Ambiguous product under 'medical' -> REJECT 400
    try {
      await client.post('/product', {
        name: 'Illegal Stationary Product',
        category: 'stationary',
        unit: 'Nos',
        minStockLevel: 5
      }, {
        headers: { 'x-inventory-domain': 'medical' }
      });
      assert(false, 'Creating ambiguous product rejected with HTTP 400');
    } catch (err: any) {
      assert(err.response?.status === 400, 'Creating ambiguous product rejected with HTTP 400', err.response?.data?.message);
    }

    // 4d. Attempt to update stock for a medical product under 'food' domain -> REJECT 400
    const sampleMedProduct = medicalProducts[0];
    const sampleFoodProduct = foodProducts[0];

    if (sampleMedProduct) {
      try {
        await client.post('/stock/update', {
          productId: sampleMedProduct.id,
          quantity: 1,
          notes: 'Testing domain isolation'
        }, {
          headers: { 'x-inventory-domain': 'food' }
        });
        assert(false, 'Stock adjustment on medical product under food domain rejected with HTTP 400');
      } catch (err: any) {
        assert(err.response?.status === 400, 'Stock adjustment on medical product under food domain rejected with HTTP 400', err.response?.data?.message);
      }
    }

    // 4e. Attempt to issue stock of medical product for Kitchen Prep -> REJECT 400
    if (sampleMedProduct) {
      try {
        await client.post('/stock/issue-requests', {
          productId: sampleMedProduct.id,
          quantity: 1,
          usageType: 'KITCHEN_PREP',
          notes: 'Testing kitchen isolation'
        }, {
          headers: { 'x-inventory-domain': 'medical' }
        });
        assert(false, 'Medical stock issue with KITCHEN_PREP rejected with HTTP 400');
      } catch (err: any) {
        assert(err.response?.status === 400, 'Medical stock issue with KITCHEN_PREP rejected with HTTP 400', err.response?.data?.message);
      }
    }

    // 4f. Attempt to issue food product for Clinical Patient Care -> REJECT 400
    if (sampleFoodProduct) {
      try {
        await client.post('/stock/issue-requests', {
          productId: sampleFoodProduct.id,
          quantity: 1,
          usageType: 'PATIENT_CARE',
          patientId: '00000000-0000-0000-0000-000000000001',
          notes: 'Testing clinical isolation'
        }, {
          headers: { 'x-inventory-domain': 'food' }
        });
        assert(false, 'Food stock issue with patientId rejected with HTTP 400');
      } catch (err: any) {
        assert(err.response?.status === 400, 'Food stock issue with patientId rejected with HTTP 400', err.response?.data?.message);
      }
    }

    // 4g. Attempt Kitchen Requisition with a Medical product -> REJECT 400
    if (sampleMedProduct) {
      try {
        await client.post('/stock/kitchen-requisition', {
          mealPrepId: '00000000-0000-0000-0000-000000000001',
          items: [{ productId: sampleMedProduct.id, quantity: 1 }]
        });
        assert(false, 'Kitchen requisition with medical product rejected with HTTP 400');
      } catch (err: any) {
        assert(err.response?.status === 400, 'Kitchen requisition with medical product rejected with HTTP 400', err.response?.data?.message);
      }
    }

  } finally {
    server.close();
    await prisma.$disconnect();
  }

  // ----------------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`🏁 AUTOMATED VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
