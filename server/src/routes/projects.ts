import { Router } from "express";
import { v4 as uuid } from "uuid";
import { projectStore, taskStoreManager } from "../db.js";
import { buildUniqueTaskFileName } from "../sanitize.js";
import { Project } from "../types.js";

export const projectsRouter = Router();

/** Backfill taskFile for any project row that predates that column. */
async function ensureTaskFiles(projects: Project[]): Promise<Project[]> {
  let changed = false;
  const result: Project[] = [];
  for (const p of projects) {
    if (p.taskFile) {
      result.push(p);
      continue;
    }
    const others = projects.filter((x) => x.id !== p.id);
    const taskFile = buildUniqueTaskFileName(p.name, p.id, [...others, ...result]);
    await projectStore.update(p.id, { taskFile });
    result.push({ ...p, taskFile });
    changed = true;
  }
  return changed ? result : projects;
}

projectsRouter.get("/", async (_req, res) => {
  let projects = await projectStore.list();
  projects = await ensureTaskFiles(projects);
  projects.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json(projects);
});

projectsRouter.post("/", async (req, res) => {
  const { name, description } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const id = uuid();
  const trimmedName = name.trim();
  const trimmedDescription = typeof description === "string" ? description : "";
  const createdAt = new Date().toISOString();

  // insertComputed reads `existing` and pushes the new row in one queued step, so two
  // concurrent creates (e.g. a double-clicked submit button) can't both compute their
  // taskFile from the same pre-insert snapshot and collide on the same file name.
  const project = await projectStore.insertComputed((existing) => ({
    id,
    name: trimmedName,
    description: trimmedDescription,
    createdAt,
    taskFile: buildUniqueTaskFileName(trimmedName, id, existing),
  }));
  // Eagerly create the (empty, header-only) CSV file so it's visible on disk right away.
  await taskStoreManager.getStore(project).list();
  res.status(201).json(project);
});

projectsRouter.put("/:id", async (req, res) => {
  const existing = await projectStore.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });

  const { name, description } = req.body ?? {};
  const trimmedName = typeof name === "string" && name.trim() ? name.trim() : undefined;
  const renaming = trimmedName !== undefined && trimmedName !== existing.name;

  // Renaming touches the filesystem (CsvStore.rename), which can't happen inside the
  // CSV store's own queued step, so it's still done here as a separate await — but the
  // taskFile *value* is computed and written atomically via updateComputed to avoid the
  // same collision race as project creation (see insertComputed above).
  let newTaskFile: string | undefined;
  if (renaming) {
    const allProjects = await projectStore.list();
    newTaskFile = buildUniqueTaskFileName(trimmedName!, existing.id, allProjects);
    if (newTaskFile !== existing.taskFile) {
      await taskStoreManager.renameFile(existing, newTaskFile);
    }
  }

  const updated = await projectStore.updateComputed(req.params.id, () => {
    const patch: Partial<Project> = {};
    if (renaming) {
      patch.name = trimmedName;
      if (newTaskFile !== existing.taskFile) patch.taskFile = newTaskFile;
    }
    if (typeof description === "string") patch.description = description;
    return patch;
  });
  res.json(updated);
});

projectsRouter.delete("/:id", async (req, res) => {
  const project = await projectStore.get(req.params.id);
  if (!project) return res.status(404).json({ error: "not found" });
  await taskStoreManager.destroyFile(project);
  await projectStore.remove(req.params.id);
  res.status(204).end();
});
