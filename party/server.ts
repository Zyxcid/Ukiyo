import type { PartyKitServer, Connection, Room } from "partykit/server";

/**
 * Ruang multiplayer "dunia" — zyxcid · ukiyo
 *
 * Server ini sengaja DIBUAT SEPELEH MUNGKIN: hanya me-relay pesan posisi
 * antar pengunjung yang sedang membuka situs (presence / "hantu" tamu lain).
 * TIDAK ada akun, tidak ada penyimpanan, tidak ada chat, tidak ada data
 * yang disimpan setelah koneksi tertutup.
 *
 * Protokol (JSON string, ≤ 512 byte):
 *  - klien → server: {"t":"p","id":..,"n":..,"c":..,"x":..,"y":..,"z":..,"ry":..,"m":..,"s":..}
 *      → di-relay ke semua klien LAIN (pengirim mengabaikan pesan ber-id sendiri)
 *  - klien → server: {"t":"bye","id":..}  (sopan santun saat menutup tab)
 *  - server → semua: {"t":"bye","id":..}  (otomatis saat koneksi terputus)
 */

/** Batas pengunjung serentak dalam satu ruang — jaga beban kuota gratis */
const MAX_CLIENTS = 60;
/** Batas ukuran pesan per relay — pesan posisi asli ~100 byte */
const MAX_MSG_LEN = 512;

/** Ambil "id tamu" yang dikirim klien dari state koneksi */
function guestIdOf(connection: Connection): string | null {
  const s = connection.state as { guestId?: string } | null;
  return typeof s?.guestId === "string" ? s.guestId : null;
}

export default {
  onConnect(connection: Connection, room: Room) {
    // tolak halus kalau ruang terlalu penuh (presence saja, bukan game kompetitif)
    let size = 0;
    for (const _c of room.getConnections()) size++;
    if (size > MAX_CLIENTS) {
      connection.close(1008, "ruang penuh");
    }
  },

  onMessage(message: string | ArrayBuffer | ArrayBufferView, connection: Connection, room: Room) {
    if (typeof message !== "string" || message.length > MAX_MSG_LEN) return;

    let data: { t?: unknown; id?: unknown };
    try {
      data = JSON.parse(message) as { t?: unknown; id?: unknown };
    } catch {
      return; // bukan JSON — abaikan
    }

    // ingat id tamu milik koneksi ini (untuk broadcast "bye" saat terputus)
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
    room.broadcast(message, [connection.id]);
  },

  onClose(connection: Connection, room: Room) {
    const guestId = guestIdOf(connection);
    if (guestId) {
      room.broadcast(JSON.stringify({ t: "bye", id: guestId }));
    }
  },
} satisfies PartyKitServer;
