import { Task } from "../types";
import { todayStr } from "./date";

export type ScheduleStatus =
  | "no_plan" // 계획 미입력
  | "scheduled" // 예정대로, 아직 시작 전
  | "on_track" // 진행중, 정상
  | "not_started_delayed" // 계획 시작일이 지났는데 착수하지 않음
  | "in_progress_delayed" // 계획 종료일이 지났는데 진행/리뷰 중
  | "completed_on_time" // 계획 종료일 이내 완료
  | "completed_delayed" // 계획 종료일을 넘겨 완료
  | "dropped"; // 중단

export const SCHEDULE_STATUSES: ScheduleStatus[] = [
  "no_plan",
  "scheduled",
  "on_track",
  "not_started_delayed",
  "in_progress_delayed",
  "completed_on_time",
  "completed_delayed",
  "dropped",
];

export const SCHEDULE_LABELS: Record<ScheduleStatus, string> = {
  no_plan: "계획 미입력",
  scheduled: "예정",
  on_track: "정상 진행",
  not_started_delayed: "착수 지연",
  in_progress_delayed: "실행 지연",
  completed_on_time: "정상 완료",
  completed_delayed: "지연 완료",
  dropped: "중단",
};

export const SCHEDULE_COLORS: Record<ScheduleStatus, string> = {
  no_plan: "#9aa0a6",
  scheduled: "#5b8def",
  on_track: "#2fa04a",
  not_started_delayed: "#d64545",
  in_progress_delayed: "#d64545",
  completed_on_time: "#2fa04a",
  completed_delayed: "#c2790f",
  dropped: "#6b6f76",
};

export function computeScheduleStatus(task: Task, today: string = todayStr()): ScheduleStatus {
  if (task.status === "drop") return "dropped";
  if (!task.planStart || !task.planEnd) return "no_plan";

  if (task.status === "done") {
    if (task.actualEnd && task.actualEnd > task.planEnd) return "completed_delayed";
    return "completed_on_time";
  }

  const pastPlanEnd = today > task.planEnd;
  const pastPlanStartNotStarted = task.status === "todo" && today > task.planStart && !task.actualStart;

  if (pastPlanEnd) {
    return task.status === "todo" ? "not_started_delayed" : "in_progress_delayed";
  }
  if (pastPlanStartNotStarted) return "not_started_delayed";
  return task.status === "todo" ? "scheduled" : "on_track";
}

export function isDelayed(status: ScheduleStatus): boolean {
  return status === "not_started_delayed" || status === "in_progress_delayed" || status === "completed_delayed";
}
