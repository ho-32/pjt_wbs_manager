import { Task, TaskNode, TaskStatus } from "../types";
import { computeScheduleStatus, ScheduleStatus } from "./schedule";
import { todayStr } from "./date";

export function buildTree(tasks: Task[]): TaskNode[] {
  const byId = new Map<string, TaskNode>();
  for (const t of tasks) byId.set(t.id, { ...t, children: [], depth: 0 });

  const roots: TaskNode[] = [];
  for (const t of tasks) {
    const node = byId.get(t.id)!;
    const parent = t.parentId ? byId.get(t.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortAndDepth = (nodes: TaskNode[], depth: number) => {
    nodes.sort((a, b) => a.orderIndex - b.orderIndex);
    for (const n of nodes) {
      n.depth = depth;
      sortAndDepth(n.children, depth + 1);
    }
  };
  sortAndDepth(roots, 0);
  return roots;
}

/** Depth-first flatten, expanding only nodes whose id is in `expanded` (or all, if expanded is null). */
export function flattenTree(
  nodes: TaskNode[],
  expanded: Set<string> | null,
  visibleIds: Set<string> | null
): TaskNode[] {
  const out: TaskNode[] = [];
  const walk = (list: TaskNode[]) => {
    for (const n of list) {
      if (visibleIds && !visibleIds.has(n.id)) continue;
      out.push(n);
      const isExpanded = expanded === null || expanded.has(n.id);
      if (isExpanded && n.children.length > 0) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function getAncestorIds(tasks: Task[], taskId: string): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const chain: string[] = [];
  let current = byId.get(taskId);
  while (current && current.parentId) {
    chain.push(current.parentId);
    current = byId.get(current.parentId);
  }
  return chain;
}

export function collectDescendantIds(tasks: Task[], rootId: string): Set<string> {
  const byParent = new Map<string, Task[]>();
  for (const t of tasks) {
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

export interface TaskFilters {
  statuses: Set<TaskStatus>; // empty set = no filter (show all)
  assignees: Set<string>; // empty set = no filter (show all)
  scheduleStatuses: Set<ScheduleStatus>; // empty set = no filter (show all)
}

export function emptyFilters(): TaskFilters {
  return { statuses: new Set(), assignees: new Set(), scheduleStatuses: new Set() };
}

export function filtersActive(filters: TaskFilters): boolean {
  return filters.statuses.size > 0 || filters.assignees.size > 0 || filters.scheduleStatuses.size > 0;
}

function matchesFilters(task: Task, filters: TaskFilters, today: string): boolean {
  if (filters.statuses.size > 0 && !filters.statuses.has(task.status)) return false;
  if (filters.assignees.size > 0 && !filters.assignees.has(task.assignee)) return false;
  if (filters.scheduleStatuses.size > 0 && !filters.scheduleStatuses.has(computeScheduleStatus(task, today))) {
    return false;
  }
  return true;
}

/**
 * Returns { matchedIds, visibleIds }. visibleIds = matched tasks plus all of their
 * ancestors (so the WBS hierarchy stays intact); matchedIds is used to distinguish a
 * genuine match from a row shown only for context.
 */
export function computeFilterResult(
  tasks: Task[],
  filters: TaskFilters,
  today: string = todayStr()
): { matchedIds: Set<string>; visibleIds: Set<string> | null } {
  if (!filtersActive(filters)) return { matchedIds: new Set(tasks.map((t) => t.id)), visibleIds: null };

  const matchedIds = new Set(tasks.filter((t) => matchesFilters(t, filters, today)).map((t) => t.id));
  const visibleIds = new Set(matchedIds);
  for (const id of matchedIds) {
    for (const ancestorId of getAncestorIds(tasks, id)) visibleIds.add(ancestorId);
  }
  return { matchedIds, visibleIds };
}
