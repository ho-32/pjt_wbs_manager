export type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "drop";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "done", "drop"];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  drop: "Drop",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "#8a8f98",
  in_progress: "#2f7de1",
  in_review: "#b47c1f",
  done: "#2fa04a",
  drop: "#c0392b",
};

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  /** CSV file name (server/data/tasks/) this project's tasks are stored under, derived from its name. */
  taskFile: string;
}

export interface Task {
  id: string;
  projectId: string;
  parentId: string;
  title: string;
  status: TaskStatus;
  assignee: string;
  planStart: string;
  planEnd: string;
  actualStart: string;
  actualEnd: string;
  refLink: string;
  note: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskNode extends Task {
  children: TaskNode[];
  depth: number;
}
