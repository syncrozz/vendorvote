import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL;

let pool = null;

if (databaseUrl) {
  console.log('[DB] Menggunakan sambungan PostgreSQL kekal (DATABASE_URL dikesan).');
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    console.error('[DB Pool Error]', err);
  });
} else if (isProduction) {
  console.error('[DB FATAL] Tiada konfigurasi DATABASE_URL dalam mod pengeluaran (production). Mod in-memory disekat.');
} else {
  console.log('[DB] Mod in-memory aktif untuk persekitaran pembangunan dan ujian tempatan.');
}

// Senarai 61 Vendor Rasmi Pasar Malam KPMBP (P001 - P061)
const defaultKpmbpVendors = [
  { id: 'P001', name: 'Sheda Gerai Gadis2', menu_description: 'Aneka jualan gerai', phone: '017-7186007', active: true },
  { id: 'P002', name: 'Abg Zam', menu_description: 'Nasi Kukus', phone: '013-7691986', active: true },
  { id: 'P003', name: 'Kak Wan Ramlah', menu_description: 'Pisang Cheese, Pisang Goreng, Keropok Lekor', phone: '011-17661173', active: true },
  { id: 'P004', name: 'Hazlina', menu_description: 'Nasi Kerabu, Nasi Ambang, Nasi Dagang', phone: '018-7797026', active: true },
  { id: 'P005', name: 'Aleeya', menu_description: 'Laksa Penang johor & thai, Rojak asma, Mee rebus, Aneka bubur, Spaghetti', phone: '017-7080553', active: true },
  { id: 'P006', name: 'Ayu', menu_description: 'Vietnam Roll, Chicken Tenders, Aneka Popia, Tauhu Bergedil, Bubur berlauk', phone: '017-7355314', active: true },
  { id: 'P007', name: 'Zura Uncle Big', menu_description: 'Char Kueh Teow, Mac & Cheese, Mac Meatball, Mashed Potato, Skewer', phone: '017-2427129', active: true },
  { id: 'P008', name: 'Jamiah Moustafa Aly', menu_description: 'Shawarma Kunafa', phone: '016-8407694', active: true },
  { id: 'P009', name: 'Norwani', menu_description: 'Mskn Pns, Nasi Blauk, Mee, Kuey Teow & Lontong Grg, Ramen, Ayam Korea & Aym Cheezy', phone: '010-6016049', active: true },
  { id: 'P010', name: 'NH Ramli', menu_description: 'Nancos, Kayaball, dessert', phone: '016-8913036', active: true },
  { id: 'P011', name: 'Azahar', menu_description: 'Kentang Spring', phone: '017-2521486', active: true },
  { id: 'P012', name: 'Alyza', menu_description: 'Takoyaki, tauhu begedil & dessert', phone: '019-8084343', active: true },
  { id: 'P013', name: 'Mazalina', menu_description: 'Sushi', phone: '011-70292078', active: true },
  { id: 'P014', name: 'Ss Naim De Benediction', menu_description: 'Burger Big Mac', phone: '011-36503748', active: true },
  { id: 'P015', name: 'Ss Amelyn Mpp', menu_description: 'Sukiya Beef Rice, Maggie, Air Float', phone: '018-6621737', active: true },
  { id: 'P016', name: 'Ss Iman Coolbros', menu_description: 'Popis bites, mojito', phone: '017-2906128', active: true },
  { id: 'P017', name: 'Ss Ain Zest7', menu_description: 'Corndog', phone: '011-62185310', active: true },
  { id: 'P018', name: 'Padin', menu_description: 'Kopi Ais', phone: '013-7065898', active: true },
  { id: 'P019', name: 'Suraya', menu_description: 'Nasi Lemak Kukus Set Ayam, Puyuh, Telur mata/Telur Rebus', phone: '017-6939223', active: true },
  { id: 'P020', name: 'Fieda', menu_description: 'Bubur Ayam KFZ, Kek Coklat Moist, Aiskrim Goreng', phone: '014-6542742', active: true },
  { id: 'P021', name: 'Ita', menu_description: 'Chicken Cop Meatball', phone: '017-7244146', active: true },
  { id: 'P022', name: 'Ft Zaid Toxyo', menu_description: 'Crispy Chicken Burger, Chicken Wrap, Pasta Mac & Cheese, Chicken Tender, Fries, Juice', phone: '011-39648664', active: true },
  { id: 'P023', name: 'Ft Dapdap', menu_description: 'Aym Gunting, Sotong King', phone: '017-7153748', active: true },
  { id: 'P024', name: 'Dzarin', menu_description: 'TM Unifi Package', phone: '017-7850898', active: true },
  { id: 'P025', name: 'Ss Aniq', menu_description: 'Baju & Seluar Thrift', phone: '014-9431822', active: true },
  { id: 'P026', name: 'Ss Wardah AFPAC', menu_description: 'Tauhu Goreng Crispy', phone: '014-5729883', active: true },
  { id: 'P027', name: 'Kahawa Coffee', menu_description: 'ICED & HOT Latte,Cappuccino, Mocha, Chocolate, Matcha, Tea & Soda', phone: '012-6395612', active: true },
  { id: 'P028', name: 'Eilia', menu_description: 'Banana puding (pelbagai flavour) & Pavlova', phone: '011-58518139', active: true },
  { id: 'P029', name: 'Apex', menu_description: 'Kebab, Roti John, Burger Ayam Crispy', phone: '011-69300688', active: true },
  { id: 'P030', name: 'Azhar', menu_description: 'Remote Control (RC) Kramsau', phone: '014-5969395', active: true },
  { id: 'P031', name: 'Azman Era', menu_description: 'Dimsum, Dumpling, Pau, Sosej, Tongmo', phone: '010-7651101', active: true },
  { id: 'P032', name: 'Ss Dzul HHC', menu_description: 'Rojak Buah, Sengkuang Calit, Kerabu Maggi', phone: '011-11379767', active: true },
  { id: 'P033', name: 'Aboy', menu_description: 'Cakoi', phone: '011-29293634', active: true },
  { id: 'P034', name: 'Aisyah', menu_description: 'Churros + Shaker Fries', phone: '013-7715292', active: true },
  { id: 'P035', name: 'Aisyah', menu_description: 'Nasi Ayam Cordy', phone: '013-9870352', active: true },
  { id: 'P036', name: 'Aziemah', menu_description: 'Ais Kepal, Kayaball', phone: '011-18695851', active: true },
  { id: 'P037', name: 'Azli', menu_description: 'Jagung Cheese, Jagung Bakar, Jagung Susu, Jagung Madu', phone: '019-7609943', active: true },
  { id: 'P038', name: 'Fauzi Yusof', menu_description: 'Kebab & Chicken Chop', phone: '017-7244146', active: true },
  { id: 'P039', name: 'Ft Abah & Son', menu_description: 'Aneka Air Balang, Coconut/Mango Shake, Mojito', phone: '011-39648664', active: true },
  { id: 'P040', name: 'Ft Akmal', menu_description: 'C.Kueh Teow, Air Kopi kmpg, Air Coklat Lava', phone: '018-2887826', active: true },
  { id: 'P041', name: 'Ft Arman', menu_description: 'Sawarma Kebab', phone: '016-7154069', active: true },
  { id: 'P042', name: 'Ft Cik Am Kitchen', menu_description: 'Chicken Tenders, Burger, Aneka Kentang viral', phone: '011-16045758', active: true },
  { id: 'P043', name: 'Ft Foody', menu_description: 'Ramen, Sosej, Ayam Chse, Jobica Coffee', phone: '012-7757362', active: true },
  { id: 'P044', name: 'Ft Manggai', menu_description: 'Manggo Float', phone: '012-7279085', active: true },
  { id: 'P045', name: 'Ft Siti Zalina', menu_description: 'Oden, Kayaball, Jagung', phone: '013-7840930', active: true },
  { id: 'P046', name: 'Ft Vilcent', menu_description: 'Coffee Lover', phone: '017-7311570', active: true },
  { id: 'P047', name: 'Ft Yati', menu_description: 'Takoyaki & Ramen', phone: '017-7288201', active: true },
  { id: 'P048', name: 'Haslinda', menu_description: 'Ayam Goreng Crispy', phone: '017-7347513', active: true },
  { id: 'P049', name: 'Hidayah Ramli', menu_description: 'Nanchos, Cucuk2', phone: '016-8913036', active: true },
  { id: 'P050', name: 'Iena Kitchen', menu_description: 'Nasi Lemak Berlauk', phone: '018-8743463', active: true },
  { id: 'P051', name: 'Murnis', menu_description: 'Nasi ayam sambal', phone: '011-17665646', active: true },
  { id: 'P052', name: 'Norshida', menu_description: 'Oden, Coklat Moist', phone: '011-25694096', active: true },
  { id: 'P053', name: 'Rahimah', menu_description: 'Keropok Lekor, Tauhu Crispy, Tempe Crispy', phone: '013-2364161', active: true },
  { id: 'P054', name: 'Sabri', menu_description: 'Colek buah', phone: '011-51669511', active: true },
  { id: 'P055', name: 'Ss Amar Foodhaunter', menu_description: 'Nasi Goreng', phone: '018-9820980', active: true },
  { id: 'P056', name: 'Ss De Benediction', menu_description: 'Big Mac', phone: '017-4372699', active: true },
  { id: 'P057', name: 'Ss Jaris ILMA', menu_description: 'Ice cream goreng, Ramen Carbonara, Sparkling lychee & Ribena', phone: '011-17673378', active: true },
  { id: 'P058', name: 'Ss Natasha AFPAC', menu_description: 'Popis, Mushroom Soup, Cocktail', phone: '017-7479703', active: true },
  { id: 'P059', name: 'Ss Nik Husna Zest7', menu_description: 'Crab Rangoon & Popia Bergedil', phone: '013-3493964', active: true },
  { id: 'P060', name: 'Ss Pati Coolbros', menu_description: 'Donut Susu', phone: '011-55547742', active: true },
  { id: 'P061', name: 'Suhailiza', menu_description: 'Nasi Goreng Tumbok', phone: '011-12797026', active: true }
];

