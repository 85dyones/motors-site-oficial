import { NextResponse } from "next/server";
import { getCachedSettings } from "../settings";

/**
 * A porta de entrada do motor de gatilhos.
 *
 * As rotas de `/api/ciclo/motor/*` invertem o sentido do `WEBHOOKS_N8N.md`:
 * ali o site é o emissor, aqui ele é o chamado. Quem bate é o n8n, sem cookie
 * de sessão — papel `anon` —, e do outro lado da porta há a fila com nome,
 * telefone e placa de cliente. O token é obrigatório, não "validado quando
 * existe".
 *
 * Mesmo desenho de `/api/financeiro/margens/consulta`, e pelo mesmo motivo
 * aprendido em 2026-08-12: com `if (token) { valide }`, um token vazio dos
 * dois lados abre a rota para qualquer um. Aqui isso publicaria a base de
 * clientes do Ciclo.
 *
 * A leitura do token passa por `getCachedSettings` (chave de serviço) porque
 * desde `20260812120000_rls_leitura_de_site_settings.sql` o papel anônimo não
 * lê a linha `webhooks` — ler com o cliente da requisição devolveria vazio, e
 * o efeito seria exatamente o oposto do pretendido.
 */
export async function autorizarMotor(
  request: Request,
): Promise<{ erro: NextResponse } | { erro: null }> {
  let dbSecretToken: string | undefined;
  try {
    const { webhooks } = await getCachedSettings();
    dbSecretToken = webhooks?.apiSecretToken;
  } catch (e: any) {
    // Falta de chave de serviço cai aqui. Indisponível é melhor que aberto.
    console.error("[Ciclo/Motor] Não foi possível ler as configurações:", e?.message);
  }

  const secretToken = (dbSecretToken || process.env.N8N_SECRET_TOKEN || "").trim();

  if (!secretToken) {
    console.error(
      "[Ciclo/Motor] Nenhum token configurado (site_settings.webhooks.apiSecretToken " +
        "nem N8N_SECRET_TOKEN). Rota indisponível até configurar.",
    );
    // 503 e não 401: o problema é de configuração nossa, e 401 mandaria o n8n
    // tentar outro token para sempre.
    return {
      erro: NextResponse.json(
        { error: "Motor de gatilhos indisponível: token de integração não configurado." },
        { status: 503 },
      ),
    };
  }

  if (request.headers.get("Authorization") !== `Bearer ${secretToken}`) {
    return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  }

  return { erro: null };
}
