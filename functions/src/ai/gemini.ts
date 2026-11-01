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

/** 検索で見つけた出典（グラウンディングの groundingChunks） */
export interface WebSource {
  uri: string;
  title: string;
}

/**
 * Google 検索つきで答えさせる（グラウンディング）。検索ツールと JSON の形の固定は一緒に使えないので、
 * 答えの文の中の JSON を取り出して読む。出典（見たページ）と、Google が求める「検索の候補」の表示用 HTML も返す
 */
export async function callGeminiSearchJson<T>(o: { system: string; prompt: string; maxOutputTokens?: number }): Promise<{ output: T; sources: WebSource[]; searchHtml: string; usage: Usage }> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
  const res = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: o.prompt }] }],
    config: {
      systemInstruction: o.system,
      tools: [{ googleSearch: {} }],
      temperature: 0,
      ...(o.maxOutputTokens ? { maxOutputTokens: o.maxOutputTokens } : {}),
      httpOptions: { timeout: REQUEST_TIMEOUT_MS },
    },
  });
  const text = res.text?.trim() ?? "";
  const json = /\{[\s\S]*\}/.exec(text.replace(/```(?:json)?/g, ""))?.[0];
  if (!json) throw new EmptyResponseError(`finishReason=${res.candidates?.[0]?.finishReason ?? "なし"}`);
  let output: T;
  try {
    output = JSON.parse(json) as T;
  } catch {
    throw new EmptyResponseError("JSONとして読めませんでした");
  }
  const meta = res.candidates?.[0]?.groundingMetadata;
  const sources = (meta?.groundingChunks ?? []).flatMap((c) => (c.web?.uri ? [{ uri: c.web.uri, title: c.web.title ?? "" }] : []));
  return {
    output, sources, searchHtml: meta?.searchEntryPoint?.renderedContent ?? "",
    usage: { in: res.usageMetadata?.promptTokenCount ?? 0, out: res.usageMetadata?.candidatesTokenCount ?? 0 },
  };
}