// Fungsi menghasilkan slug bersih daripada nama/id peniaga
export function generateVendorSlug(name, id) {
  let s = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s) s = String(id || '').toLowerCase();
  return s;
}

// Fungsi pemetaan gambar 1:1 untuk peniaga Pasar Malam KPMBP mengikut menu dan kategori
export function getVendorDefaultImage(v) {
  const text = `${v?.name || ''} ${v?.menu_description || ''}`.toLowerCase();
  if (text.includes('kopi') || text.includes('latte') || text.includes('coffee') || text.includes('matcha')) {
    return 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('burger') || text.includes('big mac')) {
    return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('nasi lemak')) {
    return 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('kerabu') || text.includes('dagang') || text.includes('ambang')) {
    return 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('nasi kukus') || text.includes('nasi ayam') || text.includes('nasi goreng') || text.includes('nasi blauk')) {
    return 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('pisang cheese') || text.includes('banana') || text.includes('pavlova')) {
    return 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('laksa') || text.includes('kueh teow') || text.includes('kuey teow') || text.includes('mee rebus') || text.includes('ramen')) {
    return 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('shawarma') || text.includes('kebab') || text.includes('roti john')) {
    return 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('takoyaki')) {
    return 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('sushi')) {
    return 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('corndog') || text.includes('kentang') || text.includes('fries') || text.includes('nachos') || text.includes('nancos')) {
    return 'https://images.unsplash.com/photo-1627308595229-7830a5c91f9f?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('chicken cop') || text.includes('chicken chop') || text.includes('meatball') || text.includes('mac & cheese')) {
    return 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('ayam goreng') || text.includes('ayam gunting') || text.includes('chicken tender') || text.includes('sotong king')) {
    return 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('air balang') || text.includes('shake') || text.includes('mojito') || text.includes('float') || text.includes('jus')) {
    return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('thrift') || text.includes('baju') || text.includes('seluar')) {
    return 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('tauhu') || text.includes('tempe') || text.includes('lekor')) {
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('dimsum') || text.includes('dumpling') || text.includes('pau')) {
    return 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('rojak') || text.includes('colek')) {
    return 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('churros') || text.includes('cakoi')) {
    return 'https://images.unsplash.com/photo-1624300629298-e9de39c13be5?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('jagung')) {
    return 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('oden')) {
    return 'https://images.unsplash.com/photo-1552611052-33e04de081de?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('donut')) {
    return 'https://images.unsplash.com/photo-1527515862127-a4fc05baf7a5?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('popia') || text.includes('popis') || text.includes('vietnam')) {
    return 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&h=400&q=80';
  }
  if (text.includes('unifi') || text.includes('rc')) {
    return 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=400&h=400&q=80';
  }
  return 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&h=400&q=80';
}

