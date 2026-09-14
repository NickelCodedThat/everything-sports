import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env loader for the standalone CLI (Next.js itself auto-loads env
 * files, but this script runs outside Next via tsx). Existing `process.env`
 * values always win, so real environment variables still take precedence.
 */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) value = value.slice(1, -1);

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/** Loads .env.local first (higher precedence), then .env, mirroring Next's own precedence. */
export function loadDotEnvFiles(cwd: string = process.cwd()): void {
  loadEnvFile(resolve(cwd, ".env.local"));
  loadEnvFile(resolve(cwd, ".env"));
}
