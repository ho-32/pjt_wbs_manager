import { useEffect, useMemo, useRef, useState } from "react";
import { Task } from "../types";
import {
  buildTree,
  collectDescendantIds,
  computeFilterResult,
  filtersActive as areFiltersActive,
  flattenTree,
  TaskFilters,
} from "../utils/tree";
import { addDays, diffDays, parseDateStr, todayStr, toDateStr } from "../utils/date";
import { computeScheduleStatus } from "../utils/schedule";
import { COL, computeLeftWidth, OPTIONAL_COLUMNS, OptionalColumnKey, ROW_HEIGHT } from "../utils/layout";
import { GanttRow, DropPosition } from "./GanttRow";

interface WbsGanttProps {
  tasks: Task[];
  filters: TaskFilters;
  expanded: Set<string>;
  onExpandedChange: (next: Set<string>) => void;
  onAddSubtask: (parentId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onMove: (id: string, parentId: string, orderIndex: number) => void;
  onQuickUpdate: (id: string, patch: Partial<Task>) => void;
}

interface RangeOverride {
  start: string; // YYYY-MM-DD
  end: string;
}

function computeAutoDateRange(tasks: Task[]) {
  const dates: Date[] = [];
  for (const t of tasks) {
    for (const s of [t.planStart, t.planEnd, t.actualStart, t.actualEnd]) {
      const d = parseDateStr(s);
      if (d) dates.push(d);
    }
  }
  const today = parseDateStr(todayStr())!;
  if (dates.length === 0) {
    return { minDate: addDays(today, -3), maxDate: addDays(today, 21) };
  }
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  return { minDate: addDays(min, -3), maxDate: addDays(max, 5) };
}

const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

// day-width steps for zoom in/out, px per day
const ZOOM_LEVELS = [10, 14, 18, 26, 34, 44, 56];
const DEFAULT_ZOOM_INDEX = 3; // 26px, matches the original fixed layout

export function WbsGantt({
  tasks,
  filters,
  expanded,
  onExpandedChange,
  onAddSubtask,
  onEdit,
  onDelete,
  onMove,
  onQuickUpdate,
}: WbsGanttProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overPosition, setOverPosition] = useState<DropPosition | null>(null);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [rangeOverride, setRangeOverride] = useState<RangeOverride | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<OptionalColumnKey>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const dayWidth = ZOOM_LEVELS[zoomIndex];
  const leftWidth = useMemo(() => computeLeftWidth(hiddenColumns), [hiddenColumns]);
  const toggleColumn = (key: OptionalColumnKey) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const tree = useMemo(() => buildTree(tasks), [tasks]);
  const { matchedIds, visibleIds } = useMemo(() => computeFilterResult(tasks, filters), [tasks, filters]);
  const filtersOn = areFiltersActive(filters);
  const rows = useMemo(() => flattenTree(tree, expanded, visibleIds), [tree, expanded, visibleIds]);

  const autoRange = useMemo(() => computeAutoDateRange(tasks), [tasks]);
  const { minDate, maxDate } = useMemo(() => {
    if (rangeOverride) {
      const s = parseDateStr(rangeOverride.start);
      const e = parseDateStr(rangeOverride.end);
      if (s && e && s <= e) return { minDate: s, maxDate: e };
    }
    return autoRange;
  }, [rangeOverride, autoRange]);

  const totalDays = Math.max(diffDays(maxDate, minDate) + 1, 1);
  const timelineWidth = totalDays * dayWidth;
  const today = todayStr();
  const todayD = parseDateStr(today)!;
  const todayInRange = todayD >= minDate && todayD <= maxDate;
  const todayLeft = diffDays(todayD, minDate) * dayWidth;

