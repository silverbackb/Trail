#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

const args = process.argv.slice(2).filter(a => a !== "init");
const tokenIdx = args.indexOf("--token");
let token: string | undefined = tokenIdx !== -1 ? args[tokenIdx + 1] : args.find(a => a.startsWith("--token="))?.split("=")[1];

function isProcessRunning(name: string): boolean {
  try {
    if (process.platform === "darwin") {
      execSync(`pgrep -x "${name}"`, { stdio: "pipe" });
      return true;
    }
    if (process.platform === "win32") {
      const out = execSync(`tasklist /FI "IMAGENAME eq ${name}.exe"`, { stdio: "pipe" }).toString();
      return out.toLowerCase().includes(name.toLowerCase());
    }
    return false;
  } catch {
    return false;
  }
}

async function main() {
  let isLocal = !token;

  const rl = createInterface({ input, output });

  if (!token && args.length === 0) {
    console.log(`\n  🦍 Gorille d'initialisation SilverBackBase — Trail\n`);
    console.log(`  Comment souhaitez-vous utiliser Trail ?`);
    console.log(`  1. Cloud managé (Recommandé — Zéro configuration, rapports centralisés)`);
    console.log(`  2. Local open source (SQLite local, vos propres clés et base de données)`);

    const choice = (await rl.question(`\n  Saisissez votre choix (1 ou 2, défaut: 1) : `)).trim();

    if (choice === "2") {
      isLocal = true;
      console.log(`\n  ✓ Mode Local open source sélectionné.`);
    } else {
      isLocal = false;
      console.log(`\n  ✓ Mode Cloud managé sélectionné.`);
      token = (await rl.question(`  Entrez votre clé d'API (générée sur le site web, format sb_live_...) : `)).trim();
      if (!token) {
        console.error(`\n  ❌ Erreur : La clé d'API ne peut pas être vide.`);
        rl.close();
        process.exit(1);
      }
      if (!token.startsWith("sb_")) {
        console.error(`\n  ❌ Erreur : Format de clé d'API invalide. Elle doit commencer par "sb_".`);
        rl.close();
        process.exit(1);
      }
    }
  }

  const TRAIL_MCP_URL = "https://trail.silverbackbase.com/mcp";

  // JSON entry (Claude Code, Claude Desktop, Cursor, Windsurf, Antigravity)
  const jsonEntry = isLocal
    ? { command: "npx", args: ["-y", "--package=@silverbackbase/trail", "trail-mcp"] }
    : { type: "http", url: TRAIL_MCP_URL, headers: { Authorization: `Bearer ${token}` } };

  function upsertJson(configPath: string) {
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try { config = JSON.parse(readFileSync(configPath, "utf-8")); } catch {}
    } else {
      mkdirSync(dirname(configPath), { recursive: true });
    }
    const servers = (config.mcpServers as Record<string, unknown>) ?? {};
    servers.trail = jsonEntry;
    config.mcpServers = servers;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  }

  // TOML entry (Codex CLI: ~/.codex/config.toml)
  // Local:  [mcp_servers.trail] command = "npx" args = [...]
  // Cloud:  [mcp_servers.trail] url = "..." [mcp_servers.trail.http_headers] Authorization = "Bearer ..."
  function upsertToml(configPath: string) {
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try { config = parseToml(readFileSync(configPath, "utf-8")) as Record<string, unknown>; } catch {}
    } else {
      mkdirSync(dirname(configPath), { recursive: true });
    }
    const servers = (config.mcp_servers as Record<string, unknown>) ?? {};
    if (isLocal) {
      servers.trail = { command: "npx", args: ["-y", "--package=@silverbackbase/trail", "trail-mcp"] };
    } else {
      servers.trail = { url: TRAIL_MCP_URL, http_headers: { Authorization: `Bearer ${token}` } };
    }
    config.mcp_servers = servers;
    writeFileSync(configPath, stringifyToml(config), "utf-8");
  }

  const home = homedir();

  const clients: Array<{ name: string; path: string; processName?: string; format?: "toml" }> = [
    {
      name: "Claude Code",
      path: join(home, ".claude.json"),
    },
    {
      name: "Claude Desktop",
      path: process.platform === "win32"
        ? join(process.env.APPDATA ?? home, "Claude", "claude_desktop_config.json")
        : join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      processName: "Claude",
    },
    {
      name: "Antigravity",
      path: join(home, ".gemini", "antigravity", "mcp_config.json"),
      processName: "Antigravity",
    },
    {
      name: "Codex CLI",
      path: join(home, ".codex", "config.toml"),
      format: "toml",
    },
  ];

  // Block on running GUI apps before writing — they overwrite their config on close
  for (const client of clients) {
    if (client.processName && existsSync(client.path) && isProcessRunning(client.processName)) {
      console.log(`\n  ⚠️  ${client.name} est en cours d'exécution.`);
      console.log(`     Ferme-le complètement (Cmd+Q), puis appuie sur Entrée pour continuer...`);
      await rl.question("");
    }
  }

  rl.close();

  const configured: string[] = [];

  for (const client of clients) {
    if (existsSync(client.path)) {
      client.format === "toml" ? upsertToml(client.path) : upsertJson(client.path);
      configured.push(client.name);
    }
  }

  if (!configured.includes("Claude Code")) {
    upsertJson(clients[0].path);
    configured.push("Claude Code");
  }

  console.log("\n  Trail MCP configuré avec succès !\n");
  configured.forEach(name => console.log(`  ✓ ${name}`));
  console.log(`\n  Mode   : ${isLocal ? "local — SQLite, zéro config" : "cloud — trail.silverbackbase.com"}`);
  if (!isLocal) console.log(`  Token  : ${token}`);
  console.log("\n  Redémarre ton agent IA pour activer Trail.\n");
}

main().catch((err) => {
  console.error("\n  ❌ Une erreur est survenue lors de l'initialisation :", err);
  process.exit(1);
});
