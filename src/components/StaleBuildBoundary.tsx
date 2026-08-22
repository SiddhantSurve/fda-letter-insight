import { Component, useEffect, type ReactNode } from "react";

const FLAG = "stale-build-recovered";

function looksLikeStaleBuild(message: string): boolean {
  return (
    /reading 'component'/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /ChunkLoadError/i.test(message) ||
    /Loading chunk \d+ failed/i.test(message)
  );
}

async function recoverOnce(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (sessionStorage.getItem(FLAG)) return false;
  sessionStorage.setItem(FLAG, "1");
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
  } catch {
    /* recovery is best-effort */
  }
  window.location.reload();
  return true;
}

export function useStaleBuildRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (looksLikeStaleBuild(event.message ?? "")) void recoverOnce();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? "");
      if (looksLikeStaleBuild(message)) void recoverOnce();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Catches stale-bundle failures, clears caches and hard-reloads exactly once. */
export class StaleBuildBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error) {
    if (looksLikeStaleBuild(error.message ?? "")) void recoverOnce();
    else console.error(error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="clinical-panel max-w-md p-6 text-center">
          <h2 className="text-lg font-semibold text-foreground">Refreshing the app</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A newer version was published while this tab was open. Reload to continue.
          </p>
          <button
            onClick={() => {
              sessionStorage.removeItem(FLAG);
              window.location.reload();
            }}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-strong"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
