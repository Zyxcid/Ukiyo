/**
 * Data proyek — diambil dari GitHub Zyxcid (https://github.com/Zyxcid)
 * Di-scrape pada 2026-10-11, diurutkan dari yang terbaru diperbarui.
 * Catatan: repo profil "Zyxcid" TIDAK jadi pulau proyek — perannya digantikan
 * pulau pusat (Beranda) yang kini memperkenalkan zyxcid + tautan profil GitHub.
 */

export interface Project {
  /** Nama repo di GitHub */
  name: string;
  /** Deskripsi asli dari GitHub (kosong jika tidak ada) */
  githubDescription: string;
  /** Catatan kurasi berbahasa Indonesia (fallback / tambahan konteks) */
  note: string;
  /** Bahasa pemrograman utama (bisa null) */
  language: string | null;
  /** Warna bahasa sesuai GitHub */
  langColor: string;
  /** Warna aksen tema pulau */
  accent: string;
  /** ISO date update terakhir */
  updatedAt: string;
  /** URL repo */
  url: string;
  /** Pameran gedung — bila ada, pulau punya bangunan besar yang bisa dimasuki */
  showcase?: ProjectShowcase;
}

/** Satu item statistik di pameran (angka besar + label kecil) */
export interface ShowcaseStat {
  value: string;
  label: string;
}

/** Satu tangkapan layar pameran */
export interface ShowcaseShot {
  src: string;
  caption: string;
}

/** Konten pameran dalam gedung proyek */
export interface ProjectShowcase {
  /** Nama bangunan (dipakai hint pintu & judul pameran) */
  building: string;
  /** Satu kalimat pembuka di bawah judul */
  tagline: string;
  /** Paragraf cerita (urutan = urutan tampil) */
  story: string[];
  /** Fitur andalan: judul + penjelasan singkat */
  features: { title: string; desc: string }[];
  /** Angka-angka penting */
  stats: ShowcaseStat[];
  /** Teknologi / bahan pembuat (chip kecil) */
  stack: string[];
  /** Tangkapan layar + keterangan */
  gallery: ShowcaseShot[];
  /** Catatan kaki: sumber data / lisensi */
  credit?: string;
}

export const GITHUB_PROFILE = "https://github.com/Zyxcid";

