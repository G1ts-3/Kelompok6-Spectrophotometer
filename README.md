# UV–Vis Lab

Aplikasi satu halaman untuk mengeksplorasi spektrofotometer UV–Vis, mengganti dua kuvet pada model 3D, dan melihat spektrum serta kurva kalibrasi di komputer simulasi. Semua aset aplikasi memakai path relatif; dapat diunggah langsung ke GitHub Pages.

## Menjalankan

Jalankan server statis dari folder ini, misalnya `python3 -m http.server 8000`, lalu buka `http://localhost:8000`. Koneksi internet diperlukan untuk Google `<model-viewer>` dari jsDelivr dan Google Fonts. `spectrophotometer.glb` sudah jadi; `python3 build_model.py` dapat membuat ulang GLB tanpa pustaka tambahan.

## Dua kuvet dan alur kerja

- Rak **merah belakang** berisi kuvet blanko aquades. Memilih Aquades akan mengangkat lalu memasang kuvet pada rak ini, tanpa mengubah kuvet depan.
- Rak **abu depan** berisi kuvet standar atau sampel yang dipilih. Kuvet lama terangkat lurus dari rak, dibawa keluar, dan kuvet berisi larutan baru diturunkan ke rak. Kamera tidak otomatis zoom ketika memilih larutan. Setiap standar dan setiap ulangan sampel muncul dalam **dua seri** sehingga, misalnya, 0 ppm punya dua pilihan dengan ABS berbeda.
- Nyalakan **UPS → alat → PCU**. Monitor mengikuti daya PCU tanpa tombol terpisah. Urutan itu dikunci. Untuk mematikan, tutup software dahulu, lalu **shutdown PCU → alat → UPS**; urutan yang salah ditolak.
- Setelah membuka software, layar monitor lebih dulu meminta memilih **Seri 1** (Standar/Sampel 1) atau **Seri 2** (Standar/Sampel 2). λmaks **tidak diketik**: tekan **START scan λmaks** dan alat memindai 200–400 nm; kurva Abs (sumbu Y) terhadap panjang gelombang (sumbu X) digambar, lalu puncak tertinggi data menjadi λmaks (seri 1 otomatis 246,5 nm, seri 2 248,0 nm) dan dipasang untuk pengukuran. Pemindaian memakai standar 25 ppm (dipasang otomatis bila kuvet depan bukan standar), lalu Standar 0 ppm dipasang kembali. Klik **Cari λmaks** untuk memindai ulang; berpindah seri lewat baki larutan atau menutup lalu membuka software kembali. Setiap seri meminta Zero blanko ulang.
- Pilih standar 0 ppm atau sampel. Tekan **01 Zero blanko**: alat memasang aquades sementara di kedua posisi, membaca referensi, lalu mengembalikan kuvet terpilih ke depan. Tekan **02 START ukur**. Deret standar 0–25 ppm dan sampel terpasang berurutan. Kurva kalibrasi menggunakan regresi linear dengan syarat R² ≥ 0,9500.
- Saat sampel dipilih, masukkan **bobot positif berapa pun** dalam gram pada layar komputer. Nilai awal dari workbook dapat diganti, tanpa pembatas empat angka desimal; koma dan titik diterima. Bobot tersimpan per seri dan per sampel pada browser. Setiap riwayat scan menyimpan bobot yang benar-benar digunakan; mengubah bobot kemudian tidak mengubah hasil lama.
- Untuk Presisi 1–5 dan Akurasi bawaan, kolom **Abs input manual** bersifat opsional. Kosong berarti memakai angka sheet Excel tanpa mengubahnya; jika diisi, angka itu menjadi Abs pada λ seri yang aktif. Input manual menerima angka nonnegatif dengan koma atau titik, mempertahankan digit yang diketik pada hasil dan riwayat, serta diberi label **input manual**. Kurva di sekitar titik tersebut tetap ilustrasi, bukan data spektrum alat.
- Saat Zero dan START ukur, panel progres memperlihatkan sumber cahaya → monokromator → blanko dan sampel → detektor → hasil, selaras dengan animasi pada model. Tutup ruang sampel dikendalikan oleh klip `LidMotion` dengan pose terakhir yang ditahan.
- Buka tab **Spektrum**, **Kurva kalibrasi**, atau **Riwayat** pada monitor. Riwayat tersimpan di browser; hasil dari data lama tetap bisa dilihat dan ditandai sebagai simulasi lama. Daftar 30 larutan tambahan telah dihapus.

