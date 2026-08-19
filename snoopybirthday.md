# Snoopy Birthday Gift Studio — Agent Handoff

Dokumen ini adalah sumber konteks utama untuk agent yang melanjutkan pengembangan `snoopy-gift-standalone`. Baca dokumen ini sebelum mengubah kode. Setelah itu, verifikasi detail yang akan disentuh langsung pada source code karena implementasi tetap menjadi sumber kebenaran terakhir.

**Status dokumen:** 20 Agustus 2026  
**Status implementasi:** Step 1 sampai Step 4 selesai secara lokal  
**Status deployment:** Worker dan frontend sudah memiliki deployment production; production smoke test dan perbaikan upload masih berlangsung  
**Keputusan media:** memakai bucket R2 For You Always yang sudah ada melalui `https://cdn.for-you-always.my.id`  
**Batas scope saat ini:** hanya folder `snoopy-gift-standalone`

---

## 1. Tujuan Produk

Snoopy Birthday Gift Studio adalah produk kado ulang tahun digital bertema comic scrapbook Snoopy/Peanuts. Produk ini mengubah satu template statis menjadi sistem yang dapat dipakai berulang kali untuk banyak customer tanpa mengedit HTML secara manual.

Produk memiliki tiga pengalaman utama:

1. **Penerima kado** membuka halaman gift, menuliskan wish, lalu menikmati empat kejutan: warm wishes, foto, lagu, dan surat.
2. **Pembeli/customer** mengisi sendiri isi kado melalui wizard Studio menggunakan magic link.
3. **Aldo/admin** membuat dan mengelola project dari dashboard internal `/admin`.

Target akhirnya adalah project baru dapat dibuat otomatis sesudah pembayaran di platform For You Always/Pakasir. Integrasi pembayaran belum dikerjakan dan harus dilakukan setelah deployment Cloudflare/Vercel stabil.

### Goals utama

- Tidak ada data customer yang di-hardcode pada gift production.
- Satu renderer gift dipakai untuk halaman publik dan live preview Studio.
- Customer non-teknis dapat mengisi, upload, preview, publish, dan download QR sendiri.
- Wish penerima tersimpan di Cloudflare KV dan hanya terlihat dari Studio atau admin yang sah.
- Foto dan MP3 customer disimpan di Cloudflare R2.
- Project creation bersifat idempotent agar retry pembayaran tidak membuat project duplikat.
- Magic token tidak tampil pada query string dan tidak disimpan plaintext di KV.
- Admin dapat membuat project manual, mencari, mengarsipkan, memulihkan, dan menghapus project.

### Non-goals saat ini

- Tidak ada database SQL.
- Tidak ada Telegram Bot.
- Tidak ada halaman generator terpisah; generator manual berada di `/admin`.
- Tidak ada akun customer/password tradisional.
- Tidak ada integrasi Pakasir pada folder atau service lain dalam repository ini.
- Tidak ada analytics, email notification, atau backup wish eksternal.

---

## 2. Status Tahapan Implementasi

| Tahap | Status | Ringkasan |
|---|---|---|
| Step 1 | Selesai | Gift dinamis, routing `/gift/:id`, Studio tujuh langkah, mock development, live preview, publish, dan QR. |
| Step 2 | Selesai | Cloudflare Worker, KV, R2, project API, upload, wish inbox, token hashing, CORS, dan idempotent project creation. |
| Step 3 | Selesai | Dashboard `/admin`, generator manual, pencarian/filter, magic link, archive/restore, dan permanent delete. |
| Step 4 | Selesai secara lokal | Automated tests dan browser QA untuk gift, Studio, admin shell, mobile responsiveness, route security, dan QR. |
| Deployment | Belum | Binding, secrets, domain production, deploy Worker, dan deploy Vercel masih harus dilakukan. |
| Pakasir | Belum | Endpoint internal sudah disiapkan, tetapi pemanggilan dari service Pakasir belum dibuat. |

---

## 3. Arsitektur

```text
                          +--------------------------+
                          |       Vercel Static      |
                          | /gift /studio /admin     |
                          +------------+-------------+
                                       |
                                       | HTTPS JSON / multipart
                                       v
                          +--------------------------+
                          |    Cloudflare Worker     |
                          | validation + auth + API  |
                          +----------+---------------+
                                     |
                         +-----------+-----------+
                         |                       |
                         v                       v
                +----------------+      +----------------+
                | Cloudflare KV  |      | Cloudflare R2  |
                | projects/wishes|      | photos + MP3   |
                +----------------+      +----------------+
```

### Frontend

