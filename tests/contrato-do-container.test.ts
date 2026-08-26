import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  containerAssumeOsEventos,
  marcarContainerAtivo,
  pushCamadaGlobal,
  pushCliqueWhatsApp,
  pushLead,
  pushVeiculo,
} from "../src/lib/dataLayer";
import { lerCodigo } from "./fonte";

/**
 * O contrato entre o site e o container `GTM-TB665RN9`.
 *
 * Um container do GTM lê a camada de dados **por nome**. Renomear um evento ou
 * mudar `whatsapp_location` de lugar não quebra teste nenhum, não quebra build,
 * não aparece em code review — e faz a tag correspondente parar de disparar em
 * silêncio. O prejuízo só aparece num relatório semanas depois, quando já não
 * há como recuperar o dado.
 *
 * Por isso as listas abaixo são transcritas do export do container, e não
 * derivadas do código: elas são a OUTRA ponta. Se alguém mudar o site, este
 * teste falha; se alguém mudar o container, alguém tem que vir mudar aqui.
 */

// ---------------------------------------------------------------------------
// Transcrito de: "Motors Store - dataLayer + Ads conversions", 2026-08-25
// ---------------------------------------------------------------------------

/** Os 9 `customEventFilter` dos gatilhos do container. */
const EVENTOS_DO_CONTAINER = [
  "view_vehicle",
  "click_whatsapp",
  "click_to_call",
  "click_directions",
  "generate_lead",
  "financing_simulation",
  "view_specs",
  "form_start",
  "view_gallery",
] as const;

/** Os caminhos das variáveis de camada de dados que as tags do container leem. */
const VARIAVEIS_DO_CONTAINER = [
  "vehicle.id",
  "vehicle.name",
  "vehicle.brand",
  "vehicle.model",
  "vehicle.price",
  "vehicle.body_type",
  "vehicle.transmission",
  "lead_type",
  "lead_id",
  "page_type",
  "whatsapp_location",
  "ecommerce.items",
] as const;

function comoNoNavegador() {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as { dataLayer?: unknown[] }).dataLayer = [];
}

function fila(): Record<string, unknown>[] {
  return (globalThis as { dataLayer?: Record<string, unknown>[] }).dataLayer ?? [];
}

/** O valor que o GTM leria — o modelo é acumulativo, então a fila é achatada. */
function valorNaCamada(caminho: string): unknown {
  let atual: unknown = undefined;
  for (const linha of fila()) {
    const raiz = caminho.split(".")[0];
    if (!(raiz in linha)) continue;
    atual = caminho.split(".").reduce<unknown>(
      (obj, parte) =>
        obj && typeof obj === "object" ? (obj as Record<string, unknown>)[parte] : undefined,
      linha,
    );
  }
  return atual;
}

const VEICULO = {
  id: "abc123",
  marca: "Volkswagen",
  modelo: "Saveiro",
  versao: "Robust CD",
  ano: 2021,
  preco: 89900,
  quilometragem: 60000,
  cambio: "Manual",
  combustivel: "Flex",
  tipo: "Picape",
  cor: "Branco",
  nome: "Volkswagen Saveiro Robust CD",
};

beforeEach(() => {
  comoNoNavegador();
  marcarContainerAtivo(false);
});
afterEach(() => {
  marcarContainerAtivo(false);
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { dataLayer?: unknown[] }).dataLayer;
});

