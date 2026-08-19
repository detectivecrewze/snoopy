# Snoopy Gift Studio

Frontend Vanilla HTML, CSS, dan JavaScript untuk gift page dinamis serta studio customer tujuh langkah. Backend production berada di `worker/` dan memakai Cloudflare KV serta R2.

## Local development

```text
npm start
```

Buka:

- Gift demo: `http://localhost:3000/gift/cindy-demo?mock=1`
- Studio demo: `http://localhost:3000/studio/cindy-demo?mock=1#token=demo-token`
- Admin placeholder: `http://localhost:3000/admin`

Magic token dipindahkan dari URL fragment ke `sessionStorage` saat studio dibuka. Mock draft dan wish disimpan di `localStorage`. Perilaku ini hanya aktif pada localhost dan tidak menjadi fallback production.

## Production API

1. Buat KV namespace dan R2 bucket mengikuti `worker/README.md`.
2. Isi bindings serta URL production pada `worker/wrangler.toml`.
3. Simpan tiga secret Worker menggunakan `wrangler secret put`.
4. Deploy Worker.
5. Masukkan URL Worker ke `runtime-config.js` pada `apiBaseUrl`.

Frontend kemudian mengakses Worker secara langsung. Pastikan domain Vercel sudah tercantum pada `ALLOWED_ORIGINS`.

## Dynamic project contract

Customer content menggunakan schema version 1 dengan bagian `identity`, `warmWish`, `gallery`, `music`, `letter`, dan `settings`. Gift publik mengambil data dari `GET /api/gift/:id`; studio menggunakan endpoint `/api/studio/:id`, `/api/upload`, dan `/api/wishes/:id` melalui adapter bersama.

GIF dan visual Snoopy adalah aset tema statis. Data penerima, pengirim, tanggal, ucapan, galeri, lagu, dan surat tidak disimpan di HTML gift atau JavaScript production.

## Music catalog

Katalog berada di `assets/data/music.json`. Format yang didukung:

```json
{
  "tracks": [
    { "id": "song-id", "title": "Song title", "artist": "Artist", "url": "https://cdn.example/song.mp3" }
  ]
}
```

Array langsung juga diterima. Studio turut mengenali alias `name`, `singer`, `src`, `audio`, dan `file`.

## Checks

```text
npm run check
```

Telegram tidak digunakan lagi. Wish penerima disimpan di KV dan dibaca melalui Wish Inbox studio.
