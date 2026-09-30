import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/app.js";
import { pool } from "../server/db.js";
import { migrate } from "../server/migrations.js";

const app = createApp();

async function signUp(name: string, email: string) {
  const res = await request(app).post("/api/auth/signup").send({ name, email, password: "password123" });
  expect(res.status).toBe(201);
  return { token: res.body.token as string, id: res.body.me.id as number, me: res.body.me };
}

const as = (token: string) => ({
  get: (url: string) => request(app).get(url).set("Authorization", `Bearer ${token}`),
  post: (url: string, body?: object) => request(app).post(url).set("Authorization", `Bearer ${token}`).send(body),
  put: (url: string, body?: object) => request(app).put(url).set("Authorization", `Bearer ${token}`).send(body),
  patch: (url: string, body?: object) => request(app).patch(url).set("Authorization", `Bearer ${token}`).send(body),
  del: (url: string) => request(app).delete(url).set("Authorization", `Bearer ${token}`),
});

let creator: Awaited<ReturnType<typeof signUp>>;
let admin: Awaited<ReturnType<typeof signUp>>;
let coach: Awaited<ReturnType<typeof signUp>>;
let coach2: Awaited<ReturnType<typeof signUp>>;

beforeAll(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate();
  creator = await signUp("Abel Hazina", "Abel@Ambassadors.test"); // case differs from CREATOR_EMAIL on purpose
  admin = await signUp("Ann Admin", "ann@example.com");
  coach = await signUp("Carl Coach", "carl@example.com");
  coach2 = await signUp("Dee Coach", "dee@example.com");
  await as(creator.token).patch(`/api/users/${admin.id}/role`, { role: "admin" });
});

afterAll(async () => {
  await pool.end();
});

describe("sign-up and sign-in", () => {
  it("gives every new account the User role", () => {
    expect(coach.me.role).toBe("user");
    expect(coach.me.isAdmin).toBe(false);
    expect(coach.me.isCreator).toBe(false);
  });

  it("recognises the creator by email, whatever the case", () => {
    expect(creator.me.isCreator).toBe(true);
    expect(creator.me.isAdmin).toBe(true);
  });

  it("refuses a second account with the same email", async () => {
    const res = await request(app).post("/api/auth/signup").send({ name: "Carl Again", email: "CARL@example.com", password: "password123" });
    expect(res.status).toBe(409);
  });

  it("ignores a role sent with the sign-up", async () => {
    const res = await request(app).post("/api/auth/signup").send({ name: "Sneaky", email: "sneaky@example.com", password: "password123", role: "admin" });
    expect(res.body.me.role).toBe("user");
  });

  it("signs in with email and password", async () => {
    const ok = await request(app).post("/api/auth/login").send({ email: "carl@example.com", password: "password123" });
    expect(ok.status).toBe(200);
    const bad = await request(app).post("/api/auth/login").send({ email: "carl@example.com", password: "nope" });
    expect(bad.status).toBe(401);
  });

  it("requires sign-in for everything else", async () => {
    expect((await request(app).get("/api/programs")).status).toBe(401);
  });

  it("rejects a token with an edited user id", async () => {
    const parts = coach.token.split(".");
    parts[0] = String(creator.id);
    expect((await as(parts.join(".")).get("/api/auth/me")).status).toBe(401);
  });

  it("changes your own password only with the current one", async () => {
    expect((await as(coach2.token).post("/api/auth/password", { current: "wrong", next: "newpassword1" })).status).toBe(400);
    expect((await as(coach2.token).post("/api/auth/password", { current: "password123", next: "newpassword1" })).status).toBe(200);
    const login = await request(app).post("/api/auth/login").send({ email: "dee@example.com", password: "newpassword1" });
    expect(login.status).toBe(200);
  });
});

