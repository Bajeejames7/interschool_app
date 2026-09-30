import { useState, type FormEvent } from "react";
import { LogOut } from "lucide-react";
import { api } from "../lib/api";
import { useAuth, useMe } from "../lib/auth";
import { Notice, Page, TopBar } from "../components/ui";

export function AccountPage() {
  const me = useMe();
  const { signOut } = useAuth();
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
    } catch (err) {
      setStatus({ tone: "bad", text: err instanceof Error ? err.message : "Not changed" });
    } finally {
      setBusy(false);
    }
  };

  const role = me.isCreator ? "Creator" : me.isAdmin ? "Admin" : me.coordinates.length ? "Coordinator" : "User";

  return (
    <>
      <TopBar title="Your account" />
      <Page>
        <section className="card">
          <p className="eyebrow">Signed in as</p>
          <h1 className="mt-1 font-display text-2xl">{me.name}</h1>
          <p className="text-muted">{me.email}</p>
          <span className="mt-3 inline-block rounded-full bg-page px-3 py-1 text-sm font-bold ring-1 ring-line">{role}</span>
        </section>

        <form onSubmit={change} className="card mt-4 space-y-3">
          <h2 className="font-display text-lg">Change password</h2>
          <input className="field" type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
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
