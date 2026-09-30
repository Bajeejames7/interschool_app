import { Router } from "express";
import { z } from "zod";
import { one, query, transaction } from "../db.js";
import { HttpError, canManage, me, requireManager } from "../auth.js";
import { findProgram, type ProgramRow } from "./programs.js";

export const tallyRoutes = Router();

async function standings(p: ProgramRow) {
  const reset = await one<{ created_at: string; name: string | null }>(
    `SELECT r.created_at, u.name FROM tally_resets r LEFT JOIN users u ON u.id = r.user_id
      WHERE r.program_id = $1 ORDER BY r.created_at DESC LIMIT 1`,
    [p.id],
  );
  const since = reset?.created_at ?? "-infinity";
  const totals = await query<{ team_id: string; points: number; last_by: string; last_at: string }>(
    `SELECT DISTINCT ON (team_id) team_id,
            sum(amount) OVER (PARTITION BY team_id)::int AS points,
            author AS last_by, created_at AS last_at
       FROM tally_events WHERE program_id = $1 AND created_at > $2
      ORDER BY team_id, created_at DESC`,
    [p.id, since],
  );
  const recent = await query(
    `SELECT id, team_id AS "teamId", category, amount, author, created_at AS "createdAt"
       FROM tally_events WHERE program_id = $1 ORDER BY created_at DESC, id DESC LIMIT 40`,
    [p.id],
  );
  const byTeam = new Map(totals.map((t) => [t.team_id, t]));
  return {
    teams: p.teams.map((team) => {
      const t = byTeam.get(team.id);
      return { ...team, points: t?.points ?? 0, lastBy: t?.last_by ?? null, lastAt: t?.last_at ?? null };
    }),
    resetAt: reset?.created_at ?? null,
    resetBy: reset?.name ?? null,
    recent,
  };
}

tallyRoutes.get("/programs/:slug/tally", async (req, res) => {
  res.json(await standings(await findProgram(req.params.slug)));
});

const TallyBody = z.object({
  teamId: z.string().min(1).max(30),
  category: z.string().min(1).max(40),
  amount: z.union([z.literal(-1), z.literal(1), z.literal(5), z.literal(10)]),
  clientEventId: z.string().min(8).max(64),
});

// Coaches score during play with the −1 / +1 / +5 / +10 buttons.
tallyRoutes.post("/programs/:slug/tally", async (req, res) => {
  const user = me(req);
  const p = await findProgram(req.params.slug);
  const body = TallyBody.parse(req.body);
  if (!p.teams.some((t) => t.id === body.teamId)) throw new HttpError(400, "Unknown team");
  if (!p.categories.includes(body.category)) throw new HttpError(400, "Unknown category");
  // A retried request (same clientEventId) is ignored rather than counted twice.
  await query(
    `INSERT INTO tally_events (program_id, team_id, category, amount, user_id, author, client_event_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (client_event_id) DO NOTHING`,
    [p.id, body.teamId, body.category, body.amount, user.id, user.name, body.clientEventId],
  );
  res.json(await standings(p));
});

tallyRoutes.post("/programs/:slug/tally/reset", async (req, res) => {
  const user = me(req);
  const p = await findProgram(req.params.slug);
  requireManager(user, p.id);
  await query("INSERT INTO tally_resets (program_id, user_id) VALUES ($1, $2)", [p.id, user.id]);
  res.json(await standings(p));
});

// ---- coach updates (the notice board on the calendar page) --------------------------

tallyRoutes.get("/programs/:slug/updates", async (req, res) => {
  const user = me(req);
  const p = await findProgram(req.params.slug);
  const rows = await query<{ id: number; author: string; body: string; createdAt: string; userId: number | null }>(
    `SELECT id, author, body, created_at AS "createdAt", user_id AS "userId"
       FROM updates WHERE program_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [p.id],
  );
  const manager = canManage(user, p.id);
  res.json(rows.map((r) => ({ ...r, canDelete: manager || r.userId === user.id })));
});

const UpdateBody = z.object({ body: z.string().trim().min(1, "Write something first").max(2000) });

tallyRoutes.post("/programs/:slug/updates", async (req, res) => {
  const user = me(req);
  const p = await findProgram(req.params.slug);
  const { body } = UpdateBody.parse(req.body);
  await query("INSERT INTO updates (program_id, user_id, author, body) VALUES ($1, $2, $3, $4)", [
    p.id,
    user.id,
    user.name,
    body,
  ]);
  res.status(201).json({ ok: true });
});

tallyRoutes.delete("/updates/:id", async (req, res) => {
  const user = me(req);
  await transaction(async (client) => {
    const row = await one<{ program_id: number; user_id: number | null }>(
      "SELECT program_id, user_id FROM updates WHERE id = $1",
      [Number(req.params.id)],
      client,
    );
    if (!row) throw new HttpError(404, "Already gone");
    if (row.user_id !== user.id && !canManage(user, row.program_id)) {
      throw new HttpError(403, "You can only remove your own updates");
    }
    await query("DELETE FROM updates WHERE id = $1", [Number(req.params.id)], client);
  });
  res.json({ ok: true });
});
