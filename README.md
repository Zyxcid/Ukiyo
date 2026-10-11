# zyxcid — ukiyo

> **ukiyo** (浮世) — *"dunia melayang"*. Akar kata yang sama dengan **ukiyo-e**, seni cetak blok kayu Jepang — ruh dari estetika kertas & tinta situs ini.

Portofolio interaktif berbentuk game **platformer 3D** dengan nuansa kertas & tinta (paper-ink). Proyek-proyek dari GitHub berubah menjadi pulau kecil yang melayang di dunia ukiyo — jelajahi bebas, kumpulkan bintangnya, lompat double-jump, melesat dengan dash, dan sapa penghuni tiap pulau. Bisa dimainkan dengan **keyboard, layar sentuh, atau gamepad** (tinggal colok).

Pulau pusat adalah **pulau Zyxcid** yang kini lebih luas — perkenalan sang pembuat sekaligus **taman bermain**: ayunan yang bisa dinaiki, perosotan yang meluncur ke arah tengah pulau, trampolin, bola yang bisa ditendang menggelinding, sampai meja **Connect 4**. Di utara pulau berdiri **gerbang GitHub**: portal bulat yang berputar dengan plakat kucing — dekati dan tekan `E` untuk membuka profil GitHub di tab baru (pengganti label "Zyxcid" yang dulu mengambang). Semua mainan itu jalan menuju **lencana** (kolektibel) — lengkap di daftar kolektibel (tombol tas di kanan atas).

Pulau tertentu punya **gedung besar yang benar-benar bisa dimasuki** — mulai dari **Kanji Hall** di pulau Kanjichō: tekan `E` di pintunya dan kamu berdiri **di dalam ruangan 3D** — pameran screenshot di dinding, stasiun **kuis kanji** yang bisa dimainkan, dan "buku pamaran" untuk membaca cerita lengkapnya. Temboknya solid: tidak bisa ditembus — pintu satu-satunya jalan masuk.

Bintang yang kamu kumpulkan membuka **emote & kolektibel**; dan sekarang **progresmu tersimpan di perangkat** — reload browser tidak menghapus bintang, bendera kunjungan, maupun lencana (lihat seksi *Kolektibel*).

**Lingkungan mengikuti jam nyata pengunjung**: pagi, siang, sore, senja, hingga malam berbulan & berbintang — semuanya dihitung lokal di browser.

Situsnya **tanpa akun & tanpa database**. Multiplayer-nya pun opsional: hanya me-relay posisi (dan emote) pengunjung yang sedang online (lihat seksi *Multiplayer*) — berjalan di **Cloudflare Workers milikmu sendiri**, tanpa menyimpan apa pun setelah koneksi tertutup.

Dibangun dengan **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + three.js**.

## Menjalankan secara lokal

Skrip npm di proyek ini **murni cross-platform** — jalan di Windows (PowerShell/CMD), macOS, dan Linux tanpa perintah Unix khusus. Proyek ini memakai **npm** (lockfile: `package-lock.json`).

Prasyarat: **Node.js** ≥ 20 + npm.

Langkah:

```bash
# 1. masuk folder
cd ukiyo

# 2. pasang dependensi
npm install

# 3. jalankan mode pengembangan
npm run dev
```

Buka <http://localhost:3000> di browser (Chrome/Edge/Firefox/Safari terbaru, perlu WebGL).

Build produksi lokal:

```bash
npm run build        # next build + salin aset (Node murni, aman di Windows)
npm start            # menjalankan server standalone
```

Catatan: `npm install` juga memasang **wrangler** (alat CLI Cloudflare, devDependency, termasuk binary `workerd` ±130 MB) yang dipakai untuk mode multiplayer. Kalau tidak butuh multiplayer dan ingin instalasi ramping: `npm install --omit=dev`, lalu pasang ulang saat hendak meng-deploy ruang multiplayer (`npm i -D wrangler partyserver`).

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

## Taman bermain — pulau Zyxcid

Pulau pusat kini jadi rumah sang pembuat **sekaligus taman bermain**. Semua mainan benar-benar bisa dimainkan:

