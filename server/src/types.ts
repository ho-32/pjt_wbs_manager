export type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "drop";

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  /** File name (under server/data/tasks/) holding this project's tasks, derived from its name. */
  taskFile: string;
}

export interface Task {
  id: string;
  projectId: string;
  parentId: string; // "" for root task
  title: string;
  status: TaskStatus;
  assignee: string;
  planStart: string; // YYYY-MM-DD or ""
  planEnd: string;
  actualStart: string;
  actualEnd: string;
  refLink: string; // reference URL, freeform
  note: string; // freeform remarks
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "done", "drop"];
