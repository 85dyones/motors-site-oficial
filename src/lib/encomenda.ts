import { FAIXAS_DE_PRECO, type FaixaDePreco } from "./faixasDePreco";
import type { SegmentoDePdp } from "./veiculoUrl";
import type { UtmParameters } from "./telemetry";

/**
 * "Encomende seu carro" — o pedido de quem chegou num hub sem estoque.
 *
 * ---------------------------------------------------------------------------
 * O que este módulo resolve
 * ---------------------------------------------------------------------------
 * São 32 hubs de modelo e 5 de marca sem unidade à venda hoje. A única saída
 * deles era um `wa.me`: o contato acontecia no WhatsApp e **não existia para o
 * sistema** — sem linha em `leads`, sem CAPI, sem Kanban, sem atribuição.
 *
 * E é a intenção de melhor qualidade do site. Quem procura "Corolla seminovo
 * Curitiba", cai numa página que diz "não temos agora" e vai embora, volta
 * para o Google — que é exatamente o buraco que o hub perene existe para
 * tapar. A pessoa sabe o que quer; o que falta é a loja registrar isso.
 *
 * ---------------------------------------------------------------------------
 * Por que o payload é montado AQUI, e não dentro do `onSubmit`
 * ---------------------------------------------------------------------------
 * Porque é ele que precisa de trava, e um campo trocado nele não quebra tela
 * nenhuma: o formulário continua enviando, a resposta continua 200, e o lead
 * chega mudo do outro lado. Fora do componente, `tests/encomenda-grava-e-dispara`
 * o exercita sem renderizar nada e sem subir Supabase.
 */

/** As mesmas três faixas da vitrine — nunca uma segunda lista. */
export const FAIXAS_DA_ENCOMENDA: FaixaDePreco[] = FAIXAS_DE_PRECO;

export interface DadosDaEncomenda {
  nome: string;
  whatsapp: string;
  /** Slug de `FAIXAS_DE_PRECO`. */
  faixa: string;
}

export interface ContextoDaEncomenda {
  /** Como a loja escreve a marca — vem do hub, não digitado. */
  marca: string;
  /** O modelo, no hub de modelo. `null` no hub de marca. */
  modelo?: string | null;
  caminho: string;
  segmento: SegmentoDePdp;
}

/** "carro" ou "moto", para a frase não ficar torta num hub de moto. */
export function substantivoDoSegmento(segmento: SegmentoDePdp): string {
  return segmento === "motos" ? "moto" : "carro";
}

/**
 * A mensagem que a loja lê, na voz do CLIENTE.
 *
 * É ele quem manda o texto, então nada de "separei ótimas opções para você" —
 * o mesmo cuidado que o `CarMatch` documenta. E ela vira o `interesse` da
 * linha em `leads`: sem `veiculo` no corpo, a rota deriva `interesse` daqui, e
 * uma frase genérica grava um lead que não diz o que a pessoa quer.
 *
 * O que a frase NÃO diz, e é regra e não estilo:
 *  - **prazo**. "Em 7 dias" é promessa que a loja não controla: o carro depende
 *    de aparecer um que passe na perícia.
 *  - **FIPE, desconto ou "abaixo da tabela"**. Mesma regra de `/avaliacao` — o
 *    cliente nunca vê valor de compra no site.
 */
export function mensagemDaEncomenda(
  dados: DadosDaEncomenda,
  contexto: ContextoDaEncomenda,
): string {
  const faixa = FAIXAS_DA_ENCOMENDA.find((f) => f.slug === dados.faixa);
  // `modelo` é vazio no hub de marca. Montar com template puro deixaria um
  // espaço duplo na frase — e o teste cobra isso, porque é o tipo de detalhe
  // que ninguém vê até um consultor ler a mensagem.
  const oQue = [contexto.marca, contexto.modelo].filter(Boolean).join(" ");
  const alvo = `${substantivoDoSegmento(contexto.segmento)} ${oQue}`.trim();
  const orcamento = faixa ? `, na faixa ${faixa.nome}` : "";

  return `Olá! Procuro ${alvo}${orcamento}. Vi que não tem no estoque agora — me avisem quando entrar.`;
}

/**
 * O corpo do POST para `/api/leads`.
 *
 * Mesma rota e mesmo formato que `/carro-perfeito` e o formulário de contato
 * já usam. Tabela nova nenhuma: o lead da encomenda cai no mesmo Kanban, e o
 * que o distingue é `canal`.
 */
export function montarEncomenda(
  dados: DadosDaEncomenda,
  contexto: ContextoDaEncomenda,
  extras: {
    agUid: string;
    eventId: string | null;
    turnstileToken: string;
    /** `getUtmParameters()` — o formato que `/api/leads` já recebe das outras cinco superfícies. */
    utm: UtmParameters;
    eventSourceUrl?: string;
    fbp: string | null;
    fbc: string | null;
  },
) {
  const mensagem = mensagemDaEncomenda(dados, contexto);

  return {
    tipo: "lead_encomenda",
    // A etiqueta que o consultor lê no Kanban antes de abrir a conversa, e o
    // que a rota grava na coluna `canal` de `leads`.
    canal: "Encomenda",
    mensagem,
    // Três campos, e só. Sem `email`: crédito ruim é a maior causa de perda de
    // lead, e formulário curto qualifica menos e converte mais — a
    // qualificação é do consultor, depois.
    cliente: {
      nome: dados.nome,
      whatsapp: dados.whatsapp,
    },
    // O contexto estruturado, além da frase. O texto é para o humano; isto é
    // para o n8n e para o dia em que o Motor de Gatilhos casar "encomenda
    // pendente" com "veículo da marca publicado".
    intencao_busca: {
      marca: contexto.marca,
      modelo: contexto.modelo ?? "",
      faixa: dados.faixa,
      caminho: contexto.caminho,
      segmento: contexto.segmento,
    },
    /**
     * Como este lead se chama no Meta quando não há veículo.
     *
     * A CAPI monta `content_name` a partir de `veiculo`, e aqui o carro é
     * justamente o que não existe no pátio. Sem isto o evento de SERVIDOR
     * chegaria sem nome enquanto o do NAVEGADOR chega com um — os dois lados
     * do mesmo `event_id` descrevendo coisas diferentes.
     */
    contentName: `Encomenda ${[contexto.marca, contexto.modelo].filter(Boolean).join(" ")}`,
    utm: extras.utm,
    agUid: extras.agUid,
    eventId: extras.eventId,
    eventSourceUrl: extras.eventSourceUrl,
    fbp: extras.fbp,
    fbc: extras.fbc,
    turnstileToken: extras.turnstileToken,
  };
}
