import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { BASE } from "./base";

async function latestBuild(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}version.json`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as { build: string }).build : null;
  } catch {
    return null; // offline: try again later
  }
}

/**
 * Keeps phones on the latest version. An app left open (or the Android app
 * resumed from the background) keeps running the code it first loaded, so
 * without this a coach could miss a fix for days. When a newer build is out:
 * reload straight away if the app is just being reopened, otherwise offer a
 * button, so nothing half-typed is lost.
 */
export function UpdateWatcher() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let stale = false;
    const check = async (reopened: boolean) => {
      const build = await latestBuild();
      if (!build || build === __BUILD_ID__) return;
      stale = true;
      if (reopened) window.location.reload();
      else setReady(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(() => void check(stale), 60_000);
    void check(false);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, []);

  if (!ready) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center p-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
      <button onClick={() => window.location.reload()} className="btn bg-brand px-5 py-3 text-white shadow-lg">
        <RefreshCw className="h-4 w-4" /> A new version is ready — tap to update
      </button>
    </div>
  );
}
