import { db } from './db.js';
import { toCSV } from './csv-utils.js';

export const access = 'admin';
export const methods = ['GET'];

export default async function (req, res) {
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
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="senarai_pelajar_layak_kpmbp_${new Date().toISOString().slice(0, 10)}.csv"`
  );
  return res.send(csvContent);
}
