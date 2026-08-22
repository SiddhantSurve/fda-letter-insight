import { Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";

type Message = { role: "user" | "assistant"; content: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle: string;
  letterId?: string | null;
  kind?: "warning" | "untitled" | null;
};

export function ChatPanel({ open, onOpenChange, title, subtitle, letterId, kind }: Props) {
  const { accessToken, user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // Restore this scope's most recent thread for signed-in users.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    void (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      let query = supabase
        .from("chat_threads")
        .select("id")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);
      query = letterId ? query.eq("letter_id", letterId) : query.eq("scope", "corpus");
      const { data: threads } = await query;
      const thread = threads?.[0];
      if (!thread || cancelled) return;
      const { data: history } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true })
        .limit(40);
      if (cancelled) return;
      setThreadId(thread.id);
      setMessages(
        (history ?? [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, letterId]);

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    const next: Message[] = [...messages, { role: "user", content: question }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ messages: next, letterId: letterId ?? null, kind: kind ?? null, threadId }),
      });
      const returnedThread = response.headers.get("x-thread-id");
      if (returnedThread) setThreadId(returnedThread);

      if (!response.ok || !response.body) {
        const detail = response.status === 429 ? "Too many requests — try again shortly." : "The assistant is unavailable right now.";
        setMessages([...next, { role: "assistant", content: detail }]);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistant = "";
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            assistant += json.choices?.[0]?.delta?.content ?? "";
            setMessages([...next, { role: "assistant", content: assistant }]);
          } catch {
            /* partial frame */
          }
        }
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-w-2xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </DialogHeader>

        <ScrollArea className="flex-1 rounded-md border border-border bg-surface-clinical p-3">
          {messages.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              Ask about findings, cited regulations, company responses or close-out status.
            </p>
          )}
          <div className="space-y-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "max-w-[92%] rounded-lg bg-card px-3 py-2 shadow-card"
                }
              >
                {message.role === "user" ? message.content : <Markdown>{message.content || "…"}</Markdown>}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </ScrollArea>

        {!user && (
          <p className="text-xs text-muted-foreground">
            Sign in to keep this conversation in your history.
          </p>
        )}

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask a question…"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