describe("Creator Control", () => {
  it("lists users for admins and the creator only", async () => {
    expect((await as(coach.token).get("/api/users")).status).toBe(403);
    const list = await as(creator.token).get("/api/users");
    expect(list.status).toBe(200);
    expect(list.body.find((u: any) => u.id === creator.id).isCreator).toBe(true);
  });

  it("lets an admin make someone an admin", async () => {
    expect((await as(admin.token).patch(`/api/users/${coach2.id}/role`, { role: "admin" })).status).toBe(200);
  });

  it("does not let an admin take admin away from another admin", async () => {
    expect((await as(admin.token).patch(`/api/users/${coach2.id}/role`, { role: "user" })).status).toBe(403);
    expect((await as(creator.token).patch(`/api/users/${coach2.id}/role`, { role: "user" })).status).toBe(200);
  });

  it("never changes the creator", async () => {
    expect((await as(admin.token).patch(`/api/users/${creator.id}/role`, { role: "user" })).status).toBe(400);
    expect((await as(admin.token).post(`/api/users/${creator.id}/password`, { password: "hijacked123" })).status).toBe(403);
  });

  it("does not let a coach promote themselves", async () => {
    expect((await as(coach.token).patch(`/api/users/${coach.id}/role`, { role: "admin" })).status).toBe(403);
  });
});

describe("schools, intramurals and clubs", () => {
  it("starts with the four partner schools", async () => {
    const res = await as(coach.token).get("/api/programs");
    expect(res.body.map((p: any) => p.name)).toEqual(["Rafiki Classical", "Daniels School", "ICC Imara", "Rosslyn Academy"]);
    expect(res.body.map((p: any) => p.kind)).toEqual(["intramural", "intramural", "club", "club"]);
  });

  it("lets admins add a new club; coaches cannot", async () => {
    expect((await as(coach.token).post("/api/programs", { name: "Brookhouse", shortCode: "BH", kind: "club" })).status).toBe(403);
    const res = await as(admin.token).post("/api/programs", { name: "Brookhouse School", shortCode: "bh", kind: "club" });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe("brookhouse-school");
    expect(res.body.shortCode).toBe("BH");
  });

  it("makes a coordinator admin of their own program only", async () => {
    expect((await as(admin.token).put("/api/programs/daniels/coordinators", { userIds: [coach.id] })).status).toBe(200);
    expect((await as(coach.token).get("/api/programs/daniels")).body.canManage).toBe(true);
    expect((await as(coach.token).get("/api/programs/rafiki")).body.canManage).toBe(false);
    expect((await as(coach.token).patch("/api/programs/daniels", { notes: "Sessions on the lower pitch" })).status).toBe(200);
    expect((await as(coach.token).patch("/api/programs/rafiki", { notes: "x" })).status).toBe(403);
    // Coordinators tailor their program but do not archive it or change its kind.
    expect((await as(coach.token).patch("/api/programs/daniels", { archived: true })).status).toBe(403);
  });
});

