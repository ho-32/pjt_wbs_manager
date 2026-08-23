import { Project, Task, TaskStatus } from "../types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export const api = {
  listProjects: () => request<Project[]>("/projects"),
  createProject: (data: { name: string; description: string }) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<{ name: string; description: string }>) =>
    request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),

  // Tasks live under their project (each project persists to its own CSV file server-side),
  // so every task call is scoped by projectId in the URL.
  listTasks: (projectId: string) => request<Task[]>(`/projects/${projectId}/tasks`),
  createTask: (
    projectId: string,
    data: {
      parentId?: string;
      title: string;
      status?: TaskStatus;
      assignee?: string;
      planStart?: string;
      planEnd?: string;
      actualStart?: string;
      actualEnd?: string;
      refLink?: string;
      note?: string;
    }
  ) => request<Task>(`/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify(data) }),
  updateTask: (
    projectId: string,
    taskId: string,
    data: Partial<Omit<Task, "id" | "projectId" | "parentId" | "orderIndex">>
  ) => request<Task>(`/projects/${projectId}/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(data) }),
  moveTask: (projectId: string, taskId: string, data: { parentId: string; orderIndex: number }) =>
    request<Task>(`/projects/${projectId}/tasks/${taskId}/move`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTask: (projectId: string, taskId: string) =>
    request<void>(`/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" }),

  // CSV file save/load: export downloads the project's current CSV, import replaces
  // the whole task list from a CSV file's text (the file the user picks in the browser).
  exportTasksUrl: (projectId: string) => `${BASE}/projects/${projectId}/tasks/export`,
  importTasks: (projectId: string, csv: string) =>
    request<Task[]>(`/projects/${projectId}/tasks/import`, { method: "POST", body: JSON.stringify({ csv }) }),
};
