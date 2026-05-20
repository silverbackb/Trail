#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const args = process.argv.slice(2);
const tokenIdx = args.indexOf("--token");
const token = tokenIdx !== -1 ? args[tokenIdx + 1] : args.find(a => a.startsWith("--token="))?.split("=")[1];
const isLocal = !token;

const TRAIL_MCP_URL = "https://trail.silverbackbase.com/mcp";

const mcpEntry = isLocal
  ? { command: "npx", args: ["-y", "--package=@silverbackbase/trail", "trail-mcp"] }
  : { type: "http", url: TRAIL_MCP_URL, headers: { Authorization: `Bearer ${token}` } };

function upsert(configPath: string) {
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, "utf-8")); } catch {}
  } else {
    mkdirSync(dirname(configPath), { recursive: true });
  }
  const servers = (config.mcpServers as Record<string, unknown>) ?? {};
  servers.trail = mcpEntry;
  config.mcpServers = servers;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

const home = homedir();

const clients = [
  {
    name: "Claude Code",
    path: join(home, ".claude.json"),
  },
  {
    name: "Claude Desktop",
    path: process.platform === "win32"
      ? join(process.env.APPDATA ?? home, "Claude", "claude_desktop_config.json")
      : join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
  },
  {
    name: "Cursor",
    path: join(process.cwd(), ".cursor", "mcp.json"),
  },
];

// Configure all existing clients; always configure Claude Code as fallback
const configured: string[] = [];

for (const client of clients) {
  if (existsSync(client.path)) {
    upsert(client.path);
    configured.push(client.name);
  }
}

if (!configured.includes("Claude Code")) {
  upsert(clients[0].path);
  configured.push("Claude Code");
}

console.log("\n  Trail MCP configuré\n");
configured.forEach(name => console.log(`  ✓ ${name}`));
console.log(`\n  Mode   : ${isLocal ? "local — SQLite, zéro config" : "cloud — trail.silverbackbase.com"}`);
if (!isLocal) console.log(`  Token  : ${token}`);
console.log("\n  Redémarrez votre agent IA pour activer Trail.\n");
