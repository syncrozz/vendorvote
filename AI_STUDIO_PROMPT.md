# PROMPT GOOGLE AI STUDIO — VENDORVOTE KPMBP

Anda sedang menerima snapshot kod sumber sedia ada bagi **VendorVote — Pasar Malam KPMBP**. Ini ialah projek sedia ada yang perlu diteruskan, bukan dibina semula tanpa sebab.

## Objektif
1. Audit semua fail dan terangkan struktur aplikasi serta apa yang benar-benar sudah dilaksanakan.
2. Kekalkan identiti UI, bahasa Melayu, aliran undian, pilihan sehingga `max_choices`, ID pelajar, had satu undian bagi setiap pelajar bagi setiap sesi, paparan admin, import roster dan keputusan.
3. Asingkan dengan jelas ciri yang aktif dalam snapshot, ciri draf, isu yang ditemui dan ciri yang belum dibuat.
4. Sediakan pelan migrasi backend supaya kod tidak lagi bergantung kepada `import { db } from 'hatchable'` apabila dipindahkan keluar daripada Hatchable.
5. Jangan mendakwa database atau data live telah dipindahkan hanya kerana fail kod telah dimuat naik.

## Konteks teknikal semasa
- Frontend ialah HTML/CSS/JavaScript biasa dalam `public/`.
- API asal berada dalam `api/` dan menggunakan SDK `hatchable`.
- Database asal ialah PostgreSQL dengan jadual `voting_sessions`, `vendors`, `session_vendors`, `eligible_students`, `votes`, `vote_choices`, `admin_audit_log`.
- Schema ada dalam `migrations/001_vendorvote.sql`.
- `seed.sql` hanya mengandungi data seed/contoh, bukan eksport data langsung.
- `api/admin-manage.js` ialah draf pengurusan sesi/peniaga dan bukan endpoint yang aktif dalam deployment asal ketika snapshot ini dibuat.
- Aplikasi asal kekal hidup di `https://vendorvote.hatchable.site`.

## Keperluan keselamatan dan integriti
- Jangan masukkan sebarang rahsia, token, API key atau kata laluan dalam kod frontend.
- Jangan dedahkan ID pelajar atau rekod undian kepada pengguna awam.
- Pengesahan admin mesti dilakukan di server/backend, bukan sekadar menyembunyikan butang di frontend.
- Pastikan hanya roster aktif boleh mengundi.
- Pastikan satu undian sahaja bagi setiap ID pelajar bagi setiap sesi menggunakan kekangan database.
- Pastikan pengesahan sesi (status, tarikh mula/tamat), vendor yang dibenarkan, dan bilangan pilihan dibuat di server.
- Gunakan transaksi database untuk menyimpan undian dan pilihan vendor secara atomik.
- Jangan import `seed.sql` ke database production secara automatik.
- Jangan ubah atau padam deployment asal atau database asal.

## Isu wajib diaudit
Dalam `api/admin-dashboard.js`, query semasa menggunakan `COUNT(DISTINCT vo.id)` sedangkan `vote_choices vc` disambungkan melalui vendor. Ini berpotensi mengira semua pengundi sesi untuk setiap vendor, bukan undian yang benar-benar memilih vendor tersebut. Semak dan betulkan kiraan supaya ia mengira pilihan yang sepadan (contohnya `COUNT(DISTINCT vc.vote_id)` jika sesuai dengan schema).

## Cara kerja yang diminta
**Fasa 1 — Audit sahaja:** Baca semua fail. Senaraikan apa yang berfungsi, risiko, dan fail yang perlu diubah. Jangan terus menulis semula keseluruhan aplikasi.

**Fasa 2 — Cadangan backend:** Bandingkan pilihan backend yang praktikal untuk aplikasi ini (contohnya Firebase/Firestore atau Supabase/PostgreSQL). Ambil kira pengesahan admin, transaksi, roster, undian unik dan eksport laporan. Terangkan kos/kerumitan serta keputusan yang diperlukan sebelum migrasi.

**Fasa 3 — Migrasi terkawal:** Selepas backend dipilih, hasilkan perubahan dalam langkah kecil, kekalkan struktur dan UI sedia ada sejauh yang munasabah, serta sediakan `.env.example` tanpa rahsia.

**Fasa 4 — Pengesahan:** Sediakan ujian untuk:
- sesi tiada / sesi belum dibuka / sesi tamat;
- ID tidak layak;
- undian berganda;
- vendor tidak sah;
- pilihan melebihi had;
- keputusan vendor dikira dengan betul;
- endpoint admin ditolak kepada pengguna awam;
- import roster dan rekod audit.

## Format respons pertama
Mulakan dengan:
1. Ringkasan seni bina semasa.
2. Senarai fail dan fungsi.
3. Isu/risiko yang dikenal pasti.
4. Pelan migrasi backend yang dicadangkan.
5. Soalan yang perlu diputuskan sebelum sebarang perubahan besar.

Jangan mendakwa aplikasi telah dipindahkan atau berfungsi di luar Hatchable sehingga migrasi dan ujian benar-benar selesai.
