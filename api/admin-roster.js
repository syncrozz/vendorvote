import { db } from 'hatchable';
export const access = 'admin';
export const methods = ['POST'];
export default async function (req, res) {
  const raw = Array.isArray(req.body?.studentIds) ? req.body.studentIds : [];
  const ids = [...new Set(raw.map(v => String(v).trim().toUpperCase()).filter(v => /^[A-Z0-9-]{5,32}$/.test(v)))];
  if (!ids.length) return res.status(400).json({ error: 'Tiada ID yang sah untuk diimport.' });
  let added = 0;
  for (const id of ids) {
    const result = await db.query('INSERT INTO eligible_students (student_id, active) VALUES ($1, TRUE) ON CONFLICT (student_id) DO UPDATE SET active=TRUE', [id]);
    added += result.rowCount || 0;
  }
  await db.query('INSERT INTO admin_audit_log (actor, action, details) VALUES ($1, $2, $3::jsonb)', [req.member?.email || req.member?.handle || 'admin', 'roster_import', JSON.stringify({ submitted: raw.length, accepted: ids.length })]);
  return res.json({ ok: true, message: 'Import selesai. '+ids.length+' ID telah diaktifkan.' });
}