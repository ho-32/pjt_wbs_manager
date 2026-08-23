import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Toolbar } from "../components/Toolbar";
import { WbsGantt } from "../components/WbsGantt";
import { TaskFormModal, TaskFormValues } from "../components/TaskFormModal";
import { Project, Task } from "../types";
import { TaskFilters, computeFilterResult, emptyFilters } from "../utils/tree";

type ModalState = { mode: "create"; parentId: string } | { mode: "edit"; task: Task } | null;

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskFilters>(emptyFilters());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);
  const [renamingProject, setRenamingProject] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [importing, setImporting] = useState(false);
  const initializedExpand = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [projects, taskList] = await Promise.all([api.listProjects(), api.listTasks(id)]);
      const found = projects.find((p) => p.id === id) ?? null;
      setProject(found);
      setTasks(taskList);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "불러오기에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!initializedExpand.current && tasks.length > 0) {
      const withChildren = new Set(tasks.filter((t) => t.parentId === "").map((t) => t.id));
      for (const t of tasks) if (t.parentId) withChildren.add(t.parentId);
      setExpanded(withChildren);
      initializedExpand.current = true;
    }
  }, [tasks]);

  const allAssignees = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.assignee).filter(Boolean))).sort(),
    [tasks]
  );

  const { matchedIds } = useMemo(() => computeFilterResult(tasks, filters), [tasks, filters]);

  const expandAll = () => {
    const withChildren = new Set(tasks.filter((t) => tasks.some((c) => c.parentId === t.id)).map((t) => t.id));
    setExpanded(withChildren);
  };
  const collapseAll = () => setExpanded(new Set());

  const handleCreate = async (values: TaskFormValues) => {
    if (!id || modal?.mode !== "create") return;
    await api.createTask(id, { parentId: modal.parentId, ...values });
    setModal(null);
    await load();
  };

  const handleUpdate = async (values: TaskFormValues) => {
    if (!id || modal?.mode !== "edit") return;
    await api.updateTask(id, modal.task.id, values);
    setModal(null);
    await load();
  };

  const handleDeleteFromModal = async () => {
    if (!id || modal?.mode !== "edit") return;
    if (!confirm(`"${modal.task.title}" 작업과 하위 작업을 모두 삭제할까요?`)) return;
    await api.deleteTask(id, modal.task.id);
    setModal(null);
    await load();
  };

  const handleDeleteFromRow = async (task: Task) => {
    if (!id) return;
    if (!confirm(`"${task.title}" 작업과 하위 작업을 모두 삭제할까요?`)) return;
    await api.deleteTask(id, task.id);
    await load();
  };

  const handleMove = async (taskId: string, parentId: string, orderIndex: number) => {
    if (!id) return;
    // optimistic UI update so drag-and-drop feels instant
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, parentId, orderIndex } : t)));
    try {
      await api.moveTask(id, taskId, { parentId, orderIndex });
    } catch (e: any) {
      setError(e.message ?? "이동에 실패했습니다.");
      await load();
    }
  };

  /** Row-level inline edits (status / assignee / dates) — applied immediately, no modal. */
  const handleQuickUpdate = async (taskId: string, patch: Partial<Task>) => {
    if (!id) return;
    const previous = tasks;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
    try {
      await api.updateTask(id, taskId, patch);
    } catch (e: any) {
      setError(e.message ?? "수정에 실패했습니다.");
      setTasks(previous);
    }
  };

  const startRename = () => {
    if (!project) return;
    setNameDraft(project.name);
    setRenamingProject(true);
  };
  const commitRename = async () => {
    setRenamingProject(false);
    if (!id || !project) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === project.name) return;
    try {
      await api.updateProject(id, { name: trimmed });
      await load();
    } catch (e: any) {
      setError(e.message ?? "이름 변경에 실패했습니다.");
    }
  };
  const handleRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    if (e.key === "Escape") setRenamingProject(false);
  };

  /** CSV 저장: 서버가 Content-Disposition: attachment로 응답하므로 새 창 없이 바로 다운로드된다. */
  const handleExportCsv = () => {
    if (!id) return;
    const a = document.createElement("a");
    a.href = api.exportTasksUrl(id);
    a.click();
  };

  const handleImportClick = () => importInputRef.current?.click();

  /** CSV 불러오기: 선택한 파일 내용으로 이 프로젝트의 작업을 통째로 교체한다(병합 아님). */
  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file || !id) return;
    if (!confirm(`"${file.name}" 파일 내용으로 현재 프로젝트의 모든 작업을 대체합니다. 계속할까요?`)) return;
    setImporting(true);
    try {
      const text = await file.text();
      await api.importTasks(id, text);
      await load();
      setError(null);
    } catch (err: any) {
      setError(err.message ?? "CSV 불러오기에 실패했습니다.");
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <div className="page-state">불러오는 중...</div>;
  if (!project) return <div className="page-state">프로젝트를 찾을 수 없습니다. <Link to="/">목록으로</Link></div>;

  return (
    <div className="project-detail-page">
      <div className="page-header">
        <div>
          <Link to="/" className="back-link">
            ← 프로젝트 목록
          </Link>
          {renamingProject ? (
            <input
              autoFocus
              className="project-title-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKeyDown}
            />
          ) : (
            <h2 onClick={startRename} title="클릭하여 이름 변경" className="project-title-edit">
              {project.name} <span className="edit-hint">✎</span>
            </h2>
          )}
          {project.description && <p className="project-desc">{project.description}</p>}
          <p className="project-file-hint">저장 파일: data/tasks/{project.taskFile}</p>
        </div>

        <div className="header-actions">
          <button className="btn ghost small" onClick={handleExportCsv}>
            CSV 내보내기
          </button>
          <button className="btn ghost small" onClick={handleImportClick} disabled={importing}>
            {importing ? "불러오는 중..." : "CSV 가져오기"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="visually-hidden"
            onChange={handleImportFile}
          />
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}

      <Toolbar
        filters={filters}
        onFiltersChange={setFilters}
        allAssignees={allAssignees}
        onAddRootTask={() => setModal({ mode: "create", parentId: "" })}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        matchedCount={matchedIds.size}
        totalCount={tasks.length}
      />

      <WbsGantt
        tasks={tasks}
        filters={filters}
        expanded={expanded}
        onExpandedChange={setExpanded}
        onAddSubtask={(parentId) => setModal({ mode: "create", parentId })}
        onEdit={(task) => setModal({ mode: "edit", task })}
        onDelete={handleDeleteFromRow}
        onMove={handleMove}
        onQuickUpdate={handleQuickUpdate}
      />

      {modal?.mode === "create" && (
        <TaskFormModal
          mode="create"
          parentTitle={tasks.find((t) => t.id === modal.parentId)?.title}
          onClose={() => setModal(null)}
          onSubmit={handleCreate}
        />
      )}
      {modal?.mode === "edit" && (
        <TaskFormModal
          mode="edit"
          initial={modal.task}
          onClose={() => setModal(null)}
          onSubmit={handleUpdate}
          onDelete={handleDeleteFromModal}
        />
      )}
    </div>
  );
}
