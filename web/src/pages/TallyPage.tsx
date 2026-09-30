import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { api, eventId, type Tally } from "../lib/api";
import { useProgramContext } from "../lib/program";
import { keys, useTally } from "../lib/queries";
import { timeAgo } from "../lib/dates";
import { Credit, ErrorNote, Notice, Page, Spinner } from "../components/ui";

const PLACES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

export function TallyPage() {
  const program = useProgramContext();
  const tally = useTally(program.slug);
  const queryClient = useQueryClient();
  const storageKey = `ambassadors.category.${program.slug}`;
  const [category, setCategory] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && program.categories.includes(saved)) return saved;
    } catch { /* ignore */ }
    return program.categories[0] ?? "";
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    try { localStorage.setItem(storageKey, category); } catch { /* ignore */ }
  }, [storageKey, category]);

  if (program.teams.length === 0) {
    return (
      <Page>
        <p className="card text-sm text-muted">
          No teams are set up for {program.name} yet.{program.canManage ? " Add them under Setup." : ""}
        </p>
      </Page>
    );
  }

  const give = async (teamId: string, amount: number) => {
    setError(null);
    setPending((n) => n + 1);
    navigator.vibrate?.(10);
    // Show it straight away; the server's totals replace this a moment later.
    queryClient.setQueryData<Tally>(keys.tally(program.slug), (t) =>
      t && { ...t, teams: t.teams.map((team) => (team.id === teamId ? { ...team, points: team.points + amount } : team)) },
    );
    try {
      const fresh = await api<Tally>(`/programs/${program.slug}/tally`, {
        method: "POST",
        body: { teamId, category, amount, clientEventId: eventId() },
      });
      queryClient.setQueryData(keys.tally(program.slug), fresh);
    } catch (err) {
      setError(err instanceof Error ? `Not saved: ${err.message}` : "Not saved");
      await queryClient.invalidateQueries({ queryKey: keys.tally(program.slug) });
    } finally {
      setPending((n) => n - 1);
    }
  };

  const reset = async () => {
    if (!window.confirm("Reset all points to 0 for everyone? The history is kept.")) return;
    try {
      queryClient.setQueryData(keys.tally(program.slug), await api<Tally>(`/programs/${program.slug}/tally/reset`, { method: "POST" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not reset");
    }
  };

  if (tally.isPending) return <Page><Spinner /></Page>;
  if (tally.isError) return <Page><ErrorNote error={tally.error} onRetry={() => tally.refetch()} /></Page>;

  const ranked = [...tally.data.teams].sort((a, b) => b.points - a.points);
  const top = Math.max(1, ...ranked.map((t) => t.points));
  const total = ranked.reduce((sum, t) => sum + t.points, 0);
  const place = (id: string) => ranked.findIndex((t) => t.id === id);

  return (
    <Page>
      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <label className="block flex-1">
            <span className="mb-1.5 block text-sm font-semibold text-muted">Coaching category</span>
            <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
              {program.categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          {program.canManage && (
            <button className="btn-danger mt-6 shrink-0" onClick={reset}>Reset all points</button>
          )}
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
      </section>

      <section className="mt-4 rounded-3xl bg-[#1f2330] p-5 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg"><Trophy className="h-5 w-5 text-amber-300" /> Live standings</h2>
          <span className="text-sm text-white/70">{pending > 0 ? "Saving…" : `${total} pts total`}</span>
        </div>
        <div className="mt-4 space-y-3">
          {ranked.map((team) => (
            <div key={team.id}>
              <div className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm font-bold" style={{ color: team.color }}>{team.name}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, (team.points / top) * 100)}%`, backgroundColor: team.color }} />
                </div>
                <span className="w-10 text-right font-bold tabular-nums">{team.points}</span>
              </div>
              {team.lastBy && team.lastAt && (
                <p className="ml-27 mt-0.5 text-xs text-white/50">Last by {team.lastBy} · {timeAgo(team.lastAt)}</p>
              )}
            </div>
          ))}
        </div>
        {tally.data.resetAt && (
          <p className="mt-4 text-xs text-white/50">Counting since the reset by {tally.data.resetBy ?? "an admin"} · {timeAgo(tally.data.resetAt)}</p>
        )}
      </section>

      <div className="mt-4 space-y-3">
        {tally.data.teams.map((team) => (
          <section
            key={team.id}
            className="rounded-3xl p-4 ring-1"
            style={{ backgroundColor: `color-mix(in srgb, ${team.color} 12%, #15171f)`, borderColor: team.color, ["--tw-ring-color" as string]: `${team.color}55` }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg" style={{ color: team.color }}>{team.name}</h3>
                <p className="text-xs font-semibold text-white/60">{PLACES[place(team.id)]} place</p>
              </div>
              <span className="font-display text-3xl tabular-nums" style={{ color: team.color }}>{team.points}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <TallyButton label="−1" color="#9ca3af" onClick={() => give(team.id, -1)} disabled={team.points <= 0} />
              <div className="ml-auto flex gap-2">
                {[1, 5, 10].map((n) => (
                  <TallyButton key={n} label={`+${n}`} color={team.color} onClick={() => give(team.id, n)} />
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="card mt-4">
        <h2 className="font-display text-xl">Recent tallies</h2>
        {tally.data.recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No points given yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tally.data.recent.map((r) => {
              const team = program.teams.find((t) => t.id === r.teamId);
              return (
                <li key={r.id} className="flex items-center justify-between rounded-2xl bg-page px-4 py-2.5 ring-1 ring-line">
                  <div>
                    <p className="text-sm font-bold">{r.author}</p>
                    <p className="text-xs text-muted">{r.category} · {team?.name ?? r.teamId}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${r.amount > 0 ? "text-good" : "text-bad"}`}>{r.amount > 0 ? `+${r.amount}` : r.amount}</p>
                    <p className="text-xs text-muted">{timeAgo(r.createdAt)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Credit coordinator={program.coordinatorName || undefined} />
    </Page>
  );
}

function TallyButton({ label, color, onClick, disabled }: { label: string; color: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="min-w-14 rounded-xl border px-3 py-2.5 text-sm font-bold transition active:scale-95 disabled:opacity-30"
      style={{ color, borderColor: `${color}88`, backgroundColor: `${color}1a` }}
    >
      {label}
    </button>
  );
}
