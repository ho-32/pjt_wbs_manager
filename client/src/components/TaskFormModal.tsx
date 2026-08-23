import { FormEvent, useState } from "react";
import { Modal } from "./Modal";
import { STATUS_LABELS, TASK_STATUSES, Task, TaskStatus } from "../types";

export interface TaskFormValues {
  title: string;
  status: TaskStatus;
  assignee: string;
  planStart: string;
  planEnd: string;
  actualStart: string;
  actualEnd: string;
  refLink: string;
  note: string;
}

interface TaskFormModalProps {
  mode: "create" | "edit";
  parentTitle?: string; // shown when creating a subtask
  initial?: Task;
  onClose: () => void;
  onSubmit: (values: TaskFormValues) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}

const empty: TaskFormValues = {
  title: "",
  status: "todo",
  assignee: "",
  planStart: "",
  planEnd: "",
  actualStart: "",
  actualEnd: "",
  refLink: "",
  note: "",
};

export function TaskFormModal({ mode, parentTitle, initial, onClose, onSubmit, onDelete }: TaskFormModalProps) {
  const [values, setValues] = useState<TaskFormValues>(
    initial
      ? {
          title: initial.title,
          status: initial.status,
          assignee: initial.assignee,
          planStart: initial.planStart,
          planEnd: initial.planEnd,
          actualStart: initial.actualStart,
          actualEnd: initial.actualEnd,
          refLink: initial.refLink,
          note: initial.note,
        }
      : empty
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof TaskFormValues>(key: K, val: TaskFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.title.trim()) {
      setError("작업명을 입력해 주세요.");
      return;
    }
    if (values.planStart && values.planEnd && values.planStart > values.planEnd) {
      setError("계획 시작일은 계획 종료일보다 늦을 수 없습니다.");
      return;
    }
    if (values.actualStart && values.actualEnd && values.actualStart > values.actualEnd) {
      setError("실행 시작일은 실행 종료일보다 늦을 수 없습니다.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={mode === "create" ? "작업 추가" : "작업 수정"} onClose={onClose} width={520}>
      {parentTitle && (
        <div className="modal-hint">
          상위 작업: <strong>{parentTitle}</strong>
        </div>
      )}
      <form onSubmit={handleSubmit} className="task-form">
        <label className="field">
          <span>작업명 *</span>
          <input
            autoFocus
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="작업명을 입력하세요"
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>상태</span>
            <select value={values.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>담당자</span>
            <input value={values.assignee} onChange={(e) => set("assignee", e.target.value)} placeholder="담당자" />
          </label>
        </div>

        <fieldset className="field-group">
          <legend>계획 일정</legend>
          <div className="field-row">
            <label className="field">
              <span>시작일</span>
              <input type="date" value={values.planStart} onChange={(e) => set("planStart", e.target.value)} />
            </label>
            <label className="field">
              <span>종료일</span>
              <input type="date" value={values.planEnd} onChange={(e) => set("planEnd", e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset className="field-group">
          <legend>실행 일정</legend>
          <div className="field-row">
            <label className="field">
              <span>시작일</span>
              <input type="date" value={values.actualStart} onChange={(e) => set("actualStart", e.target.value)} />
            </label>
            <label className="field">
              <span>종료일</span>
              <input type="date" value={values.actualEnd} onChange={(e) => set("actualEnd", e.target.value)} />
            </label>
          </div>
        </fieldset>

        <label className="field">
          <span>참조 링크</span>
          <input
            type="text"
            value={values.refLink}
            onChange={(e) => set("refLink", e.target.value)}
            placeholder="https://..."
          />
        </label>

        <label className="field">
          <span>비고</span>
          <textarea
            value={values.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="메모, 특이사항 등"
            rows={3}
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          {mode === "edit" && onDelete && (
            <button type="button" className="btn danger" onClick={onDelete}>
              삭제
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