  const disallowedTargets = useMemo(() => {
    if (!dragId) return new Set<string>();
    const s = collectDescendantIds(tasks, dragId);
    s.add(dragId);
    return s;
  }, [tasks, dragId]);

  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < totalDays; i++) arr.push(addDays(minDate, i));
    return arr;
  }, [minDate, totalDays]);

  const monthGroups = useMemo(() => {
    const groups: { label: string; days: number }[] = [];
    for (const d of days) {
      const label = `${d.getFullYear()}. ${MONTH_NAMES[d.getMonth()]}`;
      if (groups.length > 0 && groups[groups.length - 1].label === label) {
        groups[groups.length - 1].days++;
      } else {
        groups.push({ label, days: 1 });
      }
    }
    return groups;
  }, [days]);

  const handleToggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onExpandedChange(next);
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || !overPosition) return resetDrag();
    if (disallowedTargets.has(targetId)) return resetDrag();

    const targetTask = tasks.find((t) => t.id === targetId);
    if (!targetTask) return resetDrag();

    if (overPosition === "inside") {
      const siblings = tasks.filter((t) => t.parentId === targetId && t.id !== dragId);
      const maxOrder = siblings.reduce((m, t) => Math.max(m, t.orderIndex), 0);
      onMove(dragId, targetId, maxOrder + 1000);
      const next = new Set(expanded);
      next.add(targetId);
      onExpandedChange(next);
    } else {
      const parentId = targetTask.parentId;
      const siblings = tasks
        .filter((t) => t.parentId === parentId && t.id !== dragId)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      const idx = siblings.findIndex((s) => s.id === targetId);
      if (overPosition === "before") {
        const prev = siblings[idx - 1];
        const newOrder = prev ? (prev.orderIndex + targetTask.orderIndex) / 2 : targetTask.orderIndex - 1000;
        onMove(dragId, parentId, newOrder);
      } else {
        const next = siblings[idx + 1];
        const newOrder = next ? (targetTask.orderIndex + next.orderIndex) / 2 : targetTask.orderIndex + 1000;
        onMove(dragId, parentId, newOrder);
      }
    }
    resetDrag();
  };

  const resetDrag = () => {
    setDragId(null);
    setOverId(null);
    setOverPosition(null);
  };

  const bodyHeight = rows.length * ROW_HEIGHT;

  // ---- zoom / pan controls ----
  const zoomIn = () => setZoomIndex((i) => Math.min(i + 1, ZOOM_LEVELS.length - 1));
  const zoomOut = () => setZoomIndex((i) => Math.max(i - 1, 0));
  const zoomReset = () => setZoomIndex(DEFAULT_ZOOM_INDEX);

  const pan = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const visible = Math.max(el.clientWidth - leftWidth, dayWidth * 3);
    el.scrollBy({ left: direction * visible * 0.85, behavior: "smooth" });
  };

  const centerOnToday = () => {
    const el = scrollRef.current;
    if (!el) return;
    const visible = Math.max(el.clientWidth - leftWidth, dayWidth * 3);
    el.scrollTo({ left: Math.max(leftWidth + todayLeft - visible / 2, 0), behavior: "smooth" });
  };
  const pendingCenterTodayRef = useRef(false);

  const goToToday = () => {
    if (!todayInRange) {
      // widen the visible range (seeding a manual override if needed) so today becomes visible,
      // then let the effect below scroll to it once minDate/maxDate reflect the new range.
      const base = rangeOverride
        ? { start: parseDateStr(rangeOverride.start)!, end: parseDateStr(rangeOverride.end)! }
        : { start: minDate, end: maxDate };
      const newStart = todayD < base.start ? addDays(todayD, -3) : base.start;
      const newEnd = todayD > base.end ? addDays(todayD, 3) : base.end;
      pendingCenterTodayRef.current = true;
      setRangeOverride({ start: toDateStr(newStart), end: toDateStr(newEnd) });
      return;
    }
    centerOnToday();
  };

  useEffect(() => {
    if (pendingCenterTodayRef.current && todayInRange) {
      pendingCenterTodayRef.current = false;
      centerOnToday();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate.getTime(), maxDate.getTime(), todayInRange]);

  const clearRange = () => setRangeOverride(null);
  const setRangeStart = (value: string) =>
    setRangeOverride((prev) => ({ start: value, end: prev?.end ?? toDateStr(maxDate) }));
  const setRangeEnd = (value: string) =>
    setRangeOverride((prev) => ({ start: prev?.start ?? toDateStr(minDate), end: value }));

  return (
    <div className="wbs-container">
      <div className="gantt-controls">
        <div className="control-group">
          <span className="control-label">확대/축소</span>
          <button className="btn ghost small" onClick={zoomOut} disabled={zoomIndex === 0} title="축소">
            −
          </button>
          <span className="zoom-value">{dayWidth}px/일</span>
          <button
            className="btn ghost small"
            onClick={zoomIn}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            title="확대"
          >
            +
          </button>
          <button className="btn ghost small" onClick={zoomReset}>
            초기화
          </button>
        </div>

        <div className="control-group">
          <span className="control-label">이동</span>
          <button className="btn ghost small" onClick={() => pan(-1)} title="이전 구간">
            ← 이전
          </button>
          <button className="btn ghost small" onClick={goToToday} title="오늘로 이동">
            오늘
          </button>
          <button className="btn ghost small" onClick={() => pan(1)} title="다음 구간">
            다음 →
          </button>
        </div>

        <div className="control-group">
          <span className="control-label">기간</span>
          <input type="date" value={toDateStr(minDate)} onChange={(e) => setRangeStart(e.target.value)} />
          <span className="range-sep">~</span>
          <input type="date" value={toDateStr(maxDate)} onChange={(e) => setRangeEnd(e.target.value)} />
          {rangeOverride && (
            <button className="btn ghost small" onClick={clearRange} title="작업 일정 기준으로 자동 설정">
              자동
            </button>
          )}
        </div>

        <details className="filter-dropdown">
          <summary>
            열 표시{hiddenColumns.size > 0 ? ` (${OPTIONAL_COLUMNS.length - hiddenColumns.size}/${OPTIONAL_COLUMNS.length})` : ""}
          </summary>
          <div className="filter-panel">
            {OPTIONAL_COLUMNS.map((c) => (
              <label key={c.key} className="checkbox-row">
                <input type="checkbox" checked={!hiddenColumns.has(c.key)} onChange={() => toggleColumn(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        </details>
      </div>

      <div className="wbs-scroll" ref={scrollRef}>
        <div className="wbs-inner" style={{ width: leftWidth + timelineWidth }}>
          <div className="wbs-header">
            <div className="header-left" style={{ width: leftWidth }}>
              <div className="header-left-row">
                <span style={{ width: COL.title }}>작업</span>
                {!hiddenColumns.has("status") && <span style={{ width: COL.status }}>상태</span>}
                {!hiddenColumns.has("assignee") && <span style={{ width: COL.assignee }}>담당자</span>}
                {!hiddenColumns.has("plan") && <span style={{ width: COL.plan }}>계획 일정</span>}
                {!hiddenColumns.has("actual") && <span style={{ width: COL.actual }}>실행 일정</span>}
                {!hiddenColumns.has("refLink") && <span style={{ width: COL.refLink }}>참조 링크</span>}
                {!hiddenColumns.has("note") && <span style={{ width: COL.note }}>비고</span>}
                {!hiddenColumns.has("schedule") && <span style={{ width: COL.schedule }}>진행 상태</span>}
              </div>
            </div>
            <div className="header-timeline" style={{ width: timelineWidth }}>
              <div className="header-months">
                {monthGroups.map((g, i) => (
                  <span key={i} style={{ width: g.days * dayWidth }}>
                    {g.label}
                  </span>
                ))}
              </div>
              <div className="header-days">
                {days.map((d, i) => (
                  <span
                    key={i}
                    style={{ width: dayWidth }}
                    className={d.getDay() === 0 || d.getDay() === 6 ? "weekend" : ""}
                  >
                    {d.getDate()}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="wbs-body" style={{ height: bodyHeight, position: "relative" }}>
            {todayInRange && (
              <div
                className="today-line"
                style={{ left: leftWidth + todayLeft, height: bodyHeight }}
                title={`오늘 ${today}`}
              />
            )}
            {rows.length === 0 && <div className="empty-state">표시할 작업이 없습니다.</div>}
            {rows.map((node) => (
              <GanttRow
                key={node.id}
                node={node}
                isMatched={matchedIds.has(node.id)}
                filtersActive={filtersOn}
                isExpanded={expanded.has(node.id)}
                scheduleStatus={computeScheduleStatus(node, today)}
                hiddenColumns={hiddenColumns}
                minDate={minDate}
                dayWidth={dayWidth}
                isDragging={dragId === node.id}
                dragOver={overId === node.id ? overPosition : null}
                dropDisallowed={dragId !== null && disallowedTargets.has(node.id)}
                onToggleExpand={handleToggleExpand}
                onAddSubtask={onAddSubtask}
                onEdit={onEdit}
                onDelete={onDelete}
                onQuickUpdate={onQuickUpdate}
                onDragStart={setDragId}
                onDragOverRow={(id, pos) => {
                  setOverId(id);
                  setOverPosition(pos);
                }}
                onDrop={handleDrop}
                onDragEnd={resetDrag}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
