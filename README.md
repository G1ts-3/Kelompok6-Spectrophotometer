# UV–Vis Lab

Halaman tunggal untuk menjelajahi spektrofotometer UV–Vis. Model 3D dibuat ulang mengikuti bentuk umum instrumen pada foto acuan: bodi putih lebar, ventilasi belakang kiri, tutup ruang sampel gelap, tombol daya di depan kiri, kabel data di belakang, dan **dua** posisi kuvet yang berbaris depan-belakang (merah di belakang untuk blanko aquades, abu di depan untuk sampel). Jalur ilustrasi bergerak dari **kanan ke kiri**: sumber cahaya, monokromator, dua kuvet, lalu detektor. Kedua kuvet dilalui berkas pada panjang gelombang terpilih yang sama. Bentuknya disederhanakan untuk pembelajaran, bukan replika teknik pabrikan.

## Menjalankan

Tidak perlu proses build atau framework. Jalankan server statis dari direktori ini:

```sh
python3 -m http.server 8000
```

Buka `http://localhost:8000`. Untuk GitHub Pages, unggah isi direktori ke cabang yang dipakai Pages; `index.html` dan semua aset memakai path relatif. Koneksi internet diperlukan untuk `<model-viewer>` dari jsDelivr dan Google Fonts.

## Perubahan terbaru

- **Layout sesuai sketsa**: Isi kuvet | Model 3D | UCP | CPU | Komputer, tersambung kabel. UCP dan CPU lebih pendek dari model, CPU sedikit lebih tinggi dari UCP.
- **Isi kuvet** pindah ke kolom kiri (grid 3 kolom, rapi). Memilih larutan membuat kamera mendekat ke kedua kuvet, lalu botol terangkat dari rak, terbang ke kuvet depan, miring dan menuang; cairan di kuvet 3D naik perlahan dan botol kembali. Sesudahnya kamera kembali ke sudut semula. Kuvet lama dikosongkan dulu. Zero dan pergantian otomatis ke larutan berikutnya juga memakai animasi isi/kosong dan zoom kamera.
- **Warna larutan**: aquades, standar tiamin, sampel tablet, kafein, asam benzoat, dan asam salisilat tak berwarna (digambar bening dengan semburat biru muda agar terlihat). Larutan lain mengikuti warna aslinya.
- Judul kurva: **Kurva Kalibrasi Deret Standar Thiamin**. Persamaan regresi (y = mx + b, R²) ditempel pada titik 15 ppm di grafik.
- **Rumus di bawah layar monitor** muncul setelah scan: A = −log T, T = 10^(−A), %T = T × 100, Lambert–Beer, regresi, dan konsentrasi sampel C = (A − b)/m.

- **Animasi scanning** (Zero + baseline dan Mulai scan): kamera mendekat secukupnya agar kedua kuvet dan ruang sampel tetap masuk bingkai. Tutup gelap menjadi tembus pandang. Di sisi kanan tampak cahaya putih sebelum monokromator; sesudah pemilihan panjang gelombang, dua berkas berwarna sama melintasi kuvet belakang dan depan ke detektor di sisi kiri. Berkas kuvet depan meredup mengikuti serapan larutan, dan grafik tergambar bertahap di monitor. Setelah selesai, jalur ilustrasi menghilang, tutup kembali gelap, dan kamera kembali ke sudut semula.
- **Kamera scan** menyesuaikan rasio panggung agar seluruh ruang sampel terbaca di desktop maupun ponsel. Hanya ada **satu warna pada suatu waktu** mengikuti panjang gelombang yang sedang disapu; UV yang tidak kasatmata digambar ungu-biru sebagai penanda visual. Di ruang kuvet tidak ada kipas pelangi; spektrum kecil hanya tampak di dalam monokromator. Rumus tidak ditampilkan di tab Riwayat.
- **Animasi tutup** memakai klip dengan pose terbuka yang ditahan sampai akhir; posisi buka/tutup dikendalikan langsung sehingga pembacaan berulang tidak memantulkan tutup kembali ke posisi tertutup.
- **Rumus** kini berada di paling bawah isi layar monitor (ikut scroll), bukan menempel.

- **Scanning dibuat lebih realistis** (mengacu pada foto instrumen dan diagram sumber → monokromator → beam splitter → blanko/sampel → detektor): lampu menyala dengan halo (deuterium untuk UV di bawah 350 nm, tungsten-halogen untuk visibel; nama lampu tampil di bar atas), berkas putih masuk ke prisma di dalam monokromator (rumah monokromator menjadi kaca asap), prisma menguraikan spektrum kecil 7 warna dengan pita terpilih menyala, lalu pembagi berkas membagi cahaya satu warna ke jalur blanko dan sampel. Tiap jalur berupa inti terang + halo lembut, melewati lensa, kuvet berpendar halus, dan pulsa foton bergerak ke arah detektor (meredup di jalur sampel sesuai serapan). Panah lama diganti pulsa foton.
- **Animasi daya UCP dan CPU**: UCP menyala bersama tombol alat, CPU bersama tombol daya monitor/komputer. Saat dinyalakan, LED berkedip kuning dua kali lalu hijau, garis ventilasi menyala bergantian, dan kabel menyalurkan denyut sinyal; saat dimatikan, LED meredup dan unit menggelap.

