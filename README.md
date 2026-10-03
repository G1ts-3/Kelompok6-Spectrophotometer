# UV–Vis Lab

Halaman tunggal untuk menjelajahi spektrofotometer UV–Vis. Model 3D dibuat ulang mengikuti bentuk umum instrumen pada foto acuan: bodi putih lebar, ventilasi belakang kiri, tutup ruang sampel gelap, tombol daya di depan kiri, kabel data di belakang, dan **dua** posisi kuvet yang berbaris depan-belakang (merah di belakang untuk blanko aquades, abu di depan untuk sampel). Dua berkas cahaya sejajar melintas dari monokromator ke detektor menembus kedua kuvet. Bentuknya disederhanakan untuk pembelajaran, bukan replika teknik pabrikan.

## Menjalankan

Tidak perlu proses build atau framework. Jalankan server statis dari direktori ini:

```sh
python3 -m http.server 8000
```

Buka `http://localhost:8000`. Untuk GitHub Pages, unggah isi direktori ke cabang yang dipakai Pages; `index.html` dan semua aset memakai path relatif. Koneksi internet diperlukan untuk `<model-viewer>` dari jsDelivr dan Google Fonts.

## Perubahan terbaru

- **Layout sesuai sketsa**: Isi kuvet | Model 3D | UCP | CPU | Komputer, tersambung kabel. UCP dan CPU lebih pendek dari model, CPU sedikit lebih tinggi dari UCP.
- **Isi kuvet** pindah ke kolom kiri (grid 3 kolom, rapi). Memilih larutan menjalankan animasi: botol terangkat dari rak, terbang ke kuvet depan, miring dan menuang, cairan di kuvet 3D naik perlahan, lalu botol kembali. Kuvet lama dikosongkan dulu. Zero dan pergantian otomatis ke larutan berikutnya juga mengisi/mengosongkan kuvet dengan animasi.
- **Warna larutan**: aquades, standar tiamin, sampel tablet, kafein, asam benzoat, dan asam salisilat tak berwarna (digambar bening dengan semburat biru muda agar terlihat). Larutan lain mengikuti warna aslinya.
- Judul kurva: **Kurva Kalibrasi Deret Standar Thiamin**. Persamaan regresi (y = mx + b, R²) ditempel pada titik 15 ppm di grafik.
- **Rumus di bawah layar monitor** muncul setelah scan: A = −log T, T = 10^(−A), %T = T × 100, Lambert–Beer, regresi, dan konsentrasi sampel C = (A − b)/m.

- **Animasi scanning** (Zero dan Mulai scan): kamera zoom ke ruang kuvet, tutup gelap berubah menjadi kaca asap tembus pandang, lalu berkas cahaya menyapu panjang gelombang (HUD di atas model menampilkan nm dan progres). Berkas kuvet depan meredup mengikuti serapan larutan, dan grafik spektrum tergambar bertahap di monitor. Setelah selesai, tutup kembali gelap dan kamera kembali ke sudut semula.
- **Rumus** kini berada di paling bawah isi layar monitor (ikut scroll), bukan menempel.

## Eksplorasi

- Seret untuk memutar alat, scroll untuk zoom, atau pilih **Kenali bagian** untuk tujuh titik anotasi (kamera dan titik kuvet mengikuti susunan belakang/depan). Tombol `↺` mengembalikan kamera.
- **Buka tutup** menunjukkan dua kuvet; pemilihan larutan mengubah isi kuvet abu (depan). Sakelar instrumen berada di depan kiri model dan tersedia juga sebagai tombol kecil di bawah model. Monitor punya tombol daya sendiri.
- Di layar komputer, tekan **Zero · blanko–blanko**, lalu **Mulai scan**. Zero memasang aquades di kuvet belakang dan depan, mengukur baseline, lalu memasukkan larutan berikutnya ke kuvet depan. Tutup menutup sebelum proses optik dimulai.
- **Urutan otomatis**: standar berjalan 0, 5, 10, 15, 20, 25 ppm, dan Presisi 1 sampai 5 lalu Akurasi. Begitu satu larutan selesai, larutan berikutnya otomatis masuk kuvet depan (kuvet belakang tetap aquades), jadi tidak ada yang terlompat. **Ganti kelompok** (standar, presisi, larutan lain) selalu menuntut **Zero blanko–blanko** lagi sebelum scan.
- Komputer tersambung ke instrumen lewat dua unit: **UCP** (pengendali alat spektrofotometer) dan **CPU** (komputer yang menjalankan software).
- Rentang UV, Vis, atau penuh dapat dipilih. Klik atau geser penunjuk pada kurva untuk membaca Abs atau %T pada panjang gelombang tertentu.
- Scan standar untuk membentuk **Kurva kalibrasi** pada 246 nm (tab Kurva kalibrasi). Riwayat tersimpan di `localStorage` browser dan dapat dibuka lagi tanpa mengubah isi kuvet.
- Baki berisi aquades, enam standar, Presisi 1 sampai 5, Akurasi, dan 30 larutan tambahan untuk eksplorasi spektrum.

**Data kurva dan angka adalah simulasi pedagogis**, dengan puncak Gaussian dan variasi fotometrik kecil; tidak dapat dipakai sebagai hasil analisis laboratorium.

## Berkas

- `index.html` — struktur halaman dan `<model-viewer>`.
- `styles.css` — desain responsif biru muda, kaca, dan workstation.
- `app.js` — interaksi viewer, tutup, perangkat lunak, grafik, dan riwayat.
- `sim-core.js` — data larutan, spektrum, transmitansi, dan regresi linear.
- `spectrophotometer.glb` — model siap pakai.
- `build_model.py` — sumber prosedural model; `python3 build_model.py` membuat ulang GLB tanpa dependensi tambahan.