// Memuat senarai ID Pelajar Layak Rasmi KPMBP daripada fail CSV
function getInitialEligibleStudents() {
  const students = [
    { student_id: 'PDL2502145', student_name: 'Pelajar Ujian 1', class_name: 'TEST', active: true, created_at: new Date().toISOString() },
    { student_id: 'PDL2502115', student_name: 'Pelajar Ujian 2', class_name: 'TEST', active: true, created_at: new Date().toISOString() },
    { student_id: 'PDL2502061', student_name: 'Pelajar Ujian 3', class_name: 'TEST', active: true, created_at: new Date().toISOString() },
    { student_id: 'PDL2502001', student_name: 'Pelajar Ujian 4', class_name: 'TEST', active: true, created_at: new Date().toISOString() },
    { student_id: 'PDL2502002', student_name: 'Pelajar Ujian 5', class_name: 'TEST', active: true, created_at: new Date().toISOString() }
  ];

  try {
    const csvCandidates = [
      path.join(process.cwd(), 'data', 'pelajar_kpmbp.csv'),
      path.join(process.cwd(), 'public', 'data', 'pelajar_kpmbp.csv')
    ];
    for (const filePath of csvCandidates) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const parts = line.split(',');
          const id = (parts[1] || '').trim().toUpperCase();
          const name = (parts[2] || '').trim();
          const className = (parts[3] || '').trim();
          if (id && !students.some(s => s.student_id === id)) {
            students.push({
              student_id: id,
              student_name: name || 'Pelajar KPMBP',
              class_name: className || '-',
              active: true,
              created_at: new Date().toISOString()
            });
          }
        }
        break;
      }
    }
  } catch (err) {
    console.warn('[DB] Amaran: Gagal membaca data/pelajar_kpmbp.csv:', err.message);
  }

  return students;
}