- Vanilla HTML5, CSS3, dan JavaScript.
- Mobile-first.
- Tidak menggunakan framework atau build step.
- Google Fonts: Caveat, DM Sans, dan Fredoka.
- QR dibuat client-side dengan `qrcodejs`, error correction tinggi, pola hati dekoratif, dan empat pilihan palet warna.
- Runtime API URL dibaca dari `window.SNOOPY_RUNTIME.apiBaseUrl`.

### Backend

- Cloudflare Worker ES Module.
- Cloudflare KV untuk project, wishes, idempotency mapping, dan rate-limit counter.
- Cloudflare R2 yang sudah dimiliki For You Always untuk foto dan MP3.
- Tidak memakai Vercel Functions lagi.

### Hosting

- Frontend ditujukan untuk Vercel Static.
- API ditujukan untuk Cloudflare Worker.
- Media dilayani dari bucket R2 For You Always yang sudah ada melalui `MEDIA_BASE_URL=https://cdn.for-you-always.my.id`.

---

## 4. Struktur Folder Penting

```text
snoopy-gift-standalone/
├── index.html                 # Shell gift publik
├── app.js                     # Interaksi dan renderer gift
├── styles.css                 # Visual gift
├── runtime-config.js          # Public API base URL, tidak boleh berisi secret
├── vercel.json                # Rewrite /gift, /studio, /admin
├── .vercelignore              # Mencegah source internal ikut ter-host
├── server.js                  # Static dev server lokal
├── build.mjs                  # Allowlist build statis Vercel ke dist/
├── package.json               # npm start, npm test, npm run check
├── shared/
│   ├── project.js             # Schema/normalizer/validator frontend
│   └── api.js                 # Adapter API gift dan Studio
├── studio/
│   ├── index.html             # Wizard tujuh langkah
│   ├── styles.css
│   └── app.js                 # Autosave, upload, preview, publish, QR
├── admin/
│   ├── index.html             # Dashboard internal
│   ├── styles.css
│   └── app.js                 # Login, list, create, archive, delete
├── worker/
│   ├── wrangler.toml          # Binding dan public vars placeholder
│   ├── package.json           # Wrangler scripts
│   ├── README.md
│   └── src/
│       ├── index.js           # Router dan seluruh endpoint Worker
│       └── project.js         # Sanitasi/schema server-side
├── assets/
│   ├── data/music.json        # Katalog lagu
│   ├── gifs/                  # Aset tema Snoopy statis
│   ├── photos/                # Fixture development, bukan customer production
│   └── audio/                 # Fixture development
├── fixtures/sample.json       # Fixture generik lokal; tidak menjadi fallback production
├── dev/mock-api.js            # localStorage mock untuk gift dan Studio localhost
└── tests/
    ├── frontend.test.js
    ├── project.test.js
    └── worker.test.mjs
```

### File yang tidak ikut deployment Vercel

Vercel menjalankan `npm run build` dan hanya mempublikasikan `dist/`. `build.mjs` menyalin frontend melalui allowlist: gift, Studio, admin, shared client code, GIF tema, dan katalog musik. Worker, tests, dev mock, fixture, `server.js`, foto/audio lokal, serta Markdown tidak disalin. `.vercelignore` menjadi lapisan tambahan untuk mencegah source internal ikut diunggah ke build environment.

---

## 5. Alur Pengguna

### 5.1 Alur penerima kado

1. Membuka `/gift/:projectId`.
2. Frontend memanggil `GET /api/gift/:id`.
3. Hanya project `published` yang dapat dibuka.
4. Penerima membuka intro dan masuk ke section wish.
5. Jika wish aktif, penerima menulis 3–280 karakter dan mengirimkannya.
6. Wish disimpan di KV.
7. Penerima membuka empat surprise:
   - Warm Wishes.
   - Galeri foto.
   - Music turntable.
   - Surat langsung tanpa envelope.
8. Musik menggunakan URL dari data project dan dimulai dari user gesture agar sesuai aturan autoplay browser.

Gift memiliki state loading, invalid ID, not found/unpublished, network error, dan preview mode.

### 5.2 Alur customer melalui Studio

1. Customer menerima magic link berbentuk `/studio/:projectId#token=...`.
2. Token dari URL fragment dipindahkan ke `sessionStorage`.
3. Fragment dihapus dari address bar menggunakan `history.replaceState`.
4. Studio memakai token sebagai `Authorization: Bearer ...`.
5. Customer mengisi tujuh langkah:
   1. Identitas: penerima, pengirim, tanggal ulang tahun, subtitle.
   2. Warm Wishes: tiga preset generik, pesan custom, dan signature.
   3. Galeri: nama gallery room dinamis, deskripsi room, 1–15 foto atau video dalam editor grid, judul, cerita, dan dialog konfirmasi sebelum menghapus media.
   4. Musik: katalog atau upload MP3, cover, preview, dan playlist maksimal tiga lagu.
   5. Surat: greeting, paragraf, dan signoff.
   6. Wish Inbox: daftar wish terbaru dan timestamp.
   7. Live Preview, publish, gift URL, QR, dan download PNG.
