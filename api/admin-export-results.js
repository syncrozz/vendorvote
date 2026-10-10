import { db } from './db.js';
import { toCSV } from './csv-utils.js';

export const access = 'admin';
export const methods = ['GET'];

export default async function (req, res) {
  // Query sessions and results
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

  const headers = [
    'Bil',
    'ID Peniaga',
    'Nama Peniaga',
    'Menu Jualan',
    'No. Telefon',
    'Jumlah Undian',
    'Had Minimum',
    'Status Kelayakan'
  ];

  const csvContent = '\uFEFF' + toCSV(csvRows, headers); // Include UTF-8 BOM for Excel compatibility

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="keputusan_undian_${activeSession.id}_${new Date().toISOString().slice(0, 10)}.csv"`
  );
  return res.send(csvContent);
}