| Mainan | Cara main | Lencana |
| --- | --- | --- |
| **Trampolin** (barat daya) | tinggal injak / mendarat di atasnya — pantul tinggi | *Kang Trampolin* — mantul 10× |
| **Ayunan** (barat laut) | `E` dekat kursinya → burung ikut mengayun; **`spasi` = melompat dari ayunan dengan momentum ayunannya** | *Penunggang Ayunan* — mengayun 6 detik penuh |
| **Perosotan** (timur laut) | naiki undakan tangga di sisi LUAR, `E` di platform atas → meluncur **ke arah tengah pulau** (aman dari jurang) | *Penerbang Perosotan* — meluncur 2× |
| **Bola pantai** (selatan) | jalan mendekat — bola tertendang, menggelinding, memantul di tepi pulau. **Tendangannya tersinkron ke tamu lain** | *Penggiring Bola* — menendang 15× |
| **Connect 4** (tenggara) | `E` di mejanya → modal permainan. Sendirian: lawan penghuni (AI). **Bila tamu lain membuka meja yang sama → otomatis jadi lawan-lawan manusia** (AI nonaktif, nama lawan + warnamu ditampilkan). Papan 3D di pulau ikut terisi & tersinkron ke semua tamu | *Juara Connect 4* — kalahkan penghuni |
| **Gerbang GitHub** (utara) | dekati → `E` membuka `github.com/Zyxcid` di tab baru | — |

**Sinkronisasi multiplayer taman bermain**: tendangan bola di-broadcast (posisi + kecepatan — fisika bolanya deterministik jadi lintasannya sama di semua klien), dan meja Connect 4 memakai protokol ringan `hi/bye/pair/move/reset/state`: dua pemain yang sama-sama membuka meja otomatis berpasangan (id terkecil jadi merah & jalan duluan), langkah saling ter-relay, dan lawan yang pergi → penghuni (AI) mengambil alih papan lagi. Tamu ketiga yang membuka meja jadi **penonton** — papan tetap tersinkron.

## Gedung proyek — interior 3D

Pulau proyek tertentu punya **bangunan besar dengan pintu yang bisa dimasuki**. Yang pertama: **Kanji Hall** (漢字帳) di pulau *Kanjichō*. Tekan `E` di depan pintunya dan kamu **benar-benar masuk** ke ruangan 3D (dimensi saku di kedalaman dunia):

- **8 screenshot aplikasi Kanjichō berbingkai** di dinding barat & timur, lengkap dengan label museum. Dekati → hint muncul; tekan `E` → tangkapan layar itu terbuka besar (overlay pameran) kalau mau membacanya pelan-pelan.
- **Stasiun KUIS KANJI** di tengah ruangan: papan menampilkan satu kanji + arti dalam bahasa Indonesia. Berdiri di salah satu **karung jawaban** bertuliskan kana, tekan `E` — benar → konfeti + streak; salah → papan menampilkan bacaannya. Soal berganti otomatis (6 soal dalam bank).
- **Pedestal "buku pamaran"** di pojok: `E` → membuka pameran lengkap (cerita proyek, statistik 2.211 kanji / N5–N1 / FSRS-6, fitur, stack, kredit).
- **Papan statistik** di dinding selatan, plakat 漢字帳 + tagline di dinding utara, lentera gantung, jendela shoji, rak gulungan, kristal, dan roh kanji yang melayang.
- **Pintu keluar** ada di dinding selatan: dekati → `E` → kamu kembali tepat di depan pintu gedung di pulau.

Di dalam gedung kamu tetap bisa lompat/dash, dan **tamu lain yang juga masuk gedung yang sama saling terlihat** — jadi bisa main kuis barengan.

**Tembok gedung solid**: eksterior gedung punya kotak tabrakan (AABB) — pemain maupun penghuni NPC tidak bisa menembus temboknya; pintu tetap jadi satu-satunya jalan masuk (kalau kamu cukup jago melompati atapnya, silakan).

Cara lain masuk: tombol **masuk gedung** di panel detail pulau (sisi kanan).

Arsitektur interior **generik per data**:

- **`src/lib/projects.ts`** — `ProjectShowcase` (`building`, `tagline`, `story`, `features`, `stats`, `stack`, `gallery`, `credit`); entri dengan `showcase` otomatis dapat interior.
- **`src/components/game/structures.ts`** — bentuk eksterior gedung (`buildKanjiHall`, mengembalikan `door` → engine otomatis mengenali pintunya, plus `blockers` → tembok solid).
- **`src/components/game/interior.ts`** — ruangan 3D + stasiun interaksi + bank soal kuis (`QUIZ_BANK`). Ruangan berbentuk kotak sumbu (AABB) sehingga tabrakan dinding & clamp kamera murah dan pasti.
- **`public/kanjicho/`** — gambar galeri (JPG teroptimasi, ±360 KB total; termuat asinkron saat ruangan dibangun).

