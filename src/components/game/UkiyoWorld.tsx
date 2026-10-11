"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  ArrowBigUpDash,
  ArrowDownRight,
  ArrowRight,
  Armchair,
  Backpack,
  BookOpen,
  CalendarClock,
  Check,
  CircleDot,
  Crown,
  DoorOpen,
  ExternalLink,
  Gamepad2,
  Github,
  Hand,
  Heart,
  Landmark,
  Languages,
  Library,
  List,
  ListChecks,
  Lock,
  MapPin,
  MessageCircle,
  Moon,
  MousePointer2,
  Move,
  Music,
  PenLine,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Sunrise,
  Sunset,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GITHUB_PROFILE, PROJECTS, type Project } from "@/lib/projects";
import { GameEngine } from "./engine";
import { currentHour, phaseName } from "./daycycle";
import { NPC_COLOR_HEX } from "./npcs";
import {
  EMOTES,
  emoteById,
  emoteUnlocked,
  unlockStars,
  loadMaxStars,
  loadGoldScarf,
} from "./emotes";
import { BADGES } from "./playground";
import { loadBadges, loadVisited, resetAllProgress } from "./progress";
import type { C4EventMsg, C4Peer, PlayerAction } from "./types";

const emptySubscribe = () => () => {};

/** Ikon fitur pameran (berurut mengikuti daftar features Kanjichō) */
const FEATURE_ICONS = [
  ListChecks,
  CalendarClock,
  RotateCcw,
  Library,
  PenLine,
  BookOpen,
  Languages,
  Smartphone,
];

/** Ikon tiap emote (urut EMOTES) */
const EMOTE_ICONS: Record<string, typeof Hand> = {
  wave: Hand,
  dance: Music,
  spin: RotateCw,
  flip: RefreshCw,
  sit: Armchair,
  hearts: Heart,
  glitter: Sparkles,
};

/* ================= Connect 4 (lawan: penghuni pulau) ================= */
const C4_COLS = 7;
const C4_ROWS = 6;
const emptyC4 = () =>
  Array.from({ length: C4_COLS }, () => Array<number>(C4_ROWS).fill(0));

/** cek 4 sejajar; return {p, line} — line = index datar col*6+row */
function c4Winner(cells: number[][]): { p: number; line: number[] } | null {
  const at = (c: number, r: number) => cells[c]?.[r] ?? 0;
  const dirs: Array<[number, number]> = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let c = 0; c < C4_COLS; c++) {
    for (let r = 0; r < C4_ROWS; r++) {
      const p = at(c, r);
      if (!p) continue;
      for (const [dc, dr] of dirs) {
        const line: number[] = [c * 6 + r];
        let ok = true;
        for (let k = 1; k < 4; k++) {
          if (at(c + dc * k, r + dr * k) !== p) {
            ok = false;
            break;
          }
          line.push((c + dc * k) * 6 + (r + dr * k));
        }
        if (ok) return { p, line };
      }
    }
  }
  return null;
}

/** baris kosong terbawah di kolom (row 0 = bawah), -1 = penuh */
function c4DropRow(cells: number[][], col: number): number {
  for (let r = 0; r < C4_ROWS; r++) if (!cells[col][r]) return r;
  return -1;
}

function c4IsFull(cells: number[][]): boolean {
  return cells.every((col) => col.every((v) => v !== 0));
}

/** AI penghuni: menang kalau bisa, halau kalau harus, selebihnya suka tengah */
function c4AiPick(cells: number[][]): number {
  const tryWin = (p: number) => {
    for (let c = 0; c < C4_COLS; c++) {
      const r = c4DropRow(cells, c);
      if (r < 0) continue;
      cells[c][r] = p;
      const w = c4Winner(cells);
      cells[c][r] = 0;
      if (w && w.p === p) return c;
    }
    return -1;
  };
  const win = tryWin(2);
  if (win >= 0) return win;
  const block = tryWin(1);
  if (block >= 0) return block;
  const order = [3, 2, 4, 1, 5, 0, 6];
  const valid = order.filter((c) => c4DropRow(cells, c) >= 0);
  // hindari langkah yang langsung membuka kemenangan pemain tepat di atasnya
  for (const c of valid) {
    const r = c4DropRow(cells, c);
    cells[c][r] = 2;
    const r2 = c4DropRow(cells, c);
    let opensWin = false;
    if (r2 >= 0) {
      cells[c][r2] = 1;
      opensWin = !!c4Winner(cells);
      cells[c][r2] = 0;
    }
    cells[c][r] = 0;
    if (!opensWin) return c;
  }
  return valid[0] ?? -1;
}

function monthsSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 2.63e9;
}

/** Validasi papan C4 dari jaringan → bentuk 7×6 berisi 0/1/2 (null = rusak) */
function sanitizeC4Cells(raw: unknown): number[][] | null {
  if (!Array.isArray(raw) || raw.length !== C4_COLS) return null;
  const out: number[][] = [];
  for (let c = 0; c < C4_COLS; c++) {
    const col = raw[c];
    if (!Array.isArray(col) || col.length !== C4_ROWS) return null;
    out.push(col.map((v) => (v === 1 || v === 2 ? v : 0)));
  }
  return out;
}

/* ================= doodle thumbnail ala index.html ================= */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawDoodleIsle(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  color: string,
  seed: number
) {
  const rnd = mulberry32(seed * 97 + 13);
  const INK = "#1C1813";
  const ACCENT = "#E4572E";
  g.fillStyle = "#F7F2E6";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = INK;
  g.lineWidth = 2.6;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(W * 0.14, H * 0.2);
  g.quadraticCurveTo(W * 0.28, H * 0.1, W * 0.42, H * 0.19);
  g.quadraticCurveTo(W * 0.58, H * 0.26, W * 0.72, H * 0.16);
  g.stroke();
  const cx = W * 0.5;
  const cy = H * 0.68;
  const rx = W * 0.3;
  const ry = H * 0.14;
  g.fillStyle = "#EFE7D2";
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, 7);
  g.fill();
  g.stroke();
  g.fillStyle = "#A9B37B";
  g.beginPath();
  g.ellipse(cx, cy - ry * 0.5, rx * 0.9, ry * 0.75, 0, 0, 7);
  g.fill();
  g.stroke();
  const hx = cx + (rnd() * 2 - 1) * rx * 0.35;
  const hy = cy - ry * 1.1 - H * 0.05;
  const s = H * 0.14;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(hx, hy - s);
  g.lineTo(hx - s * 0.92, hy + s * 0.62);
  g.lineTo(hx + s * 0.92, hy + s * 0.62);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(hx - s * 0.32, hy + s * 0.05, 1.7, 0, 7);
  g.fill();
  g.beginPath();
  g.arc(hx + s * 0.32, hy + s * 0.05, 1.7, 0, 7);
  g.fill();
  const sx = cx + (rnd() * 2 - 1) * rx * 0.7;
  const sy = cy - ry * 1.6 - rnd() * H * 0.1;
  g.fillStyle = ACCENT;
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 2.2 : 5.5;
    const an = (k / 10) * Math.PI * 2 - Math.PI / 2;
    g[k ? "lineTo" : "moveTo"](sx + Math.cos(an) * r, sy + Math.sin(an) * r);
  }
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(8, H - 9);
  for (let px = 8; px < W - 8; px += 14)
    g.lineTo(px, H - 9 + Math.sin(px * 0.4 + seed) * 2.2);
  g.lineTo(W - 8, H - 9);
  g.stroke();
}

function DoodleIsle({
  w,
  h,
  color,
  seed,
  className,
}: {
  w: number;
  h: number;
  color: string;
  seed: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;
    drawDoodleIsle(g, w, h, color, seed);
  }, [w, h, color, seed]);
  return <canvas ref={ref} width={w} height={h} className={className} />;
}

/* ================= langkah tutorial (menunggu input sungguhan) ================= */
const TUTORIAL_STEPS: Array<{
  action: PlayerAction;
  label: string;
  labelTouch: string;
}> = [
  {
    action: "move",
    label: "Jalan dulu — WASD atau tombol panah",
    labelTouch: "Dorong joystick di kiri bawah untuk berjalan",
  },
  {
    action: "jump",
    label: "Tekan SPASI untuk lompat",
    labelTouch: "Tekan tombol lompat di kanan bawah",
  },
  {
    action: "djump",
    label: "Saat masih di udara, tekan SPASI lagi — double jump",
    labelTouch: "Saat masih melayang, tekan lompat sekali lagi",
  },
  {
    action: "dash",
    label: "Tekan SHIFT untuk melesat (dash)",
    labelTouch: "Tekan tombol petir untuk melesat",
  },
];

