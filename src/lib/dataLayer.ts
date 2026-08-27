// Os dois módulos abaixo não importam nada — é o que permite lê-los daqui,
// que roda no navegador, sem arrastar o cliente do Supabase para o bundle.
import { ehSlugDeFaixa, faixaDoPreco } from "./faixasDePreco";
import { SEGMENTOS_DE_PDP } from "./veiculoUrl";

/**
 * A camada de dados do site — o que o Google Tag Manager lê.
 *
 * ---------------------------------------------------------------------------
 * Por que ela existe, já que o site mede
 * ---------------------------------------------------------------------------
 * O site JÁ dispara os eventos que importam: `lib/telemetry.ts` manda
 * `generate_lead`, `view_item`, `search`, `complete_registration` e `Contact`
 * direto pelo `gtag`/`fbq`, e espelha no CAPI. O que faltava era o outro lado:
 * um `dataLayer` de NEGÓCIO. Sem ele, cada nova medição — um evento novo, um
 * parâmetro a mais numa conversão, um público de remarketing — vira ticket de
 * desenvolvimento e deploy, e nesta vertical a medição muda toda semana.
 *
 * Com a camada publicada, o marketing configura tag, gatilho e conversão
 * dentro do GTM (o container já é suportado por `IntegrationsTracker`, é só
 * preencher o ID no painel) sem tocar em código.
 *
 * ---------------------------------------------------------------------------
 * Duas regras que não podem ser afrouxadas
 * ---------------------------------------------------------------------------
 * 1. **Isto ACRESCENTA, nunca substitui.** Regra 7 do repositório: evento de
 *    tracking não some e não é renomeado. Todo push daqui roda ao lado dos
 *    disparos que já existiam — nada foi movido para cá.
 *
 * 2. **Nenhum dado pessoal entra.** Nome, telefone, e-mail e CPF ficam fora:
 *    o `dataLayer` é legível por qualquer script da página, e o que o GTM
 *    precisa para otimizar mídia é veículo, página e origem do clique. Quem
 *    precisa de identidade — a CAPI, as conversões otimizadas do Ads — já
 *    recebe pelo caminho servidor, com hash.
 *
 * ---------------------------------------------------------------------------
 * Consentimento
 * ---------------------------------------------------------------------------
 * O push NÃO é bloqueado pelo banner de cookies, e isso é deliberado: escrever
 * num array em memória não envia nada para lugar nenhum. Quem envia é o GTM, e
 * ele só é carregado depois do aceite (`IntegrationsTracker`). Como o GTM
 * processa a fila que já existe no `dataLayer` ao carregar, o contexto anterior
 * ao aceite não se perde — que é justamente o que se perderia se o gate
 * estivesse aqui.
 */

/**
 * ---------------------------------------------------------------------------
 * Quem manda o evento: o código ou o container
 * ---------------------------------------------------------------------------
 * Até 2026-08-25 a resposta era "os dois", e isso passou a ser um problema no
 * dia em que o container `GTM-TB665RN9` ganhou tags GA4 para os mesmos eventos
 * que `lib/telemetry.ts` já dispara por `gtag`. Publicar assim contaria
 * `generate_lead` em dobro — e não dá para simplesmente apagar o `gtag`,
 * porque **quem liga o container é o dono, no painel**, não o deploy: o
 * `IntegrationsTracker` só injeta o GTM quando `companySettings.gtmId` existe,
 * e esse valor vem do banco.
 *
 * As duas saídas óbvias erram para lados opostos:
 *
 *   apagar o `gtag` agora  → GA4 sem `generate_lead` até o dono digitar o ID
 *   manter os dois         → tudo em dobro a partir do segundo em que digitar
 *
 * Daí este sinalizador. O código mede **enquanto o container está ausente** e
 * sai de cena sozinho quando ele chega. Uma regra só, sem sincronizar deploy
 * com edição de painel, sem lacuna e sem sobreposição.
 *
 * Quem escreve é o `IntegrationsTracker`; quem lê é o `telemetry.ts`, antes de
 * falar com o GA4 ou com o Ads.
 *
 * ⚠️ **O sinal é `gtmAssumeEventos`, não a existência do `gtmId`.** A primeira
 * versão inferia do `gtmId` e isso quebrou em produção no mesmo dia: o
 * container `GTM-TB665RN9` estava no painel e carregando, mas **vazio** —
 * importado sem as tags. O código cedeu a vez para quem não media nada, e o
 * `generate_lead` parou de chegar ao GA4 até alguém perceber.
 *
 * Container carregando e container medindo são coisas diferentes, e de dentro
 * do site não dá para distinguir: só quem publicou sabe. Daí o campo separado,
 * com default `false` — na dúvida o código continua medindo, porque perder
 * evento é irreversível e contar em dobro por um dia não é.
 *
 * ⚠️ Isto **não** silencia o `dataLayer`: os pushes continuam sempre, porque
 * são eles que alimentam o container. O que o sinalizador desliga é o caminho
 * paralelo do `gtag`.
 */
