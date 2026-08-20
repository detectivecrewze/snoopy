# Dubu & Dudu theme assets

Folder ini disiapkan untuk paket karakter Dubu & Dudu. Semua aset harus disimpan lokal dan dihubungkan melalui manifest `THEMES` di `shared/project.js`.

Pemetaan aktif:

- `welcome` → `welcome.webp`
- `wishWriting` → `cozy.webp`
- `wish` → `celebrate.webp`
- `hug` → `hearts.webp`
- `cozy` → `cozy.webp`
- `memoriesLogo` → `together.webp`
- `dance` → `affection.webp`
- `letterLogo` → `goodbye.webp`
- `letter` → `together.webp`
- `finale` → `celebrate.webp`

Tujuh file dipakai untuk sepuluh slot. Pengulangan sengaja dipilih agar konteks gerakannya tetap cocok. Jika sebuah slot dilepas nanti, renderer menampilkan placeholder netral dan tidak memakai fallback Snoopy.
