import { promises as fs } from "fs";
import path from "path";
import { parseCSV, rowsToObjects, stringifyCSV } from "./csv.js";

type WithId = { id: string };

/**
 * A tiny CSV-backed table. Keeps an in-memory copy for fast reads and
 * writes the whole file back to disk on every mutation. A simple promise
 * chain serializes mutations so concurrent requests can't interleave writes
 * (fine for a local single-user tool; not meant for high concurrency).
 */
export class CsvStore<T extends WithId> {
  private items: T[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private loaded = false;

  constructor(
    private filePath: string,
    private headers: (keyof T)[],
    private fromRow: (row: Record<string, string>) => T,
    private toRow: (item: T) => Record<string, unknown>
  ) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const text = await fs.readFile(this.filePath, "utf-8");
      const rows = parseCSV(text);
      this.items = rowsToObjects(rows).map((r) => this.fromRow(r));
    } catch (err: any) {
      if (err.code === "ENOENT") {
        this.items = [];
        await this.persist();
      } else {
        throw err;
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const csv = stringifyCSV(
      this.headers.map((h) => String(h)),
      this.items.map((item) => this.toRow(item))
    );
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, csv, "utf-8");
    await fs.rename(tmpPath, this.filePath);
  }

  private run<R>(fn: () => Promise<R> | R): Promise<R> {
    const result = this.queue.then(async () => {
      await this.ensureLoaded();
      return fn();
    });
    // swallow errors in the chain itself so one failed op doesn't wedge the queue
    this.queue = result.catch(() => undefined);
    return result;
  }

  list(): Promise<T[]> {
    return this.run(() => [...this.items]);
  }

  get(id: string): Promise<T | undefined> {
    return this.run(() => this.items.find((i) => i.id === id));
  }

  insert(item: T): Promise<T> {
    return this.run(async () => {
      this.items.push(item);
      await this.persist();
      return item;
    });
  }

  /**
   * Atomic "read current rows, then decide what to insert" in one queued step.
   * Use this instead of `list()` + `insert()` whenever the new item depends on the
   * current table contents (e.g. a uniqueness check) — two concurrent `list()` calls
   * can both see the same pre-insert snapshot and compute a colliding value (this is
   * exactly how two projects previously ended up sharing one taskFile).
   */
  insertComputed(compute: (current: readonly T[]) => T): Promise<T> {
    return this.run(async () => {
      const item = compute(this.items);
      this.items.push(item);
      await this.persist();
      return item;
    });
  }

  update(id: string, patch: Partial<T>): Promise<T | undefined> {
    return this.run(async () => {
      const idx = this.items.findIndex((i) => i.id === id);
      if (idx === -1) return undefined;
      this.items[idx] = { ...this.items[idx], ...patch };
      await this.persist();
      return this.items[idx];
    });
  }

  /** Same atomicity guarantee as `insertComputed`, for an update whose patch depends on current rows. */
  updateComputed(id: string, compute: (current: readonly T[]) => Partial<T>): Promise<T | undefined> {
    return this.run(async () => {
      const idx = this.items.findIndex((i) => i.id === id);
      if (idx === -1) return undefined;
      const patch = compute(this.items);
      this.items[idx] = { ...this.items[idx], ...patch };
      await this.persist();
      return this.items[idx];
    });
  }

  remove(id: string): Promise<boolean> {
    return this.run(async () => {
      const before = this.items.length;
      this.items = this.items.filter((i) => i.id !== id);
      if (this.items.length === before) return false;
      await this.persist();
      return true;
    });
  }

  removeMany(ids: Set<string>): Promise<number> {
    return this.run(async () => {
      const before = this.items.length;
      this.items = this.items.filter((i) => !ids.has(i.id));
      const removed = before - this.items.length;
      if (removed > 0) await this.persist();
      return removed;
    });
  }

  /** Move the backing file to a new path (used when a project is renamed). */
  rename(newPath: string): Promise<void> {
    return this.run(async () => {
      const oldPath = this.filePath;
      if (oldPath === newPath) return;
      this.filePath = newPath;
      try {
        await fs.mkdir(path.dirname(newPath), { recursive: true });
        await fs.rename(oldPath, newPath);
      } catch (err: any) {
        if (err.code !== "ENOENT") throw err;
        // Old file was never created on disk yet (e.g. no tasks added so far) -
        // just (re)write the current in-memory state at the new location.
        await this.persist();
      }
    });
  }

  /** Delete the backing file entirely (used when a project is deleted). */
  destroy(): Promise<void> {
    return this.run(async () => {
      try {
        await fs.unlink(this.filePath);
      } catch (err: any) {
        if (err.code !== "ENOENT") throw err;
      }
    });
  }

  /** Replace a batch of items (by id) in one persisted write. */
  updateMany(patches: { id: string; patch: Partial<T> }[]): Promise<T[]> {
    return this.run(async () => {
      const updated: T[] = [];
      for (const { id, patch } of patches) {
        const idx = this.items.findIndex((i) => i.id === id);
        if (idx === -1) continue;
        this.items[idx] = { ...this.items[idx], ...patch };
        updated.push(this.items[idx]);
      }
      if (updated.length > 0) await this.persist();
      return updated;
    });
  }

  /** Serialize the current table to CSV text (for user-facing export/download). */
  exportCsv(): Promise<string> {
    return this.run(() =>
      stringifyCSV(
        this.headers.map((h) => String(h)),
        this.items.map((item) => this.toRow(item))
      )
    );
  }

  /** Wholesale replace the table contents (used by CSV import) in one persisted write. */
  replaceAll(items: T[]): Promise<T[]> {
    return this.run(async () => {
      this.items = items;
      await this.persist();
      return [...this.items];
    });
  }
}
