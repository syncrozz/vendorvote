import { db } from '../db.js';

export const access = 'public';
export const methods = ['GET', 'POST'];

export default async function handler(req, res) {
  const studentId = String(req.query?.studentId || req.body?.studentId || '').trim().toUpperCase();
  let sessionId = String(req.query?.sessionId || req.body?.sessionId || '').trim();

  if (!studentId) {
    return res.status(400).json({ ok: false, error: 'Sila masukkan ID pelajar.' });
  }

  try {
    // 1. Dapatkan sesi yang aktif jika sessionId tidak diberikan
    let maxChoices = 5;
    if (!sessionId) {
      const { rows: sessions } = await db.query(
        "SELECT id, title, max_choices FROM voting_sessions WHERE status IN ('open','scheduled') ORDER BY created_at DESC LIMIT 1"
      );
      if (sessions.length) {
        sessionId = sessions[0].id;
        maxChoices = sessions[0].max_choices || 5;
      }
    } else {
      const { rows: sessions } = await db.query(
        "SELECT id, title, max_choices FROM voting_sessions WHERE id=$1",
        [sessionId]
      );
      if (sessions.length) {
        maxChoices = sessions[0].max_choices || 5;
      }
    }

    // 2. Semak kelayakan pelajar (padanan terus atau abaikan sengkang)
    const cleanId = studentId.replace(/[^A-Z0-9]/gi, '');
    const { rows: eligible } = await db.query(
      `SELECT student_id, student_name, class_name FROM eligible_students 
       WHERE (student_id=$1 OR UPPER(REPLACE(student_id, '-', '')) = $2) AND active=TRUE 
       LIMIT 1`,
      [studentId, cleanId]
    );

    if (!eligible.length) {
      return res.status(404).json({
        ok: false,
        eligible: false,
        error: 'ID pelajar tidak ditemui dalam senarai rasmi pelajar KPMBP yang layak. Sila semak semula atau rujuk urus setia.'
      });
    }

    const student = eligible[0];
    const canonicalStudentId = student.student_id;

    // 3. Semak undian sedia ada untuk sesi ini
    let votedVendorIds = [];
    if (sessionId) {
      const { rows: voteRows } = await db.query(
        'SELECT id FROM votes WHERE session_id=$1 AND student_id=$2',
        [sessionId, canonicalStudentId]
      );

      if (voteRows.length > 0) {
        const voteId = voteRows[0].id;
        const { rows: choiceRows } = await db.query(
          'SELECT vendor_id FROM vote_choices WHERE vote_id=$1',
          [voteId]
        );
        votedVendorIds = choiceRows.map(c => c.vendor_id);
      }
    }

    const totalVoted = votedVendorIds.length;
    const remainingVotes = Math.max(0, maxChoices - totalVoted);

    return res.json({
      ok: true,
      eligible: true,
      studentId: student.student_id,
      studentName: student.student_name || 'Pelajar KPMBP',
      className: student.class_name || '-',
      totalVoted,
      maxChoices,
      remainingVotes,
      votedVendorIds,
      hasReachedLimit: totalVoted >= maxChoices
    });
  } catch (err) {
    console.error('[StudentStatus Error]', err);
    return res.status(500).json({ ok: false, error: 'Ralat menyemak status pelajar.' });
  }
}
