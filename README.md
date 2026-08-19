# Snoopy Gift Studio

Frontend Vanilla HTML, CSS, dan JavaScript untuk gift page dinamis serta studio customer tujuh langkah. Backend production berada di `worker/` dan memakai Cloudflare KV serta R2.

## Local development

```text
npm start
```

Buka:

- Gift demo: `http://localhost:3000/gift/sample-demo?mock=1`
- Studio demo: `http://localhost:3000/studio/sample-demo?mock=1#token=demo-token`
- Admin dashboard: `http://localhost:3000/admin`

Magic token dipindahkan dari URL fragment ke `sessionStorage` saat studio dibuka. Mock draft dan wish disimpan di `localStorage`. Perilaku ini hanya aktif pada localhost dan tidak menjadi fallback production.

Saat dashboard admin dibuka dari localhost, magic link Studio menggunakan `/studio/index.html?project=:id#token=...` dan link gift menggunakan `/index.html?project=:id`. Format file-plus-query ini tetap bekerja pada Live Server dan static server sederhana yang tidak mendukung deep-link rewrite. Origin serta port mengikuti `location.origin`; project ID dan token dari Worker tetap dipertahankan. Pada domain production, URL cantik dari Worker tidak diubah.

## Vercel static deployment

Vercel dikunci ke preset `Other`, menjalankan `npm run build`, dan hanya mempublikasikan folder `dist`. Build tersebut menggunakan allowlist frontend sehingga `server.js`, Worker, tests, fixture development, source Markdown, dan media development lokal tidak masuk deployment.

Jangan memilih preset Express atau mengarahkan Output Directory ke root. Konfigurasi `vercel.json` sudah menetapkan Output Directory ke `dist` dan akan mengoverride pengaturan deployment berikutnya. Karena `cleanUrls` aktif, target rewrite menggunakan `/` dan `/studio` tanpa suffix `.html`.

## Production API

1. Buat KV namespace dan siapkan nama bucket R2 For You Always yang sudah ada mengikuti `worker/README.md`.
2. Isi bindings serta URL production pada `worker/wrangler.toml`.
3. Simpan tiga secret Worker menggunakan `wrangler secret put`.
4. Deploy Worker.
5. Masukkan URL Worker ke `runtime-config.js` pada `apiBaseUrl`.

Frontend kemudian mengakses Worker secara langsung. Pastikan domain Vercel sudah tercantum pada `ALLOWED_ORIGINS`.

Media customer menggunakan bucket R2 For You Always yang sudah ada dan CDN `https://cdn.for-you-always.my.id`. Isi `bucket_name` dengan nama bucket Cloudflare aslinya; jangan membuat bucket baru hanya untuk Snoopy. File tetap terisolasi dalam prefix `snoopy/{projectId}/`.

## Admin dashboard

Halaman `/admin` memakai `ADMIN_SECRET` yang hanya disimpan sementara di `sessionStorage`. Dashboard menyediakan statistik, pencarian dan filter status, pembuatan project manual/gratis, magic link studio, link gift, archive/restore, serta penghapusan permanen dengan konfirmasi project ID.

Penghapusan permanen turut membersihkan config project, wish inbox, idempotency mapping, rate counter, dan seluruh media project di R2.

## Dynamic project contract

Customer content menggunakan schema version 2 dengan bagian `identity`, `warmWish`, `gallery`, `music`, `letter`, dan `settings`. Schema v1 dengan satu lagu tetap dimigrasikan otomatis saat dibaca. Gift publik mengambil data dari `GET /api/gift/:id`; studio menggunakan endpoint `/api/studio/:id`, `/api/upload`, dan `/api/wishes/:id` melalui adapter bersama.

GIF dan visual Snoopy adalah aset tema statis. Data penerima, pengirim, tanggal, ucapan, galeri, lagu, dan surat tidak disimpan di HTML gift atau JavaScript production.

## Music catalog

Katalog berada di `assets/data/music.json`. Format yang didukung:

```json
{
  "tracks": [
    {
      "id": "song-id",
      "title": "Song title",
      "artist": "Artist",
      "coverUrl": "https://cdn.example/cover.jpg",
      "audioUrl": "https://cdn.example/song.mp3"
    }
  ]
}
```

Array langsung juga diterima. Studio menampilkan kartu katalog ber-cover, pencarian, preview audio, progress/seek, dan playlist maksimal tiga lagu. Alias lama `url`, `name`, `singer`, `src`, `audio`, dan `file` tetap dikenali. Lagu tanpa `coverUrl` menggunakan cover Snoopy bawaan.

## Checks

```text
npm run check
```

Perintah tersebut menjalankan pemeriksaan sintaks dan suite Node untuk kontrak frontend, autentikasi admin, lifecycle project, upload R2, publish, gift publik, wish inbox, archive/restore, penghapusan, CORS, serta idempotency.

Telegram tidak digunakan lagi. Wish penerima disimpan di KV dan dibaca melalui Wish Inbox studio.
