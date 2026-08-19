# Snoopy Gift Cloudflare Worker

## Bindings

- `GIFT_KV`: config project, idempotency mapping, wish inbox, dan rate counter.
- `MEDIA_BUCKET`: foto serta MP3 customer.

Ganti namespace ID, bucket, origin, dan public URL pada `wrangler.toml`. `MEDIA_BASE_URL` harus mengarah ke custom domain atau public development URL bucket R2.

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
npx wrangler r2 bucket create snoopy-gift-media
```

Masukkan ID KV hasil perintah pertama ke `wrangler.toml`, lalu jalankan `npm run deploy` dari folder `worker`.

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
