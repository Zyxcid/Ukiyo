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
  ArrowRight,
  Check,
  ExternalLink,
  Gamepad2,
  Github,
  List,
  MapPin,
  MessageCircle,
  Moon,
  MousePointer2,
  Move,
  Star,
  Sun,
  Sunrise,
  Sunset,
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
import type { PlayerAction } from "./types";

const emptySubscribe = () => () => {};

function monthsSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 2.63e9;
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
  const berandaSeenRef = useRef(false);
  const startedRef = useRef(false);

  const { toast } = useToast();

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
  const [berandaCard, setBerandaCard] = useState(false);
  const berandaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        // kartu beranda hanya sekali per sesi (setelah mulai)
        if (index === 0 && !berandaSeenRef.current && startedRef.current) {
          berandaSeenRef.current = true;
          setBerandaCard(true);
          if (berandaTimerRef.current) clearTimeout(berandaTimerRef.current);
          berandaTimerRef.current = setTimeout(
            () => setBerandaCard(false),
            9000
          );
        } else if (index !== 0) {
          setBerandaCard(false);
        }
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
      onTalk: (info) => setTalk(info),
      onStar: (c, total) => setStarCount({ c, total }),
      onAllStars: () => {
        toast({
          title: "Semua bintang terkumpul!",
          description: "Kamu penjelajah sejati kepulauan ini.",
        });
      },
      onPresence: (n) => setPresence(n),
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
    engine.setBubbleEl(bubbleRef.current);
    // hook debug (hanya dev; digunakan untuk verifikasi otomatis)
    (window as unknown as { __zyxEngine?: GameEngine }).__zyxEngine = engine;

    return () => {
      delete (window as unknown as { __zyxEngine?: GameEngine }).__zyxEngine;
      if (berandaTimerRef.current) clearTimeout(berandaTimerRef.current);
      if (doneHintTimerRef.current) clearTimeout(doneHintTimerRef.current);
      engine.dispose();
      engineRef.current = null;
    };
  }, [toast]);

  // ---------- input engine aktif hanya saat bermain ----------
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setInputEnabled(started && !listOpen && !controlsOpen);
  }, [started, listOpen, controlsOpen]);

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

  // ---------- tombol pintasan: H (kontrol), Esc (tutup overlay) ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "escape") {
        if (listOpen) setListOpen(false);
        else if (controlsOpen) setControlsOpen(false);
      }
      if (k === "h" && started) {
        if (!listOpen) setControlsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, listOpen, controlsOpen]);

  const handleStart = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      engine.sfx.ensure(); // aktivasi audio dari gesture user
      engine.setInputEnabled(true);
      // player mungkin sudah mendarat di pulau pusat saat intro — tampilkan
      // kartu beranda sekarang (sekali saja per sesi)
      if (
        !berandaSeenRef.current &&
        engine.getDebugState().island === 0
      ) {
        berandaSeenRef.current = true;
        setBerandaCard(true);
        if (berandaTimerRef.current) clearTimeout(berandaTimerRef.current);
        berandaTimerRef.current = setTimeout(() => setBerandaCard(false), 9000);
      }
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

      {/* ================= HINT BICARA (desktop, saat dekat NPC) ================= */}
      {started && !isTouch && nearNpc !== null && !talk && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 -translate-x-1/2">
          <div className="hand flex items-center gap-2 border-2 border-[#1C1813] bg-[#F7F2E6]/95 px-4 py-1.5 font-space text-[10.5px] uppercase tracking-wider shadow-[3px_3px_0_#1C1813]">
            <kbd className="hand border-[1.5px] border-[#1C1813] px-1.5 py-0.5 font-space text-[9px]">E</kbd>
            sapa penghuni
          </div>
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

      {/* ================= KARTU BERANDA (sekali per sesi) ================= */}
      <AnimatePresence>
        {berandaCard && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="absolute bottom-6 left-4 z-20 w-[min(22rem,calc(100vw-2rem))] sm:left-6"
          >
            <div className="hand2 border-[2.5px] border-[#1C1813] bg-[#F7F2E6]/95 p-4 shadow-[5px_5px_0_#1C1813] backdrop-blur-sm">
              <p className="font-space text-[10px] uppercase tracking-[1.5px] text-[#E4572E]">
                pulau pusat
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#1C1813]/85">
                Dari sini kamu bisa ke mana saja — pulau-pulau proyek ada di segala
                arah. Dekati penghuninya dan{" "}
                {isTouch ? "tekan tombol sapa" : "tekan E"} kalau butuh arah.
              </p>
              <button
                type="button"
                onClick={() => setBerandaCard(false)}
                className="mt-2 font-space text-[10px] uppercase tracking-wider text-[#1C1813]/50 underline decoration-dotted hover:text-[#E4572E]"
              >
                mengerti
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              <b className="text-[#E4572E]">E</b> sapa penghuni · kumpulkan
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
                kartu ini · tahan spasi saat jatuh untuk melayang pelan
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
          <div className="absolute bottom-8 right-6 z-30 flex flex-col items-end gap-3">
            <AnimatePresence>
              {nearNpc !== null && (
                <motion.button
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
              )}
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
              <p className="mt-4 font-space text-[10px] uppercase tracking-wider text-[#1C1813]/50">
                kendali muncul sebentar setelah mulai ·{" "}
                <a
                  href={GITHUB_PROFILE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#E4572E] underline decoration-dotted"
                >
                  github.com/Zyxcid
                </a>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
