import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { lerCodigo } from "./fonte";
import {
  pushCamadaGlobal,
  pushCliqueTelefone,
  pushContagemDeEstoque,
  pushCliqueWhatsApp,
  pushLead,
  pushSimulacaoDeFinanciamento,
  pushVeiculo,
  tipoDaPagina,
} from "../src/lib/dataLayer";

/**
 * A camada de dados que o GTM lê.
 *
 * O §0.5.4 do plano de aquisição diagnosticou "GA4 sem camada de eventos" e
 * concluiu que nada de negócio era medido. A primeira metade está certa — não
 * havia `dataLayer` de negócio —, a segunda não: `lib/telemetry.ts` já
 * disparava lead, visualização, busca e contato direto pelo `gtag`/`fbq`.
 * O auditor não viu nada porque o tracking é gated pelo consentimento LGPD e
 * ele não aceitou os cookies.
 *
 * O que a camada acrescenta é independência: com ela publicada, criar uma
 * conversão nova no Ads deixa de exigir deploy.
 */

function comoNoNavegador() {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as { dataLayer?: unknown[] }).dataLayer = [];
}

function fila(): Record<string, unknown>[] {
  return ((globalThis as { dataLayer?: Record<string, unknown>[] }).dataLayer ?? []);
}

beforeEach(comoNoNavegador);
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { dataLayer?: unknown[] }).dataLayer;
});

describe("tipo da página", () => {
  /**
   * Decide o `dynx_pagetype` do remarketing dinâmico e o recorte de todo
   * relatório por tipo de página. Errar aqui não quebra nada visível — só
   * produz relatório errado durante semanas.
   */
  it.each([
    ["/", "home"],
    ["/estoque", "inventory"],
    ["/estoque/suv", "bodytype"],
    // Faixa de preço e carroceria dividem `/estoque/[recorte]` e são recortes
    // diferentes: "SUV" fala de produto, "até 60 mil" fala de orçamento, e a
    // campanha que traz um não é a que traz o outro. As duas caíam em
    // `bodytype` até 2026-08-25, junto com `/financiamento` e `/garantia`
    // caindo em `other` — as três paginas foram criadas na mesma rodada em que
    // o classificador ficou para trás.
    ["/estoque/ate-60-mil", "pricerange"],
    ["/estoque/60-a-100-mil", "pricerange"],
    ["/estoque/acima-100-mil", "pricerange"],
    ["/financiamento", "financing"],
    ["/garantia", "institutional"],
    ["/carros/jeep", "brand"],
    ["/motos/harley-davidson", "brand"],
    ["/carros/jeep/renegade", "model"],
    ["/carros/jeep/renegade/s-t270/jeep-renegade-s-t270-7977579", "vehicle_detail"],
    ["/destaques/baixa-quilometragem", "highlight"],
    ["/seminovos-bacacheri", "geo"],
    ["/seminovos-curitiba", "geo"],
    ["/avaliacao", "appraisal"],
    ["/carro-perfeito", "advisor"],
    ["/contato", "contact"],
    ["/sobre", "institutional"],
    ["/admin/estoque", "internal"],
    ["/vitrine/balcao", "internal"],
  ])("%s → %s", (caminho, esperado) => {
    expect(tipoDaPagina(caminho)).toBe(esperado);
  });

  it("ignora barra final e query", () => {
    expect(tipoDaPagina("/estoque/")).toBe("inventory");
    expect(tipoDaPagina("/estoque?marca=jeep")).toBe("inventory");
  });
});

describe("a camada roda no navegador — e não pode arrastar o servidor junto", () => {
  it("`dataLayer` só importa módulos sem dependência", async () => {
    const { lerCodigo: lerFonte } = await import("./fonte");
    const fonte = lerFonte("src/lib/dataLayer.ts");
    const importes = [...fonte.matchAll(/from "\.\/([\w-]+)"/g)].map((m) => m[1]);

    // A lista de faixas vive em `faixasDePreco.ts`, e não em `hubsDeEstoque`,
    // por um motivo só: `hubsDeEstoque` importa `./supabase`, e ler de lá
    // traria o cliente do banco para o bundle do navegador.
    expect(importes).not.toContain("hubsDeEstoque");
    expect(importes).not.toContain("supabase");

    for (const modulo of importes) {
      expect(lerFonte(`src/lib/${modulo}.ts`)).not.toMatch(/^import .*from "\.\/supabase"/m);
    }
  });
});