// Inisialisasi automatik skema dan seed data untuk sambungan PostgreSQL
let pgInitPromise = null;
export async function ensurePostgresInitialized() {
  if (!pool) return;
  if (!pgInitPromise) {
    pgInitPromise = (async () => {
      try {
        const client = await pool.connect();
        try {
          const schemaPath = path.resolve(process.cwd(), 'migrations', '001_vendorvote.sql');
          if (fs.existsSync(schemaPath)) {
            const sql = fs.readFileSync(schemaPath, 'utf8');
            await client.query(sql);
          }
          await client.query("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS slug TEXT NOT NULL DEFAULT ''");
          await client.query("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''");

          const { rows: vCount } = await client.query('SELECT count(*) FROM vendors');
          if (parseInt(vCount[0]?.count || '0', 10) === 0) {
            for (const v of defaultKpmbpVendors) {
              const slug = generateVendorSlug(v.name, v.id);
              const img = getVendorDefaultImage(v);
              await client.query(
                `INSERT INTO vendors (id, name, menu_description, phone, image_url, slug, active)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug, image_url=EXCLUDED.image_url`,
                [v.id, v.name, v.menu_description, v.phone, img, slug, true]
              );
            }
          } else {
            const { rows: emptySlugs } = await client.query("SELECT count(*) FROM vendors WHERE slug IS NULL OR slug=''");
            if (parseInt(emptySlugs[0]?.count || '0', 10) > 0) {
              for (const v of defaultKpmbpVendors) {
                const slug = generateVendorSlug(v.name, v.id);
                await client.query(
                  "UPDATE vendors SET slug=$2 WHERE id=$1 AND (slug IS NULL OR slug='')",
                  [v.id, slug]
                );
              }
            }
          }

          const { rows: sCount } = await client.query('SELECT count(*) FROM voting_sessions');
          if (parseInt(sCount[0]?.count || '0', 10) === 0) {
            await client.query(
              `INSERT INTO voting_sessions (id, title, starts_at, ends_at, status, min_votes, max_choices)
               VALUES ($1, $2, NOW() - INTERVAL '1 day', NOW() + INTERVAL '3 days', 'open', 20, 5)
               ON CONFLICT (id) DO NOTHING`,
              ['PMK-2026-10', 'Pasar Malam KPMBP — Oktober 2026']
            );
            await client.query(
              `INSERT INTO session_vendors (session_id, vendor_id)
               SELECT 'PMK-2026-10', id FROM vendors
               ON CONFLICT DO NOTHING`
            );
          }

          const { rows: stCount } = await client.query('SELECT count(*) FROM eligible_students');
          if (parseInt(stCount[0]?.count || '0', 10) === 0) {
            const initialStudents = getInitialEligibleStudents();
            for (const st of initialStudents) {
              await client.query(
                `INSERT INTO eligible_students (student_id, student_name, class_name, active)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (student_id) DO NOTHING`,
                [st.student_id, st.student_name, st.class_name, true]
              );
            }
          }
        } finally {
          client.release();
        }
      } catch (err) {
        console.error('[DB] Ralat memulakan jadual/data PostgreSQL:', err);
      }
    })();
  }
  return pgInitPromise;
}

