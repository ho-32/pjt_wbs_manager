import { DragEvent, useEffect, useState } from "react";
import { STATUS_COLORS, STATUS_LABELS, TASK_STATUSES, Task, TaskNode, TaskStatus } from "../types";
import { SCHEDULE_COLORS, SCHEDULE_LABELS, ScheduleStatus, isDelayed } from "../utils/schedule";
import { formatDisplay, parseDateStr, diffDays, todayStr } from "../utils/date";
import { COL, INDENT, OptionalColumnKey, ROW_HEIGHT } from "../utils/layout";

export type DropPosition = "before" | "after" | "inside";

interface GanttRowProps {
  node: TaskNode;
  isMatched: boolean;
  filtersActive: boolean;
  isExpanded: boolean;
  scheduleStatus: ScheduleStatus;
  hiddenColumns: Set<OptionalColumnKey>;
  minDate: Date;
  dayWidth: number;
  isDragging: boolean;
  dragOver: DropPosition | null;
  dropDisallowed: boolean;
  onToggleExpand: (id: string) => void;
  onAddSubtask: (parentId: string) => void;
  onEdit: (node: TaskNode) => void;
  onDelete: (node: TaskNode) => void;
  onQuickUpdate: (id: string, patch: Partial<Task>) => void;
  onDragStart: (id: string) => void;
  onDragOverRow: (id: string, position: DropPosition) => void;
  onDrop: (id: string) => void;
  onDragEnd: () => void;
}

function barMetrics(start: string, end: string, minDate: Date, dayWidth: number) {
  const s = parseDateStr(start);
  const e = parseDateStr(end);
  if (!s && !e) return null;
  const startD = s ?? e!;
  const endD = e ?? s!;
  const left = diffDays(startD, minDate) * dayWidth;
  const width = Math.max((diffDays(endD, startD) + 1) * dayWidth - 3, dayWidth - 3);
  return { left, width };
}

