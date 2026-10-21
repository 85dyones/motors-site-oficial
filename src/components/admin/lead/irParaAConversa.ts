/**
 * Leva a tela até a conversa do lead e põe o cursor na caixa de resposta
 * (2026-10-21). É o destino do botão "Conversa" do card e do cabeçalho, que
 * substituiu o atalho do Chatwoot: a conversa pelo WhatsApp da loja mora no
 * bloco de atendimento do lead (`AtendimentoDoLead`).
 *
 * Do card, o detalhe ainda está abrindo quando o clique acontece: tenta de
 * novo a cada 100 ms, por até 3 s. Sem a caixa (o detalhe não abriu), não faz
 * nada — o lead aberto já é o caminho até ela.
 */
export function irParaAConversa(leadId: string, tentativas = 30): void {
  if (typeof document === "undefined") return;
  const caixa = document.getElementById(`resposta-${leadId}`);
  if (caixa) {
    caixa.closest("section")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    caixa.focus?.({ preventScroll: true });
    return;
  }
  if (tentativas > 0) setTimeout(() => irParaAConversa(leadId, tentativas - 1), 100);
}
