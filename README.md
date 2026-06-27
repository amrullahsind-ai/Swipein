# GForm → SwipeForm MVP

Admin paste link Google Form publik, app membaca pertanyaan, lalu generate link SwipeForm tanpa database. Responden mengisi lewat UI swipe-card, jawaban dikirim ke Google Form.

## Cara menjalankan

Project ini butuh serverless API untuk membaca HTML Google Form, jadi jalankan dengan Vercel CLI:

```bash
npm install
npm run dev
```

## Deploy

1. Upload folder ini ke GitHub.
2. Import ke Vercel.
3. Deploy.

Tidak perlu database.

## Cara pakai

1. Buat Google Form.
2. Pastikan form publik, tidak wajib login Google.
3. Copy link `/viewform`.
4. Paste di halaman awal app.
5. Klik convert.
6. Copy link SwipeForm yang dihasilkan.
7. Share link itu ke responden.

## Batasan MVP

Support:
- Linear scale / skala angka
- Multiple choice sederhana
- Short answer / paragraph

Belum support:
- Form wajib login Google
- Upload file
- Branching/section kompleks
- Validasi rumit
- Checkbox multi-jawaban
- Email collection wajib

## Catatan teknis

- App membaca struktur Google Form dari `FB_PUBLIC_LOAD_DATA_`.
- Submit jawaban memakai hidden iframe ke endpoint `formResponse`.
- Karena ini bukan integrasi resmi penuh Google Forms API, struktur Google Form bisa berubah sewaktu-waktu.
- Untuk produk serius, versi berikutnya sebaiknya pakai OAuth + Google Forms API resmi.
