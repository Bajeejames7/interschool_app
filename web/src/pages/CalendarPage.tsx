import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Megaphone, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useProgramContext } from "../lib/program";
import { keys, useMonth, useUpdates } from "../lib/queries";
import { WEEKDAYS, monthGrid, monthTitle, shiftMonth, timeAgo, weekdayOf } from "../lib/dates";
import { Credit, ErrorNote, Notice, Page, Spinner } from "../components/ui";

export function CalendarPage() {
  const program = useProgramContext();
  const [month, setMonth] = useState(program.today.slice(0, 7));
  const days = useMonth(program.slug, month);
  const info = new Map((days.data ?? []).map((d) => [d.date, d]));
  const grid = monthGrid(month);
  const sessionCount = grid.flat().filter((d) => d && weekdayOf(d) === program.sessionWeekday).length;
  const day = WEEKDAYS[program.sessionWeekday];

  return (
    <Page>
      <section className="card">
        <div className="flex items-center justify-between">
          <button className="btn-ghost p-2.5" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <h1 className="font-display text-xl">{day} calendar</h1>
            <p className="text-sm text-muted">{monthTitle(month)} — {sessionCount} {day}s this month</p>
          </div>
          <button className="btn-ghost p-2.5" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wider text-muted">
          {WEEKDAYS.map((d) => <div key={d}>{d.slice(0, 3)}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {grid.flat().map((date, i) => {
            if (!date) return <div key={i} />;
            const isSession = weekdayOf(date) === program.sessionWeekday;
            const d = info.get(date);
            const isToday = date === program.today;
            const label = `${Number(date.slice(8))}`;
            if (!isSession && !d) {
              return (
                <div key={date} className={`grid aspect-square place-items-center rounded-xl text-sm ${isToday ? "font-bold text-brand" : "text-muted/70"}`}>
                  {label}
                </div>
              );
            }
            return (
              <Link
                key={date}
                to={`/p/${program.slug}/session/${date}`}
                className={`relative grid aspect-square place-items-center rounded-xl text-sm font-bold transition ${
                  date < program.today ? "bg-navy/40 text-white" : "bg-navy text-white hover:bg-brand"
                } ${isToday ? "ring-2 ring-brand ring-offset-2" : ""}`}
                aria-label={`${date}${d ? `, ${d.coming} coming` : ""}`}
              >
                {label}
                {d && d.coming > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-good px-1 text-[10px] text-white">
                    {d.coming}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        {days.isError && <Notice tone="bad">Could not load this month. It will retry.</Notice>}
        <p className="mt-4 text-xs text-muted">Tap any highlighted {day} to see or edit that session. The green number is how many coaches are coming.</p>
      </section>

      <UpdatesBoard />
      <Credit coordinator={program.coordinatorName || undefined} />
    </Page>
  );
}

function UpdatesBoard() {
  const program = useProgramContext();
  const updates = useUpdates(program.slug);
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.updates(program.slug) });

  const post = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/programs/${program.slug}/updates`, { method: "POST", body: { body } });
      setBody("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not posted");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api(`/updates/${id}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not removed");
    }
    await refresh();
  };

  return (
    <section className="card mt-5">
      <h2 className="flex items-center gap-2 font-display text-xl"><Megaphone className="h-5 w-5 text-brand" /> Coach updates</h2>
      <form onSubmit={post} className="mt-3">
        <textarea className="field min-h-20" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share an update with the team…" maxLength={2000} />
        <div className="mt-2 flex justify-end">
          <button className="btn-primary" disabled={busy || !body.trim()}>{busy ? "Posting…" : "Post update"}</button>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
      </form>

      <div className="mt-4 space-y-2.5">
        {updates.isPending ? (
          <Spinner />
        ) : updates.isError ? (
          <ErrorNote error={updates.error} onRetry={() => updates.refetch()} />
        ) : updates.data.length === 0 ? (
          <p className="text-sm text-muted">No updates posted yet.</p>
        ) : (
          updates.data.map((u) => (
            <article key={u.id} className="rounded-2xl bg-page p-3.5 ring-1 ring-line">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold">{u.author} <span className="font-normal text-muted">· {timeAgo(u.createdAt)}</span></p>
                {u.canDelete && (
                  <button onClick={() => remove(u.id)} className="text-muted hover:text-bad" aria-label="Remove update">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-line text-[15px]">{u.body}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