describe("os nomes de evento do container continuam existindo no site", () => {
  it.each(EVENTOS_DO_CONTAINER)("%s é empurrado por lib/dataLayer.ts", (evento) => {
    // Fonte, não execução: alguns destes só disparam em componente de cliente,
    // e o que interessa aqui é o nome sobreviver a um refactor.
    expect(lerCodigo("src/lib/dataLayer.ts")).toContain(`event: "${evento}"`);
  });

  it("não há evento a mais empurrado que o container ignore em silêncio", () => {
    const codigo = lerCodigo("src/lib/dataLayer.ts");
    const empurrados = [...codigo.matchAll(/event:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    // `page_context` é o único que o container não precisa como gatilho: ele
    // existe para ATUALIZAR `page_type`, que todas as tags leem como parâmetro.
    const inesperados = empurrados.filter(
      (e) => e !== "page_context" && !EVENTOS_DO_CONTAINER.includes(e as never),
    );
    expect(inesperados).toEqual([]);
  });
});

describe("os caminhos de variável que o container lê chegam preenchidos", () => {
  it("view_vehicle entrega o objeto do veículo e o espelho de e-commerce", () => {
    pushCamadaGlobal({ page_type: "vehicle_detail" });
    pushVeiculo(VEICULO);

    for (const caminho of [
      "vehicle.id",
      "vehicle.name",
      "vehicle.brand",
      "vehicle.model",
      "vehicle.price",
      "vehicle.body_type",
      "vehicle.transmission",
      "page_type",
      "ecommerce.items",
    ]) {
      expect(valorNaCamada(caminho), caminho).toBeDefined();
    }

    expect(valorNaCamada("vehicle.body_type")).toBe("Picape");
    expect(valorNaCamada("vehicle.transmission")).toBe("Manual");
  });

  it("generate_lead entrega lead_type E lead_id", () => {
    // `lead_id` é mapeado pela tag 204 do container e chegava sempre
    // `undefined`: ninguém o empurrava.
    pushLead("proposta", { lead_id: "Lead.1756160000.abc", vehicle_id: VEICULO.id });
    expect(valorNaCamada("lead_type")).toBe("proposta");
    expect(valorNaCamada("lead_id")).toBe("Lead.1756160000.abc");
  });

  it("click_whatsapp entrega whatsapp_location", () => {
    pushCliqueWhatsApp("ficha_rodape", { vehicle_id: VEICULO.id });
    expect(valorNaCamada("whatsapp_location")).toBe("ficha_rodape");
  });

  it("toda variável do container tem quem a preencha", () => {
    // Varredura de fonte: prende os nomes ainda que o push more noutro módulo.
    const codigo = lerCodigo("src/lib/dataLayer.ts");
    for (const caminho of VARIAVEIS_DO_CONTAINER) {
      const folha = caminho.split(".").pop() as string;
      expect(codigo, `quem preenche ${caminho}?`).toContain(folha);
    }
  });
});

describe("os campos que o §11.1 do plano pediu", () => {
  it("view_vehicle leva price_range, owners e has_report", () => {
    pushVeiculo({ ...VEICULO, donos: 1, temLaudo: true });

    // A mesma faixa que nomeia `/estoque/60-a-100-mil`: público de remarketing
    // e página perene falando do mesmo recorte.
    expect(valorNaCamada("vehicle.price_range")).toBe("60-a-100-mil");
    expect(valorNaCamada("vehicle.owners")).toBe(1);
    expect(valorNaCamada("vehicle.has_report")).toBe(true);
  });

  it("has_report não sai como false quando o laudo não foi lançado", () => {
    // `conteudo-seo/POSICIONAMENTO.md`: o dono confirmou que TODOS os veículos
    // passam por perícia; `laudo_pericia` vazio é falha de lançamento. Publicar
    // `false` contradiria o que a própria página afirma.
    pushVeiculo({ ...VEICULO, temLaudo: false });
    expect(valorNaCamada("vehicle.has_report")).toBeUndefined();
  });

  it("price_range some em vez de inventar faixa para preço inválido", () => {
    pushVeiculo({ ...VEICULO, preco: 0 });
    expect(valorNaCamada("vehicle.price_range")).toBeUndefined();
  });

  it("a ficha entrega os dois campos que dependem do veículo", () => {
    const fonte = lerCodigo("src/components/PDPClientWrapper.tsx");
    expect(fonte).toContain("donos: veiculo.donos_anteriores");
    expect(fonte).toContain("temLaudo: Boolean((veiculo.laudo_pericia ?? \"\").trim())");
  });
});

describe("o veículo não atravessa a navegação", () => {
  it("trocar de página zera vehicle e stock_count", () => {
    pushVeiculo(VEICULO);
    expect(valorNaCamada("vehicle.id")).toBe(VEICULO.id);

    // Sai da ficha para a home. O `dataLayer` é acumulativo: sem a limpeza, um
    // clique de WhatsApp na home reportaria o carro da página anterior — e
    // agora TODA tag GA4 do container lê `vehicle.*`.
    pushCamadaGlobal({ page_type: "home" });

    expect(valorNaCamada("vehicle")).toBeNull();
    expect(valorNaCamada("stock_count")).toBeNull();
  });
});

describe("quem manda o evento: o código ou o container", () => {
  it("o sinalizador começa desligado e responde a quem o marca", () => {
    expect(containerAssumeOsEventos()).toBe(false);
    marcarContainerAtivo(true);
    expect(containerAssumeOsEventos()).toBe(true);
  });

  it("o IntegrationsTracker liga o sinalizador a partir do gtmId", () => {
    const fonte = lerCodigo("src/components/IntegrationsTracker.tsx");
    expect(fonte).toContain("marcarContainerAtivo(Boolean(gtmId))");
  });

  it("os dois gtag que o container duplicaria estão sob o sinalizador", () => {
    const fonte = lerCodigo("src/lib/telemetry.ts");

    // `generate_lead` do formulário e do clique de contato, mais a conversão
    // do Ads. Sem o gate, publicar o container conta cada lead duas vezes.
    expect(fonte).toMatch(/const oContainerAssume = containerAssumeOsEventos\(\);/);
    expect(fonte).toMatch(/if \(window\.gtag && !oContainerAssume\) \{\s*window\.gtag\("event", "generate_lead"/);
    expect(fonte).toMatch(/if \(window\.gtag && !oContainerAssume && options\?\.googleAdsId/);
    expect(fonte).toMatch(/if \(window\.gtag && !containerAssumeOsEventos\(\)\) \{\s*window\.gtag\("event", "generate_lead"/);
  });

  it("view_item, search e complete_registration continuam SEM gate", () => {
    // Não têm contrapartida no container. `view_item` em especial é evento
    // recomendado do GA4 e sustenta relatório de item e público de
    // remarketing que `view_vehicle`, sendo nome customizado, não sustenta.
    const fonte = lerCodigo("src/lib/telemetry.ts");
    for (const evento of ["view_item", "search", "complete_registration"]) {
      const trecho = fonte.slice(0, fonte.indexOf(`window.gtag("event", "${evento}"`));
      const ultimaGuarda = trecho.lastIndexOf("if (window.gtag");
      expect(
        trecho.slice(ultimaGuarda),
        `${evento} não deveria estar sob o sinalizador`,
      ).not.toContain("containerAssumeOsEventos");
    }
  });

  it("o push do dataLayer NUNCA é silenciado pelo sinalizador", () => {
    // É ele que alimenta o container. Silenciá-lo seria desligar os dois lados.
    marcarContainerAtivo(true);
    pushLead("proposta", { lead_id: "x" });
    expect(fila().some((l) => l.event === "generate_lead")).toBe(true);
  });
});

describe("o container é carregado só quando configurado", () => {
  it("o GTM depende do gtmId, e o gtmId vem do painel", () => {
    const fonte = lerCodigo("src/components/IntegrationsTracker.tsx");
    // A condição que sustenta todo o desenho: enquanto o campo está vazio, o
    // container não existe na página, e o código segue medindo sozinho.
    expect(fonte).toMatch(/if \(gtmId && !initializedGTM\.current\)/);
  });

  it("o repositório traz o container real como padrão de fallback", () => {
    const settings = JSON.parse(lerCodigo("src/lib/companySettings.json"));
    expect(settings.gtmId).toBe("GTM-TB665RN9");
    // Vazios de propósito: o container dispara as conversões do Ads. Preencher
    // aqui com o container ligado reativaria o caminho paralelo.
    expect(settings.googleAdsId).toBe("");
    expect(settings.googleAdsConversionLabel).toBe("");
  });
});
