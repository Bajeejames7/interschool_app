import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CircleUserRound, CloudOff, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useConnection } from "../lib/offline";
import { useAuth } from "../lib/auth";
import { asset, imageSrc } from "../lib/base";

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
      <ConnectionBar />
    </header>
  );
}

/** Shown under the top bar when there is no connection, or changes are waiting to sync. */
function ConnectionBar() {
  const { online, lastSync, waiting } = useConnection();
  if (online && waiting === 0) return null;
  const changes = waiting === 1 ? "1 change" : `${waiting} changes`;
  const saved = new Date(lastSync).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <div role="status" className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold ${online ? "bg-brand" : "bg-amber-500 text-navy"}`}>
      {online ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CloudOff className="h-3.5 w-3.5" />}
      {online
        ? `Syncing ${changes}…`
        : `Offline — showing what was saved at ${saved}${waiting ? ` · ${changes} will sync when you are back online` : ""}`}
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-2xl px-4 pb-32 pt-5">{children}</main>;
}

/** A school's logo on a white tile, or its initials in its colour if it has none. */
export function SchoolBadge({ program, size = 44 }: { program: { logo: string; shortCode: string; color: string; name: string }; size?: number }) {
  const style = { width: size, height: size };
  if (program.logo) {
    const src = imageSrc(program.logo);
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

type Coordinated = { coordinatorName: string; coordinatorTitle: string; kind: "intramural" | "club" };

/** "Kate Agosa — Intramural Coordinator", using the school's own title if it has one. */
export function coordinatorLine(program: Coordinated): string | null {
  if (!program.coordinatorName) return null;
  const title = program.coordinatorTitle || (program.kind === "club" ? "Club Coordinator" : "Intramural Coordinator");
  return `${program.coordinatorName} — ${title}`;
}

export function Credit({ program }: { program?: Coordinated }) {
  const line = program && coordinatorLine(program);
  if (!line) return null;
  return (
    <footer className="mt-10 text-center font-display text-xs uppercase tracking-[0.2em] text-navy">
      <p className="opacity-70">{line}</p>
    </footer>
  );
}
