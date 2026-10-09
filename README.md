# VendorVote — Pakej Pemindahan AI Studio

Pakej ini mengandungi snapshot kod sumber yang dibaca daripada projek Hatchable `VendorVote` pada 9 Oktober 2026.

## Struktur
- `public/`: halaman undian, dashboard admin dan CSS/JavaScript frontend.
- `api/`: API asal yang menggunakan SDK `hatchable`.
- `migrations/001_vendorvote.sql`: struktur pangkalan data.
- `seed.sql`: data contoh/seed peniaga dan sesi.
- `AI_STUDIO_PROMPT.md`: prompt untuk memulakan pemindahan dalam Google AI Studio.

## Perhatian penting
1. API dalam `api/` masih menggunakan `import { db } from 'hatchable'`; ia tidak akan berjalan terus di luar Hatchable tanpa migrasi backend.
2. `api/admin-manage.js` termasuk sebagai fail sumber draf, tetapi tidak tersenarai sebagai endpoint yang aktif dalam deployment semasa ketika snapshot dibuat.
3. `seed.sql` ialah data permulaan, bukan eksport data live. Ia tidak mengandungi rekod undian sebenar, ID pelajar layak, atau data database live.
4. Dashboard asal mempunyai isu pengiraan undian yang perlu disemak: query `admin-dashboard.js` mengira vote ID tanpa mengehadkan kiraan kepada pilihan vendor yang sepadan.
5. Jangan masukkan `.env`, API key, kata laluan atau data peribadi pelajar ke dalam prompt atau repositori awam.

Aplikasi asal masih di https://vendorvote.hatchable.site. Jangan matikan deployment asal semasa proses pemindahan.