6. Perubahan teks di-autosave setelah debounce 750 ms.
7. Live preview dikirim ke iframe melalui `postMessage` agar draft yang belum tersimpan tetap terlihat.
8. Project published tetap dapat diedit; autosave selanjutnya tetap mempertahankan status published.

### 5.3 Alur admin

1. Membuka `/admin`.
2. Memasukkan `ADMIN_SECRET`.
3. Secret disimpan di `sessionStorage`, bukan URL atau bundle.
4. Admin dapat:
   - Melihat statistik total/draft/published/archived.
   - Mencari berdasarkan project ID, penerima, pengirim, atau source.
   - Memfilter status.
   - Membuat project manual/gratis melalui satu tombol `Generate random link`; identitas diisi customer di Studio.
   - Menyalin magic link Studio.
   - Membuka gift published.
   - Archive dan restore.
   - Permanent delete setelah mengetik project ID lengkap.

### 5.4 Alur pembayaran yang direncanakan

1. Pakasir mengonfirmasi pembayaran.
2. Service yang dipercaya memanggil `POST /api/internal/projects`.
3. Invoice/order ID dipakai sebagai `idempotencyKey`.
4. Worker mengembalikan `projectId`, `studioUrl`, dan `giftUrl`.
5. Platform mengirim magic link Studio kepada pembeli.

Bagian ini belum diimplementasikan dari sisi Pakasir.

---

## 6. Data Dinamis dan Data Statis

### Data customer yang dinamis

Semua data berikut berasal dari payload API/KV:

- Nama penerima.
- Nama pengirim.
- Tanggal ulang tahun.
- Subtitle gift.
- Warm Wishes dan signature.
- Foto, judul foto, dan cerita.
- Playlist maksimal tiga lagu beserta URL audio, cover, judul, dan artis.
- Greeting, paragraf surat, dan signoff.
- Status wish inbox.

### Data tema yang tetap statis

Hal berikut sengaja tetap berada di HTML/CSS/JS:

- Layout dan urutan pengalaman.
- Warna comic scrapbook.
- Label generic seperti tombol dan judul komponen.
- Animasi dan interaksi.
- GIF Snoopy bawaan.
- Typography dan decorative assets.

Fixture generik hanya aktif di localhost untuk `sample-demo` atau query `?mock=1`. Production tidak memiliki fallback ke data customer.

---

## 7. Kontrak Data Project

Schema saat ini adalah `schemaVersion: 2`. Payload schema v1 dengan satu lagu dimigrasikan otomatis menjadi `music.tracks[]`.

```json
{
  "schemaVersion": 2,
  "projectId": "gift-0123456789abcdef",
  "status": "draft",
  "identity": {
    "recipient": "Nama penerima",
    "sender": "Nama pengirim",
    "birthdayDate": "2030-01-01",
    "subtitle": "Empat kejutan kecil yang dibuat khusus untukmu."
  },
  "warmWish": {
    "message": "Ucapan singkat",
    "signature": "Dengan sayang"
  },
  "galleryRoom": {
    "title": "My Portraits",
    "subtitle": "Kumpulan foto favorit yang ingin disimpan."
  },
  "gallery": [
    {
      "id": "media-id",
      "mediaType": "image",
      "mediaUrl": "https://media.example/photo.webp",
      "imageUrl": "https://media.example/photo.webp",
      "title": "Judul foto",
      "story": "Cerita kecil"
    }
  ],
  "music": {
    "tracks": [
      {
        "id": "track-id",
        "sourceType": "catalog",
        "catalogId": "catalog-track-id",
        "audioUrl": "https://media.example/song.mp3",
        "coverUrl": "https://media.example/cover.jpg",
        "title": "Judul lagu",
        "artist": "Nama artis"
      }
    ]
  },
  "letter": {
    "greeting": "Untuk kamu yang berulang tahun,",
    "paragraphs": ["Paragraf pertama", "Paragraf kedua"],
    "signoff": "Nama pengirim"
  },
  "settings": {
    "wishEnabled": true
  },
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "publishedAt": null
}
```

### Batas validasi server

