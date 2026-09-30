import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { one, query } from "../db.js";
import { HttpError, isCreatorEmail, me, requireAdmin, type Me } from "../auth.js";

export const userRoutes = Router();

interface Row {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
  created_at: string;
  coordinates: { id: number; name: string }[];
}

userRoutes.get("/users", async (req, res) => {
  requireAdmin(me(req));
  const rows = await query<Row>(
    `SELECT u.id, u.email, u.name, u.role, u.created_at,
            coalesce(json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.position)
                     FILTER (WHERE p.id IS NOT NULL), '[]') AS coordinates
       FROM users u
       LEFT JOIN program_admins pa ON pa.user_id = u.id
       LEFT JOIN programs p ON p.id = pa.program_id
      GROUP BY u.id ORDER BY lower(u.name)`,
  );
  res.json(rows.map((r) => ({ ...r, isCreator: isCreatorEmail(r.email) })));
});

async function target(id: string | string[] | undefined): Promise<Row> {
  const row = await one<Row>("SELECT id, email, name, role FROM users WHERE id = $1", [Number(id)]);
  if (!row) throw new HttpError(404, "No such person");
  return row;
}

/**
 * Admins can make someone an admin. Taking admin away, or touching another
 * admin's account, is for the creator only — so admins cannot remove each
 * other, and nobody can lock the creator out.
 */
function checkPower(actor: Me, subject: Row, changingAdmin: boolean): void {
  requireAdmin(actor);
  if (isCreatorEmail(subject.email) && !actor.isCreator) {
    throw new HttpError(403, "Only the creator can change the creator's account");
  }
  if (changingAdmin && !actor.isCreator) {
    throw new HttpError(403, "Only the creator can change another admin's account");
  }
}

const RoleBody = z.object({ role: z.enum(["user", "admin"]) });

userRoutes.patch("/users/:id/role", async (req, res) => {
  const actor = me(req);
  const { role } = RoleBody.parse(req.body);
  const subject = await target(req.params.id);
  if (isCreatorEmail(subject.email)) throw new HttpError(400, "The creator is always in charge; their role does not change");
  checkPower(actor, subject, subject.role === "admin" && role !== "admin");
  await query("UPDATE users SET role = $1 WHERE id = $2", [role, subject.id]);
  res.json({ ok: true });
});

const PasswordBody = z.object({ password: z.string().min(8, "Password must be at least 8 characters").max(200) });

// There is no email service, so a forgotten password is fixed by an admin
// setting a temporary one and telling the person.
userRoutes.post("/users/:id/password", async (req, res) => {
  const actor = me(req);
  const { password } = PasswordBody.parse(req.body);
  const subject = await target(req.params.id);
  checkPower(actor, subject, subject.role === "admin" && subject.id !== actor.id);
  await query("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(password, 10), subject.id]);
  res.json({ ok: true });
});

userRoutes.delete("/users/:id", async (req, res) => {
  const actor = me(req);
  const subject = await target(req.params.id);
  if (subject.id === actor.id) throw new HttpError(400, "You cannot remove your own account");
  checkPower(actor, subject, subject.role === "admin");
  await query("DELETE FROM users WHERE id = $1", [subject.id]);
  res.json({ ok: true });
});
