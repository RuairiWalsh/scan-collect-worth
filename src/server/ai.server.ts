// Server-only: Lovable AI Gateway (Responses API, streamed, raw fetch).
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

export class AiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function streamJson<T>(opts: {
  instructions: string;
  content: Record<string, unknown>[];
  schemaName: string;
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
}): Promise<T> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiError("AI is not configured.", 401);

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: opts.instructions,
      input: [{ role: "user", content: opts.content }],
      stream: true,
      store: false,
      reasoning: { effort: opts.effort ?? "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      text: {
        format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.schema },
      },
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    let msg = `AI request failed (${res.status})`;
    try {
      const j = JSON.parse(body);
      msg = j?.error?.message ?? j?.message ?? msg;
    } catch {
      /* ignore */
    }
    if (res.status === 402) msg = "AI credits are used up for this workspace. " + msg;
    if (res.status === 429) msg = "Too many scans at once — wait a moment and try again.";
    throw new AiError(msg, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let evt: { type?: string; delta?: string; error?: { message?: string }; response?: { error?: { message?: string } } };
        try {
          evt = JSON.parse(data);
        } catch {
          continue;
        }
        if (evt.type === "response.output_text.delta" && evt.delta) text += evt.delta;
        if (evt.type === "error" || evt.type === "response.failed") {
          throw new AiError(evt.error?.message ?? evt.response?.error?.message ?? "AI failed", 500);
        }
      }
    }
  }
  if (!text) throw new AiError("The AI couldn't read this image.", 422);
  return JSON.parse(text) as T;
}
