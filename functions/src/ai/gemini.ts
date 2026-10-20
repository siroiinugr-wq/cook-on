// Gemini への1回の呼び出し。答えは必ず JSON（responseJsonSchema で形を固定する）
import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY, GEMINI_MODEL, REQUEST_TIMEOUT_MS } from "./config";

export interface Usage {
  in: number;
  out: number;
}

export class EmptyResponseError extends Error {
  constructor(detail = "") {
    super(`Geminiの返事が空か、JSONとして読めませんでした ${detail}`.trim());
  }
}

export async function callGeminiJson<T>(o: {
  system: string;
  prompt: string;
  /** 一緒に見せる画像（base64）。並べた順に渡す */
  images?: { mimeType: string; data: string }[];
  schema: object;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<{ output: T; usage: Usage }> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
  const res = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [...(o.images ?? []).map((inlineData) => ({ inlineData })), { text: o.prompt }] }],
    config: {
      systemInstruction: o.system,
      responseMimeType: "application/json",
      responseJsonSchema: o.schema,
      temperature: o.temperature ?? 0,
      ...(o.maxOutputTokens ? { maxOutputTokens: o.maxOutputTokens } : {}),
      httpOptions: { timeout: REQUEST_TIMEOUT_MS },
    },
  });
  const text = res.text?.trim();
  if (!text) throw new EmptyResponseError(`finishReason=${res.candidates?.[0]?.finishReason ?? "なし"}`);
  let output: T;
  try {
    output = JSON.parse(text) as T;
  } catch {
    throw new EmptyResponseError("JSONの途中で切れています");
  }
  return {
    output,
    usage: { in: res.usageMetadata?.promptTokenCount ?? 0, out: res.usageMetadata?.candidatesTokenCount ?? 0 },
  };
}

export function addUsage(a: Usage, b: Usage): Usage {
  return { in: a.in + b.in, out: a.out + b.out };
}
