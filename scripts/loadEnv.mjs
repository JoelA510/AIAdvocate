// scripts/loadEnv.mjs
// Shared loader for the standalone backfill scripts. Reads supabase/.env and
// populates process.env without overriding values already present in the
// environment. Mirrors the previous per-script implementations.
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadEnv() {
  const envPath = path.resolve(__dirname, "..", "supabase", ".env");
  try {
    const content = await fs.readFile(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      if (process.env[key]) continue;
      let value = trimmed.slice(eq + 1);
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value;
    }
  } catch (err) {
    console.warn("Warning: unable to load supabase/.env:", err.message);
  }
}
