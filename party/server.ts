import { routePartykitRequest, Server } from "partyserver";
import type { Connection } from "partyserver";

/**
 * Ruang multiplayer "dunia" — zyxcid · ukiyo
 *
 * Server ini sengaja DIBUAT SEPELE MUNGKIN: hanya me-relay pesan posisi
 * antar pengunjung yang sedang membuka situs (presence / "hantu" tamu lain).
 * TIDAK ada akun, tidak ada penyimpanan, tidak ada chat, tidak ada data
 * yang disimpan setelah koneksi tertutup.
 *
 * Berjalan sebagai Cloudflare Worker + Durable Object ("PartyServer"):
 * di-deploy ke akun Cloudflare milik sendiri lewat `npm run party:deploy`
 * (wrangler) — bukan lagi platform managed PartyKit yang sudah ditutup.
 * Diaktifkan dengan hibernation WebSocket agar hemat kuota gratis.
 *
 * Protokol (JSON string, ≤ 512 byte):
 *  - klien → server: {"t":"p","id":..,"n":..,"c":..,"x":..,"y":..,"z":..,"ry":..,"m":..,"s":..}
 *      → di-relay ke semua klien LAIN (pengirim mengabaikan pesan ber-id sendiri)
 *  - klien → server: {"t":"bye","id":..}  (sopan santun saat menutup tab)
 *  - server → semua: {"t":"bye","id":..}  (otomatis saat koneksi terputus)
 *
 * URL ruang: /parties/main/dunia  (binding DO bernama `Main`, kamar `dunia`)
 */

/** Batas pengunjung serentak dalam satu ruang — jaga beban kuota gratis */
const MAX_CLIENTS = 60;
/** Batas ukuran pesan per relay — pesan posisi asli ~100 byte */
const MAX_MSG_LEN = 512;

/** Bindung Durable Object di wrangler.jsonc → menentukan path /parties/main/... */
type Env = {
  Main: DurableObjectNamespace<UkiyoServer>;
};

export class UkiyoServer extends Server<Env> {
  /** Hibernation: DO boleh tidur di sela pesan — koneksi WS tetap hidup */
  static options = { hibernate: true };

  onConnect(connection: Connection) {
    // tolak halus kalau ruang terlalu penuh (presence saja, bukan game kompetitif)
    let size = 0;
    for (const _c of this.getConnections()) size++;
    if (size > MAX_CLIENTS) {
      connection.close(1008, "ruang penuh");
    }
  }

  onMessage(
    connection: Connection,
    message: string | ArrayBuffer | ArrayBufferView
  ) {
    if (typeof message !== "string" || message.length > MAX_MSG_LEN) return;

    let data: { t?: unknown; id?: unknown };
    try {
      data = JSON.parse(message) as { t?: unknown; id?: unknown };
    } catch {
      return; // bukan JSON — abaikan
    }

    // ingat id tamu milik koneksi ini (untuk broadcast "bye" saat terputus);
    // state tersimpan di attachment WebSocket — selamat dari hibernasi
    if (data.t === "p" || data.t === "bye") {
      if (typeof data.id === "string" && data.id.length > 0 && data.id.length <= 40) {
        try {
          connection.setState({ guestId: data.id });
        } catch {
          // state opsional — lanjut tanpa itu
        }
      }
    }

    // relay apa adanya ke klien lain (pengirim menyaring pesan miliknya sendiri)
    this.broadcast(message, [connection.id]);
  }

  onClose(connection: Connection) {
    const s = connection.state as { guestId?: string } | null;
    const guestId = typeof s?.guestId === "string" ? s.guestId : null;
    if (guestId) {
      this.broadcast(JSON.stringify({ t: "bye", id: guestId }));
    }
  }
}

/** Worker utama: arahkan /parties/:server/:room ke Durable Object yang cocok */
const worker: { fetch(request: Request, env: Env): Promise<Response> } = {
  async fetch(request, env) {
    return (
      (await routePartykitRequest(request, env)) ??
      new Response("Not Found", { status: 404 })
    );
  },
};

export default worker;
