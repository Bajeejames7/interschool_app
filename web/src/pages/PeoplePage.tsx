import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Search, Trash2, UserPlus } from "lucide-react";
import { api, type Person } from "../lib/api";
import { useMe } from "../lib/auth";
import { keys, usePeople } from "../lib/queries";
import { useConfirm } from "../lib/confirm";
import { ErrorNote, Notice, Page, Spinner, TopBar } from "../components/ui";

type Status = { tone: "good" | "bad"; text: string } | null;

/**
 * Creator Control. Abel and James (super admins) create every account here and
 * choose who is an Admin. Admins see the same list as "People" and can make a
 * user an admin, but cannot create or remove accounts or demote an admin.
 */
export function PeoplePage() {
  const me = useMe();
  const people = usePeople();
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<Status>(null);

  if (!me.isAdmin) return <Navigate to="/" replace />;

  const shown = (people.data ?? []).filter((p) =>
    `${p.name} ${p.email}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const admins = (people.data ?? []).filter((p) => p.role !== "user").length;

  return (
    <>
      <TopBar title={me.isSuperAdmin ? "Creator Control" : "People"} />
      <Page>
        <p className="eyebrow">{me.isSuperAdmin ? "Super admins only" : "Admins"}</p>
        <h1 className="font-display text-2xl">{me.isSuperAdmin ? "Creator Control" : "People"}</h1>
        <p className="mt-1 text-sm text-muted">
          {me.isSuperAdmin
            ? "Create accounts for coaches and choose who is an Admin. Admins can edit coach roles, schedules and every school's setup."
            : "Choose Admin to let someone edit coach roles, schedules and every school's setup. Only Abel and James create accounts or take admin away."}
        </p>

        {me.isSuperAdmin && <AddPerson onStatus={setStatus} />}

        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted" />
          <input className="field pl-10" placeholder="Search by name or email" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {status && <Notice tone={status.tone}>{status.text}</Notice>}

        {people.data === undefined ? (
          people.isError ? (
          <ErrorNote error={people.error} onRetry={() => people.refetch()} />
          ) : (
          <Spinner />
          )
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

function AddPerson({ onStatus }: { onStatus: (s: Status) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/users", { method: "POST", body: { name, email, password, role } });
      onStatus({
        tone: "good",
        text: `Account created for ${name}. Send them their email and the temporary password; they choose their own when they first sign in.`,
      });
      setName(""); setEmail(""); setPassword(""); setRole("user"); setOpen(false);
      await queryClient.invalidateQueries({ queryKey: keys.people });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not created");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="btn-primary mt-4 w-full py-3" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Add a person
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card mt-4 space-y-3">
      <h2 className="font-display text-lg">Add a person</h2>
      <input className="field" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="off" />
      <input className="field" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
      <input className="field" type="text" placeholder="Temporary password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="off" />
      <select className="field" value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")} aria-label="Role">
        <option value="user">User (coach)</option>
        <option value="admin">Admin</option>
      </select>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

function PersonRow({ person, onStatus }: { person: Person; onStatus: (s: Status) => void }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");

  const isSelf = person.id === me.id;
  // What this viewer may change about this person (the server checks the same).
  const canEdit = !person.isSuperAdmin && !isSelf && (me.isSuperAdmin || person.role !== "admin");
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
    }, `Temporary password set for ${person.name}. Tell them; they choose a new one when they sign in.`);

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${person.name}?`,
      message: "Their account, check-ins and posts are deleted. This cannot be undone.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) await run(() => api(`/users/${person.id}`, { method: "DELETE" }), `${person.name} was removed.`);
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
        {person.isSuperAdmin ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Super admin</span>
        ) : (
          <select
            className="field w-28 py-2 text-sm font-semibold"
            value={person.role}
            disabled={busy || !canEdit}
            onChange={(e) => setRole(e.target.value as "user" | "admin")}
            aria-label={`Role for ${person.name}`}
            title={canEdit ? undefined : "Only Abel and James can change an admin"}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        )}
      </div>

      {(person.coordinates.length > 0 || person.pendingFirstSignIn) && (
        <p className="mt-2 text-xs text-muted">
          {person.coordinates.length > 0 && <>Coordinator of {person.coordinates.map((c) => c.name).join(", ")}. </>}
          {person.pendingFirstSignIn && <>Has not chosen their own password yet.</>}
        </p>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {resetting ? (
            <>
              <input className="field flex-1" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password (8+ characters)" autoComplete="off" />
              <button className="btn-primary" disabled={busy || password.length < 8} onClick={setTempPassword}>Set</button>
              <button className="btn-ghost" onClick={() => setResetting(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setResetting(true)}>
                <KeyRound className="h-3.5 w-3.5" /> Set a temporary password
              </button>
              {me.isSuperAdmin && (
                <button className="btn-ghost px-3 py-1.5 text-xs text-bad" onClick={remove} disabled={busy}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