## Emote, kolektibel & progres — hadiah dari bintang

Mengumpulkan bintang membuka **emote**; bermain di taman membuka **lencana**; semuanya terkumpul di **daftar kolektibel** (tombol **tas** di kanan atas):

| Emote | Buka pada | Efek |
| --- | --- | --- |
| Lambai | langsung terbuka | sayap terangkat mengibas |
| Dansa | 8% bintang | goyang + kepak ritmis |
| Putar | 20% bintang | dua putaran penuh |
| Salto | 33% bintang | salto ganda di tempat |
| Duduk | 47% bintang | merem santai sejenak |
| Hati | 62% bintang | hati-hati doodle melayang |
| Konfeti | 78% bintang | ledakan konfeti warna-warni |
| **Syal emas** | **semua bintang** | kolektibel kosmetik, bisa dipakai/dilepas |

| Lencana | Syarat |
| --- | --- |
| Kang Trampolin | mantul 10× di trampolin |
| Penunggang Ayunan | mengayun penuh 6 detik |
| Penerbang Perosotan | meluncur dari perosotan 2× |
| Penggiring Bola | menendang bola 15× |
| Juara Connect 4 | kalahkan penghuni di Connect 4 |

Cara pakai emote: tombol **`Q`** (atau tombol percik di layar sentuh) membuka **roda emote** — roda ini **tidak mengunci gerakan**: kamu tetap bisa berjalan & memutar kamera sambil memilih. Roda hanya menampilkan **emote yang sudah kamu miliki**; klik ikonnya atau tekan **`1`–`7`** langsung. Gamepad: **LB** emote berikutnya, **RB** rodanya. Selama animasi emote bermain, gerakan terkunci sebentar (lompat tetap bisa).

**Progres tersimpan di `localStorage`** — reload browser tidak menghapus:

- `ukiyo:stars` — bintang yang sudah terkumpul (index bintang; layout dunia deterministik jadi indexnya stabil)
- `ukiyo:visited` — pulau yang pernah dikunjungi (benderanya naik lagi setelah reload)
- `ukiyo:badges` — lencana taman bermain
- `ukiyo:maxStars` + `ukiyo:goldScarf` — pencapaian emote & syal

Mau mulai bersih? Buka daftar kolektibel → **"mulai dari awal"** (dua kali klik untuk konfirmasi).

- **Terlihat tamu lain**: emote yang kamu mainkan di-broadcast lewat ruang multiplayer — burung tamu ikut beranimasi + ikon emote melayang di atas kepalanya. Mode solo: semuanya tetap jalan.
- Toast muncul persis saat ambang tercapai ("Emote baru terbuka!" / "Lencana baru terbuka!").

## Multiplayer — bertemu pengunjung lain (OPSIONAL)

Situs bisa menampilkan **tamu lain yang sedang membuka halaman yang sama**: burung kertas dengan syal warna acak + label nama samaran ("tamu 42"), melayang dan bergerak mengikuti posisi mereka sungguhan — termasuk **emote** yang mereka mainkan, **tendangan bola** yang mereka lakukan, dan **permainan Connect 4** yang mereka jalankan. Tanpa chat, tanpa akun, tanpa data yang disimpan — begitu tab ditutup, tamunya hilang.

> **Pembaruan v0.7:** taman bermain kini **multiplayer sungguhan** — bola & papan Connect 4 tersinkron antar tamu, dan Connect 4 otomatis berubah jadi lawan-lawan manusia begitu tamu lain membuka meja yang sama (AI penghuni nonaktif, nama lawan ditampilkan). Pulau pusat dilebarkan (mainan tidak lagi dempet di tepi), perosotan arah luncurnya dibalik ke tengah pulau, dan label "Zyxcid" melayang diganti **gerbang GitHub interaktif**. UI dibersihkan (teks bawah tombol mulai & pop-up kartu beranda dihapus, hint "sapa penghuni" menunggu tutorial selesai) dan motion semua emote dipoles (easing + amplop naik-turun, salto & putaran kini benar-benar melompat).

