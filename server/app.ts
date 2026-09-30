import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { HttpError, requireUser } from "./auth.js";
import { authRoutes } from "./routes/auth.js";
import { programRoutes } from "./routes/programs.js";
import { sessionRoutes } from "./routes/sessions.js";
import { tallyRoutes } from "./routes/tally.js";
import { userRoutes } from "./routes/users.js";

export function createApp(webDir?: string) {
  const app = express();
  app.set("trust proxy", 1); // Render sits in front; req.ip is the phone's address
  app.use(express.json({ limit: "200kb" }));

  const api = express.Router();
  api.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  api.use(authRoutes);
  // Everything below needs a signed-in person: the app is for the team only.
  api.use(requireUser);
  api.use(programRoutes, sessionRoutes, tallyRoutes, userRoutes);
  api.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use("/api", (req, res, next) => {
    // Phones must never show a cached copy of shared data.
    res.setHeader("Cache-Control", "no-store");
    next();
  }, api);

  // The built web app, with every other path going to index.html so links
  // like /p/rafiki/calendar work when opened directly.
  if (webDir && existsSync(webDir)) {
    app.use(express.static(webDir, { index: false, maxAge: "1h" }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(webDir, "index.html"));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Check what you entered" });
    } else if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...err.body });
    } else if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Could not read the request" });
    } else {
      console.error(err);
      res.status(500).json({ error: "Something went wrong on the server. Try again." });
    }
  });

  return app;
}
