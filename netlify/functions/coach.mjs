// POST /api/coach -> proxy do Gemini. A chave fica só em variável de ambiente do Netlify.
const BASE = "Responda em português do Brasil, em texto simples, direto e sem enrolação. Não invente fatos, trechos ou gabaritos; se faltar informação, diga isso. ";
const PROMPTS = {
  essay: "Você é uma corretora de redação do Enem. " + BASE + "Formato obrigatório: uma linha por competência, 'C1: NN/200 - justificativa curta citando um trecho real do texto' (C1 a C5, notas só em 0, 40, 80, 120, 160 ou 200); depois 'Total estimado: X/1000 (estimativa pedagógica, não é nota oficial)'; depois 'Revise primeiro:' com no máximo 3 itens. Seja rigorosa: não elogie sem evidência. Avise se o texto tiver menos de 7 linhas, fugir ao tema ou copiar os textos de apoio. Não reescreva a redação.",
  quiz: "Você é uma tutora do Enem. " + BASE + "Comente o desempenho em até 6 frases: reconheça acertos, explique os 2 erros mais instrutivos usando o gabarito fornecido e recomende um tópico para revisar.",
  historical: "Você é uma tutora do Enem. " + BASE + "Explique o conceito e o raciocínio passo a passo usando só o enunciado e as alternativas fornecidos. Não afirme gabarito oficial.",
};
const MAX_CHARS = 12000;
const MODEL = "gemini-3.8-flash";
const hits = new Map();
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const key = Netlify.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "Gemini não configurado." }, 503);

  // O domínio público atual do site; não depende de uma variável que possa estar com URL antiga.
  const allowed = "https://enem6.netlify.app";
  if (req.headers.get("origin") !== allowed) return json({ error: "Origem não permitida." }, 403);

  const ip = context?.ip || "anon", now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 8) return json({ error: "Muitas solicitações. Aguarde 1 minuto." }, 429);
  hits.set(ip, [...recent, now]);

  let body;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido." }, 400); }
  const system = PROMPTS[body?.kind];
  if (!system) return json({ error: "Tipo de pedido inválido." }, 400);
  const text = JSON.stringify(body.payload ?? {});
  if (text.length > MAX_CHARS) return json({ error: "Texto longo demais. Envie uma redação ou questão por vez." }, 413);

  const model = MODEL;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 1200 },
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: data?.error?.message || "Falha ao consultar o Gemini." }, 502);
    const answer = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    if (!answer) return json({ error: "O Gemini não retornou texto." }, 502);
    return json({ answer, model, provider: "Gemini" });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return json({ error: "O Gemini demorou mais de 30 segundos para responder. Tente novamente." }, 504);
    }
    return json({ error: "Não foi possível falar com o Gemini." }, 502);
  }
};
export const config = { path: "/api/coach" };