- Project ID: lowercase alphanumeric dan dash, 3–64 karakter.
- Maksimal galeri: 15 media berupa foto atau video.
- Nama gallery room: maksimal 80 karakter.
- Deskripsi gallery room: maksimal 160 karakter.
- Maksimal playlist: 3 lagu.
- Nama penerima/pengirim: maksimal 80 karakter.
- Subtitle: maksimal 120 karakter.
- Warm wish: maksimal 650 karakter.
- Gallery title: maksimal 100 karakter.
- Gallery story: maksimal 350 karakter.
- Music title/artist: maksimal 100 karakter.
- Greeting: maksimal 120 karakter.
- Surat: maksimal 50 paragraf, 4.000 karakter per paragraf.
- Signoff: maksimal 220 karakter.
- Wish penerima: 3–280 Unicode characters.
- Media URL harus `/assets/...` atau HTTPS.

### Syarat publish

Project hanya dapat dipublish jika:

- Penerima, pengirim, dan tanggal ulang tahun terisi.
- Warm Wishes minimal 3 karakter.
- Nama gallery room minimal 2 karakter.
- Media pertama memiliki `mediaUrl`.
- Musik memiliki 1–3 item di `music.tracks[]`; setiap item memiliki `audioUrl` dan title.
- Surat memiliki greeting, minimal satu paragraf, dan signoff.

---

## 8. API Worker

Base URL berasal dari deployment Worker dan dikonfigurasi ke frontend melalui `runtime-config.js`.

| Method | Endpoint | Auth | Fungsi |
|---|---|---|---|
| GET | `/api/health` | Tidak | Health check Worker. |
| GET | `/api/gift/:id` | Tidak | Mengambil gift published yang sudah disanitasi. |
| GET | `/api/studio/:id` | Magic token | Mengambil project Studio. |
| PUT | `/api/studio/:id` | Magic token | Autosave draft atau publish. |
| POST | `/api/upload` | Magic token | Upload foto, video, atau MP3 ke R2. |
| POST | `/api/wishes` | Tidak | Menyimpan wish untuk project published. |
| GET | `/api/wishes/:id` | Magic token/admin | Membaca wish terbaru. |
| GET | `/api/admin/projects` | Admin secret | List, stats, search, dan filter project. |
| POST | `/api/admin/projects` | Admin secret | Membuat project manual idempotent. |
| PATCH | `/api/admin/projects/:id` | Admin secret | `archive` atau `restore`. |
| DELETE | `/api/admin/projects/:id` | Admin secret | Permanent delete project dan seluruh data terkait. |
| POST | `/api/internal/projects` | Internal generator secret | Entry point integrasi Pakasir mendatang. |

### Bentuk request upload

`POST /api/upload` menggunakan `multipart/form-data`:

- `projectId`.
- `kind`: `photo`, `video`, atau `audio`.
- `file`.

Batas file:

- Foto JPG/PNG/WEBP maksimal 8 MB sebelum kompresi.
- Browser mengubah foto menjadi WEBP, sisi terpanjang maksimal 1.600 px, quality 0.86.
- Video MP4/WEBM maksimal 20 MB dan ditampilkan autoplay tanpa suara.
- MP3 maksimal 25 MB.

### Admin project creation

```json
{
  "idempotencyKey": "manual-unique-key",
  "project": {
    "identity": {
      "recipient": "Optional",
      "sender": "Optional",
      "birthdayDate": "2026-08-20"
    }
  }
}
```

### Internal project creation

```json
{
  "source": "pakasir",
  "idempotencyKey": "invoice-or-order-id",
  "project": {}
}
```

Retry dengan pasangan `source + idempotencyKey` yang sama menghasilkan project dan magic link yang sama.

---

## 9. Penyimpanan KV dan R2

### KV keys

```text
project:{projectId}
wish:{projectId}:{inverseTimestamp}:{uuid}
idempotency:{source}:{sha256(idempotencyKey)}
rate:wish:{projectId}:{hashedIp}:{10MinuteBucket}
```

Wish menggunakan inverse timestamp pada key agar item baru muncul lebih awal saat listing. Worker tetap melakukan sort akhir berdasarkan `createdAt`.

Rate limit wish saat ini adalah maksimum 20 request per kombinasi project dan IP dalam bucket 10 menit. Counter memiliki TTL 20 menit.

### R2 object keys

```text
snoopy/{projectId}/photos/{uuid}-{safeFilename}.webp
snoopy/{projectId}/videos/{uuid}-{safeFilename}.mp4
snoopy/{projectId}/audio/{uuid}-{safeFilename}.mp3
```

Permanent delete menghapus seluruh object dengan prefix `snoopy/{projectId}/`.

---

## 10. Authentication dan Security Model

### Magic token Studio

- Project ID dan edit token diturunkan secara deterministik dengan HMAC-SHA256.
- Project ID berasal dari `source + idempotencyKey`.
- Edit token versi terbaru diturunkan dari `projectId`.
- KV hanya menyimpan SHA-256 token, bukan plaintext token.
- Token dibawa pada URL fragment `#token=...`, bukan query string.
- Browser memindahkannya ke `sessionStorage` dan menghapus fragment dari address bar.
- API menerima token lewat Bearer Authorization.

