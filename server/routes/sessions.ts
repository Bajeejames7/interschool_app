import { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { one, query, transaction } from "../db.js";
import { HttpError, me, requireManager } from "../auth.js";
import { addDays, isDate, today, weekdayOf } from "../dates.js";
import { ScheduleItem, findProgram, type ProgramRow } from "./programs.js";

export const sessionRoutes = Router();

interface Role {
  name: string;
  assignee: string;
}

interface SessionRow {
  schedule: z.infer<typeof ScheduleItem>[];
  roles: Role[];
  version: number;
  updated_at: string | null;
  updated_by_name: string | null;
}

function checkDate(raw: string | string[] | undefined): string {
  const date = String(raw);
  if (!isDate(date)) throw new HttpError(400, "Dates look like 2026-10-06");
  const t = today();
  if (date < addDays(t, -400) || date > addDays(t, 400)) throw new HttpError(400, "That date is too far away");
  return date;
}

/** A session day as stored, or the program's defaults if nobody changed it yet. */
async function readSession(p: ProgramRow, date: string, client?: PoolClient): Promise<SessionRow> {
  const row = await one<SessionRow>(
    `SELECT s.schedule, s.roles, s.version, s.updated_at, u.name AS updated_by_name
       FROM sessions s LEFT JOIN users u ON u.id = s.updated_by
      WHERE s.program_id = $1 AND s.date = $2`,
    [p.id, date],
    client,
  );
  return (
    row ?? {
      schedule: p.default_schedule,
      roles: p.default_roles.map((name) => ({ name, assignee: "" })),
      version: 0,
      updated_at: null,
      updated_by_name: null,
    }
  );
}

sessionRoutes.get("/programs/:slug/sessions/:date", async (req, res) => {
  const user = me(req);
  const p = await findProgram(req.params.slug);
  const date = checkDate(req.params.date);
  const session = await readSession(p, date);
  const availability = await query<{ userId: number; name: string; optionId: string; updatedAt: string }>(
    `SELECT a.user_id AS "userId", u.name, a.option_id AS "optionId", a.updated_at AS "updatedAt"
       FROM availability a JOIN users u ON u.id = a.user_id
      WHERE a.program_id = $1 AND a.date = $2 ORDER BY a.updated_at`,
    [p.id, date],
  );
  res.json({
    date,
    isSessionDay: weekdayOf(date) === p.session_weekday,
    schedule: session.schedule,
    roles: session.roles,
    version: session.version,
    updatedAt: session.updated_at,
    updatedBy: session.updated_by_name,
    availability,
    mine: availability.find((a) => a.userId === user.id)?.optionId ?? null,
  });
});

/** Which days of a month have been edited, and how many coaches replied. */
sessionRoutes.get("/programs/:slug/months/:month", async (req, res) => {
  const p = await findProgram(req.params.slug);
  const month = String(req.params.month);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, "Months look like 2026-10");
  const rows = await query<{ date: string; edited: boolean; replies: number; coming: number }>(
    `WITH days AS (
       SELECT date FROM sessions WHERE program_id = $1 AND to_char(date, 'YYYY-MM') = $2
       UNION SELECT date FROM availability WHERE program_id = $1 AND to_char(date, 'YYYY-MM') = $2)
     SELECT d.date,
            EXISTS (SELECT 1 FROM sessions s WHERE s.program_id = $1 AND s.date = d.date) AS edited,
            (SELECT count(*)::int FROM availability a WHERE a.program_id = $1 AND a.date = d.date) AS replies,
            (SELECT count(*)::int FROM availability a WHERE a.program_id = $1 AND a.date = d.date
                AND a.option_id <> ALL($3::text[])) AS coming
       FROM days d ORDER BY d.date`,
    [p.id, month, p.availability_options.filter((o) => o.tone === "bad").map((o) => o.id)],
  );
  res.json(rows);
});

/**
 * Change one part of a session day. The caller sends the version it was
 * looking at; if someone else saved in between, nothing is written and the
 * caller gets the latest copy back (409) to look at and try again.
 */
async function saveSession(
  p: ProgramRow,
  date: string,
  userId: number,
  baseVersion: number,
  change: Partial<Pick<SessionRow, "schedule" | "roles">>,
) {
  return transaction(async (client) => {
    // Lock this program's row for the day so two saves cannot interleave.
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [p.id, Number(date.replaceAll("-", ""))]);
    const current = await readSession(p, date, client);
    if (current.version !== baseVersion) {
      throw new HttpError(409, "Someone else changed this session a moment ago. Here is the latest version.", {
        latest: { schedule: current.schedule, roles: current.roles, version: current.version, updatedBy: current.updated_by_name },
      });
    }
    const next = { schedule: change.schedule ?? current.schedule, roles: change.roles ?? current.roles };
    await client.query(
      `INSERT INTO sessions (program_id, date, schedule, roles, version, updated_by)
       VALUES ($1, $2, $3, $4, 1, $5)
       ON CONFLICT (program_id, date) DO UPDATE
         SET schedule = EXCLUDED.schedule, roles = EXCLUDED.roles, version = sessions.version + 1,
             updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [p.id, date, JSON.stringify(next.schedule), JSON.stringify(next.roles), userId],
    );
    return { ...next, version: current.version + 1 };
  });
}

const Version = z.number().int().min(0);

const ScheduleBody = z.object({ version: Version, schedule: z.array(ScheduleItem).max(40) });

sessionRoutes.put("/programs/:slug/sessions/:date/schedule", async (req, res) => {
  const user = me(req);
  const p = await findProgram(req.params.slug);
  requireManager(user, p.id);
  const date = checkDate(req.params.date);
  const body = ScheduleBody.parse(req.body);
  const schedule = [...body.schedule].sort((a, b) => a.time.localeCompare(b.time));
  res.json(await saveSession(p, date, user.id, body.version, { schedule }));
});

const RolesBody = z.object({
  version: Version,
  roles: z
    .array(z.object({ name: z.string().trim().min(1).max(60), assignee: z.string().trim().max(80) }))
    .max(30),
});

// Only admins and the program's coordinator assign coach roles.
sessionRoutes.put("/programs/:slug/sessions/:date/roles", async (req, res) => {
  const user = me(req);
  const p = await findProgram(req.params.slug);
  requireManager(user, p.id);
  const date = checkDate(req.params.date);
  const body = RolesBody.parse(req.body);
  res.json(await saveSession(p, date, user.id, body.version, { roles: body.roles }));
});

const AvailabilityBody = z.object({ optionId: z.string().min(1).max(20) });

// Every coach answers for themselves.
sessionRoutes.put("/programs/:slug/sessions/:date/availability", async (req, res) => {
  const user = me(req);
  const p = await findProgram(req.params.slug);
  const date = checkDate(req.params.date);
  const { optionId } = AvailabilityBody.parse(req.body);
  if (!p.availability_options.some((o) => o.id === optionId)) throw new HttpError(400, "Pick one of the choices");
  await query(
    `INSERT INTO availability (program_id, date, user_id, option_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (program_id, date, user_id) DO UPDATE SET option_id = EXCLUDED.option_id, updated_at = now()`,
    [p.id, date, user.id, optionId],
  );
  res.json({ ok: true });
});

sessionRoutes.delete("/programs/:slug/sessions/:date/availability", async (req, res) => {
  const user = me(req);
  const p = await findProgram(req.params.slug);
  const date = checkDate(req.params.date);
  await query("DELETE FROM availability WHERE program_id = $1 AND date = $2 AND user_id = $3", [p.id, date, user.id]);
  res.json({ ok: true });
});
