import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Search, Trash2 } from "lucide-react";
import { api, type Person } from "../lib/api";
import { useMe } from "../lib/auth";
import { keys, usePeople } from "../lib/queries";
import { ErrorNote, Notice, Page, Spinner, TopBar } from "../components/ui";

/**
 * Creator Control. The creator (and the admins) see everyone who has signed
 * up and choose who is an Admin. Only the creator can take admin away.
 */
export function PeoplePage() {
  const me = useMe();
  const people = usePeople();
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  if (!me.isAdmin) return <Navigate to="/" replace />;

  const shown = (people.data ?? []).filter((p) =>
    `${p.name} ${p.email}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const admins = (people.data ?? []).filter((p) => p.role === "admin" || p.isCreator).length;

  return (
    <>
      <TopBar title={me.isCreator ? "Creator Control" : "People"} />
      <Page>
        <p className="eyebrow">{me.isCreator ? "Only you can see this page" : "Admins"}</p>
        <h1 className="font-display text-2xl">{me.isCreator ? "Creator Control" : "People"}</h1>
        <p className="mt-1 text-sm text-muted">
          Everyone signs up as a User. Choose Admin to let someone edit coach roles, schedules and every school's setup.
          {me.isCreator ? " Only you can take admin rights away." : " Only the creator can take admin rights away."}
        </p>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted" />
          <input className="field pl-10" placeholder="Search by name or email" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {status && <Notice tone={status.tone}>{status.text}</Notice>}

        {people.isPending ? (
          <Spinner />
        ) : people.isError ? (
          <ErrorNote error={people.error} onRetry={() => people.refetch()} />
        ) : (
          <>
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted">
              {people.data.length} people · {admins} with admin rights
            </p>
            <ul className="mt-2 space-y-2.5">
              {shown.map((p) => <PersonRow key={p.id} person={p} onStatus={setStatus} />)}
            </ul>
          </>
        )}
      </Page>
    </>
  );
}

function PersonRow({ person, onStatus }: { person: Person; onStatus: (s: { tone: "good" | "bad"; text: string }) => void }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");

  const isSelf = person.id === me.id;
  // What this viewer may change about this person (the server checks the same).
  const canEdit = !person.isCreator && (me.isCreator || person.role !== "admin");
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.people });

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      onStatus({ tone: "good", text: done });
    } catch (err) {
      onStatus({ tone: "bad", text: err instanceof Error ? err.message : "Not saved" });
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const setRole = (role: "user" | "admin") =>
    run(() => api(`/users/${person.id}/role`, { method: "PATCH", body: { role } }), `${person.name} is now ${role === "admin" ? "an Admin" : "a User"}.`);

  const setTempPassword = () =>
    run(async () => {
      await api(`/users/${person.id}/password`, { method: "POST", body: { password } });
      setResetting(false);
      setPassword("");
    }, `New password set for ${person.name}. Tell them, and ask them to change it under their account.`);

  const remove = () => {
    if (!window.confirm(`Remove ${person.name}'s account? Their check-ins and posts go with it.`)) return;
    void run(() => api(`/users/${person.id}`, { method: "DELETE" }), `${person.name} was removed.`);
  };

  return (
    <li className="card p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-white">
          {person.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{person.name}{isSelf && <span className="font-normal text-muted"> (you)</span>}</p>
          <p className="truncate text-sm text-muted">{person.email}</p>
        </div>
        {person.isCreator ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Creator</span>
        ) : (
          <select
            className="field w-28 py-2 text-sm font-semibold"
            value={person.role}
            disabled={busy || !canEdit}
            onChange={(e) => setRole(e.target.value as "user" | "admin")}
            aria-label={`Role for ${person.name}`}
            title={canEdit ? undefined : "Only the creator can change an admin"}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        )}
      </div>

      {person.coordinates.length > 0 && (
        <p className="mt-2 text-xs text-muted">Coordinator of {person.coordinates.map((c) => c.name).join(", ")}</p>
      )}

      {canEdit && !isSelf && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {resetting ? (
            <>
              <input className="field flex-1" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password (8+ characters)" />
              <button className="btn-primary" disabled={busy || password.length < 8} onClick={setTempPassword}>Set</button>
              <button className="btn-ghost" onClick={() => setResetting(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setResetting(true)}>
                <KeyRound className="h-3.5 w-3.5" /> Set a new password
              </button>
              <button className="btn-ghost px-3 py-1.5 text-xs text-bad" onClick={remove} disabled={busy}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