- **Urutan di dalam monokromator diperbaiki** sesuai diagram: cahaya putih → prisma → pelangi 7 warna → **celah keluar** (dua pelat gelap) → satu berkas satu warna → pembagi berkas → jalur blanko dan sampel. Pelangi berputar di sekitar ujung prisma mengikuti panjang gelombang, sehingga hanya pita yang dipilih yang lolos melewati celah; pita lain terhalang pelat.
- **Tata letak tetap**: panel Isi kuvet kini bergulir di dalamnya sendiri dan tidak lagi memengaruhi tinggi baris. Memilih larutan dari Deret sampel (yang memunculkan panel Bobot sampel) tidak lagi membuat panggung dan alat berubah ukuran.

- **Celah (slit) diperjelas**: sesudah pelangi kini ada dua pelat hitam pekat yang tinggi dan lebar (seperti diagram acuan) dengan celah sempit di tengah dan tepi terang. Hanya pita warna yang jatuh pada celah yang lolos menjadi satu berkas; pita lain terhalang pelat. Susunan dalam monokromator kini mengikuti diagram acuan: berkas putih → prisma segitiga sama sisi abu-abu yang berdiri (puncak di atas, alas rata di bawah, seperti kuvet berdiri) dengan sisi segitiganya menghadap kotak slit hitam → pelangi yang melebar (merah di atas, violet di bawah) → celah hitam → satu berkas satu warna. Prisma dibuat ramping, dan pelangi selalu lurus dengan ujung rata menempel pada pelat slit hitam (tidak miring); pita terpilih dipilih dengan menggeser pelangi sepanjang sisi prisma sehingga tepat di celah. Rumah monokromator sedikit diperlebar agar semuanya muat berurutan.

## Eksplorasi

- Seret untuk memutar alat, scroll untuk zoom, atau pilih **Kenali bagian** untuk tujuh titik anotasi (kamera dan titik kuvet mengikuti susunan belakang/depan). Tombol `↺` mengembalikan kamera.
- **Buka tutup** menunjukkan dua kuvet; pemilihan larutan mengubah isi kuvet abu (depan). Sakelar instrumen berada di depan kiri model dan tersedia juga sebagai tombol kecil di bawah model. Monitor punya tombol daya sendiri.
- Di layar komputer, tekan **Zero + baseline**, lalu **Mulai scan**. Langkah gabungan ini memasang aquades di kedua kuvet, mengatur nol, merekam koreksi sepanjang rentang, lalu memasukkan larutan berikutnya ke kuvet depan. Tutup menutup sebelum proses optik dimulai.
- **Urutan otomatis**: standar berjalan 0, 5, 10, 15, 20, 25 ppm, dan Presisi 1 sampai 5 lalu Akurasi. Begitu satu larutan selesai, larutan berikutnya otomatis masuk kuvet depan (kuvet belakang tetap aquades), jadi tidak ada yang terlompat. **Ganti kelompok** (standar, presisi, larutan lain) selalu menuntut **Zero blanko–blanko** lagi sebelum scan.
- Komputer tersambung ke instrumen lewat dua unit: **UCP** (pengendali alat spektrofotometer) dan **CPU** (komputer yang menjalankan software).
- Rentang UV, Vis, atau penuh dapat dipilih. Klik atau geser penunjuk pada kurva untuk membaca Abs atau %T pada panjang gelombang tertentu.
- Scan sedikitnya tiga standar untuk membentuk **Kurva kalibrasi** pada 246 nm (tab Kurva kalibrasi); garis dinyatakan layak pada ilustrasi jika kemiringannya positif dan R² ≥ 0,95. Riwayat tersimpan di `localStorage` browser dan dapat dibuka lagi tanpa mengubah isi kuvet.
- Baki berisi aquades, enam standar, Presisi 1 sampai 5, Akurasi, dan 30 larutan tambahan untuk eksplorasi spektrum.

**Data kurva dan angka adalah simulasi pedagogis**, dengan puncak Gaussian dan variasi fotometrik kecil; tidak dapat dipakai sebagai hasil analisis laboratorium.

## Berkas

- `index.html` — struktur halaman dan `<model-viewer>`.
- `styles.css` — desain responsif biru muda, kaca, dan workstation.
- `app.js` — interaksi viewer, tutup, perangkat lunak, grafik, dan riwayat.
- `sim-core.js` — data larutan, spektrum, transmitansi, dan regresi linear.
- `spectrophotometer.glb` — model siap pakai.
- `build_model.py` — sumber prosedural model; `python3 build_model.py` membuat ulang GLB tanpa dependensi tambahan.
