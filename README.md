# zyxcid — ukiyo

> **ukiyo** (浮世) — *"dunia melayang"*. Akar kata yang sama dengan **ukiyo-e**, seni cetak blok kayu Jepang — ruh dari estetika kertas & tinta situs ini.

Portofolio interaktif berbentuk game **platformer 3D** dengan nuansa kertas & tinta (paper-ink). Proyek-proyek dari GitHub berubah menjadi pulau kecil yang melayang di dunia ukiyo — jelajahi bebas, kumpulkan bintangnya, lompat double-jump, melesat dengan dash, dan sapa penghuni tiap pulau. Bisa dimainkan dengan **keyboard, layar sentuh, atau gamepad** (tinggal colok).

**Lingkungan mengikuti jam nyata pengunjung**: pagi, siang, sore, senja, hingga malam berbulan & berbintang — semuanya dihitung lokal di browser.

Situsnya **tanpa akun & tanpa database**. Multiplayer-nya pun opsional: hanya me-relay posisi pengunjung yang sedang online (lihat seksi *Multiplayer*), tanpa menyimpan apa pun setelah koneksi tertutup.

Dibangun dengan **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + three.js**.

## Menjalankan secara lokal

Skrip npm di proyek ini **murni cross-platform** — jalan di Windows (PowerShell/CMD), macOS, dan Linux tanpa perintah Unix khusus.

Prasyarat — pilih salah satu:

- **Node.js** ≥ 20 + npm (cara paling umum, termasuk Windows), atau
- **Bun** ≥ 1.1 (lebih cepat): <https://bun.sh>

Langkah:

```bash
# 1. masuk folder
cd ukiyo

# 2. pasang dependensi
npm install          # atau: bun install

# 3. jalankan mode pengembangan
npm run dev          # atau: bun run dev
```

Buka <http://localhost:3000> di browser (Chrome/Edge/Firefox/Safari terbaru, perlu WebGL).

Build produksi lokal:

```bash
npm run build        # next build + salin aset (Node murni, aman di Windows)
npm start            # menjalankan server standalone
```

Catatan: `npm install` juga memasang alat PartyKit (devDependency, termasuk binary `workerd` ±130 MB). Kalau tidak butuh multiplayer dan ingin instalasi ramping: `npm install --omit=dev` lalu pasang ulang dev tool (`npm i -D partykit`) saat hendak meng-deploy ruang multiplayer.

## Siklus siang–malam (jam realtime)

Warna langit, cahaya, matahari/bulan, bintang, dan kunang-kunang berubah otomatis mengikuti **jam lokal perangkat pengunjung**:

| Jam (kira-kira) | Suasana |
| --- | --- |
| 04:30–06:00 | fajar — langit peach & lavender |
| 06:00–10:00 | pagi — kertas terang |
| 10:00–15:00 | siang — cerah khas kertas (tampilan asli) |
| 15:00–17:30 | sore — keemasan |
| 17:30–19:00 | senja — coral & mauve |
| 19:00–04:30 | malam — tinta biru gelap, bulan doodle, bintang berkelip, kunang-kunang |

Chip kecil di kanan atas HUD menampilkan fase + jam saat ini. Semua dihitung di sisi klien.

**Uji coba cepat**: tambahkan `?jam=HH` atau `?jam=HH.MM` di URL, misalnya `http://localhost:3000/?jam=22` (malam penuh) atau `?jam=18.2` (senja). Parameter ini hanya memengaruhi tampilan lingkungan.

## Multiplayer — bertemu pengunjung lain (OPSIONAL)

Situs bisa menampilkan **tamu lain yang sedang membuka halaman yang sama**: burung kertas dengan syal warna acak + label nama samaran ("tamu 42"), melayang dan bergerak mengikuti posisi mereka sungguhan. Tanpa chat, tanpa akun, tanpa data yang disimpan — begitu tab ditutup, tamunya hilang.

### Cara kerja & prinsip

- Situs utama **tetap statis** (Vercel/static hosting apa pun). Yang ditambahkan hanyalah **satu koneksi WebSocket kecil** ke sebuah "ruang" (room) bernama `dunia`.
- Server ruangnya (`party/server.ts`) cuma **me-relay pesan posisi** antar pengunjung (~100 byte, ±9×/detik). Tidak ada database, tidak ada penyimpanan, tidak ada chat.
- Identitas tamu hanya hidup **di memori tab** — id acak + nama samaran. Muat ulang halaman = jadi "tamu baru". Menutup/minimalkan tab = tamunya menghilang untuk orang lain (memang begitu rancangnya: kamu hanya melihat orang yang benar-benar sedang melihat situsnya).
- **Degradasi halus**: kalau ruang tidak tersedia / host tidak diisi, game tetap jalan 100% mode solo — tanpa error, tanpa UI aneh.

