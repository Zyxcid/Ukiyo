/**
 * Data proyek — diambil dari GitHub Zyxcid (https://github.com/Zyxcid)
 * Di-scrape pada 2026-10-11, diurutkan dari yang terbaru diperbarui.
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
}

export const GITHUB_PROFILE = "https://github.com/Zyxcid";

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
    name: "kanjicho-data",
    githubDescription: "",
    note: "Kumpulan data untuk Kanjicho — kemungkinan dataset dan aset pendukung aplikasinya.",
    language: null,
    langColor: "#c9c4e8",
    accent: "#B8A7E8",
    updatedAt: "2026-09-15T05:44:33Z",
    url: "https://github.com/Zyxcid/kanjicho-data",
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
    name: "Zyxcid",
    githubDescription: "",
    note: "Repo profil — halaman muka GitHub Zyxcid yang sedang kamu lihat sekarang ini.",
    language: null,
    langColor: "#c9c4e8",
    accent: "#D95D9E",
    updatedAt: "2026-09-04T08:23:32Z",
    url: "https://github.com/Zyxcid",
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
 * Kalimat penghuni pulau (index 0 = pulau pusat, 1..10 = pulau proyek).
 * Ditampilkan saat pemain menyapa NPC dengan tombol E.
 */
export const NPC_QUOTES: string[] = [
  "Dari pulau ini kamu bisa ke mana saja. Aku cuma penjaga benderanya.",
  "Skuter-skuter di sini bolak-balik mengantarkan penumpang kampus. Setiap hari, jam yang sama.",
  "Tuguku merapikan tumpukan data di pulau ini. Kadang aku menemukan karakter yang lucu.",
  "Aku menjaga gembok kecil di pintu pulau. Isinya tidak banyak, tapi semuanya penting.",
  "Pulau ini rumahnya sang pembuat pulau. Aku dititipi jaga benderanya saja.",
  "Setiap dua puluh menit aku ingatkan: alihkan mata, lihat yang jauh. Dua puluh detik saja.",
  "Lima tombol kecil, seribu kombinasi. Aku suka menghitungnya, tidak pernah habis.",
  "Buku besar di pulau ini penuh catatan nilai dan absensi. Kadang angkanya seperti menari.",
  "Di sini hujan dan cerah bergantian tanpa kabar. Kamu bawa payung atau tidak?",
  "Buku-buku latihan bertumpuk di pulau ini. Semuanya jejak perjalanan belajar.",
  "Dadu ini menunggu lawan baru sejak lama. Berani main satu ronde?",
];