describe("a session day", () => {
  const url = "/api/programs/rafiki/sessions/2026-10-06";

  it("shows Rafiki's schedule and roles before anyone edits it", async () => {
    const res = await as(coach.token).get(url);
    expect(res.status).toBe(200);
    expect(res.body.isSessionDay).toBe(true); // a Tuesday
    expect(res.body.schedule[0]).toEqual({ time: "13:00", activity: "Arrive to Rafiki" });
    expect(res.body.roles.map((r: any) => r.name)).toContain("Warmup Lead");
    expect(res.body.version).toBe(0);
  });

  it("lets only admins and the coordinator edit roles and the schedule", async () => {
    const roles = [{ name: "Warmup Lead", assignee: "Carl" }];
    expect((await as(coach.token).put(`${url}/roles`, { version: 0, roles })).status).toBe(403);
    expect((await as(coach.token).put(`${url}/schedule`, { version: 0, schedule: [] })).status).toBe(403);
    const ok = await as(admin.token).put(`${url}/roles`, { version: 0, roles });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(1);
  });

  it("shows an admin's change to every other phone", async () => {
    const seen = await as(coach2.token).get(url);
    expect(seen.body.roles).toEqual([{ name: "Warmup Lead", assignee: "Carl" }]);
    expect(seen.body.updatedBy).toBe("Ann Admin");
  });

  it("stops a stale edit from overwriting a newer one", async () => {
    // The creator's screen still shows version 0; the admin already saved version 1.
    const stale = await as(creator.token).put(`${url}/roles`, { version: 0, roles: [] });
    expect(stale.status).toBe(409);
    expect(stale.body.latest.version).toBe(1);
    expect(stale.body.latest.roles[0].assignee).toBe("Carl");
  });

  it("keeps the schedule in time order", async () => {
    const res = await as(admin.token).put(`${url}/schedule`, {
      version: 1,
      schedule: [{ time: "15:00", activity: "Play" }, { time: "13:00", activity: "Arrive" }],
    });
    expect(res.body.schedule.map((s: any) => s.time)).toEqual(["13:00", "15:00"]);
    expect(res.body.roles[0].assignee).toBe("Carl"); // the roles were not touched
  });

  it("lets each coach answer the availability poll for themselves", async () => {
    expect((await as(coach.token).put(`${url}/availability`, { optionId: "early" })).status).toBe(200);
    expect((await as(coach2.token).put(`${url}/availability`, { optionId: "absent" })).status).toBe(200);
    expect((await as(coach.token).put(`${url}/availability`, { optionId: "made-up" })).status).toBe(400);
    const res = await as(coach.token).get(url);
    expect(res.body.mine).toBe("early");
    expect(res.body.availability.map((a: any) => a.name)).toEqual(["Carl Coach", "Dee Coach"]);
    const month = await as(coach.token).get("/api/programs/rafiki/months/2026-10");
    expect(month.body).toEqual([{ date: "2026-10-06", edited: true, replies: 2, coming: 1 }]);
  });

  it("rejects nonsense dates", async () => {
    expect((await as(coach.token).get("/api/programs/rafiki/sessions/2026-02-30")).status).toBe(400);
  });
});

describe("the tally", () => {
  const url = "/api/programs/rafiki/tally";
  const give = (token: string, teamId: string, amount: number, clientEventId = crypto.randomUUID()) =>
    as(token).post(url, { teamId, category: "Under 7", amount, clientEventId });

  it("adds points from every coach's phone to one total", async () => {
    await Promise.all([give(coach.token, "justice", 10), give(coach2.token, "justice", 5), give(admin.token, "wisdom", 1)]);
    const res = await as(coach.token).get(url);
    const justice = res.body.teams.find((t: any) => t.id === "justice");
    expect(justice.points).toBe(15);
    expect(res.body.recent).toHaveLength(3);
  });

  it("counts a retried request once", async () => {
    const id = "retry-0000001";
    await give(coach.token, "temperance", 5, id);
    await give(coach.token, "temperance", 5, id);
    const res = await as(coach.token).get(url);
    expect(res.body.teams.find((t: any) => t.id === "temperance").points).toBe(5);
  });

  it("only accepts the button amounts and known teams", async () => {
    expect((await give(coach.token, "justice", 500)).status).toBe(400);
    expect((await give(coach.token, "nobody", 1)).status).toBe(400);
  });

  it("lets only managers reset, and keeps the history", async () => {
    expect((await as(coach.token).post(`${url}/reset`)).status).toBe(403);
    const res = await as(admin.token).post(`${url}/reset`);
    expect(res.body.teams.every((t: any) => t.points === 0)).toBe(true);
    expect(res.body.recent.length).toBeGreaterThan(0);
    expect(res.body.resetBy).toBe("Ann Admin");
  });
});

describe("coach updates", () => {
  it("lets coaches post and remove their own; managers remove any", async () => {
    await as(coach2.token).post("/api/programs/rafiki/updates", { body: "Bring the cones" });
    const list = await as(coach.token).get("/api/programs/rafiki/updates");
    const post = list.body[0];
    expect(post.body).toBe("Bring the cones");
    expect(post.canDelete).toBe(false);
    expect((await as(coach.token).del(`/api/updates/${post.id}`)).status).toBe(403);
    expect((await as(admin.token).del(`/api/updates/${post.id}`)).status).toBe(200);
  });
});
