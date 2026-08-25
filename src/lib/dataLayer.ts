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
  | "highlight"
  | "vehicle_detail"
  | "appraisal"
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

  if (primeiro === "estoque") return partes.length > 1 ? "bodytype" : "inventory";
  if (primeiro === "destaques") return "highlight";
  if (primeiro === "avaliacao") return "appraisal";
  if (primeiro === "carro-perfeito") return "advisor";
  if (primeiro === "contato") return "contact";
  if (primeiro === "sobre" || primeiro === "privacidade") return "institutional";
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
 * `stock_count: null` sai junto de propósito. O `dataLayer` é acumulativo: uma
 * variável escrita numa página continua legível na seguinte, então sem esta
 * limpeza o visitante que fosse de /estoque para /sobre levaria consigo a
 * contagem da página anterior — e todo evento disparado em /sobre nasceria
 * com um número que não é dele. Quem sabe a contagem a repõe logo em seguida
 * (`pushContagemDeEstoque`).
 */
export function pushCamadaGlobal(camada: CamadaGlobal): void {
  push({
    event: "page_context",
    page_type: camada.page_type,
    store_city: "Curitiba",
    stock_count: null,
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

/** Clique em WhatsApp — o principal lead desta vertical (§4.4). */
export function pushCliqueWhatsApp(local: string, contexto: ContextoDeVeiculo = {}): void {
  push({ event: "click_whatsapp", whatsapp_location: local, ...contexto });
}

/** Clique para ligar. */
export function pushCliqueTelefone(local: string, contexto: ContextoDeVeiculo = {}): void {
  push({ event: "click_to_call", call_location: local, ...contexto });
}

export type TipoDeLead = "proposta" | "financiamento" | "avaliacao" | "contato" | "curadoria";

/**
 * Envio de formulário concluído.
 *
 * Dispara no SUCESSO, nunca no clique do botão — um `generate_lead` por
 * tentativa de envio infla a conversão e ensina o algoritmo do Ads a comprar
 * clique de quem desiste no meio.
 */
export function pushLead(
  tipo: TipoDeLead,
  dados: ContextoDeVeiculo & { form_id?: string } = {},
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