### Admin

- `ADMIN_SECRET` tidak berada di bundle atau `runtime-config.js`.
- Admin memasukkan secret secara manual.
- Browser menyimpannya di `sessionStorage` sampai tab/session ditutup atau logout.
- Worker membandingkan secret dengan constant-time comparison.

### Internal generator

- `INTERNAL_GENERATOR_SECRET` hanya untuk service terpercaya seperti Pakasir.
- Jangan pernah memanggil endpoint internal langsung dari browser customer.
- Secret harus disimpan sebagai Worker secret atau service binding credential.

### CORS

- Production origin dibaca dari `ALLOWED_ORIGINS`.
- Banyak origin dapat dipisahkan dengan koma.
- Localhost dan `127.0.0.1` HTTP diizinkan untuk development.
- Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS.
- Allowed headers: Authorization dan Content-Type.

### Public payload

`GET /api/gift/:id` hanya mengembalikan project published dan tidak pernah menyertakan:

- `auth`.
- Token hash.
- Idempotency hash.
- Wish inbox.
- Internal source metadata.

### Static hosting protection

Dev server menolak akses ke:

- `/worker/*`.
- `/tests/*`.
- `/api/*`.
- Hidden path segment.
- File server/package internal.

Vercel juga mengecualikan source tersebut menggunakan `.vercelignore`.

---

## 11. Konfigurasi Environment

### Public Worker variables di `worker/wrangler.toml`

```toml
ALLOWED_ORIGINS = "https://domain-frontend.example"
PUBLIC_GIFT_BASE_URL = "https://domain-frontend.example"
PUBLIC_STUDIO_BASE_URL = "https://domain-frontend.example"
MEDIA_BASE_URL = "https://cdn.for-you-always.my.id"
```

`ALLOWED_ORIGINS` dapat berisi beberapa origin dipisahkan koma.

### Worker bindings

```toml
[[kv_namespaces]]
binding = "GIFT_KV"
id = "KV_NAMESPACE_ID"

[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "NAMA_BUCKET_R2_FOR_YOU_ALWAYS_YANG_SUDAH_ADA"
```

### Worker secrets

```text
PROJECT_SIGNING_SECRET
ADMIN_SECRET
INTERNAL_GENERATOR_SECRET
```

Ketiganya harus berbeda, panjang, dan acak. Jangan commit nilainya.

**Penting:** mengganti `PROJECT_SIGNING_SECRET` akan membuat Worker tidak dapat menurunkan ulang token project versi terbaru untuk dashboard admin. Rencanakan rotasi/migrasi sebelum mengganti secret ini.

### Frontend runtime

Sesudah Worker memiliki URL production, isi:

```js
window.SNOOPY_RUNTIME = Object.freeze({
  apiBaseUrl: "https://worker.example.workers.dev"
});
```

File ini publik dan hanya boleh berisi URL/config non-secret.

---

## 12. Development Lokal

### Persyaratan

- Node.js 18 atau lebih baru.
- Browser modern yang mendukung `createImageBitmap`, Canvas, Blob, dan ES2020.

### Menjalankan frontend fixture

```text
npm start
```

Default server: `http://localhost:3000`.

URL development:

```text
Gift:   http://localhost:3000/gift/sample-demo?mock=1
Studio: http://localhost:3000/studio/sample-demo?mock=1#token=demo-token
Admin:  http://localhost:3000/admin
```

Gift dan Studio menggunakan `dev/mock-api.js` serta `localStorage` pada localhost. Admin **tidak memiliki mock API** dan tetap memakai Worker yang ditentukan oleh `runtime-config.js`. Saat admin berjalan di localhost, link Studio diubah menjadi `/studio/index.html?project=:id#token=...` dan link gift menjadi `/index.html?project=:id`. Format ini kompatibel dengan static server tanpa rewrite. Pada production, URL cantik dari Worker dipakai tanpa perubahan.

### Menjalankan Worker

Dari folder `worker`:

```text
npm install
npm run dev
```

Pastikan bindings/secrets development tersedia melalui konfigurasi Wrangler yang aman. Jangan membuat `.dev.vars` berisi secret lalu memasukkannya ke Git.

### Menjalankan pemeriksaan

```text
npm run check
```

Perintah ini menjalankan syntax check pada frontend, Studio, admin, shared files, dev mock, server, dan Worker, kemudian menjalankan seluruh Node tests.

---

## 13. Hasil Pengujian Terakhir

Hasil terakhir pada 20 Agustus 2026:

```text
tests: 19
pass: 19
fail: 0
```

### Automated coverage

