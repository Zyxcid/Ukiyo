export interface PlatformCollider {
  index: number;
  /** tabrakan lingkaran (pulau membulat) */
  cx: number;
  cz: number;
  radius: number;
  topY: number;
  /** true = pulau proyek/beranda (punya lentera), false = batu loncatan */
  isIsland: boolean;
}

/** Aksi pemain — dipakai sistem tutorial (menunggu input sungguhan) */
export type PlayerAction = "move" | "jump" | "djump" | "dash" | "talk";

export interface EngineCallbacks {
  /** Dipanggil saat karakter mendarat di pulau proyek (index) / null saat lepas */
  onPlatformChange: (index: number | null) => void;
  /** Dipanggil saat pulau proyek pertama kali dikunjungi */
  onVisit: (index: number) => void;
  /** Dipanggil SAAT KALI PERTAMA aksi dilakukan pemain (tutorial input-driven) */
  onAction: (action: PlayerAction) => void;
  /** Dipanggil saat NPC terdekat berubah (untuk tombol BICARA di sentuh) */
  onNpcNear: (islandIndex: number | null) => void;
  /** Dipanggil saat gedung proyek terdekat berubah (hint masuk / null saat menjauh) */
  onDoorNear?: (islandIndex: number | null) => void;
  /** Pemain masuk (index) / keluar (null) dari ruangan 3D gedung proyek */
  onBuildingInside?: (islandIndex: number | null) => void;
  /** Interaksi terdekat DI DALAM gedung berubah (null = tidak dekat apa pun) */
  onInsideNear?: (near: {
    kind: "exit" | "shot" | "book" | "pad";
    caption?: string;
    galleryIdx?: number;
  } | null) => void;
  /** Hasil jawaban kuis kanji di dalam gedung */
  onQuizResult?: (correct: boolean, streak: number) => void;
  /** Pemain membuka buku pamaran / mengklik tangkapan layar di dalam gedung
   *  (membuka overlay pameran; galleryIdx memilih gambar awal) */
  onEnterBuilding?: (islandIndex: number, galleryIdx?: number) => void;
  /** Emote dipanggil tapi masih terkunci */
  onEmoteBlocked?: (emoteId: string, needStars: number) => void;
  /** Emote baru terbuka — persis saat ambang bintang tercapai */
  onEmoteUnlocked?: (emoteId: string) => void;
  /** Syal emas terbuka (semua bintang terkumpul) */
  onScarfUnlock?: () => void;
  /** Dipanggil saat pemain menyapa NPC — null saat bubble selesai */
  onTalk: (info: { islandIndex: number; quote: string } | null) => void;
  /** Dipanggil saat bintang terkumpul */
  onStar: (collected: number, total: number) => void;
  /** Dipanggil saat semua bintang terkumpul */
  onAllStars: () => void;
  /** Multiplayer presence: jumlah tamu online (termasuk diri sendiri).
   *  0 / tidak pernah dipanggil = tidak terhubung (mode solo). */
  onPresence?: (count: number) => void;
}

/**
 * Palet "kertas & tinta" terang-playful, mengikuti referensi index.html.
 */
export const PALETTE = {
  // kertas
  paper: "#F2EDE3",
  paperLight: "#F7F2E6",
  soft: "#E9E1CF",
  ink: "#1C1813",
  inkSoft: "rgba(28,24,19,.55)",
  // aksen
  accent: 0xe4572e,
  accentHex: "#E4572E",
  gold: 0xf7b32b,
  goldHex: "#F7B32B",
  // langit krem terang
  skyTop: 0xfbf7ec,
  skyMid: 0xf5eeda,
  skyHorizon: 0xf7e9d3,
  skyBottom: 0xe9e1cf,
  fog: 0xf2ede3,
  sun: 0xffd98a,
  cloud: 0xfffdf7,
  // pulau
  grass: [0x9cd08f, 0xa8d977, 0x8fcf8f, 0xb5de82],
  dirt: 0xd4a373,
  dirtDark: 0xc69763,
  rock: 0xbfae97,
  // karakter
  charBody: 0xf7f2e6,
  charWing: 0xeadfca,
  charBeak: 0xf08a24,
  charDark: 0x1c1813,
} as const;

/** Warna aksen playful per proyek (untuk struktur & label) */
export const PLAYFUL = {
  teal: 0x2ec4b6,
  coral: 0xe4572e,
  lemon: 0xf6d55c,
  lavender: 0xb8a7e8,
  mint: 0x7bc47f,
  sky: 0x6ec6ff,
  berry: 0xd95d9e,
  tangerine: 0xf08a24,
  cream: 0xf7f2e6,
  silver: 0xd9dde3,
} as const;
