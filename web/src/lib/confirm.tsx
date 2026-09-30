import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface Ask {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

type Confirm = (ask: Ask) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * "Are you sure?" as part of the app. The browser's own window.confirm() is
 * not used: inside the Android app (a WebView) it never appears and silently
 * answers "no", which made Remove and Reset do nothing there.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(Ask & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback<Confirm>(
    (ask) => new Promise<boolean>((resolve) => setPending({ ...ask, resolve })),
    [],
  );

  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => answer(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="font-display text-lg">{pending.title}</h2>
            {pending.message && <p className="mt-2 text-sm text-muted">{pending.message}</p>}
            <div className="mt-5 flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => answer(false)} autoFocus>
                Cancel
              </button>
              <button className={`${pending.danger ? "btn-danger" : "btn-primary"} flex-1`} onClick={() => answer(true)}>
                {pending.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm outside ConfirmProvider");
  return confirm;
}
