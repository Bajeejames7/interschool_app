import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CircleUserRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { asset } from "../lib/base";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted">
      <LoaderCircle className="h-5 w-5 animate-spin" /> {label}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div role="alert" className="card text-center">
      <p className="font-semibold text-bad">{message}</p>
      {onRetry && (
        <button className="btn-ghost mt-3" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** A short message after an action ("Saved", or what went wrong). */
export function Notice({ tone, children }: { tone: "good" | "bad"; children: ReactNode }) {
  return (
    <p role={tone === "bad" ? "alert" : "status"} className={`mt-2 text-sm font-semibold ${tone === "good" ? "text-good" : "text-bad"}`}>
      {children}
    </p>
  );
}

/** The navy bar at the top of every screen. */
export function TopBar({ left, title }: { left?: ReactNode; title?: ReactNode }) {
  const { me } = useAuth();
  return (
    <header className="sticky top-0 z-20 bg-navy text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4">
        {left ?? (
          <Link to="/" aria-label="All schools">
            <img src={asset("logo.jpg")} alt="Ambassadors Football" className="h-10 w-10 rounded-lg object-cover" />
          </Link>
        )}
        <div className="min-w-0 flex-1 truncate font-display text-sm uppercase tracking-[0.12em]">{title}</div>
        {me?.isAdmin && (
          <Link to="/people" aria-label={me.isSuperAdmin ? "Creator Control" : "People"} className="rounded-full p-2 hover:bg-white/10">
            <ShieldCheck className="h-5 w-5" />
          </Link>
        )}
        <Link to="/account" aria-label="Your account" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
          <CircleUserRound className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-2xl px-4 pb-32 pt-5">{children}</main>;
}

/** A school's logo on a white tile, or its initials in its colour if it has none. */
export function SchoolBadge({ program, size = 44 }: { program: { logo: string; shortCode: string; color: string; name: string }; size?: number }) {
  const style = { width: size, height: size };
  if (program.logo) {
    const src = program.logo.startsWith("data:") ? program.logo : asset(program.logo);
    return (
      <span className="grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-1" style={style}>
        <img src={src} alt={`${program.name} logo`} className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ ...style, backgroundColor: program.color }}>
      {program.shortCode}
    </span>
  );
}

export function Credit({ coordinator }: { coordinator?: string }) {
  if (!coordinator) return null;
  return (
    <footer className="mt-10 text-center font-display text-xs uppercase tracking-[0.2em] text-navy">
      <p className="opacity-70">{coordinator} — Intramural Coordinator</p>
    </footer>
  );
}