// In-memory relational store
const store = {
  voting_sessions: [
    {
      id: 'PMK-2026-10',
      title: 'Pasar Malam KPMBP — Oktober 2026',
      starts_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'open',
      min_votes: 20,
      max_choices: 5,
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    }
  ],
  vendors: defaultKpmbpVendors.map(v => ({
    ...v,
    slug: v.slug || generateVendorSlug(v.name, v.id),
    image_url: v.image_url || getVendorDefaultImage(v),
    created_at: new Date().toISOString()
  })),
  session_vendors: defaultKpmbpVendors.map(v => ({
    session_id: 'PMK-2026-10',
    vendor_id: v.id
  })),
  eligible_students: getInitialEligibleStudents(),
  votes: [
    { id: 'vote-001', session_id: 'PMK-2026-10', student_id: 'PDL2502001', submitted_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 'vote-002', session_id: 'PMK-2026-10', student_id: 'PDL2502002', submitted_at: new Date(Date.now() - 1800000).toISOString() }
  ],
  vote_choices: [
    { vote_id: 'vote-001', vendor_id: 'P001' },
    { vote_id: 'vote-001', vendor_id: 'P007' },
    { vote_id: 'vote-001', vendor_id: 'P008' },
    { vote_id: 'vote-002', vendor_id: 'P002' },
    { vote_id: 'vote-002', vendor_id: 'P014' }
  ],
  admin_audit_log: [
    { id: 'audit-001', actor: 'system', action: 'seed_init', details: { note: 'Initial seed 61 vendors loaded' }, created_at: new Date().toISOString() }
  ]
};

