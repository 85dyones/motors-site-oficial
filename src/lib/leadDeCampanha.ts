import type { Campanha } from "./campanhas";
import { caminhoDaCampanha } from "./campanhas";
import type { UtmParameters } from "./telemetry";

export interface DadosDoLeadDeCampanha {
  nome: string;
  email: string;
  whatsapp: string;
}

/**
 * A frase que a loja lê, na voz do CLIENTE.
 *
 * Ela vira o `interesse` da linha em `leads`: sem `veiculo` no corpo, a rota
 * deriva `interesse` daqui (`body.mensagem`, o segundo fallback), e uma frase
 * genérica grava um lead que não diz de onde a pessoa veio.
 *
 * Vem do registro e não de template. `Olá, vi sobre o feirão ${nome}…`
 * funcionaria para a Pole Position e sairia errado na primeira campanha que
 * não for feirão — uma condição de mês, uma parceria.
 *
 * O que a frase NÃO diz, e é regra e não estilo:
 *  - **prazo** que a loja não controla;
 *  - **FIPE, desconto ou "abaixo da tabela"** — o cliente nunca vê valor de
 *    compra no site;
 *  - **recompra** — regra 5 do `CLAUDE.md`, proibida em comunicação pública.
 */
export function mensagemDaCampanha(campanha: Campanha): string {
  return campanha.fraseDoCliente;
}

/**
 * O corpo do POST para `/api/leads`.
 *
 * Mesma rota e mesmo formato das outras seis superfícies. Tabela nova nenhuma:
 * o lead da campanha cai no mesmo Kanban, e o que o distingue é `canal` — o
 * padrão que `src/lib/encomenda.ts` estabeleceu.
 */
export function montarLeadDeCampanha(
  dados: DadosDoLeadDeCampanha,
  campanha: Campanha,
  extras: {
    agUid: string;
    eventId: string | null;
    turnstileToken: string;
    /** `getUtmParameters()` — o formato que `/api/leads` já recebe das outras seis superfícies. */
    utm: UtmParameters;
    eventSourceUrl?: string;
    fbp: string | null;
    fbc: string | null;
  },
) {
  const email = dados.email.trim();

  return {
    tipo: "lead_campanha",
    // A etiqueta que o consultor lê no Kanban antes de abrir a conversa.
    canal: campanha.nome,
    mensagem: mensagemDaCampanha(campanha),
    cliente: {
      nome: dados.nome.trim(),
      whatsapp: dados.whatsapp.trim(),
      // O modal aceita e-mail vazio (`!email.trim() || regex`). String vazia no
      // banco é pior que ausência: parece dado coletado e some do filtro.
      ...(email ? { email } : {}),
    },
    // O texto é para o humano; isto é para o n8n e para o dia em que o Motor de
    // Gatilhos precisar saber de qual campanha veio o contato.
    intencao_busca: {
      campanha: campanha.slug,
      caminho: caminhoDaCampanha(campanha),
    },
    utm: extras.utm,
    agUid: extras.agUid,
    eventId: extras.eventId,
    eventSourceUrl: extras.eventSourceUrl,
    fbp: extras.fbp,
    fbc: extras.fbc,
    turnstileToken: extras.turnstileToken,
  };
}