> **Pembaruan v0.3:** platform managed **PartyKit sudah ditutup** (9 Okt 2026 berhenti menerima proyek baru, 23 Okt 2026 mati total). Ruang multiplayer sekarang berjalan sebagai **Cloudflare Worker + Durable Object ("PartyServer") di akun Cloudflare milikmu sendiri** — deploy dengan `wrangler`, tidak ada lagi pihak ketiga. Variabel environment: `NEXT_PUBLIC_PARTY_HOST`.

### Cara kerja & prinsip

- Situs utama **tetap statis** (Vercel/static hosting apa pun). Yang ditambahkan hanyalah **satu koneksi WebSocket kecil** ke sebuah "ruang" (room) bernama `dunia`.
- Server ruangnya (`party/server.ts`, Cloudflare Worker via `wrangler.jsonc`) cuma **me-relay pesan** antar pengunjung: posisi (~100 byte, ±9×/detik), **emote** (`{"t":"e"}`), **tendangan bola** (`{"t":"b"}`), dan **protokol Connect 4** (`{"t":"c4","sub":"hi|pair|move|reset|state|bye"}`) — dengan **hibernation WebSocket** supaya hemat kuota. Tidak ada database, tidak ada penyimpanan, tidak ada chat.
- Identitas tamu hanya hidup **di memori tab** — id acak + nama samaran. Muat ulang halaman = jadi "tamu baru".
- **Degradasi halus**: kalau ruang tidak tersedia / host tidak diisi, game tetap jalan 100% mode solo — tanpa error, tanpa UI aneh.

### Mengaktifkan

