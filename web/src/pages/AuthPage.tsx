import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { asset } from "../lib/base";
import { Notice } from "../components/ui";

/**
 * Email and password only — no Google sign-in, and no public sign-up: Abel and
 * James create every account from Creator Control.
 */
export function AuthPage() {
  const { me, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const back = (location.state as { from?: string } | null)?.from ?? "/";
  if (me) return <Navigate to={back} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate(back, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy">
      <div
        className="relative flex h-72 flex-col justify-end bg-cover bg-center px-6 pb-8 text-white"
        style={{ backgroundImage: `linear-gradient(to top, #16224f 5%, rgba(22,34,79,.35)), url(${asset("backgrounds/cover.jpg")})` }}
      >
        <img src={asset("logo.jpg")} alt="Ambassadors Football" className="mb-4 h-16 w-16 rounded-xl" />
        <h1 className="font-display text-3xl leading-tight">Show up ready.<br />Serve together.</h1>
        <p className="mt-2 font-display text-xs uppercase tracking-[0.2em] text-sky-300">Football. Faith. Future.</p>
      </div>

      <form onSubmit={submit} className="mx-auto -mt-2 max-w-md rounded-t-[2rem] bg-page px-6 pb-12 pt-8">
        <h2 className="font-display text-2xl">Sign in</h2>
        <p className="mt-1 text-sm text-muted">Welcome back, coach.</p>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Email</span>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Password</span>
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
        </div>

        {error && <Notice tone="bad">{error}</Notice>}

        <button className="btn-primary mt-6 w-full py-3" disabled={busy}>
          {busy ? "Please wait…" : "Sign in"}
        </button>

        <p className="mt-6 text-center text-sm text-muted">
          New coach? Ask Abel, James or an admin to create your account.
        </p>
        <p className="mt-2 text-center text-xs text-muted">Forgot your password? Ask an admin to set a new one for you.</p>
      </form>
    </div>
  );
}
