export const AI_MODEL = "google/gemini-3.7-flash";
export const AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function callAiGateway(
  messages: ChatMessage[],
  options: { stream?: boolean; model?: string } = {},
): Promise<Response> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI gateway is not configured");
  return fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? AI_MODEL,
      stream: options.stream ?? false,
      messages,
    }),
  });
}