let containerAtivo = false;

/** O `IntegrationsTracker` chama isto quando decide injetar (ou não) o GTM. */
export function marcarContainerAtivo(ativo: boolean): void {
  containerAtivo = ativo;
}

/** O container assumiu os eventos? Então o `gtag` do código fica quieto. */
export function containerAssumeOsEventos(): boolean {
  return containerAtivo;
}

type ValorDeDataLayer = string | number | boolean | null | undefined | object;

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

/** Os tipos de página que o GTM distingue. Fonte: §4.2.1 do plano de aquisição. */
export type TipoDePagina =
  | "home"
  | "inventory"
  | "brand"
  | "model"
  | "bodytype"
  | "pricerange"
  | "highlight"
  | "vehicle_detail"
  | "appraisal"
  | "financing"
  | "advisor"
  | "geo"
  | "contact"
  | "institutional"
  | "internal"
  | "other";

/**
 * De que tipo é esta página, a partir do caminho.
 *
 * Função pura, e é assim de propósito: é a chave que decide o `dynx_pagetype`
 * do remarketing dinâmico e o recorte de todo relatório por tipo de página.
 * Errar aqui não quebra nada visível — só produz relatório errado durante
 * semanas —, então precisa ser testável sem navegador.
 */
export function tipoDaPagina(caminho: string): TipoDePagina {
  const limpo = (caminho || "/").split("?")[0].replace(/\/+$/, "") || "/";
  const partes = limpo.split("/").filter(Boolean);

  if (limpo === "/") return "home";

  const [primeiro] = partes;

  if (
    primeiro === "admin" ||
    primeiro === "vitrine" ||
    primeiro === "garagem" ||
    primeiro === "investidor" ||
    primeiro === "login" ||
    primeiro === "configuracoes" ||
    primeiro === "definir-senha" ||
    primeiro === "recuperar-senha" ||
    primeiro === "test"
  ) {
    return "internal";
  }

  if (primeiro === "estoque") {
    if (partes.length === 1) return "inventory";
    // Faixa de preço e carroceria dividem a rota `/estoque/[recorte]` mas são
    // recortes diferentes, e quem lê o relatório precisa separá-los: "SUV" fala
    // de produto, "até 60 mil" fala de orçamento, e a campanha que traz um não
    // é a que traz o outro. Reconhecida pela LISTA, não por padrão de slug.
    return ehSlugDeFaixa(partes[1]) ? "pricerange" : "bodytype";
  }
  if (primeiro === "destaques") return "highlight";
  if (primeiro === "avaliacao") return "appraisal";
  if (primeiro === "financiamento") return "financing";
  if (primeiro === "carro-perfeito") return "advisor";
  if (primeiro === "contato") return "contact";
  if (primeiro === "sobre" || primeiro === "privacidade" || primeiro === "garantia") {
    return "institutional";
  }
  if (primeiro.startsWith("seminovos-")) return "geo";

  if ((SEGMENTOS_DE_PDP as readonly string[]).includes(primeiro)) {
    // /carros/{marca} · /carros/{marca}/{modelo} · /carros/{m}/{mo}/{v}/{slug}
    if (partes.length === 2) return "brand";
    if (partes.length === 3) return "model";
    if (partes.length >= 5) return "vehicle_detail";
    return "other";
  }

  return "other";
}

/** Escreve no `dataLayer`, criando-o se preciso. Nunca lança. */
function push(dados: Record<string, ValorDeDataLayer>): void {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(dados as Record<string, unknown>);
  } catch (erro) {
    console.warn("[dataLayer] push falhou (não bloqueante):", erro);
  }
}

export interface CamadaGlobal {
  page_type: TipoDePagina;
}