- Studio memiliki tujuh langkah dan memakai runtime config dinamis.
- Katalog musik membaca `audioUrl`/`coverUrl`, mendukung pencarian, preview, seek, playlist maksimal tiga lagu, migrasi format lama, dan fallback cover.
- Galeri mendukung foto serta video MP4/WEBM 20 MB dengan autoplay, loop, muted, dan playsinline.
- QR berbentuk hati menggunakan quiet zone aman dan empat pilihan palet warna.
- Gift production tidak memuat konfigurasi customer lama.
- Admin memiliki login, generator, filter, dan konfirmasi destructive delete.
- Runtime config tidak mengandung secret.
- Normalisasi schema dan sanitasi gallery.
- Validasi publish.
- Partial draft autosave.
- Deep-link project ID.
- Admin/internal idempotent creation.
- Full buyer/recipient Worker flow menggunakan mock KV dan R2.
- Public payload tidak membocorkan private fields.
- Multiple wishes dan inbox.
- Archive, restore, permanent delete, serta cleanup.
- Admin auth dan CORS.

### Browser QA yang sudah dilakukan

- Gift intro, wish submit, dan empat surprise.
- Warm Wishes, photo section, music section, dan letter section.
- Studio tujuh langkah.
- Wish Inbox membaca wish fixture.
- Live preview memakai draft terbaru.
- QR dirender.
- Download QR membuat PNG Blob dan memberikan status sukses.
- Desktop dan viewport mobile 390 × 844.
- Tidak ada horizontal overflow pada gift, Studio, atau admin shell.
- Static route `/worker`, `/tests`, dan file internal mengembalikan 404.

### Yang belum diuji terhadap infrastructure nyata

- KV namespace production.
- R2 upload dan CDN production.
- Wrangler deploy production.
- Vercel production rewrite/domain.
- CORS antara domain Vercel nyata dan Worker nyata.
- Pakasir/service binding.
- Load testing atau concurrency tinggi.

---

## 14. Deployment Checklist

Ikuti urutan ini agar masalah mudah dilacak.

### A. Cloudflare resources

1. Buat KV namespace `GIFT_KV`.
2. Gunakan bucket R2 For You Always yang sudah terhubung ke `https://cdn.for-you-always.my.id`; jangan membuat bucket baru.
3. Pastikan custom domain tersebut masih aktif untuk bucket yang dipilih.
4. Masukkan KV namespace ID dan nama bucket R2 lama ke `worker/wrangler.toml`.
5. Isi origin frontend production pada public vars lainnya.

### B. Secrets

Jalankan dari folder `worker`:

```text
npx wrangler secret put PROJECT_SIGNING_SECRET
npx wrangler secret put ADMIN_SECRET
npx wrangler secret put INTERNAL_GENERATOR_SECRET
```

Simpan secret di password manager. Jangan memasukkannya ke source, Vercel bundle, screenshot publik, atau chat customer.

### C. Deploy Worker

```text
npm install
npm run deploy
```

Verifikasi:

```text
GET https://worker-domain/api/health
```

Expected response:

```json
{ "ok": true, "service": "snoopy-gift-api" }
```

### D. Hubungkan frontend

1. Isi URL Worker pada `runtime-config.js`.
2. Pastikan `ALLOWED_ORIGINS` mencakup domain Vercel/custom domain.
3. Deploy folder frontend ke Vercel.
4. Jangan deploy folder repository induk secara tidak sengaja jika root project Vercel seharusnya `snoopy-gift-standalone`.

### E. Smoke test production

1. Login `/admin`.
2. Buat satu project test.
3. Salin magic link.
4. Isi seluruh tujuh langkah.
5. Upload foto dan MP3.
6. Publish.
7. Scan QR dari device lain.
8. Kirim dua wish dengan baris baru dan karakter khusus.
9. Buka Wish Inbox Studio.
10. Edit project published dan pastikan gift berubah.
11. Archive dan pastikan gift/Studio terblokir.
12. Restore dan pastikan akses kembali.
13. Buat project test kedua, upload media, lalu permanent delete dan cek cleanup R2/KV.
14. Periksa Worker logs dengan `npm run tail` jika ada error.

---

## 15. Known Limitations dan Technical Debt

Agent berikutnya harus mengetahui batas berikut sebelum menambah fitur.

### 15.1 Admin list belum memiliki pagination UI

Worker mengambil maksimal 1.000 project dari KV, kemudian dashboard menampilkan maksimal 100 sesuai request frontend. Ini cukup untuk fase awal, tetapi tidak cukup untuk katalog besar. Tambahkan cursor-based pagination sebelum volume mendekati batas tersebut.

### 15.2 Wish pagination belum dipakai frontend

Endpoint mengembalikan `cursor`, tetapi Studio hanya meminta daftar default dan tidak memiliki tombol load more. Default saat ini 50 wish, maksimum 100 per request.

