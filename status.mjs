// GET /api/status -> informa ao site se o Gemini esta configurado (nunca expõe a chave).
export default async () => {
  const configured = Boolean(Netlify.env.get("GEMINI_API_KEY"));
  const model = Netlify.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  return new Response(JSON.stringify({ configured, model }), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
};
export const config = { path: "/api/status" };
