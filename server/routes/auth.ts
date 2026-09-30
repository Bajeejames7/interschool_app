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

export const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
export const password = z.string().min(8, "Password must be at least 8 characters").max(200);

// There is no public sign-up: Abel and James (super admins) create every
// account from Creator Control (POST /users).
authRoutes.post("/auth/signup", () => {
  throw new HttpError(403, "Accounts are created by Abel or James. Ask them to add you.");
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
  await one("UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2", [
    await bcrypt.hash(body.next, 10),
    user.id,
  ]);
  res.json({ ok: true });
});
