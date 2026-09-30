import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, CircleCheck, Pencil, Plus, Trash2, UserRoundCheck, UsersRound } from "lucide-react";
import { ApiError, api, type AvailabilityOption, type Role, type ScheduleItem, type Session } from "../lib/api";
import { useProgramContext } from "../lib/program";
import { keys, useSession } from "../lib/queries";
import { WEEKDAYS, addDays, clock, longDate, timeAgo, weekdayOf } from "../lib/dates";
import { Credit, ErrorNote, Notice, Page, Spinner } from "../components/ui";

const TONE: Record<AvailabilityOption["tone"], string> = { good: "bg-good", ok: "bg-ok", bad: "bg-bad" };

export function SessionPage() {
  const program = useProgramContext();
  const { date: routeDate } = useParams();
  const date = routeDate ?? program.nextSession;
  const session = useSession(program.slug, date);
  const day = WEEKDAYS[program.sessionWeekday];

  // Step to the previous / next session day.
  const prev = addDays(date, -(((weekdayOf(date) - program.sessionWeekday + 7) % 7) || 7));
  const next = addDays(date, ((program.sessionWeekday - weekdayOf(date) + 7) % 7) || 7);

  return (
    <Page>
      <div className="mb-4 flex items-center justify-between">
        <Link to={`/p/${program.slug}/session/${prev}`} className="btn-ghost p-2.5" aria-label="Previous session">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="text-center">
          <p className="eyebrow">{date === program.nextSession ? "Next session" : "Session"}</p>
          <h1 className="font-display text-xl">{longDate(date)}</h1>
        </div>
        <Link to={`/p/${program.slug}/session/${next}`} className="btn-ghost p-2.5" aria-label="Next session">
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>

      {session.isPending ? (
        <Spinner />
      ) : session.isError ? (
        <ErrorNote error={session.error} onRetry={() => session.refetch()} />
      ) : (
        <div className="space-y-5">
          {!session.data.isSessionDay && (
            <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
              This is not a usual {day}. Only use it if the session was moved to this day.
            </p>
          )}
          <AvailabilityCard date={date} session={session.data} />
          <RolesCard date={date} session={session.data} />
          <ScheduleCard date={date} session={session.data} />
          {session.data.updatedBy && session.data.updatedAt && (
            <p className="text-center text-xs text-muted">
              Last changed by {session.data.updatedBy} · {timeAgo(session.data.updatedAt)}
            </p>
          )}
        </div>
      )}
      <Credit program={program} />
    </Page>
  );
}

// ---- availability poll ------------------------------------------------------------------

