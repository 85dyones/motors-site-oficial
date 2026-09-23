/**
 * Tira a chave privada do GA4 do payload de staff.
 *
 * ---------------------------------------------------------------------------
 * Por que a chave não volta para a tela
 * ---------------------------------------------------------------------------
 * O GET devolve o blob completo para staff — é assim que o painel carrega, e é
 * assim que `apiSecretToken` já viaja hoje. A chave privada do GA4 é de outra
 * ordem: assina JWT em nome de uma conta de serviço do Google Cloud, e não há
 * nada na tela que precise LER o valor. Mandá-la para o navegador de cada
 * pessoa da equipe, a cada abertura de Configurações, é exposição sem uso.
 *
 * O que a tela recebe é `privateKeyConfigurada` — o suficiente para desenhar
 * "configurada ✓" e um campo para substituir.
 *
 * ⚠️ **Isto não faz da chave um segredo perante a equipe.** Quem é staff pode
 * ler a linha crua falando com o PostgREST direto: a RLS de `site_settings`
 * libera SELECT para `is_staff` (`20260813120000_role_cliente_e_is_staff.sql`).
 * A máscara elimina o vazamento ROTINEIRO — toda tela, toda pessoa, todo
 * cache de navegador — e não o deliberado. Prometer mais que isso seria
 * mentira confortável.
 */
export function mascararGa4<T extends { ga4?: unknown }>(completo: T): T {
  const ga4 = completo.ga4 as Record<string, unknown> | null | undefined;
  if (!ga4 || typeof ga4 !== "object") return completo;

  const { privateKey, ...resto } = ga4;
  return {
    ...completo,
    ga4: {
      ...resto,
      privateKeyConfigurada: Boolean(typeof privateKey === "string" && privateKey.trim()),
    },
  };
}