## Data praktikum

Label aplikasi **Standar/Sampel 1** dan **Standar/Sampel 2** masing-masing memakai sheet sumber `Kadar Thiamin` dan `Kadar Thiamin Jena` dalam workbook terlampir. Di baki, labelnya menjadi **Standar 1/2** pada deret standar dan **Sampel 1/2** pada deret sampel. Nama sheet sumber tetap dicatat di tabel agar asal nilai Abs dapat diperiksa. Saat kuvet dipilih, sumber data mengikuti seri itu; λ diketik langsung oleh pengguna pada komputer. Nilai absorbansi pada titik baca disamakan dengan workbook:

| Sheet | λmaks di Excel dan aplikasi | Standar (ppm) | Abs standar | Abs Presisi 1–5 | Abs Akurasi |
| --- | ---: | --- | --- | --- | ---: |
| Kadar Thiamin | 246,5 nm | 0, 5, 10, 15, 20, 25 | 0,002; 0,212; 0,402; 0,620; 0,811; 1,035 | 0,672; 0,664; 0,575; 0,609; 0,584 | 0,864 |
| Kadar Thiamin Jena | 248,0 nm | 0, 5, 10, 15, 20, 25 | 0,0029; 0,2032; 0,3541; 0,5373; 0,6999; 0,8788 | 1,2434; 1,1572; 1,0936; 1,0851; 1,1759 | 1,2986 |

Regresi memakai absorbansi standar yang sudah di-scan: `A = mC + b`, `C = (A − b)/m`. Untuk sampel, panel rumus mengikuti sel workbook: volume labu 100 mL, kadar dalam mg/kg = `C × 100 / bobot sampel (g)`, kadar per tablet = `mg/kg × 0,1778 / 1000`. Bobot masing-masing ulangan berasal dari workbook dan dapat diubah untuk scan berikutnya. Hasil riwayat menyimpan bobot saat scan berlangsung.

Bobot sampel juga mengikuti sel Excel. Untuk seri 246,5 nm, Presisi 1–5 berturut-turut 0,0053; 0,0051; 0,0050; 0,0050; 0,0051 g, dan Akurasi 0,0057 g. Untuk seri 248,0 nm, Presisi 1–5 berturut-turut 0,0100; 0,0100; 0,0100; 0,0100; 0,0104 g, dan Akurasi 0,0100 g. Bobot tampak di kartu hasil dan tabel **Deret sampel** pada tab Kurva kalibrasi; Abs masuk ke tabel setelah larutan di-scan. Riwayat menyimpan bobot dan Abs tiap scan. Penghitungan persentase presisi/akurasi belum ditampilkan karena permintaan ini hanya menetapkan pasangan bobot dan Abs, bukan kriteria atau konsentrasi acuan untuk recovery.

Bentuk spektrum di luar satu titik λmaks dihasilkan dengan kurva Gaussian untuk pembelajaran. Ia **bukan** data spektrum hasil alat dan tidak boleh dipakai sebagai angka analitik. Workbook sumber disertakan dalam folder `data/` tanpa mengubah sheet aslinya.

Penyiapan dan pembilasan larutan/kuvet, pencatatan log book, nama operator dan berkas instrumen asli, melepas kabel selain kabel UPS, merapikan area, serta mengeringkan kuvet dengan prosedur laboratorium ditampilkan sebagai informasi. Aplikasi hanya mengilustrasikan operasi dan menyimpan riwayat simulasi di browser; ia tidak mengendalikan instrumen fisik atau membuat berkas data alat.

## Berkas

- `index.html` — halaman dan panel perangkat lunak.
- `styles.css` — tampilan responsif.
- `app.js` — interaksi 3D, pergantian kuvet, pengukuran, grafik, riwayat.
- `sim-core.js` — data praktikum dan fungsi spektrum/regresi.
- `spectrophotometer.glb` — model dua kuvet siap pakai.
- `build_model.py` — pembuat GLB prosedural.
- `data/` — workbook sumber asli.
- `tests/revision.test.cjs` — pemeriksaan perpindahan otomatis antarseri lewat λ, bobot bebas, Abs workbook dan manual, sampel tambahan, kurva, progres, riwayat, siklus tutup, dan alur daya; jalankan `node tests/revision.test.cjs`. `node lid_regression.cjs` menjalankan rangkaian pemeriksaan yang sama.

## Mode transparan saat pengukuran

