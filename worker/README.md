# Snoopy Gift Cloudflare Worker

## Bindings

- `GIFT_KV`: config project, idempotency mapping, wish inbox, dan rate counter.
- `MEDIA_BUCKET`: foto serta MP3 customer. Binding ini boleh menunjuk ke bucket R2 For You Always yang sudah ada.

Ganti namespace ID, nama bucket, dan origin pada `wrangler.toml`. Project ini sudah diarahkan ke `https://cdn.for-you-always.my.id` melalui `MEDIA_BASE_URL`.

Gunakan nama bucket R2 yang memang terhubung ke domain CDN tersebut sebagai `bucket_name`. Jangan mengisi hostname CDN pada `bucket_name`; nilai itu harus berupa nama bucket di dashboard Cloudflare.

Semua object Snoopy terisolasi di prefix berikut:

```text
snoopy/{projectId}/photos/...
snoopy/{projectId}/audio/...
```

Permanent delete hanya membersihkan prefix `snoopy/{projectId}/`, sehingga object produk lain pada bucket yang sama tidak ikut terhapus.

## Secrets

Jangan menaruh nilai berikut di `wrangler.toml`:

```text
npx wrangler secret put PROJECT_SIGNING_SECRET
npx wrangler secret put ADMIN_SECRET
npx wrangler secret put INTERNAL_GENERATOR_SECRET
```

Ketiga secret harus berbeda. `PROJECT_SIGNING_SECRET` tidak boleh diganti setelah project dibuat karena project ID dan magic token diturunkan secara deterministik dari secret tersebut.

## Resource creation

```text
npx wrangler kv namespace create GIFT_KV
```

Karena media memakai bucket For You Always yang sudah ada, tidak perlu menjalankan perintah pembuatan bucket baru. Masukkan ID KV dan nama bucket lama ke `wrangler.toml`, lalu jalankan `npm run deploy` dari folder `worker`.

## Initial project creation

Endpoint internal menggunakan idempotency key. Request yang dikirim ulang dengan kombinasi `source` dan `idempotencyKey` sama akan mengembalikan project ID dan magic link yang sama.

```text
POST /api/internal/projects
Authorization: Bearer INTERNAL_GENERATOR_SECRET
Content-Type: application/json

{
  "source": "manual",
  "idempotencyKey": "manual-order-001"
}
```

Respons berisi `projectId`, `giftUrl`, dan `studioUrl` dengan magic token pada URL fragment.

## Admin endpoints

Seluruh endpoint berikut memakai `Authorization: Bearer ADMIN_SECRET`:

- `GET /api/admin/projects` untuk daftar, statistik, pencarian, dan filter status.
- `POST /api/admin/projects` untuk membuat project manual secara idempotent.
- `PATCH /api/admin/projects/:id` dengan action `archive` atau `restore`.
- `DELETE /api/admin/projects/:id` untuk menghapus project, wish, rate key, idempotency mapping, dan objek R2 terkait.

Project yang diarsipkan tidak dapat dibuka melalui gift publik maupun studio sampai dipulihkan.
