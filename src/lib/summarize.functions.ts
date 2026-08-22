import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PROMPT = `Summarize this FDA enforcement letter in markdown, MAXIMUM 15 lines total.
Use exactly these three sections and nothing else:

**Issue** — what the FDA found (bullet points, max 5).
**Response / Resolution** — what the company said or did; use the response and close-out documents if present, otherwise state "No response on file".
**Next steps** — what remains outstanding or what the close-out concluded (max 3 bullets).

Be dense and factual. No preamble, no closing remarks.`;

export const summarizeLetter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ letterId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getLetterContext } = await import("@/lib/fda/retrieval.server");
    const context = await getLetterContext(data.letterId);
    if (!context) return { ok: false as const, summary: "", error: "Letter not found." };

    const { callAiGateway } = await import("@/lib/ai.server");
    let response: Response;
    try {
      response = await callAiGateway([
        { role: "system", content: PROMPT },
        { role: "user", content: context.text.slice(0, 90_000) },
      ]);
    } catch {
      return { ok: false as const, summary: "", error: "AI is not available right now." };
    }
    if (!response.ok) {
      return {
        ok: false as const,
        summary: "",
        error:
          response.status === 429
            ? "Rate limit reached — try again shortly."
            : "Could not generate a summary.",
      };
    }
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const summary = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!summary) return { ok: false as const, summary: "", error: "Empty summary." };
    return { ok: true as const, summary, error: null };
  });
