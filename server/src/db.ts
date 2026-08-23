import path from "path";
import { fileURLToPath } from "url";
import { CsvStore } from "./store.js";
import { Project, Task, TaskStatus } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
export const TASKS_DIR = path.join(DATA_DIR, "tasks");

export const projectStore = new CsvStore<Project>(
  path.join(DATA_DIR, "projects.csv"),
  ["id", "name", "description", "createdAt", "taskFile"],
  (row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    createdAt: row.createdAt,
    taskFile: row.taskFile ?? "",
  }),
  (item) => ({ ...item })
);

const TASK_HEADERS: (keyof Task)[] = [
  "id",
  "projectId",
  "parentId",
  "title",
  "status",
  "assignee",
  "planStart",
  "planEnd",
  "actualStart",
  "actualEnd",
  "refLink",
  "note",
  "orderIndex",
  "createdAt",
  "updatedAt",
];

function taskFromRow(row: Record<string, string>): Task {
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId ?? "",
    title: row.title,
    status: (row.status || "todo") as TaskStatus,
    assignee: row.assignee ?? "",
    planStart: row.planStart ?? "",
    planEnd: row.planEnd ?? "",
    actualStart: row.actualStart ?? "",
    actualEnd: row.actualEnd ?? "",
    refLink: row.refLink ?? "",
    note: row.note ?? "",
    orderIndex: Number(row.orderIndex) || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function taskToRow(item: Task): Record<string, unknown> {
  return { ...item };
}

/**
 * Each project's tasks live in their own CSV file under data/tasks/, named after
 * the project (see sanitize.ts). This manager keeps one lazily-created CsvStore
 * per project, keyed by project id, and can rename/delete the backing file when
 * a project is renamed or removed.
 */
class TaskStoreManager {
  private stores = new Map<string, CsvStore<Task>>();

  private buildStore(fileName: string): CsvStore<Task> {
    return new CsvStore<Task>(path.join(TASKS_DIR, fileName), TASK_HEADERS, taskFromRow, taskToRow);
  }

  getStore(project: Project): CsvStore<Task> {
    let store = this.stores.get(project.id);
    if (!store) {
      store = this.buildStore(project.taskFile);
      this.stores.set(project.id, store);
    }
    return store;
  }

  async renameFile(project: Project, newFileName: string): Promise<void> {
    const store = this.getStore(project);
    await store.rename(path.join(TASKS_DIR, newFileName));
  }

  async destroyFile(project: Project): Promise<void> {
    const store = this.getStore(project);
    await store.destroy();
    this.stores.delete(project.id);
  }
}

export const taskStoreManager = new TaskStoreManager();