const KANJICHO_SHOWCASE: ProjectShowcase = {
  building: "Kanji Hall",
  tagline:
    "Aplikasi belajar kanji JLPT (N5–N1) — kuis pilihan ganda, penjadwal ulangan FSRS-6, dan perpustakaan 2.211 kanji yang berjalan penuh offline.",
  story: [
    "Kanjichō (漢字帳 — “buku catatan kanji”) adalah aplikasi belajar kanji untuk persiapan JLPT N5 hingga N1. Satu unit berisi 15 kanji; setiap kuis menyajikan soal bacaan pilihan ganda, dan kartu jawabannya membuka cara baca, kata contoh, kalimat contoh dua bahasa, sampai animasi urutan goresan yang bisa disentuh. Selesai kuis, unit langsung dijadwalkan ulang untuk review berikutnya.",
    "Yang menjaga ingatanmu tetap segar adalah penjadwal FSRS-6 (lewat pustaka ts-fsrs): skor kuis dinilai bukan sekadar benar-salah, melainkan dibandingkan dengan prediksi penjadwalnya sendiri — lalu unit dijadwalkan 1–2 hari ke depan (8 hari bila sempurna). Tiap jawaban salah tercatat per kanji dan bisa diulang lewat loop “kanji lemah” tanpa mengganggu jadwal utama. Seluruh progres disimpan lokal di IndexedDB: tanpa akun, tanpa server, tanpa sinkronisasi.",
    "Datanya pun hasil kerja serius: 2.211 kanji dibangun dari dataset publik (KANJIDIC2, JMdict, KanjiVG, Tatoeba) melalui pipeline Python + Node yang sepenuhnya reproducible — termasuk gerbang verifikasi bacaan kalimat dengan dua tokenizer dan lapisan terjemahan Indonesia yang diaudit manual. Hasil akhirnya dikemas sebagai PWA terinstall yang bekerja offline total, dan sebagai aplikasi Android (Capacitor) lengkap dengan pengingat belajar via notifikasi lokal.",
  ],
  features: [
    {
      title: "Kuis bacaan 15 soal",
      desc: "Pilih level → unit → kuis. Jawaban dibandingkan lewat indeks, jadi tampilan kana/romaji hanyalah kosmetik.",
    },
    {
      title: "Penjadwal FSRS-6",
      desc: "ts-fsrs dengan adapter skor→rating dan kalender review yang menampilkan semua tanggal jatuh tempo.",
    },
    {
      title: "Loop kanji lemah",
      desc: "Tiap salah tercatat per kanji; unit bisa diulang khusus untuk kanji yang dilesu — jadwal tak tersentuh.",
    },
    {
      title: "Perpustakaan 2.211 kanji",
      desc: "Pencarian kanji/arti/bacaan, filter level, uraian komponen radikal-fonetik, dan kata contoh berperingkat frekuensi.",
    },
    {
      title: "Animasi urutan goresan",
      desc: "Path KanjiVG per goresan; komponen menyala mengikuti goresan yang sedang digambar.",
    },
    {
      title: "Kalimat contoh + furigana",
      desc: "2.832 kalimat Tatoeba (JP–EN–ID) dengan offset kata sasaran dan furigana prahitung — nol tokenisasi di aplikasi.",
    },
    {
      title: "Dua bahasa penuh",
      desc: "Antarmuka, arti kanji, glosa kata, hingga terjemahan kalimat: Inggris dan Bahasa Indonesia.",
    },
    {
      title: "PWA offline + Android",
      desc: "Install dari browser atau lewat APK (Capacitor 8) dengan pengingat lokal — nol permintaan jaringan.",
    },
  ],
  stats: [
    { value: "2.211", label: "kanji" },
    { value: "N5–N1", label: "level JLPT" },
    { value: "FSRS-6", label: "penjadwal ulangan" },
    { value: "2.832", label: "kalimat contoh" },
    { value: "100%", label: "offline" },
    { value: "0", label: "akun & pelacak" },
  ],
  stack: [
    "React + Vite",
    "PWA (vite-plugin-pwa)",
    "ts-fsrs 5.4",
    "Dexie / IndexedDB",
    "Capacitor 8",
    "Pipeline Python",
    "KANJIDIC2 · JMdict",
    "KanjiVG · Tatoeba",
  ],
  gallery: [
    {
      src: "/kanjicho/beranda-terang.jpg",
      caption: "Beranda — pilih level JLPT (tema terang)",
    },
    {
      src: "/kanjicho/unit-terang.jpg",
      caption: "Pilih unit belajar — 15 kanji per unit",
    },
    {
      src: "/kanjicho/perpustakaan-terang.jpg",
      caption: "Perpustakaan kanji dengan pencarian & filter",
    },
    {
      src: "/kanjicho/beranda-gelap.jpg",
      caption: "Beranda mode gelap",
    },
    {
      src: "/kanjicho/perpustakaan-gelap.jpg",
      caption: "Perpustakaan mode gelap",
    },
    {
      src: "/kanjicho/hp-beranda-terang.jpg",
      caption: "Aplikasi Android — beranda",
    },
    {
      src: "/kanjicho/hp-unit-terang.jpg",
      caption: "Aplikasi Android — pilih unit",
    },
    {
      src: "/kanjicho/hp-perpustakaan-gelap.jpg",
      caption: "Aplikasi Android — perpustakaan (gelap)",
    },
  ],
  credit:
    "Data turunan (CC BY-SA) dari KANJIDIC2, JMdict, KanjiVG, dan Tatoeba — snapshot lengkapnya dipublikasikan di github.com/Zyxcid/kanjicho-data.",
};