### 15.3 Media lama menjadi orphan sampai project dihapus

Mengganti foto atau MP3 akan mengunggah object baru tetapi tidak langsung menghapus object sebelumnya. Permanent delete membersihkan seluruh prefix project, tetapi project aktif dapat mengumpulkan file lama. Solusi berikutnya adalah endpoint media delete yang tervalidasi atau garbage collection berdasarkan URL yang masih direferensikan project.

### 15.4 Binding R2 dan domain CDN adalah dua konfigurasi terpisah

Worker menyimpan object melalui binding `MEDIA_BUCKET`, sedangkan browser membaca file dari `MEDIA_BASE_URL`. Upload dapat berhasil tetapi preview tetap gagal jika `https://cdn.for-you-always.my.id` tidak menunjuk ke bucket yang sama. Studio sekarang menampilkan error khusus ketika gambar hasil upload tidak dapat dibaca dari CDN. Endpoint upload juga menolak project archived.

### 15.5 Rate limit berbasis KV bersifat best-effort

Read lalu write KV tidak atomic. Pada burst concurrency tinggi, batas 20 request dapat terlewati. Untuk kebutuhan yang lebih ketat gunakan Durable Object, Cloudflare Rate Limiting, atau service khusus.

### 15.6 Admin endpoint belum rate-limited

Admin dilindungi secret tetapi belum memiliki throttling login/request. Tambahkan Cloudflare WAF/rate-limit rule sebelum exposure luas.

### 15.7 Ketergantungan QR pada CDN eksternal

`qrcodejs` dimuat dari cdnjs. Jika CDN diblokir atau offline, QR tidak dapat dibuat. Pertimbangkan vendoring library lokal agar Studio tidak bergantung pada third-party runtime.

### 15.8 Google Fonts adalah dependency eksternal

UI memiliki font fallback, tetapi tampilan dapat berubah ketika Google Fonts gagal. Self-host fonts bila konsistensi visual atau privasi lebih penting.

### 15.9 Secret rotation belum memiliki prosedur migrasi

Rotasi `PROJECT_SIGNING_SECRET` memengaruhi kemampuan derivasi magic link. Implementasi baru menyimpan `tokenVersion: 2`, tetapi belum ada migration tooling atau multi-key verification.

### 15.10 Project deletion tidak recoverable

Permanent delete benar-benar menghapus KV dan R2. Tidak ada trash window atau backup. Archive harus menjadi pilihan default. Pertimbangkan soft-delete retention sebelum penggunaan skala besar.

### 15.11 Admin local tidak menggunakan mock Worker

Static dev server tidak mengimplementasikan admin API. Automated Worker tests menggunakan mock bindings, tetapi browser admin end-to-end membutuhkan Worker dev/production.

### 15.12 Belum ada Content Security Policy lengkap

Vercel menambahkan `nosniff` dan referrer policy, tetapi belum memiliki CSP lengkap, Permissions-Policy, atau HSTS custom. CSP perlu mengakomodasi Worker API, R2 CDN, Google Fonts, dan QR library.

---

## 16. What Comes Next

Urutan berikut direkomendasikan. Jangan langsung mengerjakan Pakasir sebelum deployment dasar terbukti stabil.

### Priority 0 — Production readiness

1. Buat resource Cloudflare KV dan konfirmasi nama bucket R2 For You Always yang sudah ada.
2. Konfigurasi Worker vars, bindings, dan secrets.
3. Deploy Worker.
4. Konfigurasi `runtime-config.js`.
5. Deploy frontend ke Vercel.
6. Jalankan smoke test production lengkap.
7. Catat domain final dan deployment instructions di dokumen ini.

### Priority 1 — Security dan reliability hardening

1. Tambahkan pagination cursor untuk admin dan Wish Inbox.
2. Tambahkan admin/API rate-limit di layer Cloudflare.
3. Vendor QR library ke asset lokal.
4. Tambahkan cleanup media orphan.
5. Tambahkan CSP dan security headers production.
6. Buat prosedur backup/export KV dan R2.
7. Buat strategi secret rotation/versioning.
8. Pertimbangkan audit log untuk create/publish/archive/delete.

### Priority 2 — Studio UX

1. Tambahkan upload progress yang lebih nyata.
2. Tambahkan crop/reposition foto.
3. Tambahkan preview audio duration dan error detail.
4. Tambahkan status per-step yang berasal dari validasi aktual.
5. Tambahkan pagination/empty/error/retry Wish Inbox yang lebih lengkap.
6. Tambahkan konfirmasi sebelum keluar ketika upload/save masih berlangsung.
7. Audit accessibility dengan keyboard dan screen reader.

### Priority 3 — Pakasir integration