/** Inline text field: local draft while typing, commits on blur / Enter. */
function EditableText({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="inline-text-input"
      value={draft}
      placeholder={placeholder}
      title={value || undefined}
      onChange={(e) => setDraft(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={() => {
        if (draft.trim() !== value) onCommit(draft.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

/** Best-effort "http(s)://" prefix so a bare "example.com" still opens correctly. */
function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function GanttRow({
  node,
  isMatched,
  filtersActive,
  isExpanded,
  scheduleStatus,
  hiddenColumns,
  minDate,
  dayWidth,
  isDragging,
  dragOver,
  dropDisallowed,
  onToggleExpand,
  onAddSubtask,
  onEdit,
  onDelete,
  onQuickUpdate,
  onDragStart,
  onDragOverRow,
  onDrop,
  onDragEnd,
}: GanttRowProps) {
  const hasChildren = node.children.length > 0;
  const dimmed = filtersActive && !isMatched;
  const delayed = isDelayed(scheduleStatus);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const position: DropPosition = ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "inside";
    onDragOverRow(node.id, position);
  };

  // In-progress tasks with no recorded actual end yet: show/plot "today" as the running
  // end date (display only — the stored actualEnd stays empty until the user sets it).
  const impliedActualEnd = node.status === "in_progress" && !node.actualEnd;
  const effectiveActualEnd = impliedActualEnd ? todayStr() : node.actualEnd;

  const planBar = barMetrics(node.planStart, node.planEnd, minDate, dayWidth);
  const actualBar = barMetrics(node.actualStart, effectiveActualEnd, minDate, dayWidth);

  const stopDrag = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <div
      className={`gantt-row${isDragging ? " dragging" : ""}${dimmed ? " dimmed" : ""}`}
      style={{ height: ROW_HEIGHT }}
      draggable
      onDragStart={() => onDragStart(node.id)}
      onDragOver={handleDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(node.id);
      }}
      onDragEnd={onDragEnd}
    >
      {dragOver && (
        <div className={`drop-indicator ${dragOver}${dropDisallowed ? " disallowed" : ""}`} />
      )}

      <div className="row-left">
      <div className="left-cell" style={{ width: COL.title }}>
        <span style={{ paddingLeft: node.depth * INDENT }} className="title-indent">
          {hasChildren ? (
            <button className="expand-btn" onClick={() => onToggleExpand(node.id)}>
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="expand-spacer" />
          )}
          <span className="task-title" title={node.title}>
            {node.title}
          </span>
        </span>
        <span className="row-actions">
          <button className="icon-btn tiny" title="하위 작업 추가" onClick={() => onAddSubtask(node.id)}>
            +
          </button>
          <button className="icon-btn tiny" title="수정" onClick={() => onEdit(node)}>
            ✎
          </button>
          <button className="icon-btn tiny" title="삭제" onClick={() => onDelete(node)}>
            🗑
          </button>
        </span>
      </div>

      {!hiddenColumns.has("status") && (
        <div className="left-cell" style={{ width: COL.status }} onMouseDown={stopDrag}>
          <select
            className="inline-select"
            style={{ background: STATUS_COLORS[node.status] }}
            value={node.status}
            onChange={(e) => onQuickUpdate(node.id, { status: e.target.value as TaskStatus })}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      {!hiddenColumns.has("assignee") && (
        <div className="left-cell" style={{ width: COL.assignee }} onMouseDown={stopDrag}>
          <EditableText
            value={node.assignee}
            placeholder="담당자"
            onCommit={(v) => onQuickUpdate(node.id, { assignee: v })}
          />
        </div>
      )}

      {!hiddenColumns.has("plan") && (
        <div className="left-cell dates" style={{ width: COL.plan }} onMouseDown={stopDrag}>
          <input
            type="date"
            className="inline-date-input"
            value={node.planStart}
            onChange={(e) => onQuickUpdate(node.id, { planStart: e.target.value })}
          />
          <span className="date-sep">~</span>
          <input
            type="date"
            className="inline-date-input"
            value={node.planEnd}
            onChange={(e) => onQuickUpdate(node.id, { planEnd: e.target.value })}
          />
        </div>
      )}

      {!hiddenColumns.has("actual") && (
        <div className="left-cell dates" style={{ width: COL.actual }} onMouseDown={stopDrag}>
          <input
            type="date"
            className="inline-date-input"
            value={node.actualStart}
            onChange={(e) => onQuickUpdate(node.id, { actualStart: e.target.value })}
          />
          <span className="date-sep">~</span>
          <input
            type="date"
            className={`inline-date-input${impliedActualEnd ? " inferred" : ""}`}
            value={effectiveActualEnd}
            title={impliedActualEnd ? "실행 종료일 미입력 — 진행중이라 오늘 날짜로 표시됩니다" : undefined}
            onChange={(e) => onQuickUpdate(node.id, { actualEnd: e.target.value })}
          />
        </div>
      )}

      {!hiddenColumns.has("refLink") && (
        <div className="left-cell link-cell" style={{ width: COL.refLink }} onMouseDown={stopDrag}>
          <EditableText
            value={node.refLink}
            placeholder="참조 링크 URL"
            onCommit={(v) => onQuickUpdate(node.id, { refLink: v })}
          />
          {node.refLink && (
            <button
              type="button"
              className="icon-btn tiny"
              title="새 탭에서 열기"
              onMouseDown={stopDrag}
              onClick={() => window.open(normalizeUrl(node.refLink), "_blank", "noopener,noreferrer")}
            >
              ↗
            </button>
          )}
        </div>
      )}

      {!hiddenColumns.has("note") && (
        <div className="left-cell" style={{ width: COL.note }} onMouseDown={stopDrag}>
          <EditableText value={node.note} placeholder="비고" onCommit={(v) => onQuickUpdate(node.id, { note: v })} />
        </div>
      )}

      {!hiddenColumns.has("schedule") && (
        <div className="left-cell" style={{ width: COL.schedule }}>
          <span
            className={`badge outline${delayed ? " delayed" : ""}`}
            style={{ borderColor: SCHEDULE_COLORS[scheduleStatus], color: SCHEDULE_COLORS[scheduleStatus] }}
          >
            {delayed && "⚠ "}
            {SCHEDULE_LABELS[scheduleStatus]}
          </span>
        </div>
      )}
      </div>

      <div className="timeline-cell">
        {planBar && (
          <div
            className={`bar plan-bar${delayed ? " delayed" : ""}`}
            style={{ left: planBar.left, width: planBar.width }}
            title={`계획: ${formatDisplay(node.planStart)} ~ ${formatDisplay(node.planEnd)}`}
          />
        )}
        {actualBar && (
          <div
            className={`bar actual-bar status-${node.status}`}
            style={{ left: actualBar.left, width: actualBar.width }}
            title={`실행: ${formatDisplay(node.actualStart)} ~ ${formatDisplay(effectiveActualEnd)}${
              impliedActualEnd ? " (진행중, 오늘까지)" : ""
            }`}
          />
        )}
      </div>
    </div>
  );
}
