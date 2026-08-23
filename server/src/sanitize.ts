import { Project } from "./types";

/**
 * Turn a project name into a filesystem-safe base name (no extension).
 * Only strips characters that are actually invalid in file names
 * (\ / : * ? " < > | and control chars); spaces and hyphens are kept as-is
 * so the file name reads like the project name.
 */
export function sanitizeBaseName(name: string): string {
  let s = name
    .trim()
    .replace(/[\\/:*?"<>\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
  if (s.length > 80) s = s.slice(0, 80).trim();
  return s || "project";
}

/**
 * Build a `<name>.csv` file name for a project, disambiguating against every
 * other project's current file name with a Windows-style " (2)" suffix.
 */
export function buildUniqueTaskFileName(name: string, projectId: string, existing: readonly Project[]): string {
  const base = sanitizeBaseName(name);
  const taken = new Set(existing.filter((p) => p.id !== projectId).map((p) => p.taskFile));
  const plain = `${base}.csv`;
  if (!taken.has(plain)) return plain;
  let n = 2;
  while (taken.has(`${base} (${n}).csv`)) n++;
  return `${base} (${n}).csv`;
}
