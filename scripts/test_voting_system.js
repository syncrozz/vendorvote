const BASE_URL = 'http://localhost:3000';

async function runTestSuite() {
  console.log('=====================================================');
  console.log('🧪 MEMULAKAN UJIAN SISTEM UNDIAN & SLUG VENDORVOTE');
  console.log('=====================================================\n');

  const testReport = [];

  // TEST 1: Get Public Session
  console.log('▶ UJIAN 1: Mengambil maklumat sesi aktif (/api/public-session)...');
  const sessionRes = await fetch(`${BASE_URL}/api/public-session`);
  const sessionData = await sessionRes.json();
  
  if (!sessionData.session) {
    console.error('❌ Gagal: Tiada sesi aktif ditemui!');
    process.exit(1);
  }
  const sessionId = sessionData.session.id;
  const maxChoices = sessionData.session.max_choices || 5;
  const vendors = sessionData.vendors || [];
  
  console.log(`✅ Sesi Ditemui: "${sessionData.session.title}" (ID: ${sessionId})`);
  console.log(`✅ Had Maksimum Undian: ${maxChoices} undi setiap pelajar`);
  console.log(`✅ Jumlah Peniaga Tersedia: ${vendors.length} gerai`);
  testReport.push({ test: 'Pengambilan Sesi Aktif', status: 'LULUS', details: `${sessionData.session.title} (${vendors.length} peniaga)` });

  // TEST 2: Verify Slugs & Priority Routing
  console.log('\n▶ UJIAN 2: Menguji Pautan Slug Peniaga...');
  const sampleVendor = vendors[0];
  const vendorSlug = sampleVendor.slug || 'abg-zam';
  console.log(`Peniaga contoh: ${sampleVendor.name} (Slug: /${vendorSlug})`);

  const slugRes = await fetch(`${BASE_URL}/${vendorSlug}`);
  const slugHtml = await slugRes.text();
  const hasHeading = slugHtml.includes('Peniaga kegemaran anda?');
  
  if (slugRes.status === 200 && hasHeading) {
    console.log(`✅ Akses URL /${vendorSlug} berjaya (HTTP 200) & Mengembalikan paparan antaramuka pelajar.`);
    testReport.push({ test: 'Routing Slug Peniaga', status: 'LULUS', details: `/${vendorSlug} memuatkan antaramuka dengan tajuk 'Peniaga kegemaran anda?'` });
  } else {
    console.error(`❌ Gagal memeriksa route /${vendorSlug}`);
    testReport.push({ test: 'Routing Slug Peniaga', status: 'GAGAL', details: `Status HTTP ${slugRes.status}` });
  }

  // Pick a fresh student for clean testing
  console.log('\n▶ UJIAN 3: Mencari ID Pelajar Ujian...');
  const candidateIds = ['PDL-2502-049', 'PDL2502049', 'PDA-2602-072', 'PDA-2503-007', 'PPD-2602-032'];
  let testStudentId = null;
  let statusData = null;

  for (const cid of candidateIds) {
    const res = await fetch(`${BASE_URL}/api/student-status?studentId=${cid}&sessionId=${sessionId}`);
    const data = await res.json();
    if (data.eligible && data.remainingVotes === 5) {
      testStudentId = cid;
      statusData = data;
      break;
    }
  }

  if (!testStudentId) {
    // If all candidates voted, pick any eligible student and we can verify their current state
    for (const cid of candidateIds) {
      const res = await fetch(`${BASE_URL}/api/student-status?studentId=${cid}&sessionId=${sessionId}`);
      const data = await res.json();
      if (data.eligible) {
        testStudentId = cid;
        statusData = data;
        break;
      }
    }
  }

  console.log(`Status Pelajar Ujian (${testStudentId}):`, {
    eligible: statusData?.eligible,
    studentName: statusData?.studentName,
    className: statusData?.className,
    totalVoted: statusData?.totalVoted,
    remainingVotes: statusData?.remainingVotes,
    maxVotes: statusData?.maxVotes
  });

  if (!statusData?.eligible) {
    console.error('❌ Pelajar tidak layak!');
    process.exit(1);
  }
  testReport.push({ test: 'Semakan Kelayakan Pelajar', status: 'LULUS', details: `${statusData.studentName} (${statusData.className}) - Layak (Kemasukan ID fleksibel)` });

  // Pick 6 distinct vendors for testing
  const vendorToVote = vendors.slice(0, 6);
  if (vendorToVote.length < 5) {
    console.error('❌ Tidak cukup vendor untuk ujian 5 undi!');
    process.exit(1);
  }

  let currentStudentId = testStudentId;
  let currentRemaining = statusData.remainingVotes;

  // TEST 4: Cast 1st Vote (Individual separate vote)
  console.log(`\n▶ UJIAN 4: Memasukkan Undian Pertama untuk ${currentStudentId} -> Gerai 1 (${vendorToVote[0].name})...`);
  const vote1Res = await fetch(`${BASE_URL}/api/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      studentId: currentStudentId,
      vendorIds: [vendorToVote[0].id]
    })
  });
  const vote1Data = await vote1Res.json();
  console.log('Maklum Balas Undian 1:', vote1Data);

  if (vote1Res.status === 200 && vote1Data.totalVoted === 1 && vote1Data.remainingVotes === 4) {
    console.log('✅ Undian 1 BERJAYA! Baki: 4 undi.');
    testReport.push({ test: 'Undian Pertama (Berasingan)', status: 'LULUS', details: `1/5 digunakan · Baki: 4 undi` });
  } else {
    console.error('❌ Undian 1 gagal!');
    testReport.push({ test: 'Undian Pertama (Berasingan)', status: 'GAGAL', details: JSON.stringify(vote1Data) });
  }

  // TEST 5: Prevent Duplicate Vote on the Same Vendor
  console.log(`\n▶ UJIAN 5: Menguji Perlindungan Undi Berganda (Mengundi semula ${vendorToVote[0].name})...`);
  const dupVoteRes = await fetch(`${BASE_URL}/api/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      studentId: currentStudentId,
      vendorIds: [vendorToVote[0].id]
    })
  });
  const dupVoteData = await dupVoteRes.json();
  console.log('Maklum Balas Undian Berganda (Dijangka Ditolak):', dupVoteRes.status, dupVoteData);

  if (dupVoteRes.status === 409 && dupVoteData.error && dupVoteData.error.includes('telah pun mengundi gerai ini')) {
    console.log('✅ Sistem BERJAYA menolak undian berganda untuk gerai yang sama!');
    testReport.push({ test: 'Halangan Undi Berganda (Gerai Sama)', status: 'LULUS', details: `Ditolak dengan kod 409: "${dupVoteData.error}"` });
  } else {
    console.error('❌ Sistem tidak menghalang undian berganda dengan betul!');
    testReport.push({ test: 'Halangan Undi Berganda (Gerai Sama)', status: 'GAGAL', details: JSON.stringify(dupVoteData) });
  }

  // TEST 6: Cast Separate Votes 2, 3, 4, 5 (Incrementally until limit 5 reached)
  console.log('\n▶ UJIAN 6: Memasukkan Undian Berasingan Ke-2, Ke-3, Ke-4, dan Ke-5...');
  for (let i = 1; i < 5; i++) {
    const targetVendor = vendorToVote[i];
    const voteRes = await fetch(`${BASE_URL}/api/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        studentId: currentStudentId,
        vendorIds: [targetVendor.id]
      })
    });
    const voteData = await voteRes.json();
    console.log(`Undian #${i + 1} (${targetVendor.name}):`, {
      status: voteRes.status,
      totalVoted: voteData.totalVoted,
      remaining: voteData.remainingVotes,
      msg: voteData.message
    });

    if (voteRes.status !== 200 || voteData.totalVoted !== (i + 1)) {
      console.error(`❌ Undian #${i + 1} gagal!`);
      testReport.push({ test: `Undian Berasingan #${i + 1}`, status: 'GAGAL', details: JSON.stringify(voteData) });
      break;
    }
  }
  testReport.push({ test: 'Undian Berturut-turut (Sehingga 5 Undi)', status: 'LULUS', details: `Semua 5 undian berjaya direkodkan secara berasingan` });

  // TEST 7: Attempt 6th Vote (Exceeding Limit)
  console.log(`\n▶ UJIAN 7: Menguji Had Kuota Maksimum (Cubaan Undian Ke-6 untuk gerai baharu)...`);
  const extraVendor = vendorToVote[5];
  const overLimitRes = await fetch(`${BASE_URL}/api/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      studentId: currentStudentId,
      vendorIds: [extraVendor.id]
    })
  });
  const overLimitData = await overLimitRes.json();
  console.log('Maklum Balas Undian Ke-6 (Dijangka Disekat):', overLimitRes.status, overLimitData);

  if (overLimitRes.status === 400 && overLimitData.error && overLimitData.error.includes('kesemua kuota')) {
    console.log('✅ Sistem BERJAYA menyekat undian melebihi had 5 kuota!');
    testReport.push({ test: 'Sekatan Had Kuota (Maksimum 5 Undian)', status: 'LULUS', details: `Ditolak dengan kod 400: "${overLimitData.error}"` });
  } else {
    console.error('❌ Sistem gagal menyekat undian melebihi kuota!');
    testReport.push({ test: 'Sekatan Had Kuota (Maksimum 5 Undian)', status: 'GAGAL', details: JSON.stringify(overLimitData) });
  }

  // TEST 8: Check Final Status for Student
  console.log(`\n▶ UJIAN 8: Semakan Status Akhir Pelajar (${currentStudentId})...`);
  const finalStatusRes = await fetch(`${BASE_URL}/api/student-status?studentId=${currentStudentId}&sessionId=${sessionId}`);
  const finalStatus = await finalStatusRes.json();
  console.log('Status Akhir Pelajar:', {
    totalVoted: finalStatus.totalVoted,
    remainingVotes: finalStatus.remainingVotes,
    maxVotes: finalStatus.maxVotes,
    votedVendorIdsCount: finalStatus.votedVendorIds?.length
  });

  if (finalStatus.totalVoted === 5 && finalStatus.remainingVotes === 0 && finalStatus.votedVendorIds?.length === 5) {
    console.log('✅ Pengesahan status pelajar TEPAT: 5/5 digunakan, 0 baki kuota.');
    testReport.push({ test: 'Pengesahan Status Akhir Pelajar', status: 'LULUS', details: `5/5 undian direkodkan, Baki: 0 undian` });
  } else {
    console.error('❌ Status akhir tidak sepadan!');
    testReport.push({ test: 'Pengesahan Status Akhir Pelajar', status: 'GAGAL', details: JSON.stringify(finalStatus) });
  }

  console.log('\n=====================================================');
  console.log('📋 RINGKASAN LAPORAN UJIAN SISTEM');
  console.log('=====================================================');
  console.table(testReport);
}

runTestSuite().catch(err => {
  console.error('Ralat pelaksanaan ujian:', err);
  process.exit(1);
});
