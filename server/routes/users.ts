import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { one, query } from "../db.js";
import { HttpError, isSuperAdmin, me, requireAdmin, requireSuperAdmin, type Me } from "../auth.js";
import { email, password } from "./auth.js";

export const userRoutes = Router();

interface Row {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin" | "superadmin";
  created_at: string;
  must_change_password: boolean;
  coordinates: { id: number; name: string }[];
}

userRoutes.get("/users", async (req, res) => {
  requireAdmin(me(req));
  const rows = await query<Row>(
    `SELECT u.id, u.email, u.name, u.role, u.created_at, u.must_change_password,
            coalesce(json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.position)
                     FILTER (WHERE p.id IS NOT NULL), '[]') AS coordinates
       FROM users u
       LEFT JOIN program_admins pa ON pa.user_id = u.id
       LEFT JOIN programs p ON p.id = pa.program_id
      GROUP BY u.id ORDER BY lower(u.name)`,
  );
  res.json(
    rows.map(({ must_change_password, ...r }) => ({
      ...r,
      isSuperAdmin: isSuperAdmin(r),
      // Still on the temporary password a super admin gave them.
      pendingFirstSignIn: must_change_password,
    })),
  );
});

const NewPerson = z.object({
  name: z.string().trim().min(2, "Enter their name").max(80),
  email,
  password,
  role: z.enum(["user", "admin"]).default("user"),
});

// Admins and super admins create accounts (admins can already make anyone an
// admin, so creating one directly gives them nothing new). Removing accounts
// stays with super admins. The person signs in with the temporary password and
// is asked to choose their own straight away.
userRoutes.post("/users", async (req, res) => {
  requireAdmin(me(req));
  const body = NewPerson.parse(req.body);
  const created = await one<{ id: number }>(
    `INSERT INTO users (email, name, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (lower(email)) DO NOTHING RETURNING id`,
    [body.email, body.name, await bcrypt.hash(body.password, 10), body.role],
  );
  if (!created) throw new HttpError(409, "Someone already has an account with this email");
  res.status(201).json({ id: created.id });
});

async function target(id: string | string[] | undefined): Promise<Row> {
  const row = await one<Row>("SELECT id, email, name, role FROM users WHERE id = $1", [Number(id)]);
  if (!row) throw new HttpError(404, "No such person");
  return row;
}

/**
 * Who may change whom:
 * - super admins are never changed through the app (not even by each other);
 *   each changes their own password under their account;
 * - anything that touches an admin's account is for super admins only;
 * - admins may do the rest for ordinary users.
 */
function checkPower(actor: Me, subject: Row, touchesAdmin: boolean): void {
  requireAdmin(actor);
  if (isSuperAdmin(subject)) throw new HttpError(403, "Super admins manage their own accounts");
  if (touchesAdmin && !actor.isSuperAdmin) {
    throw new HttpError(403, "Only Abel and James can change an admin's account");
  }
}

const RoleBody = z.object({ role: z.enum(["user", "admin"]) });

// Admins can make a user an admin; taking admin away is for super admins.
userRoutes.patch("/users/:id/role", async (req, res) => {
  const actor = me(req);
  const { role } = RoleBody.parse(req.body);
  const subject = await target(req.params.id);
  checkPower(actor, subject, subject.role === "admin" && role !== "admin");
  await query("UPDATE users SET role = $1 WHERE id = $2", [role, subject.id]);
  res.json({ ok: true });
});

const PasswordBody = z.object({ password });

// There is no email service, so a forgotten password is fixed by an admin
// setting a temporary one; the person chooses a new one when they sign in.
userRoutes.post("/users/:id/password", async (req, res) => {
  const actor = me(req);
  const body = PasswordBody.parse(req.body);
  const subject = await target(req.params.id);
  if (subject.id === actor.id) throw new HttpError(400, "Change your own password under your account");
  checkPower(actor, subject, subject.role === "admin");
  await query("UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2", [
    await bcrypt.hash(body.password, 10),
    subject.id,
  ]);
  res.json({ ok: true });
});

// Removing an account is for super admins, like creating one.
userRoutes.delete("/users/:id", async (req, res) => {
  const actor = me(req);
  requireSuperAdmin(actor);
  const subject = await target(req.params.id);
  if (subject.id === actor.id) throw new HttpError(400, "You cannot remove your own account");
  checkPower(actor, subject, true);
  await query("DELETE FROM users WHERE id = $1", [subject.id]);
  res.json({ ok: true });
});
