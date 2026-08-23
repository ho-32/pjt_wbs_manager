import { STATUS_LABELS, TASK_STATUSES, TaskStatus } from "../types";
import { SCHEDULE_LABELS, SCHEDULE_STATUSES, ScheduleStatus } from "../utils/schedule";
import { TaskFilters, emptyFilters } from "../utils/tree";

interface ToolbarProps {
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  allAssignees: string[];
  onAddRootTask: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  matchedCount: number;
  totalCount: number;
}

export function Toolbar({
  filters,
  onFiltersChange,
  allAssignees,
  onAddRootTask,
  onExpandAll,
  onCollapseAll,
  matchedCount,
  totalCount,
}: ToolbarProps) {
  const toggleStatus = (s: TaskStatus) => {
    const next = new Set(filters.statuses);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onFiltersChange({ ...filters, statuses: next });
  };
  const toggleAssignee = (a: string) => {
    const next = new Set(filters.assignees);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    onFiltersChange({ ...filters, assignees: next });
  };
  const toggleScheduleStatus = (s: ScheduleStatus) => {
    const next = new Set(filters.scheduleStatuses);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onFiltersChange({ ...filters, scheduleStatuses: next });
  };
  const clearFilters = () => onFiltersChange(emptyFilters());
  const filtersActive = filters.statuses.size > 0 || filters.assignees.size > 0 || filters.scheduleStatuses.size > 0;

  return (
    <div className="toolbar">
      <button className="btn primary" onClick={onAddRootTask}>
        + 새 작업
      </button>

      <details className="filter-dropdown">
        <summary>
          상태 필터{filters.statuses.size > 0 ? ` (${filters.statuses.size})` : ""}
        </summary>
        <div className="filter-panel">
          {TASK_STATUSES.map((s) => (
            <label key={s} className="checkbox-row">
              <input type="checkbox" checked={filters.statuses.has(s)} onChange={() => toggleStatus(s)} />
              {STATUS_LABELS[s]}
            </label>
          ))}
        </div>
      </details>

      <details className="filter-dropdown">
        <summary>
          담당자 필터{filters.assignees.size > 0 ? ` (${filters.assignees.size})` : ""}
        </summary>
        <div className="filter-panel">
          {allAssignees.length === 0 && <div className="filter-empty">담당자 없음</div>}
          {allAssignees.map((a) => (
            <label key={a} className="checkbox-row">
              <input type="checkbox" checked={filters.assignees.has(a)} onChange={() => toggleAssignee(a)} />
              {a}
            </label>
          ))}
        </div>
      </details>

      <details className="filter-dropdown">
        <summary>
          진행 상태 필터{filters.scheduleStatuses.size > 0 ? ` (${filters.scheduleStatuses.size})` : ""}
        </summary>
        <div className="filter-panel">
          {SCHEDULE_STATUSES.map((s) => (
            <label key={s} className="checkbox-row">
              <input
                type="checkbox"
                checked={filters.scheduleStatuses.has(s)}
                onChange={() => toggleScheduleStatus(s)}
              />
              {SCHEDULE_LABELS[s]}
            </label>
          ))}
        </div>
      </details>

      {filtersActive && (
        <button className="btn ghost small" onClick={clearFilters}>
          필터 초기화
        </button>
      )}

      {filtersActive && (
        <span className="filter-summary">
          {matchedCount} / {totalCount}건 일치
        </span>
      )}

      <div className="spacer" />

      <button className="btn ghost small" onClick={onExpandAll}>
        모두 펼치기
      </button>
      <button className="btn ghost small" onClick={onCollapseAll}>
        모두 접기
      </button>
    </div>
  );
}
