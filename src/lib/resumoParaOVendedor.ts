import {
  ROTULO_DO_PAGAMENTO,
  ROTULO_DO_PRAZO,
  motivoPrincipal,
  type Aquecimento,
  type FichaDoLead,
  type MotivoDaEntrega,
} from "./aquecimento";
import { nomeParaTratar } from "./cadencias";
import { formatarTelefone } from "./filaDoFunil";
import { linkDeConversa, numeroDiscavel, primeiroNome } from "./funil";

/**
 * O que vai para o WhatsApp do vendedor quando o assistente entrega o lead, e
 * o que o cliente lê na mesma hora.
 *
 * ---------------------------------------------------------------------------
 * O formato (2026-10-19)
 * ---------------------------------------------------------------------------
 * Pedido do dono: *"o resumo do atendimento é enviado para o WhatsApp do
 * corretor, que atende do seu próprio número"*. O manobrAI manda "LEAD QUENTE
 * — Rafael", telefone, uma frase de contexto, "Procura", "Pagamento" e
 * "Troca". Aqui vai o mesmo esqueleto, com o que o painel tem a mais: a nota
 * de aquecimento com o motivo, a origem e o link do lead. O link do WhatsApp
 * do cliente vai pronto porque o vendedor responde do PRÓPRIO número — é um
 * toque, não um número para copiar.
 *
 * Nada aqui é decidido: a ficha é a que o cliente disse, campo vazio não
 * aparece, e o resumo é o do modelo, marcado como resumo.
 */

export const CABECALHO_DA_ENTREGA: Record<MotivoDaEntrega | "painel", string> = {
  quente: "🔥 LEAD QUENTE",
  pediu_humano: "🙋 PEDIU UM CONSULTOR",
  pediu_condicao: "💰 PEDIU CONDIÇÃO",
  painel: "📋 LEAD ENTREGUE PELO PAINEL",
};

export interface DadosDaEntrega {
  motivo: MotivoDaEntrega | "painel";
  lead: { nome: string | null; telefone: string | null; canal?: string | null };
  ficha: FichaDoLead;
  aquecimento: Pick<Aquecimento, "pontos" | "temperatura" | "motivos">;
  resumo: string | null;
  origem: string | null;
  linkDoLead: string | null;
  /** `vendedor`: o dono recebe. `distribuir`: vai a quem escolhe o dono. */
  para: "vendedor" | "distribuir";
  /**
   * O cliente pediu fotos na mensagem que o entregou ("de fora do Onix LT 2020
   * (#7950008)"): o assistente não as manda na entrega — quem manda é o vendedor.
   */
  fotosPedidas?: string | null;
}

/** A mensagem ao vendedor (ou a quem distribui). */
export function mensagemDeEntrega(d: DadosDaEntrega): string {
  const nome = d.lead.nome?.trim() || "Cliente sem nome";
  const numero = numeroDiscavel(d.lead.telefone);
  const linhas: string[] = [
    `${CABECALHO_DA_ENTREGA[d.motivo]} — ${nome}`,
    // O link do CLIENTE pelo montador único do repositório (`linkDeConversa`):
    // link de WhatsApp montado à mão é o que `whatsapp-numero-unico` barra.
    numero ? `📱 ${formatarTelefone(numero)} · ${linkDeConversa(numero)}` : "",
    "",
    d.ficha.interesse ? `Procura: ${d.ficha.interesse}` : "",
    d.ficha.orcamento ? `Quer investir: ${d.ficha.orcamento}` : "",
    d.ficha.pagamento
      ? `Pagamento: ${ROTULO_DO_PAGAMENTO[d.ficha.pagamento]}${d.ficha.entrada ? ` · entrada ${d.ficha.entrada}` : ""}`
      : d.ficha.entrada
        ? `Entrada: ${d.ficha.entrada}`
        : "",
    d.ficha.troca ? `Troca: ${d.ficha.troca}` : "",
    d.ficha.prazo ? `Prazo: ${ROTULO_DO_PRAZO[d.ficha.prazo]}` : "",
    d.ficha.visita ? `Visita: ${d.ficha.visita}` : "",
    d.ficha.cidade ? `Cidade: ${d.ficha.cidade}` : "",
    `Aquecimento: ${d.aquecimento.pontos}/100${motivoPrincipal(d.aquecimento) ? ` (${motivoPrincipal(d.aquecimento)})` : ""}`,
    d.origem ? `Origem: ${d.origem}` : "",
    d.fotosPedidas ? `📷 Pediu fotos ${d.fotosPedidas}: mande do seu WhatsApp.` : "",
  ];
  const corpo = linhas.filter((l, i) => l !== "" || i === 2).join("\n").replace(/\n{3,}/g, "\n\n");

  const resumo = d.resumo?.trim() ? `\n\nResumo da conversa: ${d.resumo.trim()}` : "";
  const fechamento =
    d.para === "vendedor"
      ? [
          d.linkDoLead ? `Abrir no painel: ${d.linkDoLead}` : "",
          "O assistente saiu da conversa. Responda do seu WhatsApp ou pelo painel, e registre o contato.",
        ]
      : [
          d.linkDoLead ? `Definir o responsável: ${d.linkDoLead}` : "",
          "Sem responsável ainda: o resumo vai para quem você escolher no painel.",
        ];
  return `${corpo}${resumo}\n\n${fechamento.filter(Boolean).join("\n")}`;
}