// Internal query engine for in-memory development mode
async function executeInMemoryQuery(queryText, params = []) {
  const q = queryText.replace(/\s+/g, ' ').trim();

  // 1. SELECT voting_sessions WHERE status IN ('open','scheduled') ORDER BY created_at DESC LIMIT 1
  if (q.startsWith('SELECT id, title, starts_at, ends_at, status, min_votes, max_choices FROM voting_sessions WHERE status IN') ||
      q.startsWith("SELECT id FROM voting_sessions WHERE status IN ('open','scheduled')")) {
    const match = store.voting_sessions
      .filter(s => s.status === 'open' || s.status === 'scheduled')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { rows: match.slice(0, 1), rowCount: Math.min(match.length, 1) };
  }

  // 2. SELECT v.id, v.name, v.menu_description, v.image_url, v.slug FROM vendors v JOIN session_vendors sv
  if (q.includes('FROM vendors v JOIN session_vendors sv')) {
    const sessionId = params[0] || (q.match(/sv\.session_id=['"]([^'"]+)['"]/)?.[1]);
    const sessionVendorIds = new Set(
      store.session_vendors.filter(sv => !sessionId || sv.session_id === sessionId).map(sv => sv.vendor_id)
    );
    const rows = store.vendors
      .filter(v => sessionVendorIds.has(v.id) && v.active)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(v => ({
        id: v.id,
        name: v.name,
        menu_description: v.menu_description,
        phone: v.phone || '',
        image_url: v.image_url || getVendorDefaultImage(v),
        slug: v.slug || generateVendorSlug(v.name, v.id)
      }));
    return { rows, rowCount: rows.length };
  }

  // 3. SELECT id, max_choices FROM voting_sessions WHERE id=$1
  if (q.includes('FROM voting_sessions WHERE id=$1')) {
    const sessionId = params[0];
    const now = Date.now();
    if (q.includes("status='open'") || q.includes('starts_at<=NOW()')) {
      const rows = store.voting_sessions
        .filter(s => s.id === sessionId && s.status === 'open' && new Date(s.starts_at).getTime() <= now && new Date(s.ends_at).getTime() >= now)
        .map(s => ({ id: s.id, max_choices: s.max_choices }));
      return { rows, rowCount: rows.length };
    }
    const rows = store.voting_sessions
      .filter(s => s.id === sessionId)
      .map(s => ({ id: s.id, title: s.title, max_choices: s.max_choices, status: s.status }));
    return { rows, rowCount: rows.length };
  }

  // 4. SELECT student_id, student_name FROM eligible_students WHERE student_id=$1 AND active=TRUE
  if (q.includes('FROM eligible_students WHERE student_id=$1 AND active=TRUE')) {
    const studentId = String(params[0] || '').trim().toUpperCase();
    const rows = store.eligible_students
      .filter(s => s.student_id === studentId && s.active)
      .map(s => ({ student_id: s.student_id, student_name: s.student_name, class_name: s.class_name }));
    return { rows, rowCount: rows.length };
  }

  // 5. SELECT vendor_id FROM session_vendors WHERE session_id=$1 AND vendor_id = ANY($2::text[])
  if (q.includes('FROM session_vendors WHERE session_id=$1 AND vendor_id = ANY')) {
    const sessionId = params[0];
    const vendorIds = params[1] || [];
    const rows = store.session_vendors
      .filter(sv => sv.session_id === sessionId && vendorIds.includes(sv.vendor_id))
      .map(sv => ({ vendor_id: sv.vendor_id }));
    return { rows, rowCount: rows.length };
  }

  // 6a. SELECT id FROM votes WHERE session_id=$1 AND student_id=$2
  if (q.startsWith('SELECT id FROM votes WHERE session_id=$1 AND student_id=$2')) {
    const [sessionId, studentId] = params;
    const match = store.votes.filter(v => v.session_id === sessionId && v.student_id === studentId);
    return { rows: match.map(v => ({ id: v.id })), rowCount: match.length };
  }

  // 6b. INSERT INTO votes (session_id, student_id) VALUES ($1, $2) ON CONFLICT (session_id, student_id) DO NOTHING RETURNING id
  if (q.startsWith('INSERT INTO votes')) {
    const [sessionId, studentId] = params;
    const existing = store.votes.find(v => v.session_id === sessionId && v.student_id === studentId);
    if (existing) {
      return { rows: [], rowCount: 0 };
    }
    const newVote = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      student_id: studentId,
      submitted_at: new Date().toISOString()
    };
    store.votes.push(newVote);
    return { rows: [{ id: newVote.id }], rowCount: 1 };
  }

  // 7a. SELECT vendor_id FROM vote_choices WHERE vote_id=$1
  if (q.startsWith('SELECT vendor_id FROM vote_choices WHERE vote_id=$1')) {
    const [voteId] = params;
    const match = store.vote_choices.filter(vc => vc.vote_id === voteId);
    return { rows: match.map(vc => ({ vendor_id: vc.vendor_id })), rowCount: match.length };
  }

  // 7b. INSERT INTO vote_choices (vote_id, vendor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
  if (q.startsWith('INSERT INTO vote_choices')) {
    const [voteId, vendorId] = params;
    const exists = store.vote_choices.some(vc => vc.vote_id === voteId && vc.vendor_id === vendorId);
    if (!exists) {
      store.vote_choices.push({ vote_id: voteId, vendor_id: vendorId });
    }
    return { rows: [], rowCount: 1 };
  }

  // 8. SELECT id, title, starts_at, ends_at, status, min_votes, max_choices FROM voting_sessions ORDER BY created_at DESC
  if (q.startsWith('SELECT id, title, starts_at, ends_at, status, min_votes, max_choices FROM voting_sessions ORDER BY created_at DESC') ||
      q.startsWith('SELECT id, title, min_votes FROM voting_sessions ORDER BY created_at DESC')) {
    const rows = [...store.voting_sessions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { rows, rowCount: rows.length };
  }

  // 9. SELECT id, name, menu_description, (phone), (image_url), (slug), active FROM vendors
  if (q.startsWith('SELECT id, name, menu_description') && q.includes('FROM vendors')) {
    const rows = store.vendors.map(v => ({
      ...v,
      slug: v.slug || generateVendorSlug(v.name, v.id),
      image_url: v.image_url || getVendorDefaultImage(v)
    })).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    return { rows, rowCount: rows.length };
  }

  // 10. Results query (with bugfix for DISTINCT vc.vote_id and phone)
  if (q.includes('FROM session_vendors sv JOIN vendors v ON v.id=sv.vendor_id JOIN voting_sessions s ON s.id=sv.session_id')) {
    const results = [];
    for (const sv of store.session_vendors) {
      const vendor = store.vendors.find(v => v.id === sv.vendor_id);
      const session = store.voting_sessions.find(s => s.id === sv.session_id);
      if (!vendor || !session) continue;

      const sessionVoteIds = new Set(store.votes.filter(vo => vo.session_id === sv.session_id).map(vo => vo.id));
      const matchingVotes = new Set(
        store.vote_choices
          .filter(vc => vc.vendor_id === vendor.id && sessionVoteIds.has(vc.vote_id))
          .map(vc => vc.vote_id)
      );

      results.push({
        session_id: sv.session_id,
        vendor_id: vendor.id,
        name: vendor.name,
        menu_description: vendor.menu_description,
        phone: vendor.phone || '',
        votes: matchingVotes.size,
        min_votes: session.min_votes
      });
    }

    results.sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return (a.vendor_id || '').localeCompare(b.vendor_id || '', undefined, { numeric: true });
    });

    return { rows: results, rowCount: results.length };
  }

  // 11. SELECT session_id, COUNT(*)::int AS total_voters FROM votes GROUP BY session_id
  if (q.includes('FROM votes GROUP BY session_id')) {
    const counts = {};
    for (const v of store.votes) {
      counts[v.session_id] = (counts[v.session_id] || 0) + 1;
    }
    const rows = Object.entries(counts).map(([session_id, total_voters]) => ({
      session_id,
      total_voters
    }));
    return { rows, rowCount: rows.length };
  }

  // 12. SELECT COUNT(*)::int AS eligible_count FROM eligible_students WHERE active=TRUE
  if (q.includes('FROM eligible_students WHERE active=TRUE')) {
    const count = store.eligible_students.filter(s => s.active).length;
    return { rows: [{ eligible_count: count }], rowCount: 1 };
  }

  // 13. INSERT INTO eligible_students
  if (q.startsWith('INSERT INTO eligible_students')) {
    const studentId = String(params[0] || '').trim().toUpperCase();
    const studentName = params[1] || '';
    const className = params[2] || '';
    const existing = store.eligible_students.find(s => s.student_id === studentId);
    if (existing) {
      existing.active = true;
      if (studentName) existing.student_name = studentName;
      if (className) existing.class_name = className;
    } else {
      store.eligible_students.push({
        student_id: studentId,
        student_name: studentName || 'Pelajar KPMBP',
        class_name: className || '-',
        active: true,
        created_at: new Date().toISOString()
      });
    }
    return { rows: [], rowCount: 1 };
  }

  // 14. INSERT INTO admin_audit_log (actor, action, details) VALUES ($1, $2, $3::jsonb)
  if (q.startsWith('INSERT INTO admin_audit_log')) {
    const [actor, action, details] = params;
    let parsedDetails = details;
    if (typeof details === 'string') {
      try { parsedDetails = JSON.parse(details); } catch { parsedDetails = details; }
    }
    const log = {
      id: crypto.randomUUID(),
      actor,
      action,
      details: parsedDetails,
      created_at: new Date().toISOString()
    };
    store.admin_audit_log.push(log);
    return { rows: [log], rowCount: 1 };
  }

  // 15. INSERT INTO vendors ... ON CONFLICT
  if (q.startsWith('INSERT INTO vendors')) {
    const [id, name, menu, phone] = params;
    const existing = store.vendors.find(v => v.id === id);
    if (existing) {
      existing.name = name;
      existing.menu_description = menu;
      existing.phone = phone || '';
      existing.active = true;
    } else {
      store.vendors.push({
        id,
        name,
        menu_description: menu,
        phone: phone || '',
        image_url: '',
        active: true,
        created_at: new Date().toISOString()
      });
    }
    return { rows: [], rowCount: 1 };
  }

  // 16. INSERT INTO session_vendors (session_id,vendor_id)
  if (q.startsWith('INSERT INTO session_vendors')) {
    const [sessionId, vendorId] = params;
    if (vendorId) {
      if (!store.session_vendors.some(sv => sv.session_id === sessionId && sv.vendor_id === vendorId)) {
        store.session_vendors.push({ session_id: sessionId, vendor_id: vendorId });
      }
      return { rows: [], rowCount: 1 };
    }
    // Subquery insert: SELECT $1,id FROM vendors WHERE active=TRUE
    const activeVendors = store.vendors.filter(v => v.active);
    for (const v of activeVendors) {
      if (!store.session_vendors.some(sv => sv.session_id === sessionId && sv.vendor_id === v.id)) {
        store.session_vendors.push({ session_id: sessionId, vendor_id: v.id });
      }
    }
    return { rows: [], rowCount: activeVendors.length };
  }

  // 17. UPDATE voting_sessions SET status=$2,min_votes=$3 WHERE id=$1
  if (q.startsWith('UPDATE voting_sessions')) {
    const [id, status, minVotes] = params;
    const session = store.voting_sessions.find(s => s.id === id);
    if (!session) return { rows: [], rowCount: 0 };
    session.status = status;
    session.min_votes = Number(minVotes);
    return { rows: [{ id: session.id, title: session.title, status: session.status, min_votes: session.min_votes }], rowCount: 1 };
  }

  // 18. UPDATE vendors SET active=$2 WHERE id=$1 or SET image_url=$2
  if (q.startsWith('UPDATE vendors SET active')) {
    const [id, active] = params;
    const vendor = store.vendors.find(v => v.id === id);
    if (!vendor) return { rows: [], rowCount: 0 };
    vendor.active = Boolean(active);
    return { rows: [{ id: vendor.id, name: vendor.name, active: vendor.active }], rowCount: 1 };
  }
  if (q.startsWith('UPDATE vendors SET image_url')) {
    const [id, imageUrl] = params;
    const vendor = store.vendors.find(v => v.id === id);
    if (!vendor) return { rows: [], rowCount: 0 };
    vendor.image_url = String(imageUrl || '').trim();
    return { rows: [{ id: vendor.id, name: vendor.name, image_url: vendor.image_url }], rowCount: 1 };
  }
  if (q.startsWith('UPDATE vendors SET slug')) {
    const [id, slug] = params;
    const vendor = store.vendors.find(v => v.id === id);
    if (!vendor) return { rows: [], rowCount: 0 };
    vendor.slug = String(slug || '').trim().toLowerCase();
    return { rows: [{ id: vendor.id, name: vendor.name, slug: vendor.slug }], rowCount: 1 };
  }

  // Check slug conflict
  if (q.includes('FROM vendors WHERE slug=$1 AND id<>$2')) {
    const [slug, id] = params;
    const match = store.vendors.filter(v => (v.slug || '').toLowerCase() === String(slug || '').toLowerCase() && v.id !== id);
    return { rows: match.map(v => ({ id: v.id, name: v.name, slug: v.slug })), rowCount: match.length };
  }
  if (q.includes('FROM vendors WHERE slug=$1')) {
    const [slug] = params;
    const match = store.vendors.filter(v => (v.slug || '').toLowerCase() === String(slug || '').toLowerCase());
    return { rows: match.map(v => ({ id: v.id, name: v.name, slug: v.slug })), rowCount: match.length };
  }

  // 19. SELECT student_id, (student_name, class_name), active, created_at FROM eligible_students ORDER BY student_id
  if (q.includes('FROM eligible_students') && (q.startsWith('SELECT student_id') || q.includes('ORDER BY student_id'))) {
    const rows = [...store.eligible_students].sort((a, b) => a.student_id.localeCompare(b.student_id));
    return { rows, rowCount: rows.length };
  }

  console.warn('[DB Mock] Query tidak dikenali:', q, params);
  return { rows: [], rowCount: 0 };
}

