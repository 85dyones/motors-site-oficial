/**
 * O endereço de uma conversa no Chatwoot.
 *
 * Decisão do dono em 2026-08-31: *"vamos passar a guardar o id da conversa, é
 * importante e mais assertivo"*. O card do kanban abria `wa.me` com o número
 * do cliente — o consultor respondia pelo WhatsApp pessoal e a conversa não
 * ficava registrada. Com o id em mãos, o botão leva para dentro da ferramenta
 * onde o atendimento vive.
 *
 * ---------------------------------------------------------------------------
 * O `wa.me` NÃO sai de cena, e não é preguiça
 * ---------------------------------------------------------------------------
 * Conversa de WhatsApp no Chatwoot nasce quando o CLIENTE escreve. Um lead que
 * acabou de preencher o formulário e ainda não mandou mensagem **não tem
 * conversa** — e é justamente esse o lead que alguém precisa abordar primeiro.
 * Se o botão dependesse do Chatwoot, o caso mais comum ficaria sem botão.
 *
 * Então a régua é: conversa existe → Chatwoot; não existe → `wa.me`, como
 * sempre foi. Quem chama não escolhe, `linkDeConversa` decide.
 *
 * ---------------------------------------------------------------------------
 * O endereço vem do ambiente, não do código
 * ---------------------------------------------------------------------------
 * Host e id da conta são configuração de instalação, e este repositório não
 * inventa número — a mesma regra que mantém o endereço do site em
 * `lib/site.ts`. Sem as duas variáveis, `linkDaConversa` devolve `""` e o
 * sistema inteiro continua no `wa.me`: a falta de configuração degrada, não
 * quebra.
 *
 * Não é segredo (é hostname e um inteiro), por isso `NEXT_PUBLIC_` — o card do
 * kanban é componente de cliente e precisa montar o link no navegador.
 */

/** A base do Chatwoot, sem barra no fim. `""` quando não configurado. */
export function baseDoChatwoot(
  env: { url?: string | null } = { url: process.env.NEXT_PUBLIC_CHATWOOT_URL },
): string {
  const bruto = (env.url ?? "").trim();
  if (!bruto) return "";
  // Sem protocolo o link vira relativo ao próprio painel e abre uma 404 do
  // Next — pior que não ter link, porque parece que a conversa sumiu.
  const comProtocolo = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
  return comProtocolo.replace(/\/+$/, "");
}

/** O id da conta no Chatwoot. `""` quando não configurado ou inválido. */
export function contaDoChatwoot(
  env: { conta?: string | null } = { conta: process.env.NEXT_PUBLIC_CHATWOOT_CONTA_ID },
): string {
  const bruto = (env.conta ?? "").trim();
  return /^\d+$/.test(bruto) ? bruto : "";
}

/** O Chatwoot está configurado a ponto de conseguirmos montar um link? */
export function chatwootConfigurado(env?: { url?: string | null; conta?: string | null }): boolean {
  return Boolean(baseDoChatwoot(env && { url: env.url }) && contaDoChatwoot(env && { conta: env.conta }));
}

/**
 * O endereço da conversa. `""` quando falta id ou configuração.
 *
 * Devolver vazio, e não um link quebrado, é a mesma regra de `linkWhatsApp` e
 * de `linkDeConversa`: quem chama esconde o botão ou cai no degrau seguinte.
 * Link que abre erro faz o vendedor concluir que o sistema quebrou.
 */
export function linkDaConversa(
  conversaId: number | string | null | undefined,
  env?: { url?: string | null; conta?: string | null },
): string {
  const id = conversaId === null || conversaId === undefined ? "" : String(conversaId).trim();
  // Id de conversa do Chatwoot é inteiro positivo. Recusar o resto evita
  // montar `/conversations/undefined`, que responde 200 com tela vazia — o
  // pior dos dois mundos, porque não parece erro.
  if (!/^\d+$/.test(id) || Number(id) <= 0) return "";

  const base = baseDoChatwoot(env && { url: env.url });
  const conta = contaDoChatwoot(env && { conta: env.conta });
  if (!base || !conta) return "";

  return `${base}/app/accounts/${conta}/conversations/${id}`;
}
