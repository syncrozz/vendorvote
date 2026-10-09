import { db } from 'hatchable';
export const access = 'public';
export const methods = ['POST'];
export default async function (req, res) {
  const studentId = String(req.body?.studentId || '').trim().toUpperCase();
  const sessionId = String(req.body?.sessionId || '').trim();
  const vendorIds = Array.isArray(req.body?.vendorIds) ? [...new Set(req.body.vendorIds.map(v => String(v)))] : [];
  if (!studentId || !sessionId) return res.status(400).json({ error: 'Sila masukkan ID pelajar.' });
  if (vendorIds.length < 1) return res.status(400).json({ error: 'Sila pilih sekurang-kurangnya seorang peniaga.' });
  const { rows: sessions } = await db.query("SELECT id, max_choices FROM voting_sessions WHERE id=$1 AND status='open' AND starts_at<=NOW() AND ends_at>=NOW()", [sessionId]);
  if (!sessions.length) return res.status(409).json({ error: 'Sesi undian telah ditutup atau belum dibuka.' });
  if (vendorIds.length > sessions[0].max_choices) return res.status(400).json({ error: 'Pilihan melebihi had yang dibenarkan.' });
  const { rows: eligible } = await db.query('SELECT student_id FROM eligible_students WHERE student_id=$1 AND active=TRUE', [studentId]);
  if (!eligible.length) return res.status(403).json({ error: 'ID tidak ditemui dalam senarai pelajar yang layak. Sila hubungi urus setia.' });
  const { rows: validVendors } = await db.query('SELECT vendor_id FROM session_vendors WHERE session_id=$1 AND vendor_id = ANY($2::text[])', [sessionId, vendorIds]);
  if (validVendors.length !== vendorIds.length) return res.status(400).json({ error: 'Pilihan mengandungi peniaga yang tidak sah untuk sesi ini.' });
  const { rows: inserted } = await db.query('INSERT INTO votes (session_id, student_id) VALUES ($1, $2) ON CONFLICT (session_id, student_id) DO NOTHING RETURNING id', [sessionId, studentId]);
  if (!inserted.length) return res.status(409).json({ error: 'ID ini telah digunakan untuk mengundi dalam sesi ini.' });
  for (const vendorId of vendorIds) await db.query('INSERT INTO vote_choices (vote_id, vendor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [inserted[0].id, vendorId]);
  return res.json({ ok: true, message: 'Undian anda berjaya direkodkan. Terima kasih!' });
}