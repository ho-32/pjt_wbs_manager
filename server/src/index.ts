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

// Explicit "0.0.0.0" (not just the default) so this keeps accepting LAN connections even
// if a future Node/OS default ever narrows it to loopback-only - the client only ever talks
// to this over localhost via Vite's dev-server proxy (see vite.config.ts), but the browser
// itself is reached through Vite on the LAN, so this just has to not actively block it.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`PJT schedule server listening on http://0.0.0.0:${PORT}`);
});
