import { useState, type FormEvent } from "react";
import { LogOut } from "lucide-react";
import { api } from "../lib/api";
import { useAuth, useMe } from "../lib/auth";
import { Notice, Page, TopBar } from "../components/ui";

export function AccountPage() {
  const me = useMe();
  const { signOut, refresh } = useAuth();
  const firstSignIn = me.mustChangePassword;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const change = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await api("/auth/password", { method: "POST", body: { current, next } });
      setCurrent("");
      setNext("");
      setStatus({ tone: "good", text: "Password changed." });
      await refresh(); // lifts the first-sign-in lock
    } catch (err) {
      setStatus({ tone: "bad", text: err instanceof Error ? err.message : "Not changed" });
    } finally {
      setBusy(false);
    }
  };

  const role = me.isSuperAdmin ? "Super admin" : me.isAdmin ? "Admin" : me.coordinates.length ? "Coordinator" : "User";

  return (
    <>
      <TopBar title="Your account" />
      <Page>
        {firstSignIn && (
          <section className="mb-4 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
            <h2 className="font-display text-lg text-amber-900">Welcome! Choose your own password</h2>
            <p className="mt-1 text-sm text-amber-900/80">
              Your account was set up with a temporary password. Enter it as your current password below, then choose one only you know.
            </p>
          </section>
        )}
        <section className="card">
          <p className="eyebrow">Signed in as</p>
          <h1 className="mt-1 font-display text-2xl">{me.name}</h1>
          <p className="text-muted">{me.email}</p>
          <span className="mt-3 inline-block rounded-full bg-page px-3 py-1 text-sm font-bold ring-1 ring-line">{role}</span>
        </section>

        <form onSubmit={change} className="card mt-4 space-y-3">
          <h2 className="font-display text-lg">{firstSignIn ? "Set your password" : "Change password"}</h2>
          <input className="field" type="password" autoComplete="current-password" placeholder={firstSignIn ? "Temporary password" : "Current password"} value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <input className="field" type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
          {status && <Notice tone={status.tone}>{status.text}</Notice>}
        </form>

        <button className="btn-ghost mt-4 w-full py-3" onClick={signOut}>
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </Page>
    </>
  );
}
