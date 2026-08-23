export const ROW_HEIGHT = 36;
export const DAY_WIDTH = 26;
export const INDENT = 18;

export const COL = {
  title: 280,
  status: 100,
  assignee: 92,
  plan: 200,
  actual: 200,
  refLink: 150,
  note: 160,
  schedule: 114,
};

/** Columns that can be hidden by the user; "title" always stays (it carries expand/actions). */
export type OptionalColumnKey = "status" | "assignee" | "plan" | "actual" | "refLink" | "note" | "schedule";

export const OPTIONAL_COLUMNS: { key: OptionalColumnKey; label: string }[] = [
  { key: "status", label: "상태" },
  { key: "assignee", label: "담당자" },
  { key: "plan", label: "계획 일정" },
  { key: "actual", label: "실행 일정" },
  { key: "refLink", label: "참조 링크" },
  { key: "note", label: "비고" },
  { key: "schedule", label: "진행 상태" },
];

/** Full left-panel width when every optional column is shown. */
export const LEFT_WIDTH = COL.title + OPTIONAL_COLUMNS.reduce((sum, c) => sum + COL[c.key], 0);

/** Left-panel width for the given set of hidden columns. */
export function computeLeftWidth(hidden: Set<OptionalColumnKey>): number {
  return COL.title + OPTIONAL_COLUMNS.reduce((sum, c) => sum + (hidden.has(c.key) ? 0 : COL[c.key]), 0);
}
