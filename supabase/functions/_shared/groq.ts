const DEFAULT_MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";

export function groqKeys(): string[] {
  return (Deno.env.get("GROQ_API_KEYS") ?? Deno.env.get("GROQ_API_KEY") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

export async function groqChat(
  messages: Array<{ role: string; content: string }>,
  opts?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const keys = groqKeys();
  if (keys.length === 0) throw new Error("No GROQ API keys configured");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${keys[Math.floor(Math.random() * keys.length)]}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      max_tokens: opts?.maxTokens ?? 1024,
      temperature: opts?.temperature,
      // Reasoning models spend budget thinking first — cap it so answers survive
      reasoning_effort: "low",
    }),
  });
  if (!res.ok) {
    console.error("[groq] error:", res.status, await res.text());
    throw new Error("AI service temporarily unavailable");
  }
  const data = await res.json();
  const msg = data?.choices?.[0]?.message ?? {};
  // Reasoning models sometimes put everything in `reasoning` with empty content
  let text = String(msg.content ?? "");
  if (!text.trim() && typeof msg.reasoning === "string") text = msg.reasoning;
  // Some models wrap thoughts in tags or code fences — strip both
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```json|```/g, "").trim();
  return text;
}

/** Pulls the first JSON object/array out of an LLM response. */
export function extractJson<T>(text: string): T | null {
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  const start = arrStart !== -1 && (arrStart < objStart || objStart === -1) ? arrStart : objStart;
  if (start === -1) return null;
  const endCurly = text.lastIndexOf("}");
  const endSquare = text.lastIndexOf("]");
  const end = Math.max(endCurly, endSquare);
  if (end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
