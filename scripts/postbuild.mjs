/**
 * Post-build cross-platform (Windows/macOS/Linux) — pengganti `cp -r`:
 * menyalin .next/static dan public/ ke output standalone Next.js.
 * Dipanggil otomatis oleh `npm run build`.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("[postbuild] .next/standalone tidak ditemukan — jalankan `next build` dulu.");
  process.exit(1);
}

const staticDir = join(standalone, ".next", "static");
if (!existsSync(staticDir)) mkdirSync(staticDir, { recursive: true });
cpSync(join(root, ".next", "static"), staticDir, { recursive: true });

cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });

console.log("[postbuild] static + public tersalin ke .next/standalone");
