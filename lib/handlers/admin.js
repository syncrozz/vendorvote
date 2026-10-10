import { db, generateVendorSlug } from '../db.js';
import { toCSV, parseVendorsCSV, parseStudentsCSV } from '../csv-utils.js';
import { requireAdmin, ADMIN_PIN } from '../auth.js';

export const access = 'admin';
export const methods = ['GET', 'POST'];

function resolveAdminAction(req) {
  // 1. Direct parsed query parameter (set by Express or Vercel)
  if (req.query?.action) {
    return String(req.query.action).toLowerCase();
  }

  // 2. Fallback query string parsing from req.url or req.originalUrl
  const rawUrl = String(req.originalUrl || req.url || '');
  if (rawUrl.includes('?')) {
    try {
      const u = new URL(rawUrl, 'http://localhost');
      const actionFromQuery = u.searchParams.get('action');
      if (actionFromQuery) {
        return actionFromQuery.toLowerCase();
      }
    } catch (_) {}
  }

  // 3. Match from URL path
  const urlPath = rawUrl.split('?')[0].toLowerCase();
  if (urlPath.includes('verify-pin')) return 'verify-pin';
  if (urlPath.includes('dashboard')) return 'dashboard';
  if (urlPath.includes('import-vendors')) return 'import-vendors';
  if (urlPath.includes('export-results')) return 'export-results';
  if (urlPath.includes('export-vendors')) return 'export-vendors';
  if (urlPath.includes('export-roster')) return 'export-roster';
  if (urlPath.includes('roster')) return 'roster';
  if (urlPath.includes('manage')) return 'manage';

  // 4. Request body cues
  if (req.body?.adminAction) return String(req.body.adminAction).toLowerCase();
  if (req.body?.action && ['create_session', 'update_session', 'set_vendor_active', 'update_vendor_image', 'update_vendor_slug'].includes(req.body.action)) {
    return 'manage';
  }
  if (req.body?.pin && !req.body?.action) return 'verify-pin';

  return 'dashboard';
}

