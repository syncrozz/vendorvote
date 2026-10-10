import { db } from '../db.js';

export const access = 'public';
export const methods = ['POST'];

export default async function handler(req, res) {
  if (req.method && req.method !== 'POST') {
    return res.status(405).json({ error: 'Kaedah HTTP tidak dibenarkan.' });
  }

  const studentId = String(req.body?.studentId || '').trim().toUpperCase();
  const sessionId = String(req.body?.sessionId || '').trim();
  const vendorIds = Array.isArray(req.body?.vendorIds)
    ? [...new Set(req.body.vendorIds.map(v => String(v).trim()))].filter(Boolean)
    : [];

  if (!studentId || !sessionId) return res.status(400).json({ error: 'Sila masukkan ID pelajar.' });
  if (vendorIds.length < 1) return res.status(400).json({ error: 'Sila pilih sekurang-kurangnya seorang peniaga.' });

  const { rows: sessions } = await db.query(
    "SELECT id, max_choices FROM voting_sessions WHERE id=$1 AND status='open' AND starts_at<=NOW() AND ends_at>=NOW()",
    [sessionId]
  );
  if (!sessions.length) return res.status(409).json({ error: 'Sesi undian telah ditutup atau belum dibuka.' });
  const maxChoices = sessions[0].max_choices || 5;

  const cleanId = studentId.replace(/[^A-Z0-9]/gi, '');
  const { rows: eligible } = await db.query(
    `SELECT student_id, student_name FROM eligible_students 
     WHERE (student_id=$1 OR UPPER(REPLACE(student_id, '-', '')) = $2) AND active=TRUE 
     LIMIT 1`,
    [studentId, cleanId]
  );
  if (!eligible.length) return res.status(403).json({ error: 'ID tidak ditemui dalam senarai pelajar yang layak. Sila hubungi urus setia.' });
  const canonicalStudentId = eligible[0].student_id;

  const { rows: validVendors } = await db.query(
    'SELECT vendor_id FROM session_vendors WHERE session_id=$1 AND vendor_id = ANY($2::text[])',
    [sessionId, vendorIds]
  );
  if (validVendors.length !== vendorIds.length) {
    return res.status(400).json({ error: 'Pilihan mengandungi peniaga yang tidak sah untuk sesi ini.' });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Dapatkan atau bina rekod undian pelajar
      let voteId = null;
      const { rows: existingVotes } = await tx.query(
        'SELECT id FROM votes WHERE session_id=$1 AND student_id=$2',
        [sessionId, canonicalStudentId]
      );

      if (existingVotes.length > 0) {
        voteId = existingVotes[0].id;
      } else {
        const { rows: inserted } = await tx.query(
          'INSERT INTO votes (session_id, student_id) VALUES ($1, $2) ON CONFLICT (session_id, student_id) DO NOTHING RETURNING id',
          [sessionId, canonicalStudentId]
        );
        if (inserted.length) {
          voteId = inserted[0].id;
        } else {
          const { rows: refetch } = await tx.query(
            'SELECT id FROM votes WHERE session_id=$1 AND student_id=$2',
            [sessionId, canonicalStudentId]
          );
          voteId = refetch[0]?.id;
        }
      }

      // 2. Semak pilihan sedia ada untuk rekod undian ini
      const { rows: choiceRows } = await tx.query(
        'SELECT vendor_id FROM vote_choices WHERE vote_id=$1',
        [voteId]
      );
      const alreadyVotedSet = new Set(choiceRows.map(c => c.vendor_id));

      // 3. Semak jika ada cubaan mengundi peniaga yang sama berulang kali
      const duplicates = vendorIds.filter(v => alreadyVotedSet.has(v));
      if (duplicates.length > 0) {
        const err = new Error(`Anda telah pun mengundi gerai ini (${duplicates.join(', ')}) dalam sesi ini.`);
        err.statusCode = 409;
        throw err;
      }

      // 4. Semak had kuota maksimum (default 5 undian)
      const existingCount = choiceRows.length;
      const newTotal = existingCount + vendorIds.length;
      if (newTotal > maxChoices) {
        const baki = Math.max(0, maxChoices - existingCount);
        const err = new Error(
          existingCount >= maxChoices
            ? `Anda telah menggunakan kesemua kuota had ${maxChoices} undian untuk sesi ini.`
            : `Pilihan melebihi had baki kuota. Anda sudah membuat ${existingCount} undian (Baki kuota: ${baki} undi lagi).`
        );
        err.statusCode = 400;
        throw err;
      }

      // 5. Masukkan pilihan undi baharu
      for (const vendorId of vendorIds) {
        await tx.query(
          'INSERT INTO vote_choices (vote_id, vendor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [voteId, vendorId]
        );
      }

      const remainingVotes = maxChoices - newTotal;
      return {
        totalVoted: newTotal,
        maxChoices,
        remainingVotes,
        votedVendorIds: [...alreadyVotedSet, ...vendorIds]
      };
    });

    return res.json({
      ok: true,
      message: `Undian anda berjaya direkodkan! (${result.totalVoted}/${result.maxChoices} undian digunakan · Baki: ${result.remainingVotes} undi).`,
      ...result
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('[Vote Error]', err);
    return res.status(500).json({ error: 'Ralat dalaman pelayan semasa merekodkan undian.' });
  }
}