export default function UkiyoWorld() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const allVisitedRef = useRef(false);
  const startedRef = useRef(false);

  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [started, setStarted] = useState(false);
  const isTouch = useSyncExternalStore(
    emptySubscribe,
    () => "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0,
    () => false
  );
  const [currentPlatform, setCurrentPlatform] = useState<number | null>(null);
  const [visited, setVisited] = useState<Set<number>>(new Set());
  const [starCount, setStarCount] = useState<{ c: number; total: number }>({
    c: 0,
    total: 0,
  });
  const [muted, setMuted] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);

  // multiplayer presence (null = tidak aktif/offline)
  const [presence, setPresence] = useState<number | null>(null);
  const metGuestRef = useRef(false);

  // tutorial & bicara NPC
  const [doneActions, setDoneActions] = useState<Set<PlayerAction>>(new Set());
  const doneActionsRef = useRef<Set<PlayerAction>>(new Set());
  const [doneHint, setDoneHint] = useState(false);
  const [talk, setTalk] = useState<{ islandIndex: number; quote: string } | null>(
    null
  );
  const [nearNpc, setNearNpc] = useState<number | null>(null);

  // panel detail
  const [dismissedIsland, setDismissedIsland] = useState<number | null>(null);
  const doneHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // pameran gedung proyek (Kanji Hall dkk.)
  const [nearDoor, setNearDoor] = useState<number | null>(null);
  const [exhibitIsland, setExhibitIsland] = useState<number | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);
  // interior 3D + emote
  const [insideIsland, setInsideIsland] = useState<number | null>(null);
  const [insideNear, setInsideNear] = useState<{
    kind: "exit" | "shot" | "book" | "pad";
    caption?: string;
    galleryIdx?: number;
  } | null>(null);
  const [wheelOpen, setWheelOpen] = useState(false);
  // kolektibel (panel tas kanan atas) & mainan taman bermain
  const [collectOpen, setCollectOpen] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [nearToy, setNearToy] = useState<{
    kind: "swing" | "slide" | "c4" | "github";
    label: string;
  } | null>(null);
  // ---------- Connect 4 ----------
  // Mode default: lawan = penghuni pulau (AI). Bila tamu lain membuka meja
  // yang sama, dua klien otomatis berpasangan (protokol "c4" di
  // multiplayer.ts): AI nonaktif, warna dari urutan id, nama lawan ditampilkan.
  const [c4Open, setC4Open] = useState(false);
  const [c4Cells, setC4Cells] = useState<number[][]>(emptyC4);
  const [c4Turn, setC4Turn] = useState<1 | 2>(1);
  const [c4Status, setC4Status] = useState<"play" | "win" | "lose" | "draw">(
    "play"
  );
  const [c4WinLine, setC4WinLine] = useState<number[] | null>(null);
  /** lawan manusia yang sedang berpasangan (null = vs penghuni/AI) */
  const [c4Opponent, setC4Opponent] = useState<C4Peer | null>(null);
  /** warna saya (1 merah / 2 kuning) — dihitung saat berpasangan */
  const [c4MyColor, setC4MyColor] = useState<1 | 2>(1);
  /** saya cuma menonton dua pemain lain */
  const [c4Spectator, setC4Spectator] = useState(false);
  const [c4Peers, setC4Peers] = useState<C4Peer[]>([]);
  const c4TimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // cermin state untuk dipakai dari event multiplayer (di luar siklus React)
  const c4CellsRef = useRef<number[][]>(emptyC4());
  const c4TurnRef = useRef<1 | 2>(1);
  const c4StatusRef = useRef<"play" | "win" | "lose" | "draw">("play");
  const c4OpenRef = useRef(false);
  const c4OppRef = useRef<C4Peer | null>(null);
  const c4SpecRef = useRef(false);
  const c4PeersRef = useRef<C4Peer[]>([]);
  const c4MyIdRef = useRef<string | null>(null);
  const [resetArm, setResetArm] = useState(false);
  const resetArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // pencapaian tersimpan dibaca sekali saat mount (client) — aman: hanya
  // memengaruhi konten roda emote yang tidak dirender saat SSR
  const [maxStarsSaved] = useState(() => loadMaxStars());
  const [scarfUnlocked] = useState(() => loadGoldScarf());
  const [scarfOn, setScarfOn] = useState(() => loadGoldScarf());
  const seenUnlocksRef = useRef<Set<string>>(new Set());
  const insideToastRef = useRef(false);

  const currentProject: Project | null =
    currentPlatform !== null && currentPlatform >= 1
      ? PROJECTS[currentPlatform - 1]
      : null;

  // ---------- inisialisasi engine ----------
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const engine = new GameEngine(
      canvasRef.current,
      containerRef.current,
      PROJECTS,
      {
      onPlatformChange: (index) => {
        setCurrentPlatform(index);
      },
      onVisit: (index) => {
        setVisited((prev) => {
          const next = new Set(prev);
          next.add(index);
          return next;
        });
      },
      onAction: (action) => {
        if (doneActionsRef.current.has(action)) return;
        doneActionsRef.current.add(action);
        setDoneActions(new Set(doneActionsRef.current));
        // tutorial tuntas → pesan penutup sebentar
        if (TUTORIAL_STEPS.every((s) => doneActionsRef.current.has(s.action))) {
          setDoneHint(true);
          if (doneHintTimerRef.current) clearTimeout(doneHintTimerRef.current);
          doneHintTimerRef.current = setTimeout(
            () => setDoneHint(false),
            6000
          );
        }
      },
      onNpcNear: (islandIndex) => setNearNpc(islandIndex),
      onToyNear: (toy) => setNearToy(toy),
      onOpenConnect4: () => setC4Open(true),
      onBadgeUnlocked: (badgeId) => {
        setBadges(loadBadges());
        const def = BADGES.find((b) => b.id === badgeId);
        toast({
          title: "Lencana baru terbuka!",
          description: `${def?.label ?? badgeId} — ${def?.desc ?? ""}`,
        });
      },
      onDoorNear: (islandIndex) => setNearDoor(islandIndex),
      onBuildingInside: (islandIndex) => {
        setInsideIsland(islandIndex);
        if (islandIndex !== null && !insideToastRef.current) {
          insideToastRef.current = true;
          const name = PROJECTS[islandIndex - 1]?.name ?? "proyek";
          toast({
            title: `Masuk ${name}`,
            description:
              "Jelajahi ruangannya — kuis kanji di tengah, pameran di dinding. E untuk interaksi, pintu keluar di belakang.",
          });
        }
      },
      onInsideNear: (near) => setInsideNear(near),
      onQuizResult: (correct, streak) => {
        if (correct) {
          toast({
            title: "Benar!",
            description:
              streak >= 2
                ? `${streak} beruntun — sugoi!`
                : "Jawaban tepat. Soal berikutnya sebentar lagi…",
          });
        } else {
          toast({
            title: "Belum tepat",
            description: "Coba soal berikutnya — bacaannya ditampilkan di papan.",
          });
        }
      },
      onEnterBuilding: (islandIndex, gIdx) => {
        setExhibitIsland(islandIndex);
        setGalleryIdx(gIdx ?? 0);
      },
      onEmoteBlocked: (emoteId, need) => {
        const def = emoteById(emoteId);
        toast({
          title: "Emote masih terkunci",
          description: `Kumpulkan ${need} bintang untuk membuka “${def?.label ?? emoteId}”.`,
        });
      },
      onEmoteUnlocked: (emoteId) => {
        const def = emoteById(emoteId);
        if (!def || seenUnlocksRef.current.has(emoteId)) return;
        seenUnlocksRef.current.add(emoteId);
        toast({
          title: "Emote baru terbuka!",
          description: `“${def.label}” — tekan Q lalu pilih, atau tombol ${
            EMOTES.findIndex((d) => d.id === emoteId) + 1
          }.`,
        });
      },
      onScarfUnlock: () => {
        setScarfOn(true);
        toast({
          title: "Syal emas terbuka!",
          description:
            "Hadiah karena semua bintang terkumpul — kenakan lewat roda emote (Q).",
        });
      },
      onTalk: (info) => setTalk(info),
      onStar: (c, total) => setStarCount({ c, total }),
      onAllStars: () => {
        toast({
          title: "Semua bintang terkumpul!",
          description: "Kamu penjelajah sejati kepulauan ini.",
        });
      },
      onPresence: (n) => setPresence(n),
      // ---- Connect 4 multiplayer ----
      onC4Event: (msg) => c4HandleEventRef.current(msg),
      onC4Peers: (peers) => {
        c4PeersRef.current = peers;
        setC4Peers(peers);
        // lawan pergi (keluar modal / putus / timeout) → penghuni ambil alih
        const opp = c4OppRef.current;
        if (opp && !peers.some((p) => p.id === opp.id)) {
          c4OppRef.current = null;
          setC4Opponent(null);
          setC4MyColor(1);
          if (
            c4OpenRef.current &&
            c4StatusRef.current === "play" &&
            c4TurnRef.current === 2
          ) {
            c4ScheduleAiRef.current();
          }
          toastRef.current({
            title: "Lawanmu pergi",
            description: `${opp.name} meninggalkan meja — penghuni pulau kembali mengambil alih papan.`,
          });
        }
      },
      },
      // host ruang multiplayer dari env — kosong = mode solo (multiplayer off)
      { multiplayerHost: process.env.NEXT_PUBLIC_PARTY_HOST || "" }
    );
    engineRef.current = engine;
    engine.setInputEnabled(false); // tunggu intro selesai
    // tombol gamepad: Start = daftar pulau, Select = kartu kendali
    engine.input.onListKey = () => {
      if (startedRef.current) setListOpen((v) => !v);
    };
    engine.input.onControlsKey = () => {
      if (startedRef.current) setControlsOpen((v) => !v);
    };
    // emote: Q buka roda, 1-7 mainkan, gamepad LB siklus / RB roda
    engine.input.onEmoteKey = (slot) => {
      if (!startedRef.current) return;
      if (typeof slot === "number") {
        const def = EMOTES[slot - 1];
        if (def) engine.playEmote(def.id);
      } else if (slot === "next") {
        engine.playNextEmote();
      } else {
        setWheelOpen((v) => !v);
      }
    };
    engine.setBubbleEl(bubbleRef.current);
    // hook debug (hanya dev; digunakan untuk verifikasi otomatis)
    (window as unknown as { __zyxEngine?: GameEngine }).__zyxEngine = engine;

    return () => {
      delete (window as unknown as { __zyxEngine?: GameEngine }).__zyxEngine;
      if (doneHintTimerRef.current) clearTimeout(doneHintTimerRef.current);
      engine.dispose();
      engineRef.current = null;
    };
  }, [toast]);

  // ---------- input engine aktif hanya saat bermain ----------
  // CATATAN: roda emote SENGAJA tidak mematikan input — pemain tetap bisa
  // melihat sekeliling & berjalan saat memilih emote (Q menutup roda).
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setInputEnabled(
      started && !listOpen && !controlsOpen && !collectOpen && !c4Open && exhibitIsland === null
    );
  }, [started, listOpen, controlsOpen, collectOpen, c4Open, exhibitIsland]);

  // ---------- pulau yang pernah dikunjungi dipulihkan setelah reload ----------
  useEffect(() => {
    const v = loadVisited().filter((i) => i >= 1 && i <= PROJECTS.length);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkronisasi sekali dari localStorage ( sistem eksternal) saat mount; tanpa ini HUD "x/N pulau" selalu mulai dari 0
    if (v.length) setVisited(new Set(v));
    setBadges(loadBadges());
  }, []);

  // ---------- bersihkan timer Connect 4 / reset ----------
  useEffect(
    () => () => {
      if (c4TimeoutRef.current) clearTimeout(c4TimeoutRef.current);
      if (resetArmTimerRef.current) clearTimeout(resetArmTimerRef.current);
    },
    []
  );

  // ---------- gamepad: sambutan saat kontroler dicolok ----------
  useEffect(() => {
    const onConnect = () => {
      toast({
        title: "Kontroler terhubung",
        description:
          "Stik kiri jalan · A lompat · B/X dash · Y sapa · Start daftar pulau",
      });
    };
    const onDisconnect = () => {
      toast({ title: "Kontroler terputus" });
    };
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    return () => {
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, [toast]);

  // ---------- toast saat ada tamu lain pertama kali ----------
  useEffect(() => {
    if (presence && presence > 1 && !metGuestRef.current) {
      metGuestRef.current = true;
      toast({
        title: "Ada tamu lain di sini!",
        description:
          "Burung lain yang kamu lihat melayang adalah pengunjung sungguhan yang sedang membuka situs ini.",
      });
    }
  }, [presence, toast]);

  // ---------- jam realtime: chip kecil ikut fase hari ----------
  // (diisi hanya di client — jam server ≠ jam lokal pengunjung, hindari hydration mismatch)
  const [clock, setClock] = useState<{
    label: ReturnType<typeof phaseName>;
    time: string;
  } | null>(null);
  useEffect(() => {
    const read = () =>
      setClock({
        label: phaseName(currentHour()),
        time: format(new Date(), "HH:mm"),
      });
    read();
    const id = setInterval(read, 15000);
    return () => clearInterval(id);
  }, []);

  // ---------- toast milestone ----------
  useEffect(() => {
    const { c, total } = starCount;
    if (c === 0) return;
    if (c === total && total > 0) return; // ditangani onAllStars
    if (c === 25 || c === 50) {
      toast({
        title: `${c} bintang terkumpul!`,
        description: "Masih ada yang bersembunyi di ketinggian.",
      });
    }
  }, [starCount, toast]);

  // ---------- toast saat semua pulau dijelajahi ----------
  useEffect(() => {
    if (allVisitedRef.current) return;
    if (visited.size >= PROJECTS.length) {
      allVisitedRef.current = true;
      toast({
        title: "Semua pulau sudah dikunjungi!",
        description: "Benderanya naik semua tuh.",
      });
    }
  }, [visited, toast]);

  const handleStart = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      engine.sfx.ensure(); // aktivasi audio dari gesture user
      engine.setInputEnabled(true);
    }
    startedRef.current = true;
    setStarted(true);
  }, []);

  const toggleMute = useCallback(() => {
    const engine = engineRef.current;
    setMuted((m) => {
      engine?.sfx.setMuted(!m);
      return !m;
    });
  }, []);

  const handleTeleport = useCallback(
    (projectIndex: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.teleportTo(projectIndex + 1); // pulau 0 = Beranda
      setDismissedIsland(null); // panel pulau tujuan langsung tampil
      setListOpen(false);
    },
    []
  );

  const talkPress = useCallback(() => {
    engineRef.current?.tryTalk();
  }, []);

  const handleEmotePlay = useCallback((id: string) => {
    engineRef.current?.playEmote(id);
    setWheelOpen(false);
  }, []);

  // ---------- Connect 4: state, mode lawan (AI / tamu), jatuhkan disc ----------
  /** nomor warna saya: merah (1) bila tanpa lawan, atau id saya < id lawan */
  const c4MyNum = (opp: C4Peer | null = c4OppRef.current): 1 | 2 => {
    const myId = c4MyIdRef.current;
    if (!opp || !myId) return 1;
    return myId < opp.id ? 1 : 2;
  };

  /** tulis papan ke ref+state+3D sekaligus */
  const c4Commit = useCallback(
    (cells: number[][], turn: 1 | 2, status: "play" | "win" | "lose" | "draw", winLine: number[] | null) => {
      c4CellsRef.current = cells;
      c4TurnRef.current = turn;
      c4StatusRef.current = status;
      setC4Cells(cells);
      setC4Turn(turn);
      setC4Status(status);
      setC4WinLine(winLine);
      engineRef.current?.setConnect4Board(cells);
    },
    []
  );

  /** papan kosong + giliran merah (pemain 1) */
  const c4ResetBoard = useCallback(() => {
    if (c4TimeoutRef.current) clearTimeout(c4TimeoutRef.current);
    c4Commit(emptyC4(), 1, "play", null);
  }, [c4Commit]);

  /** berpasangan dengan tamu lain: lawan berganti AI → manusia, papan baru */
  const c4PairWith = useCallback(
    (peer: C4Peer, adoptCells?: number[][], adoptTurn?: number) => {
      const isNew = c4OppRef.current?.id !== peer.id;
      const myNum = c4MyNum(peer);
      c4OppRef.current = peer;
      c4SpecRef.current = false;
      setC4Opponent(peer);
      setC4Spectator(false);
      setC4MyColor(myNum);
      if (adoptCells) {
        c4Commit(adoptCells, adoptTurn === 2 ? 2 : 1, "play", null);
      } else {
        c4ResetBoard();
      }
      if (isNew) {
        toastRef.current({
          title: `${peer.name} bergabung di meja!`,
          description:
            "Penghuni pulau mundur — sekarang kamu lawan tamu sungguhan. " +
            (myNum === 1
              ? "Disc-mu merah, kamu jalan duluan."
              : "Disc-mu kuning, tunggu giliran."),
        });
      }
    },
    [c4Commit, c4ResetBoard]
  );

  /** AI penghuni menjawab — hanya bila TIDAK ada lawan manusia */
  const c4ScheduleAi = useCallback(() => {
    if (c4TimeoutRef.current) clearTimeout(c4TimeoutRef.current);
    c4TimeoutRef.current = setTimeout(() => {
      if (
        !c4OpenRef.current ||
        c4StatusRef.current !== "play" ||
        c4TurnRef.current !== 2 ||
        c4OppRef.current
      ) {
        return; // modal tertutup / lawan manusia mengambil alih
      }
      const aiCells = c4CellsRef.current.map((c) => [...c]);
      const col2 = c4AiPick(aiCells);
      if (col2 < 0) {
        c4Commit(aiCells, 2, "draw", null);
        return;
      }
      const r2 = c4DropRow(aiCells, col2);
      aiCells[col2][r2] = 2;
      const w2 = c4Winner(aiCells);
      if (w2 && w2.p === 2) {
        c4Commit(aiCells, 2, "lose", w2.line);
        return;
      }
      if (c4IsFull(aiCells)) {
        c4Commit(aiCells, 2, "draw", null);
        return;
      }
      c4Commit(aiCells, 1, "play", null);
    }, 620);
  }, [c4Commit]);

  /** Semua callback C4 di atas ber-dep stabil (c4Commit [] → turunannya
   *  ikut stabil), jadi cukup disimpan sekali — tanpa perlu disinkron ulang. */
  const c4ScheduleAiRef = useRef(c4ScheduleAi);

  /** terapkan langkah dari jaringan (lawan bergerak / penonton mensinkron) */
  const c4ApplyRemoteMove = useCallback(
    (col: number, p: number) => {
      if (c4StatusRef.current !== "play") return;
      if (col < 0 || col >= C4_COLS) return;
      const cells = c4CellsRef.current.map((c) => [...c]);
      const row = c4DropRow(cells, col);
      if (row < 0) return;
      cells[col][row] = p;
      const w = c4Winner(cells);
      const inModal = c4OpenRef.current;
      const myNum = c4MyNum();
      if (w) {
        // hanya lawan yang bisa menang dengan langkahnya di sisi saya
        c4Commit(
          cells,
          p === 1 ? 2 : 1,
          !inModal || c4SpecRef.current ? "play" : w.p === myNum ? "win" : "lose",
          w.line
        );
        return;
      }
      if (c4IsFull(cells)) {
        c4Commit(cells, p === 1 ? 2 : 1, "draw", null);
        return;
      }
      c4Commit(cells, p === 1 ? 2 : 1, "play", null);
    },
    [c4Commit]
  );

  /** proses pesan c4 dari tamu lain (dipanggil engine → multiplayer) */
  const c4HandleEvent = useCallback(
    (e: C4EventMsg) => {
      const engine = engineRef.current;
      if (!engine) return;
      const inModal = c4OpenRef.current;
      switch (e.sub) {
        case "hi": {
          if (!e.id) return;
          // balas state supaya pendatang/penonton luar langsung tersinkron
          if (inModal && !c4SpecRef.current) {
            const opp = c4OppRef.current;
            engine.sendC4Message({
              sub: "state",
              cells: c4CellsRef.current,
              turn: c4TurnRef.current,
              paired: !!opp,
              ...(opp
                ? {
                    red: c4MyIdRef.current && c4MyIdRef.current < opp.id
                      ? c4MyIdRef.current
                      : opp.id,
                    yellow:
                      c4MyIdRef.current && c4MyIdRef.current < opp.id
                        ? opp.id
                        : c4MyIdRef.current,
                  }
                : {}),
            });
          }
          // saya duluan di meja & belum berpasangan → klaim pasangan ini
          if (
            inModal &&
            !c4OppRef.current &&
            !c4SpecRef.current &&
            e.name &&
            c4MyIdRef.current
          ) {
            const myId = c4MyIdRef.current;
            const red = myId < e.id ? myId : e.id;
            const yellow = myId < e.id ? e.id : myId;
            engine.sendC4Message({ sub: "pair", red, yellow });
            c4PairWith({ id: e.id, name: e.name });
          }
          break;
        }
        case "pair": {
          const myId = c4MyIdRef.current;
          if (!myId || !e.red || !e.yellow || !inModal) return;
          if (e.red !== myId && e.yellow !== myId) {
            // dua tamu lain berpasangan — saya penonton di meja ini
            if (!c4OppRef.current) {
              c4SpecRef.current = true;
              setC4Spectator(true);
            }
            return;
          }
          const otherId = e.red === myId ? e.yellow : e.red;
          const name =
            c4PeersRef.current.find((p) => p.id === otherId)?.name ?? "tamu";
          c4PairWith({ id: otherId, name });
          break;
        }
        case "move": {
          if (typeof e.col !== "number" || typeof e.p !== "number") return;
          const opp = c4OppRef.current;
          if (inModal) {
            if (c4SpecRef.current) {
              c4ApplyRemoteMove(e.col, e.p); // menonton: ikut saja
            } else if (opp && e.id === opp.id) {
              c4ApplyRemoteMove(e.col, e.p); // langkah lawan saya
            }
            // langkah pemain lain (belum berpasangan) → abaikan, akan direset
          } else {
            c4ApplyRemoteMove(e.col, e.p); // penonton luar: papan 3D ikut
          }
          break;
        }
        case "reset": {
          if (!inModal) return; // penonton luar disinkron lewat state berikutnya
          const opp = c4OppRef.current;
          if (!opp || e.id === opp.id || c4SpecRef.current) {
            if (c4TimeoutRef.current) clearTimeout(c4TimeoutRef.current);
            c4ResetBoard();
          }
          break;
        }
        case "state": {
          const cells = sanitizeC4Cells(e.cells);
          if (!cells) return;
          const myId = c4MyIdRef.current;
          const opp = c4OppRef.current;
          if (!inModal) {
            // penonton dari luar modal: papan 3D di pulau ikut terisi
            c4CellsRef.current = cells;
            c4TurnRef.current = e.turn === 2 ? 2 : 1;
            engine.setConnect4Board(cells);
            return;
          }
          if (e.paired && e.red && e.yellow && myId) {
            if (e.red === myId || e.yellow === myId) {
              const otherId = e.red === myId ? e.yellow : e.red;
              if (!opp || opp.id !== otherId) {
                const name =
                  c4PeersRef.current.find((p) => p.id === otherId)?.name ?? "tamu";
                c4PairWith({ id: otherId, name }, cells, e.turn);
                return;
              }
            } else if (!opp && !c4SpecRef.current) {
              // dua pemain sudah berjalan — saya jadi penonton
              c4SpecRef.current = true;
              setC4Spectator(true);
              c4Commit(cells, e.turn === 2 ? 2 : 1, "play", null);
              return;
            }
          }
          // state dari lawan (self-heal / reconnect): adopsi
          if (opp && e.id === opp.id) {
            c4Commit(cells, e.turn === 2 ? 2 : 1, "play", null);
          }
          break;
        }
        default:
          break;
      }
    },
    [c4ApplyRemoteMove, c4Commit, c4PairWith, c4ResetBoard]
  );

  const c4HandleEventRef = useRef(c4HandleEvent);

  /** modal dibuka/ditutup → aktifkan heartbeat "aku di meja" + bye */
  useEffect(() => {
    c4OpenRef.current = c4Open;
    const engine = engineRef.current;
    if (!engine) return;
    engine.setC4Active(c4Open);
    if (c4Open) {
      // identitas multiplayer untuk warna & nama lawan
      c4MyIdRef.current = engine.getMpInfo()?.id ?? null;
      // mulai dari papan yang sedang tersinkron (mis. tadinya menonton)
      c4Commit(c4CellsRef.current, c4TurnRef.current, c4StatusRef.current, null);
    } else {
      // tutup: kalau sedang menunggu AI, batalkan
      if (c4TimeoutRef.current) clearTimeout(c4TimeoutRef.current);
      c4SpecRef.current = false;
      setC4Spectator(false);
    }
  }, [c4Open, c4Commit]);

  /** reset & tombol "main lagi" — di-broadcast supaya lawan ikut mulai baru */
  const c4Reset = useCallback(() => {
    if (c4TimeoutRef.current) clearTimeout(c4TimeoutRef.current);
    c4ResetBoard();
    engineRef.current?.sendC4Message({ sub: "reset" });
  }, [c4ResetBoard]);

  const c4Drop = useCallback(
    (col: number) => {
      if (!c4OpenRef.current || c4StatusRef.current !== "play") return;
      if (c4SpecRef.current) return; // penonton tidak bisa meletakkan disc
      const opp = c4OppRef.current;
      const myNum = c4MyNum(opp);
      if (opp ? c4TurnRef.current !== myNum : c4TurnRef.current !== 1) return;
      const cells = c4CellsRef.current.map((c) => [...c]);
      const row = c4DropRow(cells, col);
      if (row < 0) return;
      cells[col][row] = myNum;
      // broadcast langkah saya ke semua (lawan menerapkan, penonton mensinkron)
      engineRef.current?.sendC4Message({ sub: "move", col, p: myNum });
      const w = c4Winner(cells);
      if (w && w.p === myNum) {
        c4Commit(cells, myNum, "win", w.line);
        if (!opp) engineRef.current?.awardBadge("c4champ");
        return;
      }
      if (c4IsFull(cells)) {
        c4Commit(cells, myNum, "draw", null);
        return;
      }
      c4Commit(cells, myNum === 1 ? 2 : 1, "play", null);
      // penghuni menjawab hanya bila tidak ada lawan manusia
      if (!opp) c4ScheduleAi();
    },
    [c4Commit, c4ScheduleAi]
  );

  // ---------- reset total progres (dua langkah, biar tidak kepencet) ----------
  const handleResetProgress = useCallback(() => {
    if (!resetArm) {
      setResetArm(true);
      if (resetArmTimerRef.current) clearTimeout(resetArmTimerRef.current);
      resetArmTimerRef.current = setTimeout(() => setResetArm(false), 4500);
      return;
    }
    resetAllProgress();
    window.location.reload();
  }, [resetArm]);

  // ---------- tombol pintasan: H (kontrol), Esc (tutup overlay), Q/1-7 (emote) ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "escape") {
        if (c4Open) setC4Open(false);
        else if (collectOpen) setCollectOpen(false);
        else if (wheelOpen) setWheelOpen(false);
        else if (exhibitIsland !== null) setExhibitIsland(null);
        else if (listOpen) setListOpen(false);
        else if (controlsOpen) setControlsOpen(false);
      }
      // Connect 4 terbuka → angka menjatuhkan disc di kolom itu
      if (c4Open && /^[1-7]$/.test(k)) {
        c4Drop(Number(k) - 1);
        return;
      }
      if (k === "h" && started) {
        if (!listOpen && exhibitIsland === null && !wheelOpen && !collectOpen && !c4Open) setControlsOpen((v) => !v);
      }
      // roda emote terbuka → angka memutar emote, q menutup
      if (wheelOpen && started) {
        if (k === "q") {
          setWheelOpen(false);
        } else if (/^[1-7]$/.test(k)) {
          const def = EMOTES[Number(k) - 1];
          if (def) {
            engineRef.current?.playEmote(def.id);
            setWheelOpen(false);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, listOpen, controlsOpen, wheelOpen, exhibitIsland, collectOpen, c4Open, c4Drop]);

  const toggleWheel = useCallback(() => setWheelOpen((v) => !v), []);

  const toggleScarf = useCallback(() => {
    setScarfOn((v) => {
      engineRef.current?.setGoldScarf(!v);
      return !v;
    });
  }, []);

  // ---------- joystick virtual ----------
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);
  const [joystickActive, setJoystickActive] = useState(false);

  useEffect(() => {
    const base = joystickBaseRef.current;
    const knob = joystickKnobRef.current;
    if (!base || !knob) return;
    let pointerId: number | null = null;
    let cx = 0;
    let cy = 0;
    const RADIUS = 46;

    const handleMove = (x: number, y: number) => {
      let dx = x - cx;
      let dy = y - cy;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) {
        dx = (dx / len) * RADIUS;
        dy = (dy / len) * RADIUS;
      }
      knob.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
      const engine = engineRef.current;
      if (engine) {
        engine.input.joystick.x = dx / RADIUS;
        engine.input.joystick.y = -dy / RADIUS;
        engine.input.joystick.active = true;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      const rect = base.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
      setJoystickActive(true);
      handleMove(e.clientX, e.clientY);
      base.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      handleMove(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      setJoystickActive(false);
      knob.style.transform = "translate(-50%, -50%)";
      const engine = engineRef.current;
      if (engine) {
        engine.input.joystick.x = 0;
        engine.input.joystick.y = 0;
        engine.input.joystick.active = false;
      }
    };
    base.addEventListener("pointerdown", onDown);
    base.addEventListener("pointermove", onMove);
    base.addEventListener("pointerup", onUp);
    base.addEventListener("pointercancel", onUp);
    return () => {
      base.removeEventListener("pointerdown", onDown);
      base.removeEventListener("pointermove", onMove);
      base.removeEventListener("pointerup", onUp);
      base.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const jumpDown = useCallback(() => engineRef.current?.input.touchJumpPress(), []);
  const jumpUp = useCallback(() => engineRef.current?.input.touchJumpRelease(), []);
  const dashDown = useCallback(() => engineRef.current?.input.touchDashPress(), []);

  const fmtDate = (iso: string) =>
    format(new Date(iso), "d MMMM yyyy", { locale: idLocale });
  const fmtMonth = (iso: string) =>
    format(new Date(iso), "MMM yyyy", { locale: idLocale });

  const allStars = starCount.total > 0 && starCount.c === starCount.total;

  const talkIslandName =
    talk === null
      ? ""
      : talk.islandIndex === 0
        ? "pulau pusat"
        : (PROJECTS[talk.islandIndex - 1]?.name ?? "penghuni");

  const panelVisible =
    started &&
    currentPlatform !== null &&
    currentPlatform >= 1 &&
    dismissedIsland !== currentPlatform;

  /** index pulau proyek saat panel tampil (selalu >= 1) */
  const projIdx: number | null =
    currentPlatform !== null && currentPlatform >= 1 ? currentPlatform : null;

  const remainingSteps = TUTORIAL_STEPS.filter((s) => !doneActions.has(s.action));
  const showTutorialCard = started && remainingSteps.length > 0;

  /** giliran saya di Connect 4 (false saat menonton / bukan giliran) */
  const c4MyTurn =
    c4Open &&
    c4Status === "play" &&
    !c4Spectator &&
    (c4Opponent ? c4Turn === c4MyColor : c4Turn === 1);

  /** Proyek & konten pameran yang sedang terbuka (null = tertutup) */
  const exhibitProject: Project | null =
    exhibitIsland !== null && exhibitIsland >= 1
      ? (PROJECTS[exhibitIsland - 1] ?? null)
      : null;
  const exhibit = exhibitProject?.showcase ?? null;
  const exhibitShot = exhibit
    ? exhibit.gallery[Math.min(galleryIdx, exhibit.gallery.length - 1)]
    : null;
  /** jumlah bintang efektif untuk membuka emote (sesi ini atau terbaik sepanjang masa) */
  const effStars = Math.max(starCount.c, maxStarsSaved);

  return (
    <div
      ref={containerRef}
      className="relative h-dvh w-full select-none overflow-hidden bg-[#F2EDE3] text-[#1C1813]"
    >
      {/* ================= KANVAS 3D ================= */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {/* ================= LOGO KIRIC-ATAS ================= */}
      <a
        href={GITHUB_PROFILE}
        target="_blank"
        rel="noopener noreferrer"
        className="font-dm absolute left-4 top-4 z-20 text-xl italic leading-none text-[#1C1813] decoration-[#E4572E] decoration-wavy underline-offset-[6px] hover:underline sm:left-6 sm:top-5 sm:text-2xl"
        title="github.com/Zyxcid"
      >
        zyxcid<span className="text-[#E4572E]">.</span>
      </a>

      {/* ================= CHIP NAMA GEDUNG (saat di dalam) ================= */}
      {insideIsland !== null && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 sm:top-5">
          <div className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#F7F2E6]/95 px-3 py-1.5 font-space text-[10.5px] uppercase tracking-wider shadow-[3px_3px_0_#1C1813]">
            <Landmark className="h-3.5 w-3.5 text-[#E4572E]" aria-hidden />
            {PROJECTS[insideIsland - 1]?.showcase?.building ?? "gedung proyek"}
          </div>
        </div>
      )}

      {/* ================= HUD KANAN-ATAS ================= */}
      <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2 sm:right-6 sm:top-5">
        <div className="flex items-center gap-2">
          <div
            className={`hand flex items-center gap-2 border-2 border-[#1C1813] px-3 py-1.5 font-space text-[11px] uppercase tracking-wider shadow-[3px_3px_0_#1C1813] ${
              allStars ? "bg-[#E4572E] text-[#F2EDE3]" : "bg-[#F7F2E6] text-[#1C1813]"
            }`}
            aria-live="polite"
          >
            <Star
              className={`h-3.5 w-3.5 ${allStars ? "fill-[#F2EDE3]" : "fill-[#F7B32B] text-[#1C1813]"}`}
              aria-hidden
            />
            <span className="tabular-nums">
              {starCount.c}/{starCount.total}
            </span>
          </div>
          <div className="hand hidden items-center gap-2 border-2 border-[#1C1813] bg-[#F7F2E6] px-3 py-1.5 font-space text-[11px] uppercase tracking-wider shadow-[3px_3px_0_#1C1813] sm:flex">
            <MapPin className="h-3.5 w-3.5 text-[#E4572E]" aria-hidden />
            <span className="tabular-nums">
              {visited.size}/{PROJECTS.length}
            </span>
          </div>
          {clock ? (
            <div className="hand hidden items-center gap-2 border-2 border-[#1C1813] bg-[#F7F2E6] px-3 py-1.5 font-space text-[11px] tabular-nums uppercase tracking-wider shadow-[3px_3px_0_#1C1813] sm:flex" title="Lingkungan mengikuti jam lokal kamu">
              {clock.label === "malam" || clock.label === "fajar" ? (
                <Moon className="h-3.5 w-3.5 text-[#E4572E]" aria-hidden />
              ) : clock.label === "senja" ? (
                <Sunset className="h-3.5 w-3.5 text-[#E4572E]" aria-hidden />
              ) : clock.label === "pagi" ? (
                <Sunrise className="h-3.5 w-3.5 text-[#E4572E]" aria-hidden />
              ) : (
                <Sun className="h-3.5 w-3.5 text-[#E4572E]" aria-hidden />
              )}
              {clock.label} · {clock.time}
            </div>
          ) : null}
          {presence !== null && presence > 1 ? (
            <div
              className="hand hidden items-center gap-2 border-2 border-[#1C1813] bg-[#F7F2E6] px-3 py-1.5 font-space text-[11px] tabular-nums uppercase tracking-wider shadow-[3px_3px_0_#1C1813] sm:flex"
              title="Pengunjung lain yang sedang membuka situs ini"
              aria-live="polite"
            >
              <Users className="h-3.5 w-3.5 text-[#E4572E]" aria-hidden />
              {presence} tamu
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollectOpen(true)}
            className="hand grid h-9 w-9 place-items-center border-2 border-[#1C1813] bg-[#F7B32B] shadow-[3px_3px_0_#1C1813] transition-transform hover:bg-[#1C1813] hover:text-[#F2EDE3] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1C1813]"
            aria-label="Buka daftar kolektibel (emote, syal, lencana)"
            title="Kolektibel"
          >
            <Backpack className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className="hand grid h-9 w-9 place-items-center border-2 border-[#1C1813] bg-[#F7F2E6] shadow-[3px_3px_0_#1C1813] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1C1813]"
            aria-label={muted ? "Nyalakan suara" : "Matikan suara"}
          >
            {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="hand flex h-9 items-center gap-2 border-2 border-[#1C1813] bg-[#E4572E] px-3 font-space text-[11px] uppercase tracking-wider text-[#F2EDE3] shadow-[3px_3px_0_#1C1813] transition-transform hover:bg-[#1C1813] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1C1813]"
            aria-label="Buka daftar pulau proyek"
          >
            <List className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">pulau</span>
          </button>
        </div>
      </div>

      {/* ================= BUBBLE NPC (diposisikan engine) ================= */}
      <div
        ref={bubbleRef}
        className="pointer-events-none absolute left-0 top-0 z-30 max-w-[250px] opacity-0"
        style={{ willChange: "transform" }}
      >
        {talk && (
          <div className="hand relative border-2 border-[#1C1813] bg-[#F7F2E6] px-4 py-3 shadow-[4px_4px_0_rgba(28,24,19,0.2)]">
            <p className="font-dm text-[15px] italic leading-snug text-[#1C1813]">
              {talk.quote}
            </p>
            <p className="mt-1.5 font-space text-[10px] uppercase tracking-[1px] text-[#E4572E]">
              penghuni · {talkIslandName}
            </p>
            <div
              className="absolute -bottom-[7px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[9px] border-x-transparent border-t-[#1C1813]"
              aria-hidden
            />
            <div
              className="absolute -bottom-[4px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-[#F7F2E6]"
              aria-hidden
            />
          </div>
        )}
      </div>

      {/* ================= HINT INTERAKSI (desktop, saat dekat) ================= */}
      {/* catatan: hint "sapa penghuni" disembunyikan selama tutorial masih
          berjalan — jangan rebut perhatian pemain yang sedang belajar gerak */}
      {started &&
        !isTouch &&
        !talk &&
        !wheelOpen &&
        (nearDoor !== null ||
          (nearNpc !== null && !showTutorialCard) ||
          insideNear !== null ||
          nearToy !== null) && (
          <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 max-w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2">
            {insideNear !== null ? (
              <div className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#E4572E] px-4 py-1.5 font-space text-[10.5px] uppercase tracking-wider text-[#F2EDE3] shadow-[3px_3px_0_#1C1813]">
                <kbd className="hand border-[1.5px] border-[#F2EDE3] px-1.5 py-0.5 font-space text-[9px]">E</kbd>
                {insideNear.kind === "exit"
                  ? "keluar dari gedung"
                  : insideNear.kind === "pad"
                    ? "jawab kuis kanji"
                    : insideNear.kind === "book"
                      ? "buka buku pamaran"
                      : "perbesar gambar"}
                {insideNear.kind === "shot" && insideNear.caption && (
                  <span className="hidden truncate normal-case tracking-normal opacity-85 sm:inline">
                    — {insideNear.caption}
                  </span>
                )}
              </div>
            ) : nearDoor !== null ? (
              <div className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#E4572E] px-4 py-1.5 font-space text-[10.5px] uppercase tracking-wider text-[#F2EDE3] shadow-[3px_3px_0_#1C1813]">
                <kbd className="hand border-[1.5px] border-[#F2EDE3] px-1.5 py-0.5 font-space text-[9px]">E</kbd>
                masuk {(PROJECTS[nearDoor - 1]?.showcase?.building ?? "gedung").toLowerCase()}
              </div>
            ) : nearToy !== null ? (
              <div className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#F7B32B] px-4 py-1.5 font-space text-[10.5px] uppercase tracking-wider text-[#1C1813] shadow-[3px_3px_0_#1C1813]">
                <kbd className="hand border-[1.5px] border-[#1C1813] px-1.5 py-0.5 font-space text-[9px]">E</kbd>
                {nearToy.label}
              </div>
            ) : (
              <div className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#F7F2E6]/95 px-4 py-1.5 font-space text-[10.5px] uppercase tracking-wider shadow-[3px_3px_0_#1C1813]">
                <kbd className="hand border-[1.5px] border-[#1C1813] px-1.5 py-0.5 font-space text-[9px]">E</kbd>
                sapa penghuni
              </div>
            )}
          </div>
        )}

      {/* ================= PANEL DETAIL PROYEK (geser dari kanan) ================= */}
      <aside
        aria-label="Detail pulau"
        className={`absolute bottom-0 right-0 top-0 z-20 w-[min(26rem,100vw)] overflow-y-auto border-l-[2.5px] border-[#1C1813] bg-[#F7F2E6] px-6 pb-8 pt-6 shadow-[-6px_0_0_rgba(28,24,19,0.12)] transition-transform duration-500 ease-[cubic-bezier(0.75,0,0.2,1)] sm:px-8 ${
          panelVisible ? "translate-x-0" : "translate-x-[103%]"
        }`}
      >
        {currentProject && projIdx !== null && (
          <>
            <button
              type="button"
              onClick={() => setDismissedIsland(projIdx)}
              className="hand absolute right-4 top-4 grid h-10 w-10 place-items-center border-2 border-[#1C1813] bg-[#F7F2E6] hover:bg-[#E4572E] hover:text-[#F2EDE3]"
              aria-label="Tutup panel"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <div className="flex gap-4">
              <DoodleIsle
                w={120}
                h={120}
                color={NPC_COLOR_HEX[(projIdx + 1) % NPC_COLOR_HEX.length]}
                seed={projIdx - 1}
                className="hand2 mt-1 block rotate-3 border-[2.5px] border-[#1C1813] shadow-[4px_4px_0_rgba(28,24,19,0.18)]"
              />
              <div className="min-w-0 pr-10">
                <p className="font-space text-[11px] tracking-[1px] text-[#1C1813]/60">
                  PULAU {String(currentPlatform).padStart(2, "0")} /{" "}
                  {String(PROJECTS.length).padStart(2, "0")}
                </p>
                <h2 className="font-dm mt-1 break-words text-4xl italic leading-[0.95] text-[#1C1813]">
                  {currentProject.name}
                </h2>
                <p className="mt-2 font-space text-[11px] uppercase tracking-[1px] text-[#E4572E]">
                  {currentProject.language ?? "proyek"} ·{" "}
                  {format(new Date(currentProject.updatedAt), "yyyy", { locale: idLocale })}
                </p>
              </div>
            </div>
            <p className="mt-5 max-w-[48ch] text-[15px] leading-relaxed text-[#1C1813]/85">
              {currentProject.githubDescription || currentProject.note}
            </p>
            {currentProject.githubDescription &&
              currentProject.note !== currentProject.githubDescription && (
                <p className="mt-2 max-w-[48ch] text-[13px] leading-relaxed text-[#1C1813]/55">
                  {currentProject.note}
                </p>
              )}
            <dl className="mt-5 border-t-2 border-[#1C1813]">
              <div className="flex justify-between gap-4 border-b-[1.5px] border-[#1C1813]/25 py-2.5 text-sm">
                <dt className="font-space text-[10px] uppercase tracking-[1px] text-[#1C1813]/55">bahasa</dt>
                <dd className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full border border-[#1C1813]"
                    style={{ backgroundColor: currentProject.langColor }}
                    aria-hidden
                  />
                  {currentProject.language ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b-[1.5px] border-[#1C1813]/25 py-2.5 text-sm">
                <dt className="font-space text-[10px] uppercase tracking-[1px] text-[#1C1813]/55">diperbarui</dt>
                <dd>{fmtDate(currentProject.updatedAt)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b-[1.5px] border-[#1C1813]/25 py-2.5 text-sm">
                <dt className="font-space text-[10px] uppercase tracking-[1px] text-[#1C1813]/55">status</dt>
                <dd>{monthsSince(currentProject.updatedAt) < 6 ? "aktif" : "arsip"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b-[1.5px] border-[#1C1813]/25 py-2.5 text-sm">
                <dt className="font-space text-[10px] uppercase tracking-[1px] text-[#1C1813]/55">kunjungan</dt>
                <dd>{visited.has(projIdx) ? "sudah" : "baru pertama"}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <a
                href={currentProject.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#E4572E] px-4 py-2.5 font-space text-[11.5px] uppercase tracking-wider text-[#F2EDE3] shadow-[3px_3px_0_#1C1813] hover:bg-[#1C1813]"
              >
                <Github className="h-4 w-4" aria-hidden />
                buka repo
                <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </a>
              {currentProject.showcase && (
                <button
                  type="button"
                  onClick={() => {
                    // masuk langsung ke ruangan 3D gedung
                    engineRef.current?.enterBuilding(projIdx);
                    setDismissedIsland(projIdx);
                  }}
                  className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#F7B32B] px-4 py-2.5 font-space text-[11.5px] uppercase tracking-wider text-[#1C1813] shadow-[3px_3px_0_#1C1813] hover:bg-[#1C1813] hover:text-[#F2EDE3]"
                >
                  <Landmark className="h-4 w-4" aria-hidden />
                  masuk gedung
                </button>
              )}
              <button
                type="button"
                onClick={() => setDismissedIsland(projIdx)}
                className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#F7F2E6] px-4 py-2.5 font-space text-[11.5px] uppercase tracking-wider shadow-[3px_3px_0_#1C1813] hover:bg-[#1C1813] hover:text-[#F2EDE3]"
              >
                tutup
              </button>
            </div>
          </>
        )}
      </aside>

      {/* ================= KARTU TUTORIAL (menunggu input) ================= */}
      {showTutorialCard && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2">
          <div className="hand2 pointer-events-auto border-2 border-[#1C1813] bg-[#F7F2E6]/95 px-4 py-3 shadow-[4px_4px_0_#1C1813] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-space text-[9.5px] uppercase tracking-[1.5px] text-[#1C1813]/55">
                kendali {TUTORIAL_STEPS.length - remainingSteps.length}/
                {TUTORIAL_STEPS.length}
              </p>
              <button
                type="button"
                onClick={() => {
                  for (const s of TUTORIAL_STEPS)
                    doneActionsRef.current.add(s.action);
                  setDoneActions(new Set(doneActionsRef.current));
                  setDoneHint(true);
                  if (doneHintTimerRef.current)
                    clearTimeout(doneHintTimerRef.current);
                  doneHintTimerRef.current = setTimeout(
                    () => setDoneHint(false),
                    6000
                  );
                }}
                className="font-space text-[9.5px] uppercase tracking-wider text-[#1C1813]/45 underline decoration-dotted hover:text-[#E4572E]"
              >
                lewati
              </button>
            </div>
            <p className="font-dm mt-1 text-lg italic leading-snug text-[#1C1813] sm:text-xl">
              {isTouch ? remainingSteps[0].labelTouch : remainingSteps[0].label}
            </p>
            <div className="mt-2 flex gap-1.5" aria-hidden>
              {TUTORIAL_STEPS.map((s) => (
                <span
                  key={s.action}
                  className={`h-1.5 flex-1 rounded-full border border-[#1C1813] ${
                    doneActions.has(s.action) ? "bg-[#E4572E]" : "bg-transparent"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= HINT PENUTUP TUTORIAL ================= */}
      <AnimatePresence>
        {started && doneHint && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2"
          >
            <div className="hand whitespace-nowrap border-2 border-[#1C1813] bg-[#F7F2E6]/90 px-4 py-2 font-space text-[10.5px] uppercase tracking-wider text-[#1C1813] shadow-[3px_3px_0_#1C1813]">
              <b className="text-[#E4572E]">H</b> kendali ·{" "}
              <b className="text-[#E4572E]">E</b> sapa/masuk ·{" "}
              <b className="text-[#E4572E]">Q</b> emote · kumpulkan
              bintangnya
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ================= OVERLAY DAFTAR PULAU (ala index.html) ================= */}
      <AnimatePresence>
        {listOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-[#F2EDE3]"
            role="dialog"
            aria-label="Daftar pulau proyek"
          >
            <button
              type="button"
              onClick={() => setListOpen(false)}
              className="hand fixed right-4 top-4 z-10 grid h-11 w-11 place-items-center border-2 border-[#1C1813] bg-[#F7F2E6] shadow-[3px_3px_0_#1C1813] hover:bg-[#E4572E] hover:text-[#F2EDE3] sm:right-6 sm:top-5"
              aria-label="Tutup daftar"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-14 sm:px-8 sm:pt-16">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="font-space flex items-center gap-3 text-[11px] uppercase tracking-[2px] text-[#1C1813]/70">
                    <span className="h-[2px] w-9 bg-[#E4572E]" aria-hidden />
                    № 01 — peta kepulauan
                  </p>
                  <h2 className="font-dm mt-2 text-[clamp(42px,6.5vw,84px)] leading-none">
                    PULAU{" "}
                    <em className="italic text-[#E4572E]">proyek</em>
                  </h2>
                  <span className="hand mt-4 inline-block border-2 border-[#1C1813] bg-[#E9E1CF] px-3 py-1.5 font-space text-[11px] tracking-wider">
                    {visited.size}/{PROJECTS.length} PULAU DIKUNJUNGI
                  </span>
                </div>
                <p className="max-w-[400px] pb-2 text-[15px] leading-relaxed text-[#1C1813]/70">
                  Klik untuk terbang langsung ke pulaunya — atau cari jalannya
                  sendiri lewat batu-batu loncatan. Pulau pusat tetap jadi titik
                  awalmu.
                </p>
              </div>
              <ul className="mt-8">
                {PROJECTS.map((p, i) => {
                  const isVisited = visited.has(i + 1);
                  return (
                    <li
                      key={p.name}
                      className={
                        i === PROJECTS.length - 1
                          ? "border-b-2 border-[#1C1813]"
                          : ""
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleTeleport(i)}
                        className="group flex w-full items-center gap-4 border-t-2 border-[#1C1813] px-2 py-4 text-left transition-colors hover:bg-[#E9E1CF] sm:gap-6 sm:py-[18px]"
                      >
                        <span className="font-dm w-9 shrink-0 text-2xl italic leading-none text-[#E4572E] sm:w-[52px] sm:text-[32px]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <DoodleIsle
                          w={134}
                          h={88}
                          color={NPC_COLOR_HEX[(i + 2) % NPC_COLOR_HEX.length]}
                          seed={i}
                          className="hand2 hidden shrink-0 border-2 border-[#1C1813] shadow-[3px_3px_0_#1C1813] sm:block"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-dm block break-words text-[clamp(23px,3.4vw,34px)] italic leading-[1.05]">
                            {p.name}
                          </span>
                          <span className="mt-0.5 block font-space text-[11px] text-[#1C1813]/55">
                            {p.language ?? "proyek"} ·{" "}
                            {format(new Date(p.updatedAt), "yyyy", {
                              locale: idLocale,
                            })}{" "}
                            · diperbarui {fmtMonth(p.updatedAt)}
                          </span>
                        </span>
                        <span
                          className={`hand hidden shrink-0 whitespace-nowrap border-[1.5px] border-[#1C1813] px-2.5 py-1.5 font-space text-[9.5px] tracking-[1px] sm:inline-block ${
                            isVisited
                              ? "bg-[#E4572E] text-[#F2EDE3]"
                              : "text-[#1C1813]/70"
                          }`}
                        >
                          {isVisited ? "DIKUNJUNGI" : "BELUM DIKUNJUNGI"}
                        </span>
                        {isVisited ? (
                          <Check
                            className="h-4 w-4 shrink-0 text-[#E4572E] sm:hidden"
                            aria-label="Sudah dikunjungi"
                          />
                        ) : null}
                        <ArrowRight className="hidden h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1.5 sm:block" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-6 font-space text-[10.5px] uppercase tracking-wider text-[#1C1813]/50">
                esc — kembali ke permainan · data dari github.com/Zyxcid
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= PAMERAN GEDUNG PROYEK (masuk via pintu / tombol panel) ================= */}
      <AnimatePresence>
        {exhibit && exhibitProject && exhibitShot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-[#F2EDE3]"
            role="dialog"
            aria-label={`Pameran ${exhibitProject.name}`}
          >
            <button
              type="button"
              onClick={() => setExhibitIsland(null)}
              className="hand fixed right-4 top-4 z-10 grid h-11 w-11 place-items-center border-2 border-[#1C1813] bg-[#F7F2E6] shadow-[3px_3px_0_#1C1813] hover:bg-[#E4572E] hover:text-[#F2EDE3] sm:right-6 sm:top-5"
              aria-label="Tutup pameran"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <div className="mx-auto max-w-[920px] px-5 pb-24 pt-14 sm:px-8 sm:pt-16">
              {/* ---------- kepala pameran ---------- */}
              <p className="font-space flex items-center gap-3 text-[11px] uppercase tracking-[2px] text-[#1C1813]/70">
                <span className="h-[2px] w-9 bg-[#E4572E]" aria-hidden />
                gedung proyek · pulau {String(exhibitIsland).padStart(2, "0")} —{" "}
                {exhibit.building}
              </p>
              <h2 className="font-dm mt-2 text-[clamp(40px,7vw,72px)] italic leading-[0.95] text-[#1C1813]">
                {exhibitProject.name}
              </h2>
              <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-[#1C1813]/80">
                {exhibit.tagline}
              </p>

              {/* ---------- galeri tangkapan layar ---------- */}
              <section className="mt-9">
                <div className="hand2 border-[2.5px] border-[#1C1813] bg-[#F7F2E6] p-2.5 shadow-[6px_6px_0_#1C1813]">
                  <div className="relative flex h-[40vh] items-center justify-center overflow-hidden border-2 border-[#1C1813] bg-[#E9E1CF] sm:h-[52vh]">
                    <img
                      src={exhibitShot.src}
                      alt={exhibitShot.caption}
                      className="max-h-full max-w-full object-contain"
                      draggable={false}
                    />
                  </div>
                  <p className="mt-2.5 px-1 pb-0.5 font-space text-[10.5px] uppercase tracking-wider text-[#1C1813]/70">
                    {exhibitShot.caption} · {Math.min(galleryIdx + 1, exhibit.gallery.length)}/
                    {exhibit.gallery.length}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {exhibit.gallery.map((s, i) => (
                    <button
                      key={s.src}
                      type="button"
                      onClick={() => setGalleryIdx(i)}
                      className={`hand2 border-[2.5px] p-1 transition-transform hover:-translate-y-0.5 ${
                        i === galleryIdx
                          ? "border-[#E4572E] bg-[#E4572E]/15 shadow-[3px_3px_0_#E4572E]"
                          : "border-[#1C1813] bg-[#F7F2E6] shadow-[3px_3px_0_#1C1813]"
                      }`}
                      aria-label={`Lihat: ${s.caption}`}
                      aria-pressed={i === galleryIdx}
                    >
                      <img
                        src={s.src}
                        alt=""
                        className="h-12 w-auto border-[1.5px] border-[#1C1813] sm:h-14"
                        draggable={false}
                      />
                    </button>
                  ))}
                </div>
              </section>

              {/* ---------- statistik ---------- */}
              <section className="mt-11 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {exhibit.stats.map((st) => (
                  <div
                    key={st.label}
                    className="hand2 border-2 border-[#1C1813] bg-[#F7F2E6] p-3.5 text-center"
                  >
                    <p className="font-dm text-3xl italic leading-none text-[#E4572E] sm:text-4xl">
                      {st.value}
                    </p>
                    <p className="mt-2 font-space text-[9.5px] uppercase tracking-[1px] text-[#1C1813]/60">
                      {st.label}
                    </p>
                  </div>
                ))}
              </section>

              {/* ---------- cerita proyek ---------- */}
              <section className="mt-11">
                <h3 className="font-space flex items-center gap-3 text-[11px] uppercase tracking-[2px] text-[#1C1813]/70">
                  <span className="h-[2px] w-9 bg-[#E4572E]" aria-hidden />
                  tentang proyek
                </h3>
                {exhibit.story.map((p, i) => (
                  <p
                    key={i}
                    className="mt-4 max-w-[62ch] text-[15px] leading-[1.75] text-[#1C1813]/85"
                  >
                    {p}
                  </p>
                ))}
              </section>

              {/* ---------- fitur ---------- */}
              <section className="mt-11">
                <h3 className="font-space flex items-center gap-3 text-[11px] uppercase tracking-[2px] text-[#1C1813]/70">
                  <span className="h-[2px] w-9 bg-[#E4572E]" aria-hidden />
                  apa yang ada di dalamnya
                </h3>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {exhibit.features.map((f, i) => {
                    const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length];
                    return (
                      <div
                        key={f.title}
                        className="hand2 flex items-start gap-3 border-2 border-[#1C1813] bg-[#F7F2E6] p-3.5"
                      >
                        <Icon
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#E4572E]"
                          aria-hidden
                        />
                        <div>
                          <p className="text-sm font-bold text-[#1C1813]">
                            {f.title}
                          </p>
                          <p className="mt-1 text-[13px] leading-relaxed text-[#1C1813]/70">
                            {f.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* ---------- bahan pembuat ---------- */}
              <section className="mt-11">
                <h3 className="font-space flex items-center gap-3 text-[11px] uppercase tracking-[2px] text-[#1C1813]/70">
                  <span className="h-[2px] w-9 bg-[#E4572E]" aria-hidden />
                  bahan pembuat
                </h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {exhibit.stack.map((s) => (
                    <span
                      key={s}
                      className="hand border-[1.5px] border-[#1C1813] bg-[#E9E1CF] px-2.5 py-1.5 font-space text-[10px] tracking-wider text-[#1C1813]"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </section>

              {/* ---------- kredit data ---------- */}
              {exhibit.credit && (
                <p className="mt-9 max-w-[62ch] border-t-2 border-[#1C1813]/15 pt-5 text-[12.5px] leading-relaxed text-[#1C1813]/55">
                  {exhibit.credit}
                </p>
              )}

              {/* ---------- aksi ---------- */}
              <div className="mt-7 flex flex-wrap gap-2.5">
                <a
                  href={exhibitProject.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#E4572E] px-4 py-2.5 font-space text-[11.5px] uppercase tracking-wider text-[#F2EDE3] shadow-[3px_3px_0_#1C1813] hover:bg-[#1C1813]"
                >
                  <Github className="h-4 w-4" aria-hidden />
                  buka repo
                  <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
                </a>
                <button
                  type="button"
                  onClick={() => setExhibitIsland(null)}
                  className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#F7F2E6] px-4 py-2.5 font-space text-[11.5px] uppercase tracking-wider text-[#1C1813] shadow-[3px_3px_0_#1C1813] hover:bg-[#1C1813] hover:text-[#F2EDE3]"
                >
                  kembali ke permainan
                </button>
              </div>
              <p className="mt-6 font-space text-[10.5px] uppercase tracking-wider text-[#1C1813]/50">
                esc — kembali ke permainan
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= KARTU KENDALI (tombol H) ================= */}
      <AnimatePresence>
        {controlsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-[rgba(28,24,19,0.45)] p-4"
            onClick={() => setControlsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 12 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              className="hand2 w-full max-w-lg border-[2.5px] border-[#1C1813] bg-[#F7F2E6] p-6 shadow-[8px_8px_0_#1C1813] sm:p-7"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Kendali"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-space text-[10px] uppercase tracking-[2px] text-[#1C1813]/60">
                    kartu kendali
                  </p>
                  <h2 className="font-dm mt-1 text-4xl italic leading-none">
                    CARA <em className="text-[#E4572E]">main</em>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setControlsOpen(false)}
                  className="hand grid h-10 w-10 shrink-0 place-items-center border-2 border-[#1C1813] hover:bg-[#E4572E] hover:text-[#F2EDE3]"
                  aria-label="Tutup kartu kendali"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2.5 text-left sm:grid-cols-3">
                {[
                  {
                    icon: Move,
                    label: "bergerak",
                    val: isTouch ? "joystick kiri" : "WASD / panah",
                  },
                  {
                    icon: ArrowBigUpDash,
                    label: "lompat ×2",
                    val: isTouch ? "tombol lompat, dua kali" : "spasi, dua kali",
                  },
                  {
                    icon: Zap,
                    label: "dash",
                    val: isTouch ? "tombol petir" : "shift / K",
                  },
                  {
                    icon: MousePointer2,
                    label: "kamera",
                    val: isTouch ? "geser layar · cubit zoom" : "seret mouse · scroll zoom",
                  },
                  {
                    icon: MessageCircle,
                    label: "bicara",
                    val: isTouch ? "tombol sapa (muncul dekat penghuni)" : "E — dekat penghuni",
                  },
                  {
                    icon: Landmark,
                    label: "masuk gedung",
                    val: isTouch ? "tombol masuk, di depan pintu" : "E — di depan pintu gedung",
                  },
                  {
                    icon: Trophy,
                    label: "taman bermain",
                    val: isTouch
                      ? "tombol aksi dekat mainan · bola ditendang dengan jalan"
                      : "E — ayunan / platform perosotan / meja Connect 4 · bola ditendang dengan jalan",
                  },
                  {
                    icon: Sparkles,
                    label: "emote",
                    val: isTouch
                      ? "tombol emote di kiri bawah"
                      : "Q buka roda · 1–7 langsung",
                  },
                  {
                    icon: List,
                    label: "daftar pulau",
                    val: isTouch ? "tombol pulau di kanan atas" : "tombol pulau / kanan atas",
                  },
                ].map(({ icon: Icon, label, val }) => (
                  <div key={label} className="hand2 border-2 border-[#1C1813] bg-[#F2EDE3] p-3">
                    <Icon className="mb-1 h-4 w-4 text-[#E4572E]" aria-hidden />
                    <p className="font-space text-[9px] uppercase tracking-wider text-[#1C1813]/70">{label}</p>
                    <p className="mt-0.5 text-xs font-semibold">{val}</p>
                  </div>
                ))}
              </div>
              <div className="hand2 mt-2.5 flex items-start gap-3 border-2 border-[#1C1813] bg-[#E9E1CF] p-3">
                <Gamepad2
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#E4572E]"
                  aria-hidden
                />
                <p className="text-xs leading-relaxed">
                  <b>Kontroler gamepad?</b> Tinggal colok — stik kiri bergerak,
                  <b> A</b> lompat, <b>B / X</b> dash, <b>Y</b> sapa penghuni,
                  <b> LB</b> emote berikutnya, <b>RB</b> roda emote,
                  <b> Start</b> daftar pulau, stik kanan kamera. Getaran halus ikut
                  aktif dan ikut mati bersama tombol suara.
                </p>
              </div>
              <div className="hand2 mt-2.5 flex items-start gap-3 border-2 border-[#1C1813] bg-[#E9E1CF] p-3">
                <Users
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#E4572E]"
                  aria-hidden
                />
                <p className="text-xs leading-relaxed">
                  <b>Tamu lain?</b> {presence !== null
                    ? "Kadang ada burung lain melayang dengan label nama — itu pengunjung sungguhan yang kebetulan online bersamamu."
                    : "Situs ini berjalan mode solo — multiplayer belum diaktifkan (lihat README, seksi Multiplayer)."}
                </p>
              </div>
              <p className="mt-4 font-space text-[10px] uppercase tracking-wider text-[#1C1813]/50">
                tekan <b className="text-[#E4572E]">H</b> kapan saja untuk membuka
                kartu ini · <b className="text-[#E4572E]">Q</b> untuk emote · tahan
                spasi saat jatuh untuk melayang pelan
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= KONTROL SENTUH ================= */}
      {started && isTouch && (
        <>
          <div
            ref={joystickBaseRef}
            className={`hand absolute bottom-8 left-6 z-30 flex h-28 w-28 items-center justify-center rounded-full border-2 border-[#1C1813] transition-colors ${
              joystickActive ? "bg-[#E9E1CF]" : "bg-[#F7F2E6]/70"
            }`}
            style={{ touchAction: "none" }}
            role="application"
            aria-label="Joystick gerak"
          >
            <div
              ref={joystickKnobRef}
              className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 rounded-full border-2 border-[#1C1813] bg-[#E4572E] shadow-[2px_2px_0_#1C1813]"
              style={{ transform: "translate(-50%, -50%)" }}
            />
          </div>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              toggleWheel();
            }}
            className="hand absolute bottom-44 left-6 z-30 grid h-14 w-14 place-items-center border-2 border-[#1C1813] bg-[#F7B32B] shadow-[3px_3px_0_#1C1813] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1C1813]"
            style={{ touchAction: "none" }}
            aria-label="Buka roda emote"
          >
            <Sparkles className="h-6 w-6" aria-hidden />
          </button>
          <div className="absolute bottom-8 right-6 z-30 flex flex-col items-end gap-3">
            <AnimatePresence mode="wait">
              {insideNear !== null ? (
                <motion.button
                  key="aksi-dalam"
                  initial={{ opacity: 0, scale: 0.8, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 8 }}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    talkPress();
                  }}
                  className="hand flex h-14 items-center gap-2 border-2 border-[#1C1813] bg-[#E4572E] px-4 font-space text-[11px] uppercase tracking-wider text-[#F2EDE3] shadow-[3px_3px_0_#1C1813] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1C1813]"
                  style={{ touchAction: "none" }}
                  aria-label={
                    insideNear.kind === "exit"
                      ? "Keluar dari gedung"
                      : insideNear.kind === "pad"
                        ? "Jawab kuis kanji"
                        : "Lihat pameran"
                  }
                >
                  {insideNear.kind === "exit" ? (
                    <DoorOpen className="h-5 w-5" aria-hidden />
                  ) : insideNear.kind === "pad" ? (
                    <ListChecks className="h-5 w-5" aria-hidden />
                  ) : (
                    <BookOpen className="h-5 w-5" aria-hidden />
                  )}
                  {insideNear.kind === "exit"
                    ? "keluar"
                    : insideNear.kind === "pad"
                      ? "jawab"
                      : "lihat"}
                </motion.button>
              ) : nearDoor !== null ? (
                <motion.button
                  key="masuk"
                  initial={{ opacity: 0, scale: 0.8, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 8 }}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    talkPress();
                  }}
                  className="hand flex h-14 items-center gap-2 border-2 border-[#1C1813] bg-[#E4572E] px-4 font-space text-[11px] uppercase tracking-wider text-[#F2EDE3] shadow-[3px_3px_0_#1C1813] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1C1813]"
                  style={{ touchAction: "none" }}
                  aria-label="Masuk gedung proyek"
                >
                  <DoorOpen className="h-5 w-5" aria-hidden />
                  masuk
                </motion.button>
              ) : nearToy !== null ? (
                <motion.button
                  key="toy"
                  initial={{ opacity: 0, scale: 0.8, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 8 }}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    talkPress();
                  }}
                  className={`hand flex h-14 items-center gap-2 border-2 border-[#1C1813] px-4 font-space text-[11px] uppercase tracking-wider shadow-[3px_3px_0_#1C1813] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1C1813] ${
                    nearToy.kind === "github"
                      ? "bg-[#1C1813] text-[#F2EDE3]"
                      : "bg-[#F7B32B] text-[#1C1813]"
                  }`}
                  style={{ touchAction: "none" }}
                  aria-label={nearToy.label}
                >
                  {nearToy.kind === "swing" ? (
                    <Armchair className="h-5 w-5" aria-hidden />
                  ) : nearToy.kind === "slide" ? (
                    <ArrowDownRight className="h-5 w-5" aria-hidden />
                  ) : nearToy.kind === "github" ? (
                    <Github className="h-5 w-5" aria-hidden />
                  ) : (
                    <CircleDot className="h-5 w-5" aria-hidden />
                  )}
                  {nearToy.kind === "swing"
                    ? "ayunan"
                    : nearToy.kind === "slide"
                      ? "luncur"
                      : nearToy.kind === "github"
                        ? "github"
                        : "main"}
                </motion.button>
              ) : nearNpc !== null && !showTutorialCard ? (
                <motion.button
                  key="sapa"
                  initial={{ opacity: 0, scale: 0.8, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 8 }}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    talkPress();
                  }}
                  className="hand flex h-14 items-center gap-2 border-2 border-[#1C1813] bg-[#F7B32B] px-4 font-space text-[11px] uppercase tracking-wider text-[#1C1813] shadow-[3px_3px_0_#1C1813] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1C1813]"
                  style={{ touchAction: "none" }}
                  aria-label="Sapa penghuni pulau"
                >
                  <MessageCircle className="h-5 w-5" aria-hidden />
                  sapa
                </motion.button>
              ) : null}
            </AnimatePresence>
            <div className="flex items-end gap-3">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  dashDown();
                }}
                className="hand grid h-16 w-16 place-items-center border-2 border-[#1C1813] bg-[#F7B32B] shadow-[3px_3px_0_#1C1813] font-space text-[11px] uppercase tracking-wider text-[#1C1813] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1C1813]"
                style={{ touchAction: "none" }}
                aria-label="Dash"
              >
                <Zap className="h-6 w-6" aria-hidden />
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  jumpDown();
                }}
                onPointerUp={jumpUp}
                onPointerLeave={jumpUp}
                onPointerCancel={jumpUp}
                className="hand grid h-20 w-20 place-items-center border-2 border-[#1C1813] bg-[#1C1813] shadow-[3px_3px_0_#1C1813] font-dm text-[15px] italic text-[#F2EDE3] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1C1813]"
                style={{ touchAction: "none" }}
                aria-label="Lompat — tekan dua kali untuk double jump"
              >
                lompat
              </button>
            </div>
          </div>
        </>
      )}

      {/* ================= RODA EMOTE (Q / tombol percik) ================= */}
      <AnimatePresence>
        {wheelOpen && started && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="absolute bottom-6 left-1/2 z-40 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2"
            role="dialog"
            aria-label="Roda emote"
          >
            <div className="hand2 border-[2.5px] border-[#1C1813] bg-[#F7F2E6]/97 p-4 shadow-[6px_6px_0_#1C1813] backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-space text-[10px] uppercase tracking-[2px] text-[#1C1813]/60">
                  emote milikmu · {effStars}/{starCount.total} bintang
                </p>
                <button
                  type="button"
                  onClick={() => setWheelOpen(false)}
                  className="hand grid h-8 w-8 place-items-center border-2 border-[#1C1813] hover:bg-[#E4572E] hover:text-[#F2EDE3]"
                  aria-label="Tutup roda emote"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {EMOTES.map((def, i) => ({ def, i }))
                  .filter(({ def }) => emoteUnlocked(def, effStars, starCount.total))
                  .map(({ def, i }) => {
                    const Icon = EMOTE_ICONS[def.id] ?? Sparkles;
                    return (
                      <button
                        key={def.id}
                        type="button"
                        onClick={() => handleEmotePlay(def.id)}
                        aria-label={`Mainkan emote ${def.label}`}
                        className="hand2 flex flex-col items-center gap-1 border-2 border-[#1C1813] bg-[#F2EDE3] px-1.5 pb-2.5 pt-2 transition-transform hover:-translate-y-0.5"
                      >
                        <Icon className="h-5 w-5 text-[#E4572E]" aria-hidden />
                        <span className="font-space text-[9px] uppercase leading-none tracking-wider text-[#1C1813]">
                          {def.label}
                        </span>
                        <span className="font-space text-[8px] leading-none tabular-nums text-[#1C1813]/55">
                          {i + 1}
                        </span>
                      </button>
                    );
                  })}
                {scarfUnlocked && (
                  <button
                    type="button"
                    onClick={toggleScarf}
                    aria-pressed={scarfOn}
                    aria-label="Syal emas — hadiah semua bintang"
                    className={`hand2 flex flex-col items-center gap-1 border-2 border-[#1C1813] px-1.5 pb-2.5 pt-2 transition-transform hover:-translate-y-0.5 ${
                      scarfOn ? "bg-[#F7B32B]" : "bg-[#F2EDE3]"
                    }`}
                  >
                    <Crown className="h-5 w-5 text-[#E4572E]" aria-hidden />
                    <span className="font-space text-[9px] uppercase leading-none tracking-wider text-[#1C1813]">
                      syal emas
                    </span>
                    <span className="font-space text-[8px] leading-none text-[#1C1813]/55">
                      {scarfOn ? "dipakai" : "lepas"}
                    </span>
                  </button>
                )}
              </div>
              <p className="mt-2.5 font-space text-[9.5px] uppercase tracking-wider text-[#1C1813]/50">
                {isTouch
                  ? "ketuk untuk bermain"
                  : "ketuk atau tekan 1–7 · esc menutup"}{" "}
                · emote lain menunggu di daftar kolektibel (tas kanan atas)
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= DAFTAR KOLEKTIBEL (tas kanan atas) ================= */}
      <AnimatePresence>
        {collectOpen && started && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-[rgba(28,24,19,0.45)] p-4"
            onClick={() => setCollectOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 12 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              className="hand2 max-h-[86dvh] w-full max-w-lg overflow-y-auto border-[2.5px] border-[#1C1813] bg-[#F7F2E6] p-6 shadow-[8px_8px_0_#1C1813] sm:p-7"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Daftar kolektibel"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-space text-[10px] uppercase tracking-[2px] text-[#1C1813]/60">
                    koleksi &amp; pencapaian
                  </p>
                  <h2 className="font-dm mt-1 text-4xl italic leading-none">
                    KOLEKTIBEL
                  </h2>
                  <p className="mt-2 font-space text-[10.5px] uppercase tracking-wider text-[#1C1813]/60">
                    bintang {effStars}/{starCount.total} · lencana{" "}
                    {badges.length}/{BADGES.length} · emote{" "}
                    {EMOTES.filter((d) => emoteUnlocked(d, effStars, starCount.total)).length}/
                    {EMOTES.length}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCollectOpen(false)}
                  className="hand grid h-10 w-10 shrink-0 place-items-center border-2 border-[#1C1813] hover:bg-[#E4572E] hover:text-[#F2EDE3]"
                  aria-label="Tutup daftar kolektibel"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              {/* ---------- emote ---------- */}
              <h3 className="font-space mt-5 flex items-center gap-3 text-[11px] uppercase tracking-[2px] text-[#1C1813]/70">
                <span className="h-[2px] w-9 bg-[#E4572E]" aria-hidden />
                emote — tekan Q lalu pilih
              </h3>
              <ul className="mt-3 grid grid-cols-2 gap-2">
                {EMOTES.map((def, i) => {
                  const unlocked = emoteUnlocked(def, effStars, starCount.total);
                  const need = unlockStars(def, starCount.total);
                  const Icon = EMOTE_ICONS[def.id] ?? Sparkles;
                  return (
                    <li
                      key={def.id}
                      className={`hand2 flex items-center gap-2.5 border-2 border-[#1C1813] p-2.5 ${
                        unlocked ? "bg-[#F2EDE3]" : "bg-[#E9E1CF] opacity-70"
                      }`}
                    >
                      {unlocked ? (
                        <Icon className="h-4 w-4 shrink-0 text-[#E4572E]" aria-hidden />
                      ) : (
                        <Lock className="h-4 w-4 shrink-0 text-[#1C1813]/60" aria-hidden />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#1C1813]">
                          {def.label}
                          {unlocked && (
                            <span className="ml-1.5 font-space text-[9px] text-[#1C1813]/50">
                              #{i + 1}
                            </span>
                          )}
                        </p>
                        <p className="font-space text-[9px] uppercase tracking-wider text-[#1C1813]/55">
                          {unlocked ? "terbuka" : `butuh ${need} bintang`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* ---------- syal emas ---------- */}
              <div className="hand2 mt-2.5 flex items-center justify-between gap-3 border-2 border-[#1C1813] bg-[#F2EDE3] p-2.5">
                <div className="flex items-center gap-2.5">
                  <Crown className="h-4 w-4 shrink-0 text-[#E4572E]" aria-hidden />
                  <div>
                    <p className="text-xs font-bold text-[#1C1813]">Syal emas</p>
                    <p className="font-space text-[9px] uppercase tracking-wider text-[#1C1813]/55">
                      {scarfUnlocked
                        ? scarfOn
                          ? "dipakai"
                          : "terbuka — belum dipakai"
                        : `kumpulkan semua ${starCount.total} bintang`}
                    </p>
                  </div>
                </div>
                {scarfUnlocked && (
                  <button
                    type="button"
                    onClick={toggleScarf}
                    aria-pressed={scarfOn}
                    className="hand border-2 border-[#1C1813] bg-[#F7B32B] px-2.5 py-1.5 font-space text-[10px] uppercase tracking-wider hover:bg-[#1C1813] hover:text-[#F2EDE3]"
                  >
                    {scarfOn ? "lepas" : "pakai"}
                  </button>
                )}
              </div>

              {/* ---------- lencana taman bermain ---------- */}
              <h3 className="font-space mt-5 flex items-center gap-3 text-[11px] uppercase tracking-[2px] text-[#1C1813]/70">
                <span className="h-[2px] w-9 bg-[#E4572E]" aria-hidden />
                lencana taman bermain
              </h3>
              <ul className="mt-3 grid gap-2">
                {BADGES.map((b) => {
                  const got = badges.includes(b.id);
                  return (
                    <li
                      key={b.id}
                      className={`hand2 flex items-center gap-3 border-2 border-[#1C1813] p-2.5 ${
                        got ? "bg-[#E4572E]/12" : "bg-[#E9E1CF] opacity-75"
                      }`}
                    >
                      {got ? (
                        <Check className="h-4 w-4 shrink-0 text-[#E4572E]" aria-hidden />
                      ) : (
                        <Lock className="h-4 w-4 shrink-0 text-[#1C1813]/60" aria-hidden />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#1C1813]">{b.label}</p>
                        <p className="font-space text-[9px] uppercase tracking-wider text-[#1C1813]/55">
                          {b.desc}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* ---------- reset ---------- */}
              <div className="hand2 mt-5 flex items-center justify-between gap-3 border-2 border-dashed border-[#1C1813]/45 p-3">
                <p className="text-[11px] leading-relaxed text-[#1C1813]/60">
                  Progres (bintang, kunjungan, lencana, emote) tersimpan di
                  perangkat ini — reload halaman tidak menghapusnya.
                </p>
                <button
                  type="button"
                  onClick={handleResetProgress}
                  className={`hand flex shrink-0 items-center gap-2 border-2 border-[#1C1813] px-3 py-2 font-space text-[10px] uppercase tracking-wider ${
                    resetArm
                      ? "bg-[#E4572E] text-[#F2EDE3]"
                      : "bg-[#F2EDE3] hover:bg-[#1C1813] hover:text-[#F2EDE3]"
                  }`}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  {resetArm ? "yakin? klik lagi" : "mulai dari awal"}
                </button>
              </div>
              <p className="mt-4 font-space text-[10px] uppercase tracking-wider text-[#1C1813]/50">
                esc — kembali ke permainan
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= CONNECT 4 (meja taman bermain) ================= */}
      <AnimatePresence>
        {c4Open && started && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-[rgba(28,24,19,0.45)] p-4"
            onClick={() => setC4Open(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 12 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              className="hand2 w-full max-w-md border-[2.5px] border-[#1C1813] bg-[#F7F2E6] p-5 shadow-[8px_8px_0_#1C1813] sm:p-6"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Permainan Connect 4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-space text-[10px] uppercase tracking-[2px] text-[#1C1813]/60">
                    meja taman bermain
                  </p>
                  <h2 className="font-dm mt-1 text-4xl italic leading-none">
                    CONNECT <em className="text-[#E4572E]">4</em>
                  </h2>
                  <p
                    className="mt-1.5 flex items-center gap-1.5 font-space text-[10px] uppercase tracking-wider text-[#1C1813]/70"
                    aria-live="polite"
                  >
                    <Users className="h-3 w-3 text-[#E4572E]" aria-hidden />
                    lawan: {" "}
                    {c4Spectator
                      ? "dua pemain sedang bermain"
                      : c4Opponent
                        ? `${c4Opponent.name} (tamu lain) · kamu ${
                            c4MyColor === 1 ? "merah" : "kuning"
                          }`
                        : "penghuni pulau (komputer)"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setC4Open(false)}
                  className="hand grid h-10 w-10 shrink-0 place-items-center border-2 border-[#1C1813] hover:bg-[#E4572E] hover:text-[#F2EDE3]"
                  aria-label="Tutup Connect 4"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <p className="mt-2.5 text-[13px] leading-relaxed text-[#1C1813]/75">
                {c4Status === "play" &&
                  (c4Spectator
                    ? "Kamu menonton dua tamu yang sedang saling lawan — papan di pulau ikut bergerak."
                    : c4Opponent
                      ? c4MyTurn
                        ? "Giliranmu — klik kolom (atau tekan 1–7) untuk menjatuhkan disc-mu."
                        : `${c4Opponent.name} sedang bergerak…`
                      : c4Turn === 1
                        ? "Giliranmu — klik kolom (atau tekan 1–7) untuk menjatuhkan disc merah."
                        : "Penghuni sedang berpikir…")}
                {c4Status === "win" &&
                  (c4Opponent
                    ? `Kamu menang lawan ${c4Opponent.name}! Papan 3D di pulau ikut tersimpan.`
                    : "Kamu menang! Lencana Juara Connect 4 milikmu — papan 3D di pulau ikut tersimpan.")}
                {c4Status === "lose" &&
                  (c4Opponent
                    ? `${c4Opponent.name} menang ronde ini. Coba lagi!`
                    : "Penghuni menang ronde ini. Coba lagi — dia suka kolom tengah.")}
                {c4Status === "draw" && "Papan penuh — seri. Ulang?"}
              </p>

              {/* papan: kolom = tombol; baris digambar dari atas (row 5) ke bawah (row 0) */}
              <div className="hand2 mt-4 border-[2.5px] border-[#1C1813] bg-[#E9E1CF] p-2 shadow-[4px_4px_0_#1C1813]">
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: C4_COLS }, (_, c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => c4Drop(c)}
                      disabled={c4Status !== "play" || !c4MyTurn}
                      aria-label={`Jatuhkan disc di kolom ${c + 1}`}
                      className="group flex flex-col gap-1.5"
                    >
                      <span className="hidden font-space text-[8px] uppercase text-[#1C1813]/0 group-hover:text-[#1C1813]/70 sm:block">
                        {c + 1}
                      </span>
                      {Array.from({ length: C4_ROWS }, (_, k) => {
                        const r = C4_ROWS - 1 - k;
                        const v = c4Cells[c]?.[r] ?? 0;
                        const inWin = c4WinLine?.includes(c * 6 + r);
                        return (
                          <span
                            key={r}
                            className={`grid aspect-square w-full place-items-center rounded-full border-2 border-[#1C1813] transition-colors ${
                              v === 1
                                ? "bg-[#E4572E]"
                                : v === 2
                                  ? "bg-[#F7B32B]"
                                  : "bg-[#F7F2E6] group-hover:bg-[#F2EDE3] group-disabled:bg-[#F7F2E6]"
                            } ${inWin ? "outline outline-2 outline-offset-1 outline-[#1C1813]" : ""}`}
                            aria-hidden
                          />
                        );
                      })}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {c4Status !== "play" && (
                  <button
                    type="button"
                    onClick={c4Reset}
                    className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#E4572E] px-4 py-2.5 font-space text-[11px] uppercase tracking-wider text-[#F2EDE3] shadow-[3px_3px_0_#1C1813] hover:bg-[#1C1813]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    main lagi
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setC4Open(false)}
                  className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#F7F2E6] px-4 py-2.5 font-space text-[11px] uppercase tracking-wider text-[#1C1813] shadow-[3px_3px_0_#1C1813] hover:bg-[#1C1813] hover:text-[#F2EDE3]"
                >
                  kembali ke permainan
                </button>
                <p className="w-full font-space text-[10px] uppercase tracking-wider text-[#1C1813]/50">
                  esc — kembali · menang lawan penghuni = lencana “Juara Connect 4”
                  {c4Peers.length > 0
                    ? ` · ${c4Peers.length} tamu lain sedang membuka meja ini`
                    : ""}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= INTRO OVERLAY ================= */}
      <AnimatePresence>
        {!started && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-[#F2EDE3]/97 backdrop-blur-sm"
          >
            <div className="hand2 mx-4 w-full max-w-md border-[2.5px] border-[#1C1813] bg-[#F7F2E6] p-7 text-center shadow-[8px_8px_0_#1C1813] sm:p-9">
              <p className="font-space text-[10px] uppercase tracking-[2px] text-[#1C1813]/60">
                portofolio interaktif
              </p>
              <h1 className="font-dm mt-2 text-5xl leading-[0.95] sm:text-6xl">
                zyxcid
                <em className="mt-1 block italic text-[#E4572E] underline decoration-wavy decoration-[#1C1813] underline-offset-[8px]">
                  ukiyo
                </em>
              </h1>
              <p className="mx-auto mt-5 max-w-[38ch] text-[15px] leading-relaxed text-[#1C1813]/80">
                Ukiyo (浮世) — "dunia melayang". Di sinilah proyek-proyek saya
                jadi pulau kecil yang mengapung. Jelajahi bebas, kumpulkan
                bintangnya, dan sapa penghuninya.
              </p>
              <button
                type="button"
                onClick={handleStart}
                className="hand mt-7 w-full border-[2.5px] border-[#1C1813] bg-[#E4572E] px-6 py-4 font-dm text-xl italic text-[#F2EDE3] shadow-[5px_5px_0_#1C1813] hover:bg-[#1C1813] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[3px_3px_0_#1C1813]"
              >
                mulai
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