export const db = {
  // Query tunggal seragam
  query: async (queryText, params = []) => {
    if (pool) {
      await ensurePostgresInitialized();
      return pool.query(queryText, params);
    }
    if (isProduction) {
      const err = new Error('Pangkalan data belum dikonfigurasi. Sila sediakan DATABASE_URL.');
      err.statusCode = 503;
      throw err;
    }
    return executeInMemoryQuery(queryText, params);
  },

  // Transaksi atomik seragam (BEGIN / COMMIT / ROLLBACK)
  transaction: async (callback) => {
    if (pool) {
      await ensurePostgresInitialized();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    if (isProduction) {
      const err = new Error('Pangkalan data belum dikonfigurasi. Sila sediakan DATABASE_URL.');
      err.statusCode = 503;
      throw err;
    }

    // Simulasi transaksi in-memory dengan snapshot rollback
    const backupVotes = [...store.votes];
    const backupChoices = [...store.vote_choices];
    try {
      const clientMock = {
        query: (queryText, params) => executeInMemoryQuery(queryText, params)
      };
      return await callback(clientMock);
    } catch (err) {
      store.votes = backupVotes;
      store.vote_choices = backupChoices;
      throw err;
    }
  },

  // Semakan status kesihatan pangkalan data
  getHealth: async () => {
    return {
      mode: pool ? 'postgresql' : (isProduction ? 'unconfigured' : 'in-memory'),
      configured: Boolean(pool),
      vendorCount: store.vendors.length
    };
  }
};
