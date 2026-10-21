type ViaCepPayload = {
  cep?: string;
  erro?: boolean;
  logradouro?: string;
  complemento?: string;
  unidade?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  estado?: string;
  regiao?: string;
  ibge?: string;
  gia?: string;
  ddd?: string;
  siafi?: string;
};

export async function GET(request: Request) {
  const cep = new URL(request.url).searchParams.get("cep")?.replace(/\D/g, "") ?? "";
  if (!/^\d{8}$/.test(cep)) return Response.json({ error: "invalid_cep" }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return Response.json({ error: "lookup_unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });

    const payload = await response.json() as ViaCepPayload;
    if (payload.erro) return Response.json({ error: "cep_not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    if (typeof payload.localidade !== "string" || typeof payload.uf !== "string") {
      return Response.json({ error: "invalid_lookup_response" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({
      logradouro: payload.logradouro ?? "",
      bairro: payload.bairro ?? "",
      localidade: payload.localidade,
      uf: payload.uf,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "lookup_unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timeout);
  }
}
