#!/usr/bin/env node
// Trail — version check hook (installed by trail-init, do not edit manually)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TRAIL_URL    = "https://trail.silverbackbase.com";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const KEYWORDS     = ["trail", "attribution", "lead", "parcours", "canal", "/trail-", "trail_"];

const sbbDir        = join(homedir(), ".silverbackbase");
const installedFile = join(sbbDir, "trail-skill-version");
const cacheFile     = join(sbbDir, "trail-version-cache.json");

let raw = "";
process.stdin.on("data", c => { raw += c; });
process.stdin.on("end", () => { check().then(() => process.exit(0)).catch(() => process.exit(0)); });

async function check() {
  try {
    const prompt = (JSON.parse(raw)?.prompt ?? "").toLowerCase();
    if (!KEYWORDS.some(kw => prompt.includes(kw))) return;
    if (!existsSync(installedFile)) return;

    const installedVersion = readFileSync(installedFile, "utf-8").trim();
    if (!installedVersion) return;

    let latestVersion = null;
    let cacheAge = Infinity;
    try {
      const cache = JSON.parse(readFileSync(cacheFile, "utf-8"));
      cacheAge = Date.now() - (cache.checkedAt ?? 0);
      if (cache.version) latestVersion = cache.version;
    } catch {}

    if (cacheAge > CACHE_TTL_MS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 800);
        const resp = await fetch(`${TRAIL_URL}/version`, { signal: controller.signal });
        clearTimeout(timer);
        if (resp.ok) {
          const data = await resp.json();
          latestVersion = data.version;
          mkdirSync(sbbDir, { recursive: true });
          writeFileSync(cacheFile, JSON.stringify({ version: latestVersion, checkedAt: Date.now() }), "utf-8");
        }
      } catch {}
    }

    if (latestVersion && installedVersion !== latestVersion) {
      process.stdout.write(
        `[Trail] Mise à jour disponible : skill ${installedVersion} → ${latestVersion}. Lance \`npx @silverbackbase/trail@latest init\` pour activer les nouvelles recommandations.\n`
      );
    }
  } catch {}
}
