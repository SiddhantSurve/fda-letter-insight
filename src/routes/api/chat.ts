import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { callAiGateway, type ChatMessage } from "@/lib/ai.server";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(30),
  letterId: z.string().uuid().nullable().optional(),
  kind: z.enum(["warning", "untitled"]).nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

const SYSTEM = `You are an FDA enforcement-letter analyst. Answer strictly from the provided letter context.
Cite company names and letter dates when relevant. If the context does not contain the answer, say so plainly.
Be concise and use markdown. Never invent regulatory citations.`;

async function getUserId(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  const token = /^Bearer (.+)$/.exec(auth ?? "")?.[1];
  if (!token) return null;
  try {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const { data } = await supabase.auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
        const { messages, letterId, kind, threadId } = parsed.data;
        const question = messages[messages.length - 1]!.content;

        const { getLetterContext, searchCorpus } = await import("@/lib/fda/retrieval.server");
        let context = "";
        if (letterId) {
          const single = await getLetterContext(letterId);
          context = single?.text ?? "No stored text for this letter.";
        } else {
          const hits = await searchCorpus(question, kind ?? null, 6);
          context = hits.length
            ? hits.map((h, i) => `### Source ${i + 1}\n${h.text}`).join("\n\n")
            : "No matching letters found in the archive.";
        }

        const userId = await getUserId(request);
        let activeThreadId = threadId ?? null;
        if (userId) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          if (activeThreadId) {
            const { data: owned } = await supabaseAdmin
              .from("chat_threads")
              .select("id")
              .eq("id", activeThreadId)
              .eq("user_id", userId)
              .maybeSingle();
            if (!owned) return Response.json({ error: "Forbidden" }, { status: 403 });
          } else {
            const { data: created } = await supabaseAdmin
              .from("chat_threads")
              .insert({
                user_id: userId,
                title: question.slice(0, 80),
                scope: letterId ? "letter" : "corpus",
                letter_id: letterId ?? null,
                letter_kind: kind ?? null,
              })
              .select("id")
              .single();
            activeThreadId = created?.id ?? null;
          }
          if (activeThreadId) {
            await supabaseAdmin
              .from("chat_messages")
              .insert({ thread_id: activeThreadId, user_id: userId, role: "user", content: question });
          }
        }

        const payload: ChatMessage[] = [
          { role: "system", content: `${SYSTEM}\n\n## Letter context\n${context.slice(0, 90_000)}` },
          ...messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
        ];

        let upstream: Response;
        try {
          upstream = await callAiGateway(payload, { stream: true });
        } catch {
          return Response.json({ error: "AI is not available right now." }, { status: 503 });
        }
        if (!upstream.ok || !upstream.body) {
          const status = upstream.status === 429 || upstream.status === 402 ? upstream.status : 502;
          return Response.json({ error: "AI request failed." }, { status });
        }

        let assistant = "";
        const decoder = new TextDecoder();
        const transform = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            const text = decoder.decode(chunk, { stream: true });
            for (const line of text.split("\n")) {
              if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
              try {
                const json = JSON.parse(line.slice(6)) as {
                  choices?: { delta?: { content?: string } }[];
                };
                assistant += json.choices?.[0]?.delta?.content ?? "";
              } catch {
                /* partial frame */
              }
            }
            controller.enqueue(chunk);
          },
          async flush() {
            if (userId && activeThreadId && assistant) {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              await supabaseAdmin.from("chat_messages").insert({
                thread_id: activeThreadId,
                user_id: userId,
                role: "assistant",
                content: assistant,
              });
              await supabaseAdmin
                .from("chat_threads")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", activeThreadId);
            }
          },
        });

        return new Response(upstream.body.pipeThrough(transform), {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            "x-thread-id": activeThreadId ?? "",
          },
        });
      },
    },
  },
});
