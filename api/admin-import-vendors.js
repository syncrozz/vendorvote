import { db, generateVendorSlug } from './db.js';
import { parseVendorsCSV } from './csv-utils.js';

export const access = 'admin';
export const methods = ['POST'];

export default async function (req, res) {
  let vendorsToImport = [];

  if (typeof req.body?.csvText === 'string') {
    vendorsToImport = parseVendorsCSV(req.body.csvText);
  } else if (Array.isArray(req.body?.vendors)) {
    vendorsToImport = req.body.vendors;
  }

  if (!vendorsToImport.length) {
    return res.status(400).json({ error: 'Tiada rekod peniaga yang sah untuk diimport daripada data CSV.' });
  }

  // Get current active session
  const { rows: sessions } = await db.query(
    "SELECT id FROM voting_sessions WHERE status IN ('open','scheduled') ORDER BY created_at DESC LIMIT 1"
  );
  const activeSessionId = sessions[0]?.id;

  let insertedCount = 0;
  for (const v of vendorsToImport) {
    const id = String(v.id || '').trim();
    const name = String(v.name || '').trim();
    const menu = String(v.menu_description || v.menu || '').trim();
    const phone = String(v.phone || v.phoneNumber || '').trim();
    const image = String(v.image_url || v.gambar || v.image || '').trim();
    const slug = String(v.slug || v.pautan || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || generateVendorSlug(name, id);

    if (!id || !name) continue;

    if (image) {
      await db.query(
        `INSERT INTO vendors (id, name, menu_description, phone, image_url, slug, active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         ON CONFLICT (id) DO UPDATE SET name=$2, menu_description=$3, phone=$4, image_url=$5, slug=$6, active=TRUE`,
        [id, name, menu, phone, image, slug]
      );
    } else {
      await db.query(
        `INSERT INTO vendors (id, name, menu_description, phone, slug, active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (id) DO UPDATE SET name=$2, menu_description=$3, phone=$4, slug=$5, active=TRUE`,
        [id, name, menu, phone, slug]
      );
    }

    if (activeSessionId) {
      await db.query(
        `INSERT INTO session_vendors (session_id, vendor_id)
         VALUES ($1, $2)
         ON CONFLICT (session_id, vendor_id) DO NOTHING`,
        [activeSessionId, id]
      );
    }
    insertedCount++;
  }

  const actor = req.member?.email || req.member?.handle || 'admin';
  await db.query('INSERT INTO admin_audit_log (actor, action, details) VALUES ($1, $2, $3::jsonb)', [
    actor,
    'import_vendors_csv',
    JSON.stringify({ total: vendorsToImport.length, inserted: insertedCount })
  ]);

  return res.json({
    ok: true,
    count: insertedCount,
    message: `Berjaya mengimport ${insertedCount} peniaga daripada fail CSV.`
  });
}
