import { db } from './db.js';
export const access = 'admin';
export const methods = ['GET'];
export default async function (req, res) {
  const { rows: sessions } = await db.query('SELECT id, title, starts_at, ends_at, status, min_votes, max_choices FROM voting_sessions ORDER BY created_at DESC');
  const { rows: vendors } = await db.query('SELECT id, name, menu_description, phone, image_url, slug, active FROM vendors ORDER BY name');
  const { rows: results } = await db.query('SELECT sv.session_id, v.id AS vendor_id, v.name, COUNT(DISTINCT vc.vote_id)::int AS votes, s.min_votes FROM session_vendors sv JOIN vendors v ON v.id=sv.vendor_id JOIN voting_sessions s ON s.id=sv.session_id LEFT JOIN votes vo ON vo.session_id=sv.session_id LEFT JOIN vote_choices vc ON vc.vote_id=vo.id AND vc.vendor_id=v.id GROUP BY sv.session_id, v.id, v.name, s.min_votes ORDER BY votes DESC, v.name');
  const { rows: totals } = await db.query('SELECT session_id, COUNT(*)::int AS total_voters FROM votes GROUP BY session_id');
  const { rows: roster } = await db.query('SELECT COUNT(*)::int AS eligible_count FROM eligible_students WHERE active=TRUE');
  return res.json({ sessions, vendors, results, totals, eligibleStudents: roster[0]?.eligible_count || 0 });
}