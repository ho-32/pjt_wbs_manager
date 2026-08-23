import { Router, Request, Response, NextFunction } from "express";
import { v4 as uuid } from "uuid";
import { projectStore, taskStoreManager } from "../db.js";
import { CsvStore } from "../store.js";
import { parseCSV, rowsToObjects } from "../csv.js";
import { Project, Task, TASK_STATUSES, TaskStatus } from "../types.js";

// mergeParams so :projectId from the parent mount point ("/api/projects/:projectId/tasks") is visible here
export const tasksRouter = Router({ mergeParams: true });

function isValidStatus(s: unknown): s is TaskStatus {
  return typeof s === "string" && (TASK_STATUSES as string[]).includes(s);
}

function isValidDate(s: unknown): boolean {
  return s === "" || s === undefined || s === null || /^\d{4}-\d{2}-\d{2}$/.test(String(s));
}

/** Collect all descendant ids (not including the task itself). */
function collectDescendants(allTasks: Task[], rootId: string): Set<string> {
  const byParent = new Map<string, Task[]>();
  for (const t of allTasks) {
    const list = byParent.get(t.parentId) ?? [];
    list.push(t);
    byParent.set(t.parentId, list);
  }
  const result = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const child of byParent.get(current) ?? []) {
      if (!result.has(child.id)) {
        result.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return result;
}

/**
 * Parse a full task CSV export (or a hand-edited/Excel-edited version of one) back into
 * Task rows for import. Unlike the row-level PUT/POST validation, this always replaces the
 * *entire* project's task list in one shot, so it validates the whole set together:
 * every id is unique, every non-root parentId resolves to another row in the same file,
 * and there is no cyclical parentId chain (which would hang the client's tree builder).
 * `projectId` is always forced to the current project regardless of what the CSV says,
 * matching the rule that projectId is never client-settable (see README).
 */
function parseTaskCsv(text: string, projectId: string): Task[] {
  const rows = rowsToObjects(parseCSV(text));
  if (rows.length === 0) {
    throw new Error("빈 CSV 파일이거나 헤더만 있고 데이터 행이 없습니다.");
  }

  const now = new Date().toISOString();
  const seenIds = new Set<string>();
  const nextOrderByParent = new Map<string, number>();

  const tasks: Task[] = rows.map((row, idx) => {
    const title = (row.title ?? "").trim();
    if (!title) throw new Error(`title이 비어 있는 행이 있습니다 (${idx + 2}번째 줄).`);

    let id = (row.id ?? "").trim();
    if (!id) id = uuid();
    if (seenIds.has(id)) throw new Error(`id가 중복되었습니다: ${id}`);
    seenIds.add(id);

    const status: TaskStatus = isValidStatus(row.status) ? (row.status as TaskStatus) : "todo";
    const parentId = (row.parentId ?? "").trim();

    const parsedOrder = Number(row.orderIndex);
    const hasValidOrder = row.orderIndex !== undefined && row.orderIndex !== "" && Number.isFinite(parsedOrder);
    const orderIndex = hasValidOrder ? parsedOrder : (nextOrderByParent.get(parentId) ?? 0) + 1000;
    nextOrderByParent.set(parentId, Math.max(nextOrderByParent.get(parentId) ?? 0, orderIndex));

    const dateOrEmpty = (v: string | undefined) => (isValidDate(v) ? v || "" : "");

    return {
      id,
      projectId,
      parentId,
      title,
      status,
      assignee: (row.assignee ?? "").trim(),
      planStart: dateOrEmpty(row.planStart),
      planEnd: dateOrEmpty(row.planEnd),
      actualStart: dateOrEmpty(row.actualStart),
      actualEnd: dateOrEmpty(row.actualEnd),
      refLink: (row.refLink ?? "").trim(),
      note: row.note ?? "",
      orderIndex,
      createdAt: row.createdAt || now,
      updatedAt: now,
    };
  });

  for (const t of tasks) {
    if (t.parentId && !seenIds.has(t.parentId)) {
      throw new Error(`존재하지 않는 parentId를 참조하는 작업이 있습니다: "${t.title}" → ${t.parentId}`);
    }
  }

  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    let cur: Task | undefined = t;
    let steps = 0;
    while (cur && cur.parentId) {
      cur = byId.get(cur.parentId);
      if (++steps > tasks.length) {
        throw new Error(`parentId가 순환 참조되고 있습니다: "${t.title}"`);
      }
    }
  }

  return tasks;
}

type WithProject = Request & { project: Project; store: CsvStore<Task> };

function asWithProject(req: Request): WithProject {
  return req as unknown as WithProject;
}

/** Resolve :projectId once and attach the project + its dedicated task store to the request. */
async function loadProject(req: Request, res: Response, next: NextFunction) {
  const project = await projectStore.get(req.params.projectId);
  if (!project) return res.status(404).json({ error: "project not found" });
  asWithProject(req).project = project;
  asWithProject(req).store = taskStoreManager.getStore(project);
  next();
}
tasksRouter.use(loadProject);

tasksRouter.get("/", async (req, res) => {
  const { store } = asWithProject(req);
  const all = await store.list();
  all.sort((a, b) => a.orderIndex - b.orderIndex);
  res.json(all);
});

