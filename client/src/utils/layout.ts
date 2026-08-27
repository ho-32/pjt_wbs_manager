export const ROW_HEIGHT = 36;
export const DAY_WIDTH = 26;
export const INDENT = 18;

/** Header/timeline granularity: one column per day, per calendar week, or per month. */
export type TimeUnit = "day" | "week" | "month";

/**
 * Floor for a header column's on-screen width - whichever column the current unit draws
 * (one day, one week, one month). Also the zoom control's "1×" reference value: the zoom
 * levels the user picks from are targets for *this* column, not always the day column.
 */
export const MIN_DAY_WIDTH = 20;

/**
 * Sensible initial header granularity for a given total day-span: short ranges read best
 * day-by-day, medium ranges group into weeks, long ranges group into months (otherwise a
 * long range at day granularity crams too many labels into the header and they overlap).
 * This only seeds the initial value — the user can switch it manually afterwards.
 */
export function pickDefaultUnit(totalDays: number): TimeUnit {
  if (totalDays <= 60) return "day";
  if (totalDays <= 210) return "week";
  return "month";
}

/** Average number of days a single header column spans for each unit (used to convert a
 *  "target column width" zoom level into the underlying px-per-day value below). Month
 *  uses the calendar-average length rather than a fixed 30/31 so the zoom control's steps
 *  stay stable regardless of which months happen to be in view. */
const UNIT_DAY_SPAN: Record<TimeUnit, number> = { day: 1, week: 7, month: 30.44 };

/**
 * Convert a zoom level's "target column width" (px) into px-per-day for the given unit, so
 * that switching Day → Week → Month keeps *one column* around that same target width instead
 * of keeping one day that same width (which would make a week column 7× wider and show far
 * fewer days on screen at any given zoom level - the opposite of what "zooming out via unit"
 * should do). Bar positions and day-resolution overlays (weekend/month-boundary/today) all
 * key off the resulting px-per-day, so they stay correct at any unit.
 */
export function dayWidthForUnit(targetColumnWidth: number, unit: TimeUnit): number {
  return targetColumnWidth / UNIT_DAY_SPAN[unit];
}

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
