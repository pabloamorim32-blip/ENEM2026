// GET /api/status -> informa se o Gemini esta configurado, sem expor a chave.
export default async () => {
  const configured = Boolean(Netlify.env.get("GEMINI_API_KEY"));
  const model = "gemini-3.8-flash";
  return new Response(JSON.stringify({ configured, model }), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
};
export const config = { path: "/api/status" };