1. Baca implementasi Pakasir dari service aslinya tanpa mengubah scope terlebih dahulu.
2. Tentukan event pembayaran final yang terpercaya.
3. Gunakan invoice/order ID sebagai idempotency key.
4. Panggil `/api/internal/projects` server-to-server atau Cloudflare Service Binding.
5. Simpan respons `projectId`, `studioUrl`, dan `giftUrl` pada record order.
6. Tampilkan/kirim Studio magic link hanya sesudah pembayaran valid.
7. Uji retry webhook dan duplicate delivery.
8. Rotasi credentials lama yang pernah tersimpan pada konfigurasi gateway.

### Priority 4 — Product scale

1. Tambahkan template versioning/migration.
2. Tambahkan lifecycle policy R2.
3. Tambahkan observability dan alerting.
4. Tambahkan custom domain media dan cache strategy.
5. Evaluasi database/query index jika project volume tidak lagi cocok untuk KV list.

---

## 17. Acceptance Criteria untuk Release Pertama

Release pertama dianggap siap dijual jika seluruh kondisi berikut terpenuhi di production:

- Admin dapat login tanpa secret bocor ke bundle/network selain request Authorization ke Worker.
- Admin dapat membuat project dan mendapat magic link yang valid.
- Customer dapat refresh Studio tanpa kehilangan token pada session yang sama.
- Draft tersimpan setelah edit.
- Minimal satu foto dapat dikompresi dan di-upload.
- MP3 dapat di-upload dan diputar dari gift.
- Project incomplete tidak dapat dipublish.
- Gift draft tidak dapat diakses publik.
- Gift published dapat dibuka dari mobile.
- QR hasil download dapat discan dan membuka project yang benar.
- Wish 3–280 karakter tersimpan utuh termasuk line break dan karakter khusus.
- Wish Inbox tidak ada di payload publik.
- Project published dapat diedit ulang.
- Archive memblokir gift dan Studio.
- Restore mengembalikan status sebelumnya.
- Permanent delete membersihkan project, wishes, rate keys, idempotency mapping, serta seluruh media R2.
- Retry pembuatan dengan idempotency key sama tidak membuat project kedua.
- Semua automated tests tetap lulus.

---

## 18. Rules untuk Agent Berikutnya

1. Tetap bekerja hanya di `snoopy-gift-standalone` kecuali user memperluas scope secara eksplisit.
2. Jangan masukkan data customer tertentu ke production fallback.
3. Jangan commit Worker secret, admin secret, token, atau credential Pakasir.
4. Jangan mengubah schema tanpa menaikkan `schemaVersion` dan menyiapkan migrasi.
5. Jika mengubah schema/validation, sinkronkan `shared/project.js` dan `worker/src/project.js`.
6. Jika menambah endpoint, update tests, `worker/README.md`, dan tabel API pada dokumen ini.
7. Gunakan archive sebelum permanent delete pada data nyata.
8. Jangan mengirim `ADMIN_SECRET` atau `INTERNAL_GENERATOR_SECRET` ke customer browser.
9. Jangan mengganti derivasi token tanpa mempertimbangkan semua magic link yang sudah beredar.
10. Jalankan `npm run check` setelah setiap perubahan material.
11. Untuk perubahan visual, uji desktop dan mobile, termasuk overflow dan interaksi nyata.
12. Untuk perubahan Worker, uji unauthorized, invalid payload, success path, cleanup, dan CORS.
13. Perbarui bagian Status, Known Limitations, dan What Comes Next saat milestone selesai.

---

## 19. Quick Handoff Commands

Dari root `snoopy-gift-standalone`:

```text
npm start
npm run check
```

Dari `snoopy-gift-standalone/worker`:

```text
npm install
npm run dev
npm run deploy
npm run tail
```

Health check production:

```text
GET {WORKER_BASE_URL}/api/health
```

Halaman utama:

```text
/gift/:projectId
/studio/:projectId#token=:magicToken
/admin
```

---

## 20. Ringkasan untuk Agent yang Baru Masuk

Project ini sekarang merupakan platform kecil dengan template gift dinamis, Studio self-edit, admin generator, Cloudflare Worker, KV Wish Inbox, R2 media storage, dan QR generator. Seluruh fixture memakai data generik tanpa data customer. Implementasi lokal serta automated test sudah selesai. Pekerjaan terpenting berikutnya adalah deployment nyata, production smoke test, security hardening, lalu integrasi Pakasir melalui endpoint internal yang sudah tersedia.

Jangan membangun ulang arsitektur dari nol. Lanjutkan dari kontrak dan endpoint yang ada, perbaiki limitation secara bertahap, dan jaga agar data customer tetap dinamis serta private state tidak pernah masuk ke gift publik.
