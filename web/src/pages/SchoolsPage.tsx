import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Program } from "../lib/api";
import { useMe } from "../lib/auth";
import { keys, usePrograms } from "../lib/queries";
import { ErrorNote, Notice, Page, SchoolBadge, Spinner, TopBar } from "../components/ui";

const GROUPS: { kind: Program["kind"]; title: string }[] = [
  { kind: "intramural", title: "Intramurals" },
  { kind: "club", title: "Clubs" },
];

export function SchoolsPage() {
  const me = useMe();
  const programs = usePrograms();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <TopBar title="Ambassadors Football" />
      <div className="bg-navy px-4 pb-10 pt-4 text-white">
        <div className="mx-auto max-w-2xl">
          <p className="font-display text-xs uppercase tracking-[0.2em] text-sky-300">Football. Faith. Future.</p>
          <h1 className="mt-2 font-display text-3xl">Hello, {me.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-white/70">Pick your school to see the session, roles and tally.</p>
        </div>
      </div>
      <Page>
        {programs.isPending ? (
          <Spinner />
        ) : programs.isError ? (
          <ErrorNote error={programs.error} onRetry={() => programs.refetch()} />
        ) : (
          <div className="-mt-10 space-y-6">
            {me.isAdmin && (
              <Link to="/people" className="card flex items-center gap-4 hover:ring-brand">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800">
                  <ShieldCheck className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg">{me.isSuperAdmin ? "Creator Control" : "People"}</span>
                  <span className="block text-sm text-muted">
                    {me.isSuperAdmin ? "Add coaches and users, and choose who is an admin" : "Choose who is an admin"}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 text-muted" />
              </Link>
            )}
            {GROUPS.map(({ kind, title }) => {
              const list = programs.data.filter((p) => p.kind === kind);
              if (list.length === 0) return null;
              return (
                <section key={kind} className="rounded-3xl bg-navy-2 p-4 shadow-lg">
                  <h2 className="mb-3 px-1 font-display text-lg text-white">{title}</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {list.map((p) => (
                      <Link
                        key={p.id}
                        to={`/p/${p.slug}`}
                        className={`group rounded-2xl border-l-4 bg-navy p-4 text-white transition hover:brightness-110 ${p.archived ? "opacity-50" : ""}`}
                        style={{ borderColor: p.color }}
                      >
                        <SchoolBadge program={p} size={48} />
                        <span className="mt-3 block text-sm font-bold leading-tight">{p.name}</span>
                        <span className="mt-1 flex items-center text-xs font-semibold text-amber-300">
                          {p.archived ? "Hidden" : "View details"} <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
            {me.isAdmin &&
              (adding ? (
                <NewProgramForm onDone={() => setAdding(false)} />
              ) : (
                <button className="btn-ghost w-full py-3" onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4" /> Add a school, intramural or club
                </button>
              ))}
          </div>
        )}
      </Page>
    </>
  );
}

function NewProgramForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [kind, setKind] = useState<Program["kind"]>("club");
  const [color, setColor] = useState("#2F5BD3");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/programs", { method: "POST", body: { name, shortCode, kind, color } });
      await queryClient.invalidateQueries({ queryKey: keys.programs });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add it");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div>
        <p className="eyebrow">New partnership</p>
        <h3 className="font-display text-xl">Add a school, intramural or club</h3>
        <p className="mt-1 text-sm text-muted">It starts with simple defaults. Its coordinator can then tailor the setup.</p>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Name</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brookhouse School" required />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="col-span-1 block">
          <span className="mb-1.5 block text-sm font-semibold">Initials</span>
          <input className="field uppercase" value={shortCode} onChange={(e) => setShortCode(e.target.value)} maxLength={4} placeholder="BH" required />
        </label>
        <label className="col-span-1 block">
          <span className="mb-1.5 block text-sm font-semibold">Type</span>
          <select className="field" value={kind} onChange={(e) => setKind(e.target.value as Program["kind"])}>
            <option value="intramural">Intramural</option>
            <option value="club">Club</option>
          </select>
        </label>
        <label className="col-span-1 block">
          <span className="mb-1.5 block text-sm font-semibold">Colour</span>
          <input className="field h-[46px] p-1" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>{busy ? "Adding…" : "Add"}</button>
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