/**
 * A camada global — o contexto que todo evento herda.
 *
 * Sem `store_id`: a operação é uma loja só, na Rua Ernesto Piazzetta
 * (confirmado pelo dono em 2026-08-25). O plano previa duas unidades; se um dia
 * houver filial de verdade, o campo entra aqui e nos eventos de contato, para
 * saber qual unidade gerou o lead.
 *
 * `stock_count: null` e `vehicle: null` saem junto de propósito. O `dataLayer`
 * é acumulativo: uma variável escrita numa página continua legível na seguinte,
 * então sem esta limpeza o visitante que fosse de /estoque para /sobre levaria
 * consigo a contagem da página anterior — e todo evento disparado em /sobre
 * nasceria com um número que não é dele. Quem sabe a contagem a repõe logo em
 * seguida (`pushContagemDeEstoque`).
 *
 * O `vehicle` entrou nesta limpeza em 2026-08-25, quando o container
 * `GTM-TB665RN9` passou a ler `vehicle.*` em TODA tag GA4. A nota acima já
 * valia palavra por palavra para ele — só não estava aplicada: quem visitasse
 * uma ficha e voltasse para a home levava o carro junto, e o clique de WhatsApp
 * na home reportava o veículo anterior. `pushVeiculo` já fazia o equivalente
 * para o `ecommerce`; faltava a metade que o container tornou visível.
 *
 * Os **espelhos planos** entraram em 2026-08-26, e a omissão era pior do que
 * parecia. Eu limpei o `vehicle` aninhado e deixei `vehicle_id`,
 * `vehicle_name` e `vehicle_price` passarem — e são justamente esses que o
 * container lê nos eventos de interação: `GA4 - click_whatsapp` usa
 * `{{dlv - vehicle_id}}`, `GA4 - generate_lead` usa `{{dlv - vehicle_price}}`.
 *
 * O estrago não parava no relatório. `js - valor do lead` calcula
 * `parseFloat(vehicle.price) || parseFloat(vehicle_price) || 0`: numa avaliação
 * em `/avaliacao`, o aninhado já estava zerado e o plano não — então o lead ia
 * para o Google Ads **avaliado pelo preço de um carro que o visitante não está
 * olhando**, e esse número alimenta o lance.
 */
export function pushCamadaGlobal(camada: CamadaGlobal): void {
  push({
    event: "page_context",
    page_type: camada.page_type,
    store_city: "Curitiba",
    stock_count: null,
    vehicle: null,
    vehicle_id: null,
    vehicle_name: null,
    vehicle_price: null,
    // `lead_type: null` desde 27/08, e é a mesma disciplina dos campos de
    // veículo acima — só que este saiu de fora e custou dinheiro.
    //
    // O `dataLayer` é ACUMULATIVO: o que um evento escreve fica visível para
    // todos os seguintes. A variável de valor do container calcula
    // `preço × 0,08 × taxa[lead_type]`, com taxas de 0,03 (contato) a 0,12
    // (avaliação) e fallbacks de R$ 120 a R$ 500. Sem zerar aqui, o MESMO
    // clique no WhatsApp valia R$ 100 para quem chegou direto e R$ 500 para
    // quem tinha passado pela avaliação na mesma sessão. Spread de ~5,8× no
    // mesmo evento, sem nenhum erro visível — e é esse número que o Smart
    // Bidding usa para decidir lance.
    lead_type: null,
  });
}

/**
 * Quantos veículos esta página lista.
 *
 * Push SEM `event`, e isso é a diferença que importa: no GTM, push com `event`
 * aciona gatilho; sem ele, só atualiza variável. Um segundo `page_context` por
 * página de listagem faria toda tag ligada a esse gatilho disparar em dobro.
 */
export function pushContagemDeEstoque(total: number): void {
  if (!Number.isFinite(total)) return;
  push({ stock_count: total });
}

/**
 * Há quantos dias este veículo está no pátio.
 *
 * O `days_in_stock` do §11.1, que o §12.6 cobrou de novo: é o número que separa
 * o carro que entrou ontem do que está encalhado há três meses, e é sobre essa
 * diferença que o §1.2 do plano quer alocar verba.
 *
 * Devolve `null` sem carimbo — as linhas anteriores à migração
 * `20260826030000` não sabem quando chegaram, e zero ali seria a mentira mais
 * cara possível: diria "acabou de chegar" justamente sobre o que está parado.
 *
 * Recebe o "agora" por parâmetro para ser testável sem congelar relógio.
 */
export function diasEmEstoque(
  primeiraVez: string | null | undefined,
  agora: number = Date.now(),
): number | null {
  if (!primeiraVez) return null;
  const chegada = new Date(primeiraVez).getTime();
  if (!Number.isFinite(chegada)) return null;
  // Carimbo no futuro é relógio errado, não veículo do futuro: melhor omitir.
  if (chegada > agora) return null;
  return Math.floor((agora - chegada) / 86_400_000);
}

