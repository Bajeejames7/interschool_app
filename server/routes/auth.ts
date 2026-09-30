import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { one } from "../db.js";
import {
  HttpError,
  checkLoginAllowed,
  clearLoginFailures,
  issueToken,
  loadMe,
  me,
  noteLoginFailure,
  requireUser,
} from "../auth.js";

export const authRoutes = Router();

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
const password = z.string().min(8, "Password must be at least 8 characters").max(200);

const SignUp = z.object({ name: z.string().trim().min(2, "Enter your name").max(80), email, password });

// Email and password only. Every new account is a plain 'user'; nobody can
// sign themselves up as an admin.
authRoutes.post("/auth/signup", async (req, res) => {
  const body = SignUp.parse(req.body);
  const hash = await bcrypt.hash(body.password, 10);
  const created = await one<{ id: number }>(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (lower(email)) DO NOTHING RETURNING id`,
    [body.email, body.name, hash],
  );
  if (!created) throw new HttpError(409, "An account with this email already exists. Sign in instead.");
  res.status(201).json({ token: issueToken(created.id), me: await loadMe(created.id) });
});

const SignIn = z.object({ email, password: z.string().min(1).max(200) });

authRoutes.post("/auth/login", async (req, res) => {
  const body = SignIn.parse(req.body);
  const key = `${body.email}|${req.ip}`;
  checkLoginAllowed(key);
  const user = await one<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE lower(email) = $1",
    [body.email],
  );
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    noteLoginFailure(key);
    throw new HttpError(401, "Wrong email or password");
  }
  clearLoginFailures(key);
  res.json({ token: issueToken(user.id), me: await loadMe(user.id) });
});

authRoutes.get("/auth/me", requireUser, (req, res) => {
  res.json(me(req));
});

const ChangePassword = z.object({ current: z.string().min(1), next: password });

authRoutes.post("/auth/password", requireUser, async (req, res) => {
  const body = ChangePassword.parse(req.body);
  const user = me(req);
  const row = await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [user.id]);
  if (!row || !(await bcrypt.compare(body.current, row.password_hash))) {
    throw new HttpError(400, "Your current password is not right");
  }
  await one("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(body.next, 10), user.id]);
  res.json({ ok: true });
});