### Mengaktifkan

**1. Deploy ruangnya sekali** (butuh akun PartyKit gratis):

```bash
npm run party:login    # = npx partykit login (buka browser, buat akun gratis)
npm run party:deploy   # = npx partykit deploy → cetak alamat ruangmu
```

Catat alamat yang tercetak, contoh: `ukiyo.namakamu.partykit.party`

**2. Beri tahu situs alamat itu** — dua cara:

- **Vercel (produksi):** Project → Settings → Environment Variables → tambah `NEXT_PUBLIC_PARTYKIT_HOST` = alamat ruang → deploy ulang.
- **Lokal:** salin `.env.example` jadi `.env.local`, isi `NEXT_PUBLIC_PARTYKIT_HOST=...`, jalankan `npm run dev`.

**3. Uji lokal tanpa deploy:** jalankan `npm run party:dev` (ruang lokal di `127.0.0.1:1999`), lalu isi `.env.local` dengan `NEXT_PUBLIC_PARTYKIT_HOST=127.0.0.1:1999` dan `npm run dev`. Buka situs di dua jendela browser berbeda — dua burung saling melihat.

### Hal yang perlu kamu tahu (trade-off)

- **Ini satu-satunya bagian yang tidak 100% milikmu.** Situs tetap statis, tapi relay presence-nya jalan di server PartyKit (di atas Cloudflare). Kalau layanan itu down/berubah kebijakan, multiplayer mati sementara — game tetap jalan mode solo.
- **Kuota gratis**: untuk situs personal (puluhan pengunjung serentak) longgar. Kalau trafiknya besar, kuota bisa tersentuh dan layak dipindah ke tier berbayar / self-host di Cloudflare Workers sendiri. Cek harga terkini di <https://www.partykit.io>.
- **Privasi ringan**: posisi & nama samaranmu ter-relay ke pengunjung lain (tanpa IP, tanpa identitas asli). Tidak ada teks bebas — nama otomatis — jadi tidak ada masalah moderasi/chat.
- **Presence ≠ interaksi penuh**: tamu lain tidak bisa bertabrakan/saling dorong; mereka murni "hantu" yang terlihat. Kalau nanti mau chat/interaksi, itu upgrade rancangan tersendiri.

### Mematikan

Kosongkan / hapus variabel `NEXT_PUBLIC_PARTYKIT_HOST` → situs kembali murni solo & statis.

## Deploy ke Vercel

**Cara 1 — lewat Git (disarankan):**

1. Push folder ini ke repo GitHub milikmu.
2. Buka <https://vercel.com/new>, pilih repo tadi.
3. Framework terdeteksi otomatis sebagai **Next.js** — biarkan default. (Opsional: set `NEXT_PUBLIC_PARTYKIT_HOST` seperti di seksi Multiplayer.)
4. Deploy. Selesai.

**Cara 2 — lewat CLI:**

```bash
npm i -g vercel
vercel          # deploy preview
vercel --prod   # deploy produksi
```

## Kontrol

| Aksi | Desktop | Layar sentuh |
| --- | --- | --- |
| Bergerak | `WASD` / tombol panah | joystick kiri |
| Lompat / double jump | `spasi` (tekan 2×) | tombol **lompat** (2×) |
| Dash | `shift` / `K` | tombol petir |
| Melayang pelan | tahan `spasi` saat jatuh | tahan tombol lompat |
| Kamera | seret mouse + scroll zoom | geser layar + cubit |
| Bicara dengan penghuni | `E` (saat dekat) | tombol **sapa** (muncul saat dekat) |
| Kartu kendali | `H` | tombol di kanan atas |
| Daftar pulau | tombol **pulau** | tombol **pulau** |

### Kontroler gamepad (opsional)

Colok gamepad apa pun (Xbox / PlayStation / generik) — terdeteksi otomatis, muncul toast sambutan, langsung siap main tanpa pengaturan:

| Tombol | Aksi |
| --- | --- |
| Stik kiri / D-pad | bergerak |
| A / Cross | lompat · double jump · tahan saat jatuh untuk melayang |
| B / Circle atau X / Square | dash |
| Y / Triangle | sapa penghuni |
| Stik kanan | kamera |
| Start | daftar pulau |
| Select / Back | kartu kendali |

Getaran halus ikut terasa saat lompat, dash, mendarat, dan mengumpulkan bintang — dan ikut mati bersama tombol suara.

## Mengubah dunia — panduan cepat

### 1) Data proyek & teks

