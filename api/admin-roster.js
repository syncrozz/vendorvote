import { db } from './db.js';
import { parseStudentsCSV } from './csv-utils.js';

export const access = 'admin';
export const methods = ['POST'];

export default async function (req, res) {
  let studentsToImport = [];

  // 1. Check if direct CSV text was sent
  if (typeof req.body?.csvText === 'string' && req.body.csvText.trim()) {
    const parsed = parseStudentsCSV(req.body.csvText);
    if (parsed.length > 0) {
      studentsToImport = parsed;
    } else {
      // Fallback: tokenize plain IDs
      const rawIds = req.body.csvText.split(/[\r\n,;\t ]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9-]{5,32}$/.test(s));
      studentsToImport = [...new Set(rawIds)].map(id => ({ id, name: 'Pelajar KPMBP', className: '-' }));
    }
  } else if (Array.isArray(req.body?.students) && req.body.students.length > 0) {
    // 2. Check if rich student objects were sent
    studentsToImport = req.body.students
      .map(s => ({
        id: String(s.id || s.student_id || '').trim().toUpperCase(),
        name: String(s.name || s.student_name || '').trim(),
        className: String(s.class || s.className || s.class_name || '').trim()
      }))
      .filter(s => /^[A-Z0-9-]{5,32}$/.test(s.id));
  } else if (Array.isArray(req.body?.studentIds) && req.body.studentIds.length > 0) {
    // 3. Fallback: array of string IDs
    const rawIds = [...new Set(req.body.studentIds.map(v => String(v).trim().toUpperCase()).filter(v => /^[A-Z0-9-]{5,32}$/.test(v)))];
    studentsToImport = rawIds.map(id => ({ id, name: 'Pelajar KPMBP', className: '-' }));
  }

  // Deduplicate by ID
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
    [
      req.member?.email || req.member?.handle || 'admin',
      'roster_import',
      JSON.stringify({ total: finalStudents.length, accepted: added })
    ]
  );

  return res.json({
    ok: true,
    message: `Import roster berjaya! ${finalStudents.length} rekod ID pelajar telah dikemaskini dan diaktifkan.`
  });
}
