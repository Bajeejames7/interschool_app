import { Router } from "express";
import { z } from "zod";
import { one, query, transaction } from "../db.js";
import { HttpError, canManage, me, requireAdmin, requireManager } from "../auth.js";
import { nextSessionDate, today } from "../dates.js";

export const programRoutes = Router();

// ---- shapes of the per-program settings ------------------------------------------

const text = (max: number) => z.string().trim().min(1).max(max);

export const AvailabilityOption = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,20}$/),
  label: text(120),
  tone: z.enum(["good", "ok", "bad"]),
});
export const ScheduleItem = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times look like 13:00"),
  activity: text(200),
});
export const Team = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,30}$/),
  name: text(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

// A logo is either a file shipped with the app or a small uploaded image.
const Logo = z
  .string()
  .max(300_000, "That logo is too large; use a smaller image")
  .refine(
    (v) => v === "" || /^logos\/[a-z0-9_-]+\.(png|jpg|jpeg|webp|svg)$/.test(v) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v),
    "Upload a PNG, JPG or WebP image",
  );

const Settings = z.object({
  logo: Logo,
  name: text(60),
  shortCode: text(4).transform((s) => s.toUpperCase()),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  coordinatorName: z.string().trim().max(80),
  coordinatorTitle: z.string().trim().max(60),
  tagline: z.string().trim().max(80),
  notes: z.string().trim().max(5000),
  sessionWeekday: z.number().int().min(0).max(6),
  availabilityOptions: z.array(AvailabilityOption).min(1).max(6),
  defaultRoles: z.array(text(60)).max(30),
  defaultSchedule: z.array(ScheduleItem).max(40),
  teams: z.array(Team).max(8),
  categories: z.array(text(40)).max(20),
});

// Only admins decide what kind of program it is and whether it is shown.
const AdminSettings = z.object({
  kind: z.enum(["intramural", "club"]),
  archived: z.boolean(),
});

// ---- reading ---------------------------------------------------------------------------

export interface ProgramRow {
  id: number;
  slug: string;
  name: string;
  short_code: string;
  kind: "intramural" | "club";
  color: string;
  coordinator_name: string;
  coordinator_title: string;
  tagline: string;
  notes: string;
  session_weekday: number;
  availability_options: z.infer<typeof AvailabilityOption>[];
  default_roles: string[];
  default_schedule: z.infer<typeof ScheduleItem>[];
  teams: z.infer<typeof Team>[];
  categories: string[];
  archived: boolean;
  position: number;
  logo: string;
}

export async function findProgram(slug: string | string[] | undefined): Promise<ProgramRow> {
  const row = await one<ProgramRow>("SELECT * FROM programs WHERE slug = $1", [String(slug)]);
  if (!row) throw new HttpError(404, "No such school or club");
  return row;
}

function present(p: ProgramRow) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortCode: p.short_code,
    kind: p.kind,
    color: p.color,
    coordinatorName: p.coordinator_name,
    coordinatorTitle: p.coordinator_title,
    tagline: p.tagline,
    notes: p.notes,
    sessionWeekday: p.session_weekday,
    availabilityOptions: p.availability_options,
    defaultRoles: p.default_roles,
    defaultSchedule: p.default_schedule,
    teams: p.teams,
    categories: p.categories,
    archived: p.archived,
    logo: p.logo,
  };
}

programRoutes.get("/programs", async (req, res) => {
  const user = me(req);
  const rows = await query<ProgramRow>(
    `SELECT * FROM programs WHERE NOT archived OR $1 ORDER BY archived, position, name`,
    [user.isAdmin],
  );
  res.json(rows.map((p) => ({ ...present(p), canManage: canManage(user, p.id) })));
});

programRoutes.get("/programs/:slug", async (req, res) => {
  const user = me(req);
  const p = await findProgram(req.params.slug);
  const coordinators = await query<{ id: number; name: string }>(
    `SELECT u.id, u.name FROM program_admins pa JOIN users u ON u.id = pa.user_id
      WHERE pa.program_id = $1 ORDER BY lower(u.name)`,
    [p.id],
  );
  res.json({
    ...present(p),
    canManage: canManage(user, p.id),
    coordinators,
    today: today(),
    nextSession: nextSessionDate(p.session_weekday),
  });
});