describe("os eventos que a mídia precisa", () => {
  it("a camada global limpa a contagem da página anterior", () => {
    // O dataLayer é acumulativo: sem esta limpeza, quem sai de /estoque para
    // /sobre carrega a contagem junto, e todo evento em /sobre nasce com um
    // número que não é dele.
    pushCamadaGlobal({ page_type: "home" });
    expect(fila()[0]).toMatchObject({ page_type: "home", store_city: "Curitiba", stock_count: null });
  });

  it("a contagem é push de variável, sem `event` — senão o gatilho dispara em dobro", () => {
    pushContagemDeEstoque(39);

    expect(fila()[0]).toEqual({ stock_count: 39 });
    expect(fila()[0]).not.toHaveProperty("event");
  });

  it("`view_vehicle` zera o `ecommerce` antes de publicar o próximo", () => {
    // Numa navegação SPA, sem esta limpeza o objeto do veículo anterior
    // sobrevive no dataLayer e vaza para o evento seguinte.
    pushVeiculo({
      id: "7977579",
      marca: "Jeep",
      modelo: "Renegade",
      preco: 105900,
      nome: "Jeep Renegade S T270 2022",
      tipo: "SUV",
    });

    expect(fila()[0]).toEqual({ ecommerce: null });
    expect(fila()[1]).toMatchObject({ event: "view_vehicle" });
  });

  it("`item_id` do e-commerce é o ID do estoque", () => {
    // O mesmo número que fecha a URL da ficha e que o `sku` do JSON-LD publica.
    // Divergência entre os três é anúncio dinâmico em branco.
    pushVeiculo({ id: "7977579", marca: "Jeep", modelo: "Renegade", preco: 105900, nome: "Jeep Renegade" });

    const ecommerce = fila()[1].ecommerce as { items: { item_id: string }[] };
    expect(ecommerce.items[0].item_id).toBe("7977579");
  });

  it("separa clique de WhatsApp de clique para ligar", () => {
    pushCliqueWhatsApp("PDP - Conversão WhatsApp", { vehicle_id: "1" });
    pushCliqueTelefone("Rodapé - Telefone");

    expect(fila()[0]).toMatchObject({ event: "click_whatsapp", whatsapp_location: expect.any(String) });
    expect(fila()[1]).toMatchObject({ event: "click_to_call", call_location: "Rodapé - Telefone" });
  });

  it("o lead carrega o tipo de formulário", () => {
    // É o que permite uma conversão por tipo no Ads (proposta vale mais que
    // dúvida) sem inventar um evento novo para cada formulário.
    pushLead("avaliacao");
    pushLead("proposta", { vehicle_id: "1", form_id: "form-proposta-veiculo" });

    expect(fila()[0]).toMatchObject({ event: "generate_lead", lead_type: "avaliacao" });
    expect(fila()[1]).toMatchObject({ lead_type: "proposta", form_id: "form-proposta-veiculo" });
  });

  it("marca o clique que é consequência de um lead já enviado", () => {
    // Na ficha, no pop-up, na curadoria e na avaliação o site abre o WhatsApp
    // com a mensagem pronta assim que o lead é registrado: o mesmo envio
    // dispara `generate_lead` e, logo depois, `click_whatsapp`. Sem `pos_lead`,
    // o gatilho de conversão do Ads conta duas vezes e o CPA aparente cai pela
    // metade — erro que parece boa notícia.
    pushCliqueWhatsApp("PDP - Conversão WhatsApp", { vehicle_id: "1", pos_lead: true });
    pushCliqueWhatsApp("Home - Faixa de contato");

    expect(fila()[0]).toMatchObject({ pos_lead: true });

    // O clique orgânico declara `pos_lead: false` — não omite o campo.
    //
    // Esta asserção era `not.toHaveProperty("pos_lead")` e prendia o defeito:
    // o `dataLayer` é acumulativo, então omitir fazia o GTM continuar lendo o
    // `true` do clique anterior e SUPRIMIR uma conversão legítima. Ver a nota
    // longa em `pushCliqueWhatsApp` e a §12.3 do plano de aquisição.
    expect(fila()[1]).toMatchObject({ pos_lead: false });
  });

  it("os quatro fluxos que abrem o WhatsApp depois do envio marcam `pos_lead`", async () => {
    const { lerCodigo: lerFonte } = await import("./fonte");

    for (const arquivo of [
      "src/components/PDPClientWrapper.tsx",
      "src/components/LeadPopup.tsx",
      "src/components/CarMatch.tsx",
      "src/components/AutoAvaliacao.tsx",
    ]) {
      expect(lerFonte(arquivo)).toMatch(/Conversão WhatsApp"[\s\S]{0,240}?pos_lead: true/);
    }
  });

  it("simulação de financiamento é evento próprio", () => {
    pushSimulacaoDeFinanciamento({ vehicle_id: "1", down_payment: 30000, installments: 48 });
    expect(fila()[0]).toMatchObject({ event: "financing_simulation", installments: 48 });
  });
});

describe("os disparos que já existiam passaram a alimentar a camada", () => {
  /**
   * O caminho real: a ficha chama `trackVehicleView`, o rodapé e todo CTA de
   * WhatsApp chamam `trackContactClick`, os cinco formulários chamam
   * `trackLeadSubmission`. Pendurar o push nesses três pontos cobre o site
   * inteiro sem instrumentar botão por botão — e sem mexer no que já era
   * disparado para o GA4 e para o Pixel.
   */
  it("`trackVehicleView` publica `view_vehicle`", async () => {
    const { trackVehicleView } = await import("../src/lib/telemetry");

    trackVehicleView({
      id: "7977579",
      marca: "Jeep",
      modelo: "Renegade",
      preco: 105900,
      tipo: "SUV",
      cambio: "Automático",
      nome: "Jeep Renegade S T270 2022",
    });

    expect(fila()[0]).toEqual({ ecommerce: null });
    expect(fila()[1]).toMatchObject({
      event: "view_vehicle",
      vehicle: { id: "7977579", body_type: "SUV", transmission: "Automático" },
    });
  });

  it("`trackContactClick` publica `click_whatsapp` com o veículo de origem", async () => {
    const { trackContactClick } = await import("../src/lib/telemetry");

    trackContactClick("whatsapp", "PDP - Conversão WhatsApp", { vehicle_id: "7977579" });

    expect(fila()[0]).toMatchObject({
      event: "click_whatsapp",
      whatsapp_location: "PDP - Conversão WhatsApp",
      vehicle_id: "7977579",
    });
  });

  it("sem preferência registrada, publica E envia", async () => {
    /* Este teste dizia o CONTRÁRIO até 2026-09-02: *"publica mesmo sem
       consentimento — o envio é que espera o aceite"*, e exigia `null`.

       Era o regime anterior. A decisão do dono em 31/08 — *"não quero nada
       atrás do aceite"* — foi aplicada no `IntegrationsTracker` e esquecida nos
       cinco eventos de `telemetry.ts`, que seguiram exigindo `"accepted"`. Como
       ninguém mais aceita nada, a chave fica `null` e TODO evento de conversão
       parou: ViewContent, Contact, Search, CompleteRegistration e o Lead — no
       navegador e no CAPI. Medido na produção: `/api/capi` com 0 requisições
       contra 37 visitas a ficha em seis horas.

       O teste ficou verde o tempo todo afirmando o comportamento quebrado. É a
       forma mais cara de trava errada: ela não avisa, ela confirma. */
    const { trackContactClick } = await import("../src/lib/telemetry");

    // Sem `localStorage` neste ambiente — o mesmo caso do visitante que nunca
    // respondeu nada. A régua trata isso como "não recusou".
    const eventId = trackContactClick("phone", "Rodapé - Telefone");

    expect(eventId, "evento sem id = nada chega ao Meta").not.toBeNull();
    expect(eventId).toMatch(/^Contact\./);
    expect(fila()[0]).toMatchObject({ event: "click_to_call" });
  });

  it("a RECUSA explícita continua barrando o envio, e só ela", async () => {
    // A metade da regra que não mudou, e a que precisa de trava de verdade:
    // quem desligou em `/privacidade` não tem evento enviado. O `dataLayer`
    // continua recebendo o push — escrever num array em memória não envia
    // nada, e é o GTM que decide o que sai.
    const anterior = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (chave: string) => (chave === "ag_cookie_consent" ? "rejected" : null),
      setItem: () => {},
      removeItem: () => {},
    };
    try {
      const { trackContactClick } = await import("../src/lib/telemetry");
      const eventId = trackContactClick("phone", "Rodapé - Telefone");

      expect(eventId, "recusou e mesmo assim enviou").toBeNull();
      expect(fila()[0]).toMatchObject({ event: "click_to_call" });
    } finally {
      if (anterior === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else (globalThis as { localStorage?: unknown }).localStorage = anterior;
    }
  });
});

describe("nenhum dado pessoal entra na camada", () => {
  /**
   * O `dataLayer` é legível por qualquer script da página. Identidade vai pelo
   * caminho servidor — a CAPI e as conversões otimizadas do Ads —, com hash.
   */
  const PROIBIDOS = /\b(nome|email|e_mail|telefone|phone|cpf|whatsapp_number|user_email)\b/;

  /**
   * No fonte a lista é mais estreita: `nome` sozinho é ambíguo — dentro de
   * `VeiculoDaCamada` ele é o nome do CARRO. O que não pode aparecer de jeito
   * nenhum é campo que identifica pessoa.
   */
  const PROIBIDOS_NO_FONTE = /\b(email|e_mail|telefone|phone|cpf|first_name|last_name|user_email)\b/;

  it("os helpers não expõem campo de identificação", () => {
    const fonte = lerCodigo("src/lib/dataLayer.ts");
    expect(fonte).not.toMatch(PROIBIDOS_NO_FONTE);
  });

  it("nem os eventos disparados", () => {
    pushLead("proposta", { vehicle_id: "1", vehicle_name: "Jeep Renegade", vehicle_price: 105900 });
    pushCliqueWhatsApp("PDP", { vehicle_id: "1" });

    for (const evento of fila()) {
      expect(JSON.stringify(Object.keys(evento))).not.toMatch(PROIBIDOS);
    }
  });
});

describe("a camada acrescenta, nunca substitui", () => {
  it("os disparos antigos continuam no `telemetry`", () => {
    // Regra 7 do repositório: evento de tracking não some e não é renomeado.
    const fonte = lerCodigo("src/lib/telemetry.ts");

    for (const evento of ["generate_lead", "view_item", "search", "complete_registration"]) {
      expect(fonte).toContain(evento);
    }
    for (const meta of ["Lead", "ViewContent", "Contact", "CompleteRegistration", "Search"]) {
      expect(fonte).toContain(`"${meta}"`);
    }
  });

  it("o push acontece antes do gate de consentimento", () => {
    // Escrever num array em memória não envia nada; quem envia é o GTM, que só
    // carrega depois do aceite — e processa a fila que já estiver ali. Com o
    // gate aqui, o contexto anterior ao aceite se perderia.
    // A âncora mudou em 2026-09-02: a régua virou `rastreamentoRecusado()`,
    // definida no TOPO do arquivo. Procurar `ag_cookie_consent` depois do push
    // passou a achar -1 — e a comparação viraria "push antes de -1", que
    // reprova sem que nada de errado tenha acontecido. O que importa é a ordem
    // dentro da função, então a âncora é a CHAMADA.
    /* A medida é dentro do CORPO de `trackVehicleView`, e o recorte não é
       capricho. A versão anterior procurava o gate a partir do push e conferia
       que ele vinha depois — o que uma mutação furou: acrescentar um gate ANTES
       do push deixava o de baixo no lugar, o `indexOf` continuava achando esse,
       e a suíte seguia verde enquanto o `dataLayer` perdia o contexto de quem
       ainda não respondeu. Prova que existe UM gate depois não é a mesma coisa
       que provar que não existe NENHUM antes. */
    const fonte = lerCodigo("src/lib/telemetry.ts");
    const inicio = fonte.indexOf("export function trackVehicleView");
    expect(inicio, "trackVehicleView sumiu").toBeGreaterThan(-1);
    const fim = fonte.indexOf("export function", inicio + 30);
    const corpo = fonte.slice(inicio, fim === -1 ? undefined : fim);

    const indicePush = corpo.indexOf("pushVeiculo(");
    const primeiroGate = corpo.indexOf("rastreamentoRecusado()");

    expect(indicePush, "o push saiu de trackVehicleView").toBeGreaterThan(-1);
    expect(primeiroGate, "o gate sumiu de trackVehicleView").toBeGreaterThan(-1);
    expect(indicePush, "há um gate ANTES do push").toBeLessThan(primeiroGate);
  });
});