/**
 * O que o cliente lê quando sai do assistente.
 *
 * Com dono e dentro do horário, nomeia quem vai atender e diz de que número
 * vem a chamada — senão o cliente recebe mensagem de um número desconhecido e
 * não responde. Fora do horário de aviso, promete o contato para a abertura,
 * que é quando o vendedor será avisado.
 */
export function mensagemDePassagemAoCliente(dados: {
  nomeDoCliente: string | null;
  vendedor: { nome: string; whatsapp: string | null } | null;
  equipeDisponivel: boolean;
  /** O cliente pediu fotos nesta mensagem: quem manda é o vendedor, e a frase diz. */
  comFotos?: boolean;
}): string {
  const nome = nomeParaTratar(dados.nomeDoCliente);
  const abertura = nome ? `Perfeito, ${nome}!` : "Perfeito!";
  const fotos = dados.comFotos ? (dados.equipeDisponivel ? " e te mandar as fotos" : " e te manda as fotos") : "";
  // Sem "o consultor" nem "dele": quem vende pode ser Carla ou Bruno, e o
  // texto não sabe. O nome resolve sem adivinhar.
  if (dados.vendedor) {
    const quem = primeiroNome(dados.vendedor.nome);
    const numero = dados.vendedor.whatsapp ? formatarTelefone(dados.vendedor.whatsapp) : null;
    const pelo = numero ? ` pelo WhatsApp ${numero}` : "";
    return dados.equipeDisponivel
      ? `${abertura} Vou te passar para ${quem}, da nossa equipe de consultores, que já vai te chamar${pelo}${fotos}.`
      : `${abertura} Vou te passar para ${quem}, da nossa equipe de consultores, que te chama${pelo} assim que a loja abrir${fotos}.`;
  }
  const fotosSemDono = dados.comFotos ? " e te manda as fotos" : "";
  return dados.equipeDisponivel
    ? `${abertura} Vou passar seu atendimento para a nossa equipe de consultores, que já te chama${fotosSemDono}.`
    : `${abertura} Vou passar seu atendimento para a nossa equipe de consultores, que te chama assim que a loja abrir${fotosSemDono}.`;
}

/**
 * A mensagem do cliente que chega no número da loja DEPOIS da entrega.
 *
 * O vendedor atende do próprio número, e o cliente pode continuar
 * escrevendo no da loja. O assistente não responde mais (saiu da conversa);
 * a mensagem vai para o vendedor, para ele não ficar sem saber.
 */
export function mensagemRepassadaAoVendedor(dados: { nome: string | null; texto: string; linkDoLead: string | null }): string {
  const nome = dados.nome?.trim() || "O cliente";
  return [
    `💬 ${nome} escreveu no WhatsApp da loja:`,
    `"${dados.texto.trim().slice(0, 600)}"`,
    dados.linkDoLead ? `Conversa no painel: ${dados.linkDoLead}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A origem legível: anúncio, campanha, canal. */
export function origemLegivel(lead: {
  canal?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  origem_conversa?: { tipo?: string | null; titulo?: string | null; entrada?: string | null } | null;
}): string | null {
  const conversa = lead.origem_conversa;
  if (conversa?.tipo === "ad" || conversa?.entrada === "ctwa_ad") {
    return `Anúncio${conversa.titulo ? `: ${conversa.titulo}` : " (clique para o WhatsApp)"}`;
  }
  const partes = [lead.canal?.trim(), lead.utm_source?.trim(), lead.utm_campaign?.trim()].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}