export default async function handler(req, res) {
  const action = resolveAdminAction(req);

  // 1. PIN verification endpoint (does not require existing admin session)
  if (action === 'verify-pin') {
    const { pin } = req.body || {};
    if (String(pin || '').trim() === ADMIN_PIN) {
      return res.json({ ok: true, message: 'Admin Mode diaktifkan.' });
    }
    return res.status(401).json({ ok: false, error: 'PIN keselamatan tidak sah. Sila cuba lagi.' });
  }

  // 2. Server-side Admin Authorization check for all admin actions
  if (!requireAdmin(req, res)) {
    return;
  }

  const actor = req.member?.email || req.member?.handle || 'admin';

  try {
    // 3. Dashboard Data
    if (action === 'dashboard') {
      const { rows: sessions } = await db.query(
        'SELECT id, title, starts_at, ends_at, status, min_votes, max_choices FROM voting_sessions ORDER BY created_at DESC'
      );
      const { rows: vendors } = await db.query(
        'SELECT id, name, menu_description, phone, image_url, slug, active FROM vendors ORDER BY name'
      );
      const { rows: results } = await db.query(
        'SELECT sv.session_id, v.id AS vendor_id, v.name, COUNT(DISTINCT vc.vote_id)::int AS votes, s.min_votes FROM session_vendors sv JOIN vendors v ON v.id=sv.vendor_id JOIN voting_sessions s ON s.id=sv.session_id LEFT JOIN votes vo ON vo.session_id=sv.session_id LEFT JOIN vote_choices vc ON vc.vote_id=vo.id AND vc.vendor_id=v.id GROUP BY sv.session_id, v.id, v.name, s.min_votes ORDER BY votes DESC, v.name'
      );
      const { rows: totals } = await db.query(
        'SELECT session_id, COUNT(*)::int AS total_voters FROM votes GROUP BY session_id'
      );
      const { rows: roster } = await db.query(
        'SELECT COUNT(*)::int AS eligible_count FROM eligible_students WHERE active=TRUE'
      );
      return res.json({
        sessions,
        vendors,
        results,
        totals,
        eligibleStudents: roster[0]?.eligible_count || 0
      });
    }

    // 4. Session & Vendor Management
    if (action === 'manage') {
      const subAction = String(req.body?.action || '');

      if (subAction === 'create_session') {
        const title = String(req.body?.title || '').trim().slice(0, 120);
        const days = Number(req.body?.days);
        const minVotes = Number(req.body?.minVotes);
        const maxChoices = Number(req.body?.maxChoices || 5);

        if (!title || ![1, 2, 3].includes(days) || !Number.isInteger(minVotes) || minVotes < 0 || minVotes > 100000 || !Number.isInteger(maxChoices) || maxChoices < 1 || maxChoices > 9) {
          return res.status(400).json({ error: 'Semak nama sesi, tempoh 1–3 hari, had minimum dan bilangan pilihan.' });
        }

        const id = 'VV-' + Date.now().toString(36).toUpperCase();
        const { rows } = await db.query(
          "INSERT INTO voting_sessions (id,title,starts_at,ends_at,status,min_votes,max_choices) VALUES ($1,$2,NOW(),NOW()+($3::text || ' days')::interval,'open',$4,$5) RETURNING id,title,starts_at,ends_at,status,min_votes,max_choices",
          [id, title, days, minVotes, maxChoices]
        );
        await db.query('INSERT INTO session_vendors (session_id,vendor_id) SELECT $1,id FROM vendors WHERE active=TRUE', [id]);
        await db.query('INSERT INTO admin_audit_log (actor,action,details) VALUES ($1,$2,$3::jsonb)', [actor, 'create_session', JSON.stringify({ id, title, days, minVotes, maxChoices })]);
        return res.json({ ok: true, message: 'Sesi berjaya dicipta dan dibuka.', session: rows[0] });
      }

      if (subAction === 'update_session') {
        const id = String(req.body?.sessionId || '');
        const status = String(req.body?.status || '');
        const minVotes = Number(req.body?.minVotes);

        if (!id || !['scheduled', 'open', 'closed', 'finalized'].includes(status) || !Number.isInteger(minVotes) || minVotes < 0 || minVotes > 100000) {
          return res.status(400).json({ error: 'Status atau had minimum tidak sah.' });
        }

        const { rows } = await db.query(
          'UPDATE voting_sessions SET status=$2,min_votes=$3 WHERE id=$1 RETURNING id,title,status,min_votes',
          [id, status, minVotes]
        );
        if (!rows.length) return res.status(404).json({ error: 'Sesi tidak ditemui.' });
        await db.query('INSERT INTO admin_audit_log (actor,action,details) VALUES ($1,$2,$3::jsonb)', [actor, 'update_session', JSON.stringify({ id, status, minVotes })]);
        return res.json({ ok: true, message: 'Tetapan sesi dikemas kini.' });
      }

      if (subAction === 'set_vendor_active') {
        const id = String(req.body?.vendorId || '');
        const active = Boolean(req.body?.active);
        const { rows } = await db.query(
          'UPDATE vendors SET active=$2 WHERE id=$1 RETURNING id,name,active',
          [id, active]
        );
        if (!rows.length) return res.status(404).json({ error: 'Peniaga tidak ditemui.' });
        await db.query('INSERT INTO admin_audit_log (actor,action,details) VALUES ($1,$2,$3::jsonb)', [actor, 'set_vendor_active', JSON.stringify({ id, active })]);
        return res.json({ ok: true, message: 'Status peniaga dikemas kini.' });
      }

      if (subAction === 'update_vendor_image') {
        const id = String(req.body?.vendorId || '').trim();
        const imageUrl = String(req.body?.imageUrl || '').trim();
        const { rows } = await db.query(
          'UPDATE vendors SET image_url=$2 WHERE id=$1 RETURNING id,name,image_url',
          [id, imageUrl]
        );
        if (!rows.length) return res.status(404).json({ error: 'Peniaga tidak ditemui.' });
        await db.query('INSERT INTO admin_audit_log (actor,action,details) VALUES ($1,$2,$3::jsonb)', [actor, 'update_vendor_image', JSON.stringify({ id, imageUrl: imageUrl ? '(set)' : '(cleared)' })]);
        return res.json({ ok: true, message: 'Gambar branding peniaga berjaya dikemas kini.', vendor: rows[0] });
      }

      if (subAction === 'update_vendor_slug') {
        const id = String(req.body?.vendorId || '').trim();
        let slug = String(req.body?.slug || '').trim().toLowerCase();
        slug = slug.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
        if (!slug) return res.status(400).json({ error: 'Slug tidak sah. Gunakan huruf kecil, nombor, atau tanda sempang.' });
        const { rows: conflict } = await db.query('SELECT id, name FROM vendors WHERE slug=$1 AND id<>$2', [slug, id]);
        if (conflict && conflict.length) {
          return res.status(409).json({ error: `Slug "/${slug}" telah digunakan oleh peniaga ${conflict[0].name} (${conflict[0].id}). Sila pilih slug yang berbeza.` });
        }
        const { rows } = await db.query(
          'UPDATE vendors SET slug=$2 WHERE id=$1 RETURNING id,name,slug',
          [id, slug]
        );
        if (!rows.length) return res.status(404).json({ error: 'Peniaga tidak ditemui.' });
        await db.query('INSERT INTO admin_audit_log (actor,action,details) VALUES ($1,$2,$3::jsonb)', [actor, 'update_vendor_slug', JSON.stringify({ id, slug })]);
        return res.json({ ok: true, message: `Pautan slug gerai berjaya dikemas kini kepada /${slug}`, vendor: rows[0] });
      }

      return res.status(400).json({ error: 'Tindakan admin tidak dikenali.' });
    }

    // 5. Roster Import
    if (action === 'roster') {
      let studentsToImport = [];

      if (typeof req.body?.csvText === 'string' && req.body.csvText.trim()) {
        const parsed = parseStudentsCSV(req.body.csvText);
        if (parsed.length > 0) {
          studentsToImport = parsed;
        } else {
          const rawIds = req.body.csvText.split(/[\r\n,;\t ]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9-]{5,32}$/.test(s));
          studentsToImport = [...new Set(rawIds)].map(id => ({ id, name: 'Pelajar KPMBP', className: '-' }));
        }
      } else if (Array.isArray(req.body?.students) && req.body.students.length > 0) {
        studentsToImport = req.body.students
          .map(s => ({
            id: String(s.id || s.student_id || '').trim().toUpperCase(),
            name: String(s.name || s.student_name || '').trim(),
            className: String(s.class || s.className || s.class_name || '').trim()
          }))
          .filter(s => /^[A-Z0-9-]{5,32}$/.test(s.id));
      } else if (Array.isArray(req.body?.studentIds) && req.body.studentIds.length > 0) {
        const rawIds = [...new Set(req.body.studentIds.map(v => String(v).trim().toUpperCase()).filter(v => /^[A-Z0-9-]{5,32}$/.test(v)))];
        studentsToImport = rawIds.map(id => ({ id, name: 'Pelajar KPMBP', className: '-' }));
      }

      const uniqueMap = new Map();
      for (const s of studentsToImport) {
        if (s.id && !uniqueMap.has(s.id)) {
          uniqueMap.set(s.id, s);
        }
      }
      const finalStudents = Array.from(uniqueMap.values());

      if (!finalStudents.length) {
        return res.status(400).json({ error: 'Tiada rekod ID pelajar yang sah untuk diimport.' });
      }

      let added = 0;
      for (const s of finalStudents) {
        const result = await db.query(
          'INSERT INTO eligible_students (student_id, student_name, class_name, active) VALUES ($1, $2, $3, TRUE) ON CONFLICT (student_id) DO UPDATE SET active=TRUE, student_name=COALESCE(NULLIF($2, \'\'), eligible_students.student_name), class_name=COALESCE(NULLIF($3, \'\'), eligible_students.class_name)',
          [s.id, s.name, s.className]
        );
        added += result.rowCount || 1;
      }

      await db.query(
        'INSERT INTO admin_audit_log (actor, action, details) VALUES ($1, $2, $3::jsonb)',
        [actor, 'import_roster', JSON.stringify({ count: finalStudents.length, added })]
      );

      return res.json({
        ok: true,
        message: `Berjaya mengimport/mengemas kini ${finalStudents.length} rekod pelajar ke dalam senarai pemilih yang sah.`,
        count: finalStudents.length
      });
    }

    // 6. Vendor Import
    if (action === 'import-vendors') {
      let vendorsToImport = [];

      if (typeof req.body?.csvText === 'string') {
        vendorsToImport = parseVendorsCSV(req.body.csvText);
      } else if (Array.isArray(req.body?.vendors)) {
        vendorsToImport = req.body.vendors;
      }

      if (!vendorsToImport.length) {
        return res.status(400).json({ error: 'Tiada rekod peniaga yang sah untuk diimport daripada data CSV.' });
      }

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

      await db.query(
        'INSERT INTO admin_audit_log (actor, action, details) VALUES ($1, $2, $3::jsonb)',
        [actor, 'import_vendors', JSON.stringify({ count: insertedCount, sessionId: activeSessionId })]
      );

      return res.json({
        ok: true,
        message: `Berjaya memuat naik dan mengemas kini ${insertedCount} peniaga Pasar Malam KPMBP.`,
        count: insertedCount
      });
    }

    // 7. Export Results CSV
    if (action === 'export-results') {
      const { rows: sessions } = await db.query(
        'SELECT id, title, min_votes FROM voting_sessions ORDER BY created_at DESC'
      );
      const activeSession = sessions.find(s => s.status === 'open') || sessions[0];

      if (!activeSession) {
        return res.status(404).send('Tiada sesi undian ditemui.');
      }

      const { rows: results } = await db.query(
        'SELECT sv.session_id, v.id AS vendor_id, v.name, v.menu_description, v.phone, COUNT(DISTINCT vc.vote_id)::int AS votes, s.min_votes FROM session_vendors sv JOIN vendors v ON v.id=sv.vendor_id JOIN voting_sessions s ON s.id=sv.session_id LEFT JOIN votes vo ON vo.session_id=sv.session_id LEFT JOIN vote_choices vc ON vc.vote_id=vo.id AND vc.vendor_id=v.id GROUP BY sv.session_id, v.id, v.name, v.menu_description, v.phone, s.min_votes ORDER BY votes DESC, v.name'
      );

      const sessionResults = results.filter(r => r.session_id === activeSession.id);
      const csvRows = sessionResults.map((r, index) => [
        index + 1,
        r.vendor_id,
        r.name,
        r.menu_description || '',
        r.phone || '',
        r.votes,
        r.min_votes,
        r.votes >= r.min_votes ? 'Mencapai Had Kelayakan' : 'Belum Mencapai Had'
      ]);

      const headers = ['Bil', 'ID Peniaga', 'Nama Peniaga', 'Menu Jualan', 'No. Telefon', 'Jumlah Undian', 'Had Minimum', 'Status Kelayakan'];
      const csvContent = '\uFEFF' + toCSV(csvRows, headers);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="keputusan_undian_${activeSession.id}_${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csvContent);
    }

    // 8. Export Vendors CSV
    if (action === 'export-vendors') {
      const { rows: vendors } = await db.query(
        'SELECT id, name, menu_description, phone, slug, active FROM vendors ORDER BY id'
      );

      const csvRows = vendors.map((v, index) => [
        index + 1,
        v.id,
        v.name,
        v.menu_description || '',
        v.phone || '',
        v.slug ? `/${v.slug}` : '',
        v.active ? 'Aktif' : 'Tidak Aktif'
      ]);

      const headers = ['Bil', 'ID', 'Nama Peniaga', 'Menu', 'No. Telefon', 'Pautan Slug QR', 'Status'];
      const csvContent = '\uFEFF' + toCSV(csvRows, headers);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="senarai_peniaga_kpmbp_${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csvContent);
    }

    // 9. Export Roster CSV
    if (action === 'export-roster') {
      const { rows: students } = await db.query(
        'SELECT student_id, student_name, class_name, active, created_at FROM eligible_students ORDER BY student_id'
      );

      const csvRows = students.map((s, index) => [
        index + 1,
        s.student_id,
        s.student_name || '-',
        s.class_name || '-',
        s.active ? 'Layak Mengundi' : 'Tidak Layak'
      ]);

      const headers = ['Bil', 'No_Pelajar', 'Nama_Pelajar', 'Kelas', 'Status Kelayakan'];
      const csvContent = '\uFEFF' + toCSV(csvRows, headers);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="senarai_pelajar_layak_kpmbp_${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csvContent);
    }

    return res.status(400).json({ error: 'Tindakan admin tidak sah.' });
  } catch (err) {
    console.error('[Admin Action Error]', err);
    return res.status(500).json({ error: 'Ralat memproses tindakan admin: ' + err.message });
  }
}
