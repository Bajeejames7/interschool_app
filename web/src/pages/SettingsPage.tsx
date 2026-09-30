import { useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { api, type AvailabilityOption, type Program, type ScheduleItem, type Team } from "../lib/api";
import { useMe } from "../lib/auth";
import { useProgramContext } from "../lib/program";
import { imageSrc } from "../lib/base";
import { keys, usePeople } from "../lib/queries";
import { WEEKDAYS } from "../lib/dates";
import { Notice, Page, SchoolBadge } from "../components/ui";

type Draft = Pick<
  Program,
  | "name" | "shortCode" | "color" | "coordinatorName" | "coordinatorTitle" | "tagline" | "notes" | "sessionWeekday"
  | "availabilityOptions" | "defaultRoles" | "defaultSchedule" | "teams" | "categories" | "kind" | "archived" | "logo" | "background"
>;

/** Shrink an uploaded image so it stays small in the database: logos to 256px PNG, photos to 1280px JPEG. */
async function shrinkImage(file: File, max = 256, type: "image/png" | "image/jpeg" = "image/png"): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file is not an image"));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return type === "image/jpeg" ? canvas.toDataURL(type, 0.78) : canvas.toDataURL(type);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Setup for one school: admins and its coordinator tailor it here. */
export function SettingsPage() {
  const program = useProgramContext();
  const me = useMe();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => ({
    name: program.name,
    shortCode: program.shortCode,
    color: program.color,
    coordinatorName: program.coordinatorName,
    coordinatorTitle: program.coordinatorTitle,
    tagline: program.tagline,
    notes: program.notes,
    sessionWeekday: program.sessionWeekday,
    availabilityOptions: program.availabilityOptions,
    defaultRoles: program.defaultRoles,
    defaultSchedule: program.defaultSchedule,
    teams: program.teams,
    categories: program.categories,
    kind: program.kind,
    archived: program.archived,
    logo: program.logo,
    background: program.background,
  }));
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!program.canManage) return <Navigate to={`/p/${program.slug}`} replace />;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setBusy(true);
    setStatus(null);
    const { kind, archived, ...rest } = draft;
    try {
      await api(`/programs/${program.slug}`, {
        method: "PATCH",
        body: {
          ...rest,
          defaultRoles: rest.defaultRoles.map((r) => r.trim()).filter(Boolean),
          categories: rest.categories.map((c) => c.trim()).filter(Boolean),
          defaultSchedule: rest.defaultSchedule.filter((s) => s.activity.trim()).sort((a, b) => a.time.localeCompare(b.time)),
          ...(me.isAdmin ? { kind, archived } : {}),
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.program(program.slug) }),
        queryClient.invalidateQueries({ queryKey: keys.programs }),
      ]);
      setStatus({ tone: "good", text: "Saved. Every phone shows the new setup within a few seconds." });
    } catch (err) {
      setStatus({ tone: "bad", text: err instanceof Error ? err.message : "Not saved" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <p className="eyebrow">Setup</p>
      <h1 className="font-display text-2xl">{program.name}</h1>
      <p className="mt-1 text-sm text-muted">
        Tailor this {program.kind} to the school. Changes to the usual schedule and roles apply to sessions nobody has edited yet.
      </p>

      <div className="mt-5 space-y-4">
        <Section title="Logo" hint="Shown on the school's card and pages. A square image works best.">
          <div className="flex items-center gap-4">
            <SchoolBadge program={{ ...program, ...draft }} size={72} />
            <div className="flex flex-wrap gap-2">
              <label className="btn-ghost cursor-pointer">
                Upload logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      set("logo", await shrinkImage(file));
                    } catch (err) {
                      setStatus({ tone: "bad", text: err instanceof Error ? err.message : "Could not read that image" });
                    }
                  }}
                />
              </label>
              {draft.logo && (
                <button className="btn-ghost text-bad" onClick={() => set("logo", "")}>Remove</button>
              )}
            </div>
          </div>
        </Section>

        <Section title="Background photo" hint="Shown behind the top of this school's home page. A wide sports photo works best.">
          <div
            className="h-32 rounded-2xl bg-navy bg-cover bg-center ring-1 ring-line"
            style={{ backgroundImage: `url(${imageSrc(draft.background || "backgrounds/rafiki.jpg")})` }}
          />
          <div className="flex flex-wrap gap-2">
            <label className="btn-ghost cursor-pointer">
              Upload photo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    set("background", await shrinkImage(file, 1280, "image/jpeg"));
                  } catch (err) {
                    setStatus({ tone: "bad", text: err instanceof Error ? err.message : "Could not read that image" });
                  }
                }}
              />
            </label>
            {draft.background && (
              <button className="btn-ghost text-bad" onClick={() => set("background", "")}>Use the default photo</button>
            )}
          </div>
        </Section>

        <Section title="Basics">
          <Field label="Name"><input className="field" value={draft.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Initials"><input className="field uppercase" maxLength={4} value={draft.shortCode} onChange={(e) => set("shortCode", e.target.value)} /></Field>
            <Field label="Colour"><input className="field h-[46px] p-1" type="color" value={draft.color} onChange={(e) => set("color", e.target.value)} /></Field>
          </div>
          <Field label="Coordinator's name (shown on the pages)">
            <input className="field" value={draft.coordinatorName} onChange={(e) => set("coordinatorName", e.target.value)} placeholder="e.g. Denilson Mwenjwa" />
          </Field>
          <Field label="Coordinator's title">
            <input
              className="field"
              value={draft.coordinatorTitle}
              onChange={(e) => set("coordinatorTitle", e.target.value)}
              placeholder={draft.kind === "club" ? "Club Coordinator" : "Intramural Coordinator"}
            />
          </Field>
          <Field label="Tagline"><input className="field" value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} /></Field>
          <Field label="Session day">
            <select className="field" value={draft.sessionWeekday} onChange={(e) => set("sessionWeekday", Number(e.target.value))}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </Field>
          {me.isAdmin && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select className="field" value={draft.kind} onChange={(e) => set("kind", e.target.value as Program["kind"])}>
                  <option value="intramural">Intramural</option>
                  <option value="club">Club</option>
                </select>
              </Field>
              <Field label="Shown to coaches">
                <select className="field" value={draft.archived ? "hidden" : "shown"} onChange={(e) => set("archived", e.target.value === "hidden")}>
                  <option value="shown">Shown</option>
                  <option value="hidden">Hidden</option>
                </select>
              </Field>
            </div>
          )}
        </Section>

        <Section title="This school's requirements" hint="What the survey found: anything coaches should know about this school.">
          <textarea className="field min-h-32" value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
        </Section>

        <Section title="Availability choices" hint="The answers coaches pick from in the poll.">
          <ListEditor
            items={draft.availabilityOptions}
            onChange={(v) => set("availabilityOptions", v)}
            make={(): AvailabilityOption => ({ id: `opt${Date.now().toString(36).slice(-5)}`, label: "", tone: "ok" })}
            render={(o, update) => (
              <div className="flex flex-1 gap-2">
                <select className="field w-28 shrink-0" value={o.tone} onChange={(e) => update({ ...o, tone: e.target.value as AvailabilityOption["tone"] })} aria-label="Colour">
                  <option value="good">Green</option>
                  <option value="ok">Amber</option>
                  <option value="bad">Red (not coming)</option>
                </select>
                <input className="field" value={o.label} onChange={(e) => update({ ...o, label: e.target.value })} placeholder="e.g. I will arrive by 3:15 PM" />
              </div>
            )}
          />
        </Section>

        <Section title="Usual coach roles">
          <ListEditor
            items={draft.defaultRoles}
            onChange={(v) => set("defaultRoles", v)}
            make={() => ""}
            render={(r, update) => <input className="field" value={r} onChange={(e) => update(e.target.value)} placeholder="e.g. Warmup Lead" />}
          />
        </Section>

        <Section title="Usual session schedule">
          <ListEditor
            items={draft.defaultSchedule}
            onChange={(v) => set("defaultSchedule", v)}
            make={(): ScheduleItem => ({ time: draft.defaultSchedule.at(-1)?.time ?? "13:00", activity: "" })}
            render={(s, update) => (
              <div className="flex flex-1 gap-2">
                <input type="time" className="field w-28 shrink-0" value={s.time} onChange={(e) => update({ ...s, time: e.target.value })} />
                <input className="field" value={s.activity} onChange={(e) => update({ ...s, activity: e.target.value })} placeholder="What happens" />
              </div>
            )}
          />
        </Section>

        <Section title="Tally teams" hint="Renaming a team keeps its points; removing it hides its points.">
          <ListEditor
            items={draft.teams}
            onChange={(v) => set("teams", v)}
            make={(): Team => ({ id: `team${Date.now().toString(36).slice(-5)}`, name: "", color: "#93C5FD" })}
            render={(t, update) => (
              <div className="flex flex-1 gap-2">
                <input type="color" className="field h-[46px] w-14 shrink-0 p-1" value={t.color} onChange={(e) => update({ ...t, color: e.target.value })} aria-label="Team colour" />
                <input className="field" value={t.name} onChange={(e) => update({ ...t, name: e.target.value })} placeholder="e.g. Wisdom" />
              </div>
            )}
          />
        </Section>

        <Section title="Coaching categories">
          <ListEditor
            items={draft.categories}
            onChange={(v) => set("categories", v)}
            make={() => ""}
            render={(c, update) => <input className="field" value={c} onChange={(e) => update(e.target.value)} placeholder="e.g. Under 9" />}
          />
        </Section>

        {me.isAdmin && <CoordinatorsSection />}
      </div>

      <div className="sticky bottom-20 mt-6 rounded-3xl bg-white/95 p-3 shadow-lg ring-1 ring-line backdrop-blur">
        <button className="btn-primary w-full py-3" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save setup"}</button>
        {status && <Notice tone={status.tone}>{status.text}</Notice>}
      </div>
    </Page>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-display text-lg">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