tasksRouter.post("/", async (req, res) => {
  const { project, store } = asWithProject(req);
  const { parentId, title, status, assignee, planStart, planEnd, actualStart, actualEnd, refLink, note } =
    req.body ?? {};

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  const finalStatus: TaskStatus = isValidStatus(status) ? status : "todo";
  for (const d of [planStart, planEnd, actualStart, actualEnd]) {
    if (!isValidDate(d)) return res.status(400).json({ error: "invalid date format, expected YYYY-MM-DD" });
  }

  const resolvedParentId = typeof parentId === "string" ? parentId : "";
  const all = await store.list();
  if (resolvedParentId && !all.some((t) => t.id === resolvedParentId)) {
    return res.status(400).json({ error: "invalid parentId" });
  }
  const siblings = all.filter((t) => t.parentId === resolvedParentId);
  const maxOrder = siblings.reduce((max, t) => Math.max(max, t.orderIndex), 0);

  const now = new Date().toISOString();
  const task: Task = {
    id: uuid(),
    projectId: project.id,
    parentId: resolvedParentId,
    title: title.trim(),
    status: finalStatus,
    assignee: typeof assignee === "string" ? assignee.trim() : "",
    planStart: planStart || "",
    planEnd: planEnd || "",
    actualStart: actualStart || "",
    actualEnd: actualEnd || "",
    refLink: typeof refLink === "string" ? refLink.trim() : "",
    note: typeof note === "string" ? note : "",
    orderIndex: maxOrder + 1000,
    createdAt: now,
    updatedAt: now,
  };
  await store.insert(task);
  res.status(201).json(task);
});

/** Download the project's current task list as a standalone CSV file. */
tasksRouter.get("/export", async (req, res) => {
  const { project, store } = asWithProject(req);
  const csv = await store.exportCsv();
  const base = project.taskFile.replace(/\.csv$/i, "") || "tasks";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  // Plain ASCII fallback filename plus an RFC 5987 UTF-8 one so Korean project names survive.
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="tasks.csv"; filename*=UTF-8''${encodeURIComponent(base)}.csv`
  );
  // Leading BOM so the file opens with correct Korean text when double-clicked into Excel
  // (this is only added to the downloaded copy, not to the file persisted under data/tasks/).
  res.send("\uFEFF" + csv);
});

/**
 * Replace the project's entire task list from an uploaded CSV file (e.g. the file downloaded
 * via /export, possibly hand-edited or edited in Excel and re-saved). This is a full
 * replace, not a merge — the request body is the raw CSV text as JSON: { csv: "..." }.
 */
tasksRouter.post("/import", async (req, res) => {
  const { project, store } = asWithProject(req);
  const csvText = req.body?.csv;
  if (typeof csvText !== "string" || !csvText.trim()) {
    return res.status(400).json({ error: "csv text is required" });
  }
  let tasks: Task[];
  try {
    tasks = parseTaskCsv(csvText, project.id);
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? "failed to parse CSV" });
  }
  const saved = await store.replaceAll(tasks);
  res.json(saved);
});

tasksRouter.put("/:taskId", async (req, res) => {
  const { store } = asWithProject(req);
  const existing = await store.get(req.params.taskId);
  if (!existing) return res.status(404).json({ error: "not found" });

  const { title, status, assignee, planStart, planEnd, actualStart, actualEnd, refLink, note } = req.body ?? {};
  const patch: Partial<Task> = {};

  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title must be non-empty" });
    }
    patch.title = title.trim();
  }
  if (status !== undefined) {
    if (!isValidStatus(status)) return res.status(400).json({ error: "invalid status" });
    patch.status = status;
  }
  if (assignee !== undefined) {
    if (typeof assignee !== "string") return res.status(400).json({ error: "invalid assignee" });
    patch.assignee = assignee.trim();
  }
  if (refLink !== undefined) {
    if (typeof refLink !== "string") return res.status(400).json({ error: "invalid refLink" });
    patch.refLink = refLink.trim();
  }
  if (note !== undefined) {
    if (typeof note !== "string") return res.status(400).json({ error: "invalid note" });
    patch.note = note;
  }
  for (const [key, val] of Object.entries({ planStart, planEnd, actualStart, actualEnd })) {
    if (val !== undefined) {
      if (!isValidDate(val)) return res.status(400).json({ error: `invalid ${key}` });
      (patch as any)[key] = val || "";
    }
  }
  patch.updatedAt = new Date().toISOString();

  const updated = await store.update(req.params.taskId, patch);
  res.json(updated);
});

/** Move / reparent a task, with cycle protection, and reindex within the new parent. */
tasksRouter.patch("/:taskId/move", async (req, res) => {
  const { store } = asWithProject(req);
  const { parentId, orderIndex } = req.body ?? {};
  const taskId = req.params.taskId;
  const all = await store.list();
  const task = all.find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ error: "not found" });

  const newParentId = typeof parentId === "string" ? parentId : task.parentId;

  if (newParentId === taskId) {
    return res.status(400).json({ error: "a task cannot be its own parent" });
  }
  if (newParentId) {
    if (!all.some((t) => t.id === newParentId)) {
      return res.status(400).json({ error: "invalid parentId" });
    }
    const descendants = collectDescendants(all, taskId);
    if (descendants.has(newParentId)) {
      return res.status(400).json({ error: "cannot move a task into its own descendant" });
    }
  }

  const newOrderIndex = typeof orderIndex === "number" && Number.isFinite(orderIndex) ? orderIndex : task.orderIndex;

  const updated = await store.update(taskId, {
    parentId: newParentId,
    orderIndex: newOrderIndex,
    updatedAt: new Date().toISOString(),
  });
  res.json(updated);
});

tasksRouter.delete("/:taskId", async (req, res) => {
  const { store } = asWithProject(req);
  const all = await store.list();
  const task = all.find((t) => t.id === req.params.taskId);
  if (!task) return res.status(404).json({ error: "not found" });
  const descendants = collectDescendants(all, req.params.taskId);
  descendants.add(req.params.taskId);
  await store.removeMany(descendants);
  res.status(204).end();
});