**1. Deploy ruangnya sekali** (butuh akun Cloudflare gratis — <https://dash.cloudflare.com/sign-up>):

```bash
npm run party:login    # = npx wrangler login (buka browser, izinkan akses akunmu)
npm run party:deploy   # = npx wrangler deploy → cetak alamat ruangmu
```

Catat alamat yang tercetak, contoh: `ukiyo.nama-akun-kamu.workers.dev`

**2. Beri tahu situs alamat itu** — dua cara:

- **Vercel (produksi):** Project → Settings → Environment Variables → tambah `NEXT_PUBLIC_PARTY_HOST` = alamat ruang → deploy ulang.
- **Lokal:** salin `.env.example` jadi `.env.local`, isi `NEXT_PUBLIC_PARTY_HOST=...`, jalankan `npm run dev`.

**3. Uji lokal tanpa deploy:** jalankan `npm run party:dev` (ruang lokal `wrangler dev` di `127.0.0.1:1999`), lalu isi `.env.local` dengan `NEXT_PUBLIC_PARTY_HOST=127.0.0.1:1999` dan `npm run dev`. Buka situs di dua jendela browser berbeda — dua burung saling melihat, emote juga tersampaikan.

### Hal yang perlu kamu tahu (trade-off)

- **100% milikmu.** Relay presence berjalan sebagai Worker di akun Cloudflare sendiri. Kalau Worker-nya dihapus/dimatikan, multiplayer mati dengan halus dan game tetap jalan mode solo.
- **Kuota gratis Cloudflare Workers**: sudah termasuk Durable Object ber-storage SQLite — untuk situs personal sangat longgar.
- **Privasi ringan**: posisi & nama samaran + id emote ter-relay ke pengunjung lain (tanpa IP, tanpa identitas asli). Tidak ada teks bebas — tidak ada masalah moderasi/chat.
- **Presence ≠ interaksi penuh**: tamu lain tidak bisa bertabrakan; mereka murni "hantu" yang terlihat, beremote, menendang bola bersamamu, dan bisa jadi lawan Connect 4. (Bola tidak memantul dari badan tamu — hanya dari tendangan yang sungguhan di-broadcast.)

### Mematikan

Kosongkan / hapus variabel `NEXT_PUBLIC_PARTY_HOST` → situs kembali murni solo & statis.

## Deploy ke Vercel

**Cara 1 — lewat Git (disarankan):**

1. Push folder ini ke repo GitHub milikmu.
2. Buka <https://vercel.com/new>, pilih repo tadi.
3. Framework terdeteksi otomatis sebagai **Next.js** — biarkan default. (Opsional: set `NEXT_PUBLIC_PARTY_HOST` seperti di seksi Multiplayer.)
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
| Bicara dengan penghuni | `E` (saat dekat) | tombol **sapa** (saat dekat) |
| Masuk gedung / interaksi interior / keluar | `E` (di depan pintu / dekat objek) | tombol kontekstual (**masuk / lihat / jawab / keluar**) |
| Mainan: ayunan / perosotan / Connect 4 | `E` (dekat mainannya) | tombol kontekstual (**ayunan / luncur / main**) |
| Gerbang GitHub | `E` di depan gerbang (utara pulau pusat) | tombol kontekstual (**github**) |
| Lompat dari ayunan | `spasi` saat mengayun | tombol **lompat** |
| Bola | jalan mendekat bola — otomatis tertendang | idem (dorong joystick) |
| Emote | `Q` buka roda · `1`–`7` langsung | tombol **emote** (percik) kiri bawah |
| Daftar kolektibel | tombol **tas** kanan atas | tombol **tas** |
| Tutup overlay | `Esc` atau tombol × | tombol × |
| Kartu kendali | `H` | tombol di kanan atas |
| Daftar pulau | tombol **pulau** | tombol **pulau** |

### Kontroler gamepad (opsional)

Colok gamepad apa pun (Xbox / PlayStation / generik) — terdeteksi otomatis, muncul toast sambutan, langsung siap main tanpa pengaturan:

| Tombol | Aksi |
| --- | --- |
| Stik kiri / D-pad | bergerak |
| A / Cross | lompat · double jump · tahan saat jatuh untuk melayang |
| B / Circle atau X / Square | dash |
| Y / Triangle | sapa penghuni / masuk gedung / interaksi interior / mainan |
| **LB** | **emote berikutnya** |
| **RB** | **buka roda emote** |
| Stik kanan | kamera |
| Start | daftar pulau |
| Select / Back | kartu kendali |

Getaran halus ikut terasa saat lompat, dash, mendarat, mengumpulkan bintang, menjawab kuis, memantul di trampolin, dan menendang bola — dan ikut mati bersama tombol suara.

## Mengubah dunia — panduan cepat

### 1) Data proyek & teks

- `src/lib/projects.ts` — daftar proyek (`PROJECTS`) + kalimat penghuni (`NPC_QUOTES`) + **`showcase`** (isi interior & pameran gedung). Tambah/ubah entri di sini; pulau, nomor, dan daftar ikut menyesuaikan otomatis. (Repo profil "Zyxcid" sengaja tidak jadi pulau — pulau pusat sudah mengambil perannya.)

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
| `DOOR_RANGE` | 2.1 | jarak deteksi pintu gedung |
| `TRAMPOLINE_V` | 15.5 | kecepatan pantulan trampolin |
| `PLAYER_R` | 0.42 | radius pemain (tabrakan tembok gedung) |
| `SWING_AUTO_EXIT` | 12s | turun otomatis dari ayunan |

Di dalam gedung, fisika berganti mode "ruangan" (lantai datar + dinding AABB, tanpa jatuh ke kehampaan) dan kamera otomatis dijepit di dalam kotak ruangan supaya tidak menembus dinding. Saat mengayun/meluncur, fisika berganti mode kinematik (posisi dihitung langsung, tombol lompat tetap merespons untuk lompat dari ayunan).

Ubah angkanya → simpan → browser dev server akan hot-reload.

Sumber input (keyboard, mouse, sentuh, dan **gamepad**) ada di `src/components/game/input.ts` — pemetaan tombol gamepad bisa diubah di fungsi `readPad`.

### 3) Tampilan dunia, interior & taman bermain

- `src/components/game/types.ts` — `PALETTE`: warna dasar paper-ink.
- `src/components/game/islands.ts` — layout kepulauan: radius pulau, jarak ring, tinggi, jumlah batu loncatan.
- `src/components/game/structures.ts` — diorama di atas tiap pulau; yang mengembalikan `door` otomatis jadi gedung masuk-able, `blockers` = tembok solidnya.
- `src/components/game/interior.ts` — **ruangan 3D dalam gedung**: layout, bingkai screenshot, papan kuis + bank soal (`QUIZ_BANK`), pedestal buku, pintu keluar. `INTERIOR_Y` = kedalaman dunia tempat ruangan berdiri.
- `src/components/game/playground.ts` — **taman bermain pulau pusat**: posisi & bentuk ayunan/perosotan/trampolin/meja Connect 4/bola/**gerbang GitHub**, fisika bola (+ `getBallState`/`setBallState` untuk sinkron multiplayer), render disc papan (`setBoard`), dan daftar lencana (`BADGES`).
- `src/components/game/progress.ts` — **progres tersimpan** (bintang / kunjungan / lencana, plus `resetAllProgress()`).
- `src/components/game/emotes.ts` — **daftar emote + ambang unlock (fraksi total bintang) + ikon doodle + penyimpanan localStorage**. Menambah emote = tambah satu entri di `EMOTES` + satu cabang animasi di `character.ts`.
- `src/components/game/character.ts` — penampilan burung kertas + **animasi emote** (amplop & easing per gerak) + syal emas.
- `src/components/game/npcs.ts` — penghuni pulau (kini menghindari kotak gedung di pulaunya).
- `src/components/game/stars.ts` / `effects.ts` / `sfx.ts` — bintang koleksi, partikel (debu, burst, **hati, konfeti**), dan bunyi sintetis (termasuk `boing()` trampolin/bola).
- `src/components/game/environment.ts` + `daycycle.ts` — langit, matahari/bulan, bintang, awan, kunang-kunang, dan palet tiap jam.
- `src/components/game/UkiyoWorld.tsx` — seluruh UI overlay (intro, HUD, tutorial, panel, daftar pulau, pameran, **roda emote non-blocking**, **modal Connect 4**, **daftar kolektibel**, hint mainan, tombol sentuh kontekstual).

### 4) Multiplayer

- `party/server.ts` — ruang relay PartyServer (protocol posisi + emote, batas klien, pesan "bye"). Server me-relay pesan apa pun ≤512 byte, jadi menambah jenis pesan baru tidak perlu mengubah server.
- `wrangler.jsonc` — konfigurasi Worker: nama (`ukiyo`), binding Durable Object `Main`, migrasi SQLite, port dev lokal.
- `src/components/game/multiplayer.ts` — sisi klien: penampilan burung tamu, interpolasi, **pemutaran emote tamu**, **broadcast/terima tendangan bola**, **protokol Connect 4 (heartbeat pair/move/state + deteksi lawan pergi)**, laju kirim, batas tamu.
- Ruang yang dipakai semua orang: `room: "dunia"` di `multiplayer.ts`.
- Cek tipe servernya terpisah: `npm run party:typecheck` (pakai `party/tsconfig.json` + `@cloudflare/workers-types`).

## Membuat model 3D secara visual (tanpa menulis geometri manual)

Semua objek di dunia ini dibangun **secara prosedural** (kotak, bola, kerucut + outline tinta). Kamu bisa juga memodelkan secara visual lalu memasukkan hasilnya ke game:

1. **Blender** (gratis, standar industri) — modelkan → ekspor **.glb/.gltf** → taruh di `public/models/` → dimuat dengan `GLTFLoader` (three.js). Beri material *toon*/*flat* + warna solid agar menyatu dengan gaya paper-ink.
2. **Spline** (<https://spline.design>) — pemodelan 3D paling ramah pemula, langsung ekspor ke web.
3. **three.js Editor** (<https://threejs.org/editor>) — editor scene resmi three.js, bisa ekspor JSON scene.
4. **MagicaVoxel** — untuk model voxel lucu, ekspor ke .obj/.gltf.

## Struktur singkat

```
src/
├── app/                 # halaman Next.js (App Router)
├── components/
│   ├── game/            # engine + dunia 3D + taman bermain + interior gedung
│   │                    # + emote/kolektibel + progres + UI + multiplayer
│   └── ui/              # komponen dasar (shadcn/ui)
├── hooks/               # helper React
└── lib/                 # data proyek (termasuk showcase interior) & util
party/server.ts          # ruang multiplayer PartyServer (relay posisi + emote)
party/tsconfig.json      # tsconfig khusus worker (Cloudflare types)
wrangler.jsonc           # konfigurasi Cloudflare Worker (deploy party:*)
scripts/postbuild.mjs    # salin aset build (cross-platform)
public/                  # aset statis (termasuk public/kanjicho/ — galeri interior)
```
