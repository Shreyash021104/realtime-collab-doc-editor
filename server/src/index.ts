import http from "node:http";
import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { documentsRouter } from "./routes/documents.js";
import { attachCollabWebSocketServer } from "./collab/wsServer.js";

const app = express();
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/documents", documentsRouter);

const server = http.createServer(app);
attachCollabWebSocketServer(server);

server.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port}`);
});