function AvailabilityCard({ date, session }: { date: string; session: Session }) {
  const program = useProgramContext();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const day = WEEKDAYS[program.sessionWeekday];

  const choose = async (optionId: string | null) => {
    setSaving(optionId ?? "clear");
    setError(null);
    try {
      await api(`/programs/${program.slug}/sessions/${date}/availability`, {
        method: optionId ? "PUT" : "DELETE",
        body: optionId ? { optionId } : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: keys.session(program.slug, date) });
      void queryClient.invalidateQueries({ queryKey: ["month", program.slug] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved");
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <section className="card">
        <p className="eyebrow flex items-center gap-1.5"><CircleCheck className="h-4 w-4" /> Coach check-in</p>
        <h2 className="mt-1 font-display text-2xl leading-tight">{day} availability poll</h2>
        <p className="mt-1 text-sm text-muted">Choose your availability for this session. You can change it any time.</p>
        <div className="mt-4 space-y-2.5">
          {program.availabilityOptions.map((option) => {
            const picked = session.mine === option.id;
            return (
              <button
                key={option.id}
                onClick={() => choose(option.id)}
                disabled={saving !== null}
                aria-pressed={picked}
                className={`flex w-full items-center gap-3 rounded-2xl p-3.5 text-left text-[15px] ring-1 transition ${
                  picked ? "bg-navy text-white ring-navy" : "bg-white ring-line hover:ring-brand"
                }`}
              >
                <span className={`h-6 w-6 shrink-0 rounded-full ${TONE[option.tone]} ${picked ? "ring-4 ring-white/40" : "opacity-80"}`} />
                <span className="font-medium">{option.label}</span>
                {saving === option.id && <span className="ml-auto text-xs">Saving…</span>}
              </button>
            );
          })}
        </div>
        {session.mine && (
          <button className="mt-3 text-sm font-semibold text-muted underline" onClick={() => choose(null)} disabled={saving !== null}>
            Clear my answer
          </button>
        )}
        {error && <Notice tone="bad">{error}</Notice>}
      </section>

      <section className="card">
        <h2 className="flex items-center gap-2 font-display text-lg"><UsersRound className="h-5 w-5 text-brand" /> Coaches who have checked in</h2>
        {session.availability.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No coaches have checked in for this session yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {program.availabilityOptions.map((option) => {
              const people = session.availability.filter((a) => a.optionId === option.id);
              if (people.length === 0) return null;
              return (
                <div key={option.id}>
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
                    <span className={`h-2.5 w-2.5 rounded-full ${TONE[option.tone]}`} /> {option.label} · {people.length}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {people.map((p) => (
                      <span key={p.userId} className="rounded-full bg-page px-3 py-1 text-sm font-medium ring-1 ring-line">{p.name}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

// ---- saving with a version check ------------------------------------------------------

function useSessionSaver(date: string) {
  const program = useProgramContext();
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);

  const save = async (part: "roles" | "schedule", body: object, version: number): Promise<boolean> => {
    setConflict(null);
    try {
      await api(`/programs/${program.slug}/sessions/${date}/${part}`, { method: "PUT", body: { ...body, version } });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const by = err.body?.latest?.updatedBy;
        setConflict(`${by ?? "Someone"} changed this session while you were editing, so your changes were not saved. The latest version is shown now — please make your change again.`);
        return true; // leave edit mode and show the latest
      }
      throw err;
    } finally {
      await queryClient.invalidateQueries({ queryKey: keys.session(program.slug, date) });
      void queryClient.invalidateQueries({ queryKey: ["month", program.slug] });
    }
  };
  return { save, conflict };
}

// ---- coach roles ----------------------------------------------------------------------

function RolesCard({ date, session }: { date: string; session: Session }) {
  const program = useProgramContext();
  const { save, conflict } = useSessionSaver(date);
  const [draft, setDraft] = useState<{ roles: Role[]; version: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const day = WEEKDAYS[program.sessionWeekday];
  const names = session.availability.filter((a) => program.availabilityOptions.find((o) => o.id === a.optionId)?.tone !== "bad").map((a) => a.name);

  const update = (i: number, change: Partial<Role>) =>
    setDraft((d) => d && { ...d, roles: d.roles.map((r, j) => (j === i ? { ...r, ...change } : r)) });

  const submit = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const roles = draft.roles.filter((r) => r.name.trim());
      if (await save("roles", { roles }, draft.version)) setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow flex items-center gap-1.5"><UserRoundCheck className="h-4 w-4" /> {day} roles</p>
          <h2 className="mt-1 font-display text-xl">Coach role assignments</h2>
          <p className="mt-1 text-sm text-muted">
            {program.canManage ? "You can assign and edit these roles." : "Set by the admins and coordinator."}
          </p>
        </div>
        {program.canManage && !draft && (
          <button className="btn-ghost shrink-0" onClick={() => { setDraft({ roles: session.roles.map((r) => ({ ...r })), version: session.version }); }}>
            <Pencil className="h-4 w-4" /> Edit
          </button>
        )}
      </div>

      {conflict && <Notice tone="bad">{conflict}</Notice>}

      {draft ? (
        <div className="mt-4 space-y-3">
          <datalist id="coach-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          {draft.roles.map((role, i) => (
            <div key={i} className="rounded-2xl bg-page p-3 ring-1 ring-line">
              <div className="flex gap-2">
                <input className="field font-semibold" value={role.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Role" aria-label="Role name" />
                <button className="btn-ghost p-2.5 text-bad" aria-label={`Remove ${role.name || "role"}`} onClick={() => setDraft((d) => d && { ...d, roles: d.roles.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <input className="field mt-2" list="coach-names" value={role.assignee} onChange={(e) => update(i, { assignee: e.target.value })} placeholder="Coach (leave empty if unassigned)" aria-label={`Coach for ${role.name}`} />
            </div>
          ))}
          <button className="btn-ghost" onClick={() => setDraft((d) => d && { ...d, roles: [...d.roles, { name: "", assignee: "" }] })}>
            <Plus className="h-4 w-4" /> Add role
          </button>
          {error && <Notice tone="bad">{error}</Notice>}
          <div className="flex gap-2 pt-1">
            <button className="btn-primary flex-1" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save roles"}</button>
            <button className="btn-ghost" onClick={() => setDraft(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : session.roles.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No roles for this session.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {session.roles.map((role, i) => (
            <li key={i} className="rounded-2xl bg-page px-4 py-3 ring-1 ring-line">
              <p className="font-bold">{role.name}</p>
              <p className={`text-sm ${role.assignee ? "text-ink" : "text-muted"}`}>{role.assignee || "Unassigned"}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- session schedule ---------------------------------------------------------------------

function ScheduleCard({ date, session }: { date: string; session: Session }) {
  const program = useProgramContext();
  const { save, conflict } = useSessionSaver(date);
  const [draft, setDraft] = useState<{ schedule: ScheduleItem[]; version: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (i: number, change: Partial<ScheduleItem>) =>
    setDraft((d) => d && { ...d, schedule: d.schedule.map((s, j) => (j === i ? { ...s, ...change } : s)) });

  const submit = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const schedule = draft.schedule.filter((s) => s.activity.trim());
      if (await save("schedule", { schedule }, draft.version)) setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved");
    } finally {
      setBusy(false);
    }
  };

  const googleEnd = session.schedule.at(-1)?.time ?? "17:00";
  const googleStart = session.schedule[0]?.time ?? "13:00";

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-2 px-1">
        <div>
          <p className="eyebrow flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> {longDate(date)}</p>
          <h2 className="mt-1 font-display text-2xl">Session schedule</h2>
        </div>
        {program.canManage && !draft && (
          <button className="btn-ghost shrink-0 bg-white" onClick={() => setDraft({ schedule: session.schedule.map((s) => ({ ...s })), version: session.version })}>
            <Pencil className="h-4 w-4" /> Edit schedule
          </button>
        )}
      </div>

      {conflict && <Notice tone="bad">{conflict}</Notice>}

      {draft ? (
        <div className="card space-y-2.5">
          {draft.schedule.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input type="time" className="field w-28 shrink-0" value={item.time} onChange={(e) => update(i, { time: e.target.value })} aria-label="Time" required />
              <input className="field" value={item.activity} onChange={(e) => update(i, { activity: e.target.value })} placeholder="What happens" aria-label="Activity" />
              <button className="btn-ghost p-2.5 text-bad" aria-label="Remove" onClick={() => setDraft((d) => d && { ...d, schedule: d.schedule.filter((_, j) => j !== i) })}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button className="btn-ghost" onClick={() => setDraft((d) => d && { ...d, schedule: [...d.schedule, { time: d.schedule.at(-1)?.time ?? "13:00", activity: "" }] })}>
            <Plus className="h-4 w-4" /> Add a line
          </button>
          <p className="text-xs text-muted">Lines are put in time order when you save. This changes this day only; the usual schedule is under Setup.</p>
          {error && <Notice tone="bad">{error}</Notice>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save schedule"}</button>
            <button className="btn-ghost" onClick={() => setDraft(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : session.schedule.length === 0 ? (
        <p className="card text-sm text-muted">No schedule yet{program.canManage ? " — tap Edit schedule to add one." : "."}</p>
      ) : (
        <>
          <ol className="space-y-2.5">
            {session.schedule.map((item, i) => (
              <li key={i} className="flex items-start gap-4 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-line">
                <span className="w-14 shrink-0 rounded-lg bg-navy py-1.5 text-center font-mono text-sm font-bold text-white">{clock(item.time)}</span>
                <span className="pt-1 font-semibold">{item.activity}</span>
              </li>
            ))}
          </ol>
          <a
            className="btn-ghost mt-3 w-full bg-white"
            target="_blank"
            rel="noreferrer"
            href={googleCalendarHref(program.name, date, googleStart, googleEnd, session.schedule)}
          >
            Add this session to my calendar
          </a>
        </>
      )}
    </section>
  );
}

function googleCalendarHref(name: string, date: string, start: string, end: string, schedule: ScheduleItem[]) {
  const stamp = (t: string) => `${date.replaceAll("-", "")}T${t.replace(":", "")}00`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Ambassadors Football — ${name}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    ctz: "Africa/Nairobi",
    details: schedule.map((s) => `${clock(s.time)}  ${s.activity}`).join("\n"),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