export interface VeiculoDaCamada {
  id: string;
  marca: string;
  modelo: string;
  versao?: string | null;
  ano?: number | string | null;
  preco: number;
  quilometragem?: number | null;
  cambio?: string | null;
  combustivel?: string | null;
  tipo?: string | null;
  cor?: string | null;
  nome: string;
  /** Donos anteriores — `owners` do §11.1. */
  donos?: number | null;
  /** O laudo da perícia está na ficha? — `has_report` do §11.1. */
  temLaudo?: boolean;
  /** Data de chegada, para o `days_in_stock`. */
  primeiraVez?: string | null;
}

/**
 * `view_vehicle` com o espelho no formato de e-commerce do GA4.
 *
 * O espelho não é redundância: é o que habilita os relatórios nativos de item
 * do GA4 e o que faz `item_id` casar com o ID do feed dinâmico — o mesmo que
 * fecha a URL da ficha e que o `sku` do JSON-LD publica. Divergência entre
 * esses três é anúncio de remarketing em branco.
 *
 * O `ecommerce: null` antes do push é obrigatório numa navegação SPA como
 * esta: sem ele, o objeto do veículo anterior sobrevive no `dataLayer` e vaza
 * para o evento seguinte.
 */
export function pushVeiculo(veiculo: VeiculoDaCamada): void {
  push({ ecommerce: null });
  push({
    event: "view_vehicle",
    vehicle: {
      id: veiculo.id,
      name: veiculo.nome,
      brand: veiculo.marca,
      model: veiculo.modelo,
      version: (veiculo.versao ?? "") || undefined,
      model_year: veiculo.ano ?? undefined,
      price: veiculo.preco,
      currency: "BRL",
      mileage: veiculo.quilometragem ?? undefined,
      transmission: (veiculo.cambio ?? "") || undefined,
      fuel: (veiculo.combustivel ?? "") || undefined,
      body_type: (veiculo.tipo ?? "") || undefined,
      color: (veiculo.cor ?? "") || undefined,
      // Os três do §11.1 do plano de aquisição. `price_range` sai do próprio
      // preço — o mesmo corte que já nomeia `/estoque/ate-60-mil`, para que
      // público de remarketing e página perene falem da mesma faixa.
      price_range: faixaDoPreco(veiculo.preco) ?? undefined,
      owners: typeof veiculo.donos === "number" ? veiculo.donos : undefined,
      // ⚠️ `has_report` diz que o DOCUMENTO está na ficha, não que o exame
      // aconteceu. `conteudo-seo/POSICIONAMENTO.md` registra a confirmação do
      // dono em 2026-08-17: **todos** os veículos passam por perícia cautelar,
      // e `laudo_pericia` vazio é falha de lançamento, não ausência do exame.
      // Publicar `false` como se fosse "não periciado" contradiria o que a
      // própria página afirma — daí o campo só sair quando há laudo de fato.
      has_report: veiculo.temLaudo === true ? true : undefined,
      // O último dos cinco campos do §11.1 — o que mais faltava, segundo o
      // próprio plano. Ausente quando a data de chegada não é conhecida.
      days_in_stock: diasEmEstoque(veiculo.primeiraVez) ?? undefined,
    },
    ecommerce: {
      currency: "BRL",
      value: veiculo.preco,
      items: [
        {
          item_id: veiculo.id,
          item_name: veiculo.nome,
          item_brand: veiculo.marca,
          item_category: (veiculo.tipo ?? "") || undefined,
          item_category2: veiculo.modelo,
          item_category3: veiculo.ano ? String(veiculo.ano) : undefined,
          item_category4: (veiculo.cambio ?? "") || undefined,
          item_variant: (veiculo.cor ?? "") || undefined,
          price: veiculo.preco,
          quantity: 1,
        },
      ],
    },
  });
}

/** Contexto opcional de veículo nos eventos de interação. */
export interface ContextoDeVeiculo {
  vehicle_id?: string;
  vehicle_name?: string;
  vehicle_price?: number;
}

