# Birthday Gift Studio

Frontend Vanilla HTML, CSS, dan JavaScript untuk gift page dinamis serta studio customer tujuh langkah. Backend production berada di `worker/` dan memakai Cloudflare KV serta R2.

## Local development

```text
npm start
```

Buka:

- Landing page: `http://localhost:3000/`
- Gift demo: `http://localhost:3000/gift/sample-demo?mock=1`
- Studio demo: `http://localhost:3000/studio/sample-demo?mock=1#token=demo-token`
- Admin dashboard: `http://localhost:3000/admin`

Magic token dipindahkan dari URL fragment ke `sessionStorage` saat studio dibuka. Mock draft dan wish disimpan di `localStorage`. Perilaku ini hanya aktif pada localhost dan tidak menjadi fallback production.

Saat dashboard admin dibuka dari localhost, magic link Studio menggunakan `/studio/index.html?project=:id#token=...` dan link gift menggunakan `/gift/index.html?project=:id`. Format file-plus-query ini tetap bekerja pada Live Server dan static server sederhana yang tidak mendukung deep-link rewrite. Origin serta port mengikuti `location.origin`; project ID dan token dari Worker tetap dipertahankan. Pada domain production, URL cantik dari Worker tidak diubah.

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

## Landing page

Root `index.html` menampilkan landing page statis satu layar dengan stylesheet dari folder `landing/`. Halaman ini tidak memuat gift runtime atau API dan mengarahkan CTA utama ke `https://for-you-always.my.id/`. Gift shell fisik berada di `gift/index.html`, sehingga root tetap benar saat dibuka melalui Live Server yang tidak membaca rewrite Vercel.

Media customer menggunakan bucket R2 For You Always yang sudah ada dan CDN `https://cdn.for-you-always.my.id`. Isi `bucket_name` dengan nama bucket Cloudflare aslinya; jangan membuat bucket baru hanya untuk Snoopy. File tetap terisolasi dalam prefix `snoopy/{projectId}/`.

## Admin dashboard

Halaman `/admin` memakai `ADMIN_SECRET` yang hanya disimpan sementara di `sessionStorage`. Dashboard menyediakan statistik, pencarian dan filter status, pembuatan project manual/gratis, magic link studio, link gift, archive/restore, serta penghapusan permanen dengan konfirmasi project ID.

Penghapusan permanen turut membersihkan config project, wish inbox, idempotency mapping, rate counter, dan seluruh media project di R2.

## Dynamic project contract

Customer content menggunakan schema version 3 dengan `themeId` serta bagian `identity`, `warmWish`, `galleryRoom`, `gallery`, `music`, `letter`, dan `settings`. Nilai `themeId` yang didukung adalah `snoopy` dan `dubu-duu`. Project schema v2, project tanpa tema, atau nilai tema yang tidak dikenal otomatis dinormalisasi ke `snoopy`, tanpa migrasi KV manual. `galleryRoom` menyimpan judul serta deskripsi halaman media yang dapat dinamai customer. Schema lama dengan satu lagu tetap dimigrasikan otomatis saat dibaca. Gift publik mengambil data dari `GET /api/gift/:id`; studio menggunakan endpoint `/api/studio/:id`, `/api/upload`, dan `/api/wishes/:id` melalui adapter bersama.

Manifest tema berada di `shared/project.js`. Snoopy memakai aset lokal di `assets/gifs/`, sementara tujuh aset Dubu & Dudu berada di `assets/themes/dubu-duu/` dan dipetakan ke sepuluh slot pengalaman. Renderer tetap menyediakan placeholder netral jika suatu aset dilepas dan tidak pernah fallback ke Snoopy. Data penerima, pengirim, tanggal, ucapan, galeri, lagu, dan surat tidak berubah ketika tema diganti.

Galeri menerima maksimal 15 media: JPG, PNG, dan WEBP maksimal 8 MB sebelum kompresi, serta MP4, WEBM, atau MOV maksimal 20 MB. Video disimpan di R2 dan tampil autoplay, loop, muted, serta playsinline. Generator QR menyediakan empat palet dan mempertahankan QR standar di tengah pola hati dekoratif agar tetap mudah dipindai.

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