// ---- changing ---------------------------------------------------------------------------

const NewProgram = z.object({
  name: text(60),
  shortCode: text(4).transform((s) => s.toUpperCase()),
  kind: z.enum(["intramural", "club"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2F5BD3"),
});

function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "program";
}

// Admins add a new school, intramural or club when a partnership starts. It
// begins with plain defaults that its coordinator then tailors.
programRoutes.post("/programs", async (req, res) => {
  requireAdmin(me(req));
  const body = NewProgram.parse(req.body);
  const base = slugify(body.name);
  const created = await transaction(async (client) => {
    let slug = base;
    for (let n = 2; await one("SELECT 1 FROM programs WHERE slug = $1", [slug], client); n++) slug = `${base}-${n}`;
    return one<ProgramRow>(
      `INSERT INTO programs (slug, name, short_code, kind, color, tagline, notes, position,
                             availability_options, default_roles, default_schedule, teams, categories)
       VALUES ($1, $2, $3, $4, $5, 'Football. Faith. Future.', '',
               (SELECT coalesce(max(position), 0) + 1 FROM programs),
               '[{"id":"yes","label":"I will be there","tone":"good"},
                 {"id":"late","label":"I will be late","tone":"ok"},
                 {"id":"absent","label":"I will not be able to attend","tone":"bad"}]',
               '["Setup & Equipment","Player Check-in","Warmup Lead","Match Coordination"]',
               '[]', '[]', '["Under 9","Under 11","Under 13"]')
       RETURNING *`,
      [slug, body.name, body.shortCode, body.kind, body.color],
      client,
    );
  });
  res.status(201).json(present(created!));
});

programRoutes.patch("/programs/:slug", async (req, res) => {
  const user = me(req);
  const p = await findProgram(req.params.slug);
  requireManager(user, p.id);
  const body = Settings.partial().parse(req.body);
  const adminPart = AdminSettings.partial().parse(req.body);
  if (Object.keys(adminPart).length > 0) requireAdmin(user);
  if (body.teams && new Set(body.teams.map((t) => t.id)).size !== body.teams.length) {
    throw new HttpError(400, "Each team needs a different name");
  }
  if (body.availabilityOptions && new Set(body.availabilityOptions.map((o) => o.id)).size !== body.availabilityOptions.length) {
    throw new HttpError(400, "Each availability choice needs a different id");
  }

  const columns: Record<string, unknown> = {
    logo: body.logo,
    name: body.name,
    short_code: body.shortCode,
    color: body.color,
    coordinator_name: body.coordinatorName,
    coordinator_title: body.coordinatorTitle,
    tagline: body.tagline,
    notes: body.notes,
    session_weekday: body.sessionWeekday,
    availability_options: body.availabilityOptions && JSON.stringify(body.availabilityOptions),
    default_roles: body.defaultRoles && JSON.stringify(body.defaultRoles),
    default_schedule: body.defaultSchedule && JSON.stringify(body.defaultSchedule),
    teams: body.teams && JSON.stringify(body.teams),
    categories: body.categories && JSON.stringify(body.categories),
    kind: adminPart.kind,
    archived: adminPart.archived,
  };
  const set = Object.entries(columns).filter(([, v]) => v !== undefined);
  if (set.length > 0) {
    await query(
      `UPDATE programs SET ${set.map(([k], i) => `${k} = $${i + 2}`).join(", ")} WHERE id = $1`,
      [p.id, ...set.map(([, v]) => v)],
    );
  }
  res.json(present(await findProgram(p.slug)));
});

const Coordinators = z.object({ userIds: z.array(z.number().int().positive()).max(20) });

programRoutes.put("/programs/:slug/coordinators", async (req, res) => {
  requireAdmin(me(req));
  const p = await findProgram(req.params.slug);
  const { userIds } = Coordinators.parse(req.body);
  await transaction(async (client) => {
    await query("DELETE FROM program_admins WHERE program_id = $1", [p.id], client);
    if (userIds.length > 0) {
      await query(
        `INSERT INTO program_admins (program_id, user_id)
         SELECT $1, id FROM users WHERE id = ANY($2::int[])`,
        [p.id, userIds],
        client,
      );
    }
  });
  res.json({ ok: true });
});