Begitu Zero blanko, START ukur, atau scan λmaks dimulai, tutup dan rumah monokromator menjadi transparan dan kamera turun ke ruang kuvet. Proses di dalam alat mengikuti diagram acuan, berurutan dari kiri ke kanan dan diberi nomor pada model: **1 Source** (lampu, cahaya putih menyebar) → **2 Condenser** (lensa cembung menyejajarkan berkas) → **3 Monochromator** (prisma menguraikan spektrum) → **4 Slit** (hanya satu λ yang lolos) → **5 Sample Holder** (I₀ masuk, Iₜ keluar dari kuvet) → **6 Detector** (layar merah menampilkan angka Abs secara langsung). Nomor yang sedang berperan menyala kuning bergantian. `build_model.py` menambahkan kondensor, berkas menyebar dan sejajar, serta layar detektor; jalankan ulang bila model diubah.

## Perbaikan scan λmaks dan mode tampilan
- Scan λmaks kini mengikuti instruksi kerja: aquades di kedua kuvet → Zero & Baseline (garis dasar) → ganti ke Standar 25 ppm → START scan 400→200 nm, puncak kurva = λmaks (Seri 1: 246,5 nm; Seri 2: 248,0 nm).
- Grafik otomatis tergulir ke tampilan saat alat bekerja, sehingga kurva terlihat selama scan.
- Sorotan langkah 1 sampai 6 bergerak kiri ke kanan; penomoran dibuat zigzag agar tidak bertumpuk.
- Saklar "Transparan" di pojok kiri atas model 3D: mati = tampilan alat biasa; menyala = cangkang jadi kaca tipis seperti gambar potongan brosur, sehingga lampu, cermin, monokromator, chopper, dan jalur cahaya di dalam terlihat. Saat mengukur, badan alat tetap otomatis transparan sementara.
- Isi alat pada mode Transparan dibuat jauh lebih rinci mengikuti gambar cutaway brosur: lampu deuterium dan tungsten dengan reflektor dan lensa, cermin datar dan cekung, celah masuk/keluar, pra-monokromator, monokromator dengan kisi, chopper ganda bermotor, jalur merah berpanah, berkas merah melintasi kuvet, modul detektor (cermin pengumpul + tabung PMT), motor, rel berskrup emas, papan elektronik, catu daya, dan kipas.
- Saat mengukur dalam mode Transparan, kamera hanya mundur sedikit sehingga seluruh alat tetap terlihat.

## Saklar Transparan (diperbarui)
- Saklar di pojok kiri atas model 3D (default aktif). Alat selalu tampil biasa saat diam.
- Aktif: begitu Zero, Baseline, START ukur, atau scan λmaks berjalan, kamera mundur, badan alat menjadi transparan dengan garis tepi biru, dan isi alat beranimasi: bola cahaya mengalir sepanjang jalur merah (lampu, cermin, pra-monokromator, monokromator, chopper, optik bawah, detektor), chopper dan roda gigi berputar, kisi bergoyang, kipas berputar, ditambah animasi diagram proses 1 sampai 6.
- Mati: saat scan alat tetap tampil biasa (tutup menutup, grafik berjalan) tanpa transparansi.
- Isi alat ditambah detail: ruang optik bawah (laras lensa, cermin datar dan cekung), menara lampu, kolom penyangga, kipas berbilah, roda gigi, dan garis tepi biru.

## Pembaruan: callout brosur, Jeda, panel tampilan
- Nomor 1 sampai 9 di model transparan mengikuti sembilan callout brosur Cary 100/300 (biaya kepemilikan rendah, premonokromator, tanpa pergeseran puncak, celah variabel, kompartemen sampel besar, optik berlapis kuarsa, pilihan mode, pengendali aksesori, desain optik unggul). Saat dijeda, klik nomor untuk membaca penjelasan dan zoom otomatis ke bagiannya.
- Tombol Jeda/Lanjut di samping "Kenali bagian" (muncul saat animasi transparan berjalan) membekukan animasi, grafik, dan jam proses.
- Panel kanan (hanya muncul saat dijeda): Putar/Geser, tombol panah, zoom plus/minus. Tahan tombol untuk bergerak terus; ↺ mengembalikan sudut pandang.
- Isi alat disusun ulang: lampu, lensa besar, cermin datar/cekung, pra-monokromator, monokromator, chopper ganda, batang pemandu, kluster cermin, jalur turun ke modul detektor (cermin cekung hitam + tabung PMT), serta bola cahaya yang mengalir di sepanjang jalur merah.
