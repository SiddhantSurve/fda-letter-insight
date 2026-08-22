import { AlertTriangle } from "lucide-react";

export function AppBanner() {
  return (
    <div className="bg-banner text-banner-foreground">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-xs sm:text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p>This is a vibe coding product built by Sid — not formalized and currently in testing.</p>
      </div>
    </div>
  );
}