- `src/lib/projects.ts` — daftar proyek (`PROJECTS`: nama, deskripsi, bahasa, URL) + kalimat penghuni (`NPC_QUOTES`). Tambah/ubah entri di sini; pulau, nomor, dan daftar ikut menyesuaikan otomatis.

### 2) Mekanisme / rasa gerakan (`src/components/game/engine.ts`)

Semua angka tuning ada di blok atas file:

| Konstanta | Nilai | Efek |
| --- | --- | --- |
| `GRAVITY` | 26 | berat lompatan — lebih kecil = melayang |
| `JUMP_V` | 10.5 | tinggi lompatan pertama |
| `DOUBLE_JUMP_V` | 9.2 | tinggi lompatan kedua |
| `SPEED` | 7.5 | kecepatan jalan |
| `GLIDE_CAP` | -4.0 | kecepatan jatuh maks saat melayang |
| `DASH_SPEED` / `DASH_TIME` | 17 / 0.16s | jarak & durasi dash |
| `DASH_COOLDOWN` | 0.75s | jeda antar dash |
| `COYOTE_TIME` | 0.12s | toleransi lompat dari tepi |
| `RESPAWN_Y` | -26 | ketinggian respawn saat jatuh |

Ubah angkanya → simpan → browser dev server akan hot-reload.

Sumber input (keyboard, mouse, sentuh, dan **gamepad**) ada di `src/components/game/input.ts` — pemetaan tombol gamepad bisa diubah di fungsi `readPad`.

### 3) Tampilan dunia

- `src/components/game/types.ts` — `PALETTE`: warna dasar paper-ink (kertas, tinta, oranye aksen).
- `src/components/game/islands.ts` — layout kepulauan: radius pulau, jarak ring, tinggi, jumlah batu loncatan.
- `src/components/game/structures.ts` — diorama di atas tiap pulau (skuter, torii, keycap, dll.) — semua dibangun dari primitif three.js.
- `src/components/game/character.ts` — penampilan burung kertas (badan, paruh, sayap, syal).
- `src/components/game/npcs.ts` — penghuni pulau (warna badan, gerak wander).
- `src/components/game/stars.ts` / `effects.ts` / `sfx.ts` — bintang koleksi, partikel, dan bunyi sintetis.
- `src/components/game/environment.ts` + `daycycle.ts` — langit, matahari/bulan, bintang, awan, kunang-kunang, dan **palet tiap jam** (ubah keyframe di `daycycle.ts`).
- `src/components/game/UkiyoWorld.tsx` — seluruh UI overlay (intro, HUD, tutorial, panel, daftar pulau).

### 4) Multiplayer

- `party/server.ts` — ruang relay (protocol, batas klien, pesan "bye"). Ubah di sini kalau mau menambahkan fitur presence baru (mis. emote).
- `src/components/game/multiplayer.ts` — sisi klien: penampilan burung kertas tamu, interpolasi, laju kirim, batas tamu. Ghost-nya bisa diganti model lain dengan bebas.
- Ruang yang dipakai semua orang: `room: "dunia"` di `multiplayer.ts` — semua pengunjung dunia yang sama saling melihat.

## Membuat model 3D secara visual (tanpa menulis geometri manual)

Semua objek di dunia ini dibangun **secara prosedural** (kotak, bola, kerucut + outline tinta). Kamu bisa juga memodelkan secara visual lalu memasukkan hasilnya ke game:

1. **Blender** (gratis, standar industri) — modelkan → ekspor **.glb/.gltf** → taruh di `public/models/` → dimuat dengan `GLTFLoader` (three.js). Beri material *toon*/*flat* + warna solid agar menyatu dengan gaya paper-ink.
2. **Spline** (<https://spline.design>) — pemodelan 3D paling ramah pemula, langsung ekspor ke web.
3. **three.js Editor** (<https://threejs.org/editor>) — editor scene resmi three.js, bisa ekspor JSON scene.
4. **MagicaVoxel** — untuk model voxel lucu, ekspor ke .obj/.gltf.

Alur umumnya: model visual → file `.glb` → loader three.js → pasang di pulau (menggantikan diorama prosedural di `structures.ts`). Jika kamu punya file `.glb`, bagikan ke asisten AI favoritmu untuk dihubungkan ke kode — perubahannya kecil dan terlokalisir.

## Struktur singkat

```
src/
├── app/                 # halaman Next.js (App Router)
├── components/
│   ├── game/            # engine + dunia 3D + UI game + multiplayer client
│   └── ui/              # komponen dasar (shadcn/ui)
├── hooks/               # helper React
└── lib/                 # data proyek & util
party/server.ts          # ruang multiplayer PartyKit (relay presence)
scripts/postbuild.mjs    # salin aset build (cross-platform)
public/                  # aset statis
```
