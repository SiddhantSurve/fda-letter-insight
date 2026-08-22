import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { BellRing, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { getNotificationPrefs, saveNotificationPrefs } from "@/lib/notifications.functions";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Email alerts — FDA Enforcement Letter Archive" },
      {
        name: "description",
        content:
          "Subscribe to email alerts and get a link in your inbox whenever the FDA publishes a new warning letter or untitled letter.",
      },
      { property: "og:title", content: "Email alerts for new FDA letters" },
      {
        property: "og:description",
        content:
          "Automatic hourly monitoring of FDA warning and untitled letters, delivered to your inbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/alerts" }],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [warning, setWarning] = useState(true);
  const [untitled, setUntitled] = useState(true);

  const prefsQuery = useQuery({
    queryKey: ["notification-prefs", user?.id],
    queryFn: () => getNotificationPrefs(),
    enabled: Boolean(user),
  });

  useEffect(() => {
    const prefs = prefsQuery.data?.prefs;
    if (prefs) {
      setEmail(prefs.email ?? user?.email ?? "");
      setWarning(prefs.notify_warning);
      setUntitled(prefs.notify_untitled);
    } else if (user?.email) {
      setEmail((current) => current || user.email!);
    }
  }, [prefsQuery.data, user]);

  const save = useMutation({
    mutationFn: () =>
      saveNotificationPrefs({
        data: { email, notify_warning: warning, notify_untitled: untitled },
      }),
    onSuccess: () => {
      toast.success("Alert preferences saved.");
      void queryClient.invalidateQueries({ queryKey: ["notification-prefs"] });
    },
    onError: () => toast.error("Could not save your preferences."),
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
        <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
        Email alerts
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You never need to refresh the archive. The catalog is checked automatically every hour, and
        when the FDA posts a new letter we email you a direct link to it in this app.
      </p>

      <section className="clinical-panel mt-6 p-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
          </div>
        ) : !user ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">Sign in to subscribe to alerts.</p>
            <Link to="/auth">
              <Button>Sign in or create an account</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="alert-email">Send alerts to</Label>
              <Input
                id="alert-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">New Warning Letters</p>
                  <p className="text-xs text-muted-foreground">
                    Every newly posted FDA warning letter.
                  </p>
                </div>
                <Switch checked={warning} onCheckedChange={setWarning} aria-label="Warning letters" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">New Untitled Letters</p>
                  <p className="text-xs text-muted-foreground">
                    OPDP untitled letters to pharmaceutical companies.
                  </p>
                </div>
                <Switch
                  checked={untitled}
                  onCheckedChange={setUntitled}
                  aria-label="Untitled letters"
                />
              </div>
            </div>

            <Button
              disabled={save.isPending || !email || (!warning && !untitled)}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save alert preferences"}
            </Button>
            {!warning && !untitled && (
              <p className="text-xs text-muted-foreground">
                Select at least one letter type, or turn both off and save to unsubscribe later.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="mt-6 text-sm text-muted-foreground">
        <h2 className="text-sm font-semibold text-foreground">How it works</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>A scheduled job checks the FDA catalogs every hour.</li>
          <li>New letters are ingested, deduplicated and full text is stored.</li>
          <li>Each subscriber gets one email per new letter with a link to it here.</li>
          <li>You are never emailed twice about the same letter.</li>
        </ol>
      </section>
    </main>
  );
}