/**
 * Contexto de um clique de contato.
 *
 * `pos_lead` marca o clique que acontece DEPOIS de um formulário enviado — na
 * ficha, no pop-up e na avaliação, o site abre o WhatsApp já com a mensagem
 * pronta assim que o lead é registrado. Sem essa marca, o mesmo envio conta
 * duas vezes no Google Ads (uma como `generate_lead`, outra como
 * `click_whatsapp`) e o CPA aparente cai pela metade — o pior tipo de erro de
 * medição, porque parece boa notícia. Com ela, o gatilho de conversão exclui
 * esses cliques em uma condição só.
 *
 * ---------------------------------------------------------------------------
 * Por que ele é emitido SEMPRE, e não só quando é `true`
 * ---------------------------------------------------------------------------
 * O `dataLayer` é acumulativo: o que uma linha escreve, a próxima herda. Se o
 * clique pós-lead escrevesse `pos_lead: true` e o clique orgânico seguinte não
 * escrevesse nada, o GTM continuaria lendo `true` — e o gatilho de conversão,
 * que dispara em `pos_lead != true`, **suprimiria uma conversão legítima**:
 *
 *     ficha → envia o formulário → click_whatsapp {pos_lead: true}
 *           → volta e clica no botão flutuante → click_whatsapp {}
 *                                                 ↑ o GTM ainda lê `true`
 *
 * A rodada 5 do plano de aquisição (§12.3) achou o primo deste defeito: o GTM
 * avalia "não é igual a `true`" como FALSO quando a variável é **indefinida**,
 * e corrigiram dando valor padrão `false` à variável no container. O valor
 * padrão resolve o caso "nunca foi definida"; **não resolve** este, em que ela
 * foi definida e ninguém a reescreveu.
 *
 * A regra completa, que vale para qualquer campo que descreve um evento e não
 * a página: **valor padrão no container é a segunda defesa; a primeira é o
 * site reescrever o campo em todo evento.**
 */
export interface ContextoDeContato extends ContextoDeVeiculo {
  pos_lead?: boolean;
}

/**
 * Clique em WhatsApp — o principal lead desta vertical (§4.4).
 *
 * `lead_type: "contato"` vem DEPOIS do spread, e por isso vence o que o
 * chamador mandar. É deliberado: um clique é intenção de contato, tenha ele
 * acontecido na ficha, no rodapé ou depois de uma proposta. Deixar o valor
 * flutuar segundo o que sobrou no `dataLayer` foi o defeito de A.2.
 *
 * O clique posterior a um lead não é contado como conversão no Ads (a tag
 * exclui `pos_lead`), então forçar "contato" aqui não subavalia nada.
 */
export function pushCliqueWhatsApp(local: string, contexto: ContextoDeContato = {}): void {
  push({
    event: "click_whatsapp",
    whatsapp_location: local,
    ...contexto,
    // SEMPRE presentes, mesmo quando o chamador não diz nada. Ver a nota acima.
    lead_type: "contato",
    pos_lead: contexto.pos_lead === true,
  });
}

/** Clique para ligar. Mesmo contrato de `pushCliqueWhatsApp`. */
export function pushCliqueTelefone(local: string, contexto: ContextoDeContato = {}): void {
  push({
    event: "click_to_call",
    call_location: local,
    ...contexto,
    lead_type: "contato",
    pos_lead: contexto.pos_lead === true,
  });
}

export type TipoDeLead = "proposta" | "financiamento" | "avaliacao" | "contato" | "curadoria";

/**
 * Envio de formulário concluído.
 *
 * Dispara no SUCESSO, nunca no clique do botão — um `generate_lead` por
 * tentativa de envio infla a conversão e ensina o algoritmo do Ads a comprar
 * clique de quem desiste no meio.
 *
 * `lead_id` é o mesmo identificador que vai no `eventID` do Meta e no
 * `transaction_id` do Ads. Um id só nas três plataformas é o que torna a
 * conferência entre elas possível — e é o que o container lê em
 * `{{dlv - lead_id}}`, que até 2026-08-25 chegava sempre `undefined` porque
 * ninguém o empurrava.
 */
export function pushLead(
  tipo: TipoDeLead,
  dados: ContextoDeVeiculo & { form_id?: string; lead_id?: string } = {},
): void {
  push({ event: "generate_lead", lead_type: tipo, ...dados });
}

/** Simulação de financiamento concluída — micro-conversão (§4.4). */
export function pushSimulacaoDeFinanciamento(dados: {
  vehicle_id?: string;
  down_payment?: number;
  installments?: number;
}): void {
  push({ event: "financing_simulation", ...dados });
}

/** Início de preenchimento — serve para medir abandono de formulário. */
export function pushInicioDeFormulario(formId: string, contexto: ContextoDeVeiculo = {}): void {
  push({ event: "form_start", form_id: formId, ...contexto });
}

/** Interação com a galeria da ficha. */
export function pushGaleria(vehicleId: string, imagensVistas: number): void {
  push({ event: "view_gallery", vehicle_id: vehicleId, images_viewed: imagensVistas });
}

/** Abertura da ficha técnica — micro-conversão de engajamento. */
export function pushFichaTecnica(vehicleId: string): void {
  push({ event: "view_specs", vehicle_id: vehicleId });
}

/** Clique em "como chegar" / mapa. */
export function pushComoChegar(local: string): void {
  push({ event: "click_directions", directions_source: local });
}
