import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Project } from "../types";

export function ProjectListPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.listProjects();
      setProjects(list);
    } catch (e: any) {
      setError(e.message ?? "불러오기에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("프로젝트명을 입력해 주세요.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await api.createProject({ name: name.trim(), description });
      setName("");
      setDescription("");
      await load();
    } catch (e: any) {
      setError(e.message ?? "생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (p: Project) => {
    if (!confirm(`"${p.name}" 프로젝트와 모든 작업을 삭제할까요?`)) return;
    await api.deleteProject(p.id);
    await load();
  };

  return (
    <div className="project-list-page">
      <h1>PJT 일정 관리</h1>

      <form className="create-project-form" onSubmit={handleCreate}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="새 프로젝트명"
          className="project-name-input"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="설명 (선택)"
          className="project-desc-input"
        />
        <button className="btn primary" type="submit" disabled={creating}>
          {creating ? "생성 중..." : "+ 프로젝트 추가"}
        </button>
      </form>

      {error && <div className="banner error">{error}</div>}

      {loading ? (
        <div className="page-state">불러오는 중...</div>
      ) : projects.length === 0 ? (
        <div className="page-state">등록된 프로젝트가 없습니다. 위에서 새 프로젝트를 추가해 보세요.</div>
      ) : (
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.id} className="project-card">
              <Link to={`/projects/${p.id}`} className="project-card-main">
                <span className="project-card-name">{p.name}</span>
                {p.description && <span className="project-card-desc">{p.description}</span>}
                <span className="project-card-date">생성일 {p.createdAt.slice(0, 10)}</span>
              </Link>
              <button className="icon-btn" title="삭제" onClick={() => handleDelete(p)}>
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
