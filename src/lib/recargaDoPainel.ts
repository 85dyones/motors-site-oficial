/**
 * Recarregar o painel leva à Visão geral (pedido do dono em 02/10/2026).
 *
 * A regra de 01/09 já mandava todo LOGIN para a Visão geral ("sempre que logar
 * na área administrativa, sempre, a primeira visualização deve ser a Visão
 * Geral" — ver `/api/auth/callback`). Faltava a recarga: F5 em
 * `/admin/estoque` reabria o estoque. Agora a recarga de qualquer tela do
 * painel volta para a porta de entrada.
 *
 * O que NÃO muda, e é de propósito:
 *  · Abrir um endereço do painel direto (link de um alerta, favorito, URL
 *    digitada) continua abrindo aquela tela: isso é navegação, e não recarga.
 *  · Voltar e avançar do navegador.
 *  · Navegar por dentro do painel.
 *
 * É um script na página, e não uma regra no servidor, porque só o navegador
 * sabe se a carga foi uma recarga (`PerformanceNavigationTiming.type`). Roda
 * antes da tela pintar; sem a API, não faz nada.
 */

/** A porta de entrada do painel. */
export const PORTA_DO_PAINEL = "/admin";

export function scriptDaRecargaDoPainel(): string {
  return `(function(){try{var n=performance.getEntriesByType('navigation')[0];if(n&&n.type==='reload'&&location.pathname.replace(/\\/+$/,'')!=='${PORTA_DO_PAINEL}'){location.replace('${PORTA_DO_PAINEL}');}}catch(e){}})();`;
}