function ListEditor<T>({
  items,
  onChange,
  make,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  render: (item: T, update: (next: T) => void) => ReactNode;
}) {
  const move = (i: number, by: number) => {
    const next = [...items];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {render(item, (updated) => onChange(items.map((x, j) => (j === i ? updated : x))))}
          <div className="flex shrink-0 flex-col">
            <button className="p-0.5 text-muted disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
            <button className="p-0.5 text-muted disabled:opacity-20" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
          </div>
          <button className="shrink-0 p-1.5 text-muted hover:text-bad" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button className="btn-ghost" onClick={() => onChange([...items, make()])}><Plus className="h-4 w-4" /> Add</button>
    </div>
  );
}

/** Admins pick who coordinates this program (its own admins). */
function CoordinatorsSection() {
  const program = useProgramContext();
  const people = usePeople();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const current = new Set(program.coordinators.map((c) => c.id));

  const toggle = async (id: number) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setStatus(null);
    try {
      await api(`/programs/${program.slug}/coordinators`, { method: "PUT", body: { userIds: [...next] } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.program(program.slug) }),
        queryClient.invalidateQueries({ queryKey: keys.people }),
      ]);
      setStatus({ tone: "good", text: "Coordinators updated." });
    } catch (err) {
      setStatus({ tone: "bad", text: err instanceof Error ? err.message : "Not saved" });
    }
  };

  return (
    <Section title="Coordinators" hint={`Coordinators can edit roles, schedules and this setup for ${program.name} only.`}>
      {people.data === undefined ? (
        people.isError ? (
        <p className="text-sm text-bad">Could not load people.</p>
        ) : (
        <p className="text-sm text-muted">Loading people…</p>
        )
      ) : (
        <div className="flex flex-wrap gap-2">
          {people.data.map((p) => (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              aria-pressed={current.has(p.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${current.has(p.id) ? "bg-navy text-white ring-navy" : "bg-white ring-line"}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      {status && <Notice tone={status.tone}>{status.text}</Notice>}
    </Section>
  );
}