export const PROJECTS: Project[] = [
  {
    name: "Komah",
    githubDescription: "Ojek UNP",
    note: "Aplikasi ojek untuk kampus UNP — menghubungkan penumpang dan pengemudi di lingkungan kampus.",
    language: "TypeScript",
    langColor: "#3178c6",
    accent: "#2EC4B6",
    updatedAt: "2026-10-10T03:41:48Z",
    url: "https://github.com/Zyxcid/Komah",
  },
  {
    name: "Kanjichō",
    githubDescription: "",
    note: "Aplikasi belajar kanji JLPT (N5–N1) dengan kuis pilihan ganda, penjadwal ulangan FSRS-6, dan perpustakaan 2.211 kanji — PWA offline + APK Android. Data turunannya ada di repo kanjicho-data.",
    language: null,
    langColor: "#c9c4e8",
    accent: "#B8A7E8",
    updatedAt: "2026-09-15T05:44:33Z",
    url: "https://github.com/Zyxcid/kanjicho-data",
    showcase: KANJICHO_SHOWCASE,
  },
  {
    name: "kanjicho-privacy-policy",
    githubDescription: "",
    note: "Halaman kebijakan privasi untuk aplikasi Kanjicho, dibuat dengan HTML statis.",
    language: "HTML",
    langColor: "#e34c26",
    accent: "#F6D55C",
    updatedAt: "2026-09-15T02:57:16Z",
    url: "https://github.com/Zyxcid/kanjicho-privacy-policy",
  },
  {
    name: "t3r",
    githubDescription: "a simple 20 20 20 rule timer",
    note: "Timer sederhana untuk aturan 20-20-20 — istirahatkan mata tiap 20 menit, lihat objek 20 kaki jauhnya, selama 20 detik.",
    language: "Python",
    langColor: "#3572A5",
    accent: "#6EC6FF",
    updatedAt: "2026-08-24T10:20:18Z",
    url: "https://github.com/Zyxcid/t3r",
  },
  {
    name: "aline-configurator",
    githubDescription: "A web configurator for 5x1 macropad I made (Aline)",
    note: "Konfigurator web untuk Aline, macropad 5x1 buatan sendiri — atur tombol dan tampilannya langsung dari browser.",
    language: "TypeScript",
    langColor: "#3178c6",
    accent: "#F08A24",
    updatedAt: "2026-08-14T09:32:18Z",
    url: "https://github.com/Zyxcid/aline-configurator",
  },
  {
    name: "edutrack",
    githubDescription: "",
    note: "Proyek pelacakan edukasi yang dikerjakan dalam Jupyter Notebook — analisis data untuk dunia pendidikan.",
    language: "Jupyter Notebook",
    langColor: "#DA5B0B",
    accent: "#7BC47F",
    updatedAt: "2026-05-30T09:08:06Z",
    url: "https://github.com/Zyxcid/edutrack",
  },
  {
    name: "aplikasiCuaca",
    githubDescription:
      "Aplikasi untuk mengecek cuaca. UTS Pemgrograman Berorientasi Jaringan Menggunakan Node.js",
    note: "Aplikasi pengecek cuaca — tugas UTS mata kuliah Pemrograman Berorientasi Jaringan dengan Node.js.",
    language: "Handlebars",
    langColor: "#f7931e",
    accent: "#6EC6FF",
    updatedAt: "2025-10-26T08:46:26Z",
    url: "https://github.com/Zyxcid/aplikasiCuaca",
  },
  {
    name: "IDCamp-2023",
    githubDescription: "Hope to get some improvements",
    note: "Kumpulan latihan jalur belajar IDCamp 2023 — dokumentasi perjalanan belajar web development.",
    language: "HTML",
    langColor: "#e34c26",
    accent: "#E4572E",
    updatedAt: "2024-11-09T01:26:06Z",
    url: "https://github.com/Zyxcid/IDCamp-2023",
  },
  {
    name: "Turn-Based-RPG-in-C",
    githubDescription: "",
    note: "Game RPG bergantian (turn-based) yang ditulis murni dalam bahasa C — bukti bahwa C juga bisa seru.",
    language: "C",
    langColor: "#555555",
    accent: "#B8A7E8",
    updatedAt: "2023-12-19T23:30:12Z",
    url: "https://github.com/Zyxcid/Turn-Based-RPG-in-C",
  },
];

/**
 * Kalimat penghuni pulau (index 0 = pulau pusat Zyxcid, 1..9 = pulau proyek).
 * Ditampilkan saat pemain menyapa NPC dengan tombol E.
 */
export const NPC_QUOTES: string[] = [
  "Pulau ini rumah zyxcid, sang pembuat kepulauan. Dari sini kamu bisa ke mana saja — oh, taman bermainnya baru selesai dibangun.",
  "Skuter-skuter di sini bolak-balik mengantarkan penumpang kampus. Setiap hari, jam yang sama.",
  "Gedung besar itu perpustakaan kanjiku. Masuk saja kalau mau lihat isinya — pintunya tidak pernah dikunci.",
  "Aku menjaga gembok kecil di pintu pulau. Isinya tidak banyak, tapi semuanya penting.",
  "Setiap dua puluh menit aku ingatkan: alihkan mata, lihat yang jauh. Dua puluh detik saja.",
  "Lima tombol kecil, seribu kombinasi. Aku suka menghitungnya, tidak pernah habis.",
  "Buku besar di pulau ini penuh catatan nilai dan absensi. Kadang angkanya seperti menari.",
  "Di sini hujan dan cerah bergantian tanpa kabar. Kamu bawa payung atau tidak?",
  "Buku-buku latihan bertumpuk di pulau ini. Semuanya jejak perjalanan belajar.",
  "Dadu ini menunggu lawan baru sejak lama. Berani main satu ronde?",
];
