import express from "express";
import cors from "cors";
import { projectsRouter } from "./routes/projects.js";
import { tasksRouter } from "./routes/tasks.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
// Raised from the 100kb default so a full project's CSV can round-trip through
// POST /tasks/import (the file is sent as { csv: "<full file text>" } JSON).
app.use(express.json({ limit: "10mb" }));

app.use("/api/projects", projectsRouter);
app.use("/api/projects/:projectId/tasks", tasksRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`PJT schedule server listening on http://localhost:${PORT}`);
});
