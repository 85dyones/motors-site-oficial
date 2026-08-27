import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import { getUtmParameters } from "../src/lib/telemetry";

/**
 * As brechas do handoff de mensuração de 27/08.
 *
 * ---------------------------------------------------------------------------
 * O que liga estes quatro assuntos
 * ---------------------------------------------------------------------------
 * Nenhum deles quebra tela, nenhum aparece em log de erro, e todos custam
 * dinheiro pelo mesmo mecanismo: o Ads aprende com o que a gente manda. Sinal
 * errado não vira bug, vira lance — e o algoritmo passa semanas comprando o
 * tráfego errado com convicção.
 *
 *   A.2  o valor da conversão decidido por sobra do `dataLayer`
 *   A.3  captcha que aceitava tudo, por dois caminhos diferentes
 *   B.1  o click id descartado justamente nos fluxos de maior volume
 *   B.3  cookie de anúncio gravado antes do aceite
 *
 * Cada asserção aqui existe porque a versão anterior do código passava por
 * cima do problema sem reclamar.
 */

describe("A.2 · o valor da conversão não pode depender do que sobrou", () => {
  const fonte = lerCodigo("src/lib/dataLayer.ts");

  it("`page_context` zera `lead_type` junto com o contexto de veículo", () => {
    // O `dataLayer` é acumulativo. A variável de valor do container calcula
    // `preço × 0,08 × taxa[lead_type]`, e as taxas vão de 0,03 (contato) a
    // 0,12 (avaliação). Sem zerar, o MESMO clique no WhatsApp valia R$ 100
    // para quem chegou direto e R$ 500 para quem passou pela avaliação antes
    // na mesma sessão — 5,8× de spread, sem erro visível em lugar nenhum.
    const bloco = fonte.slice(
      fonte.indexOf("export function pushCamadaGlobal"),
      fonte.indexOf("export function pushContagemDeEstoque"),
    );
    expect(bloco).toContain("lead_type: null");
    // Os companheiros de zeragem, para o teste falhar se alguém remover a
    // linha nova junto com a família a que ela pertence.
    expect(bloco).toContain("vehicle_price: null");
  });

  it("os dois cliques declaram `lead_type` explicitamente", () => {
    for (const fn of ["pushCliqueWhatsApp", "pushCliqueTelefone"]) {
      const bloco = fonte.slice(fonte.indexOf(`export function ${fn}`));
      const corpo = bloco.slice(0, bloco.indexOf("}\n"));
      expect(corpo, fn).toContain('lead_type: "contato"');
    }
  });

  it("o valor forçado vem DEPOIS do spread do contexto", () => {
    // Antes do spread, um chamador poderia sobrescrever — e voltaria a
    // flutuar, que é exatamente o defeito. A ordem é a correção.
    const bloco = fonte.slice(fonte.indexOf("export function pushCliqueWhatsApp"));
    const corpo = bloco.slice(0, bloco.indexOf("}\n"));
    expect(corpo.indexOf("...contexto")).toBeLessThan(corpo.indexOf('lead_type: "contato"'));
  });
});

describe("A.3 · o captcha", () => {
  const rota = lerCodigo("src/app/api/leads/route.ts");

  it("a chave de teste da Cloudflare saiu do código", () => {
    // `1x0000000000000000000000000000000AA` é a chave "always passes". Como
    // fallback de `TURNSTILE_SECRET_KEY`, ela fazia o captcha do site inteiro
    // virar enfeite em qualquer ambiente sem a variável — sem uma linha de log
    // dizendo isso.
    expect(rota).not.toContain("1x0000000000000000000000000000000AA");
  });

  it("sem a chave, RECUSA o lead — não aceita em silêncio", () => {
    const fn = rota.slice(rota.indexOf("async function verifyTurnstileToken"));
    const corpo = fn.slice(0, fn.indexOf("\n}"));
    expect(corpo).toMatch(/if \(!secret\)/);
    expect(corpo).toMatch(/return false;/);
    // Falhar fechado só é seguro porque a chave ESTÁ configurada em produção
    // — medido em 27/08 mandando um token inválido e recebendo 403. Se um dia
    // sumir, o formulário para de aceitar lead, visível no mesmo dia, em vez
    // de aceitar bot para sempre.
    expect(corpo).toMatch(/console\.error/);
  });

  it("a régua é de ISENÇÃO, não de exigência", () => {
    // A allowlist anterior era decidida pelo campo `canal`, que vem no CORPO
    // do POST. Mandar `canal: "Formulário Contato"` pulava a verificação de
    // qualquer canal. E `PDPClientWrapper` manda `canal: activeChannel` —
    // valor dinâmico: canal novo na ficha nasceria sem captcha, em silêncio.
    expect(rota).toMatch(/const needsCaptcha = !ISENTOS_DE_CAPTCHA\.includes\(body\.canal\)/);
  });

  it("a lista de isentos está vazia", () => {
    // `/contato` era o único que faltava e passou a renderizar o desafio na
    // mesma rodada. Se um canal precisar entrar aqui, que seja com nome e
    // motivo — não por omissão.
    expect(rota).toMatch(/const ISENTOS_DE_CAPTCHA: string\[\] = \[\];/);
  });

  it("todo formulário que posta em /api/leads manda o token", () => {
    // A régua nova só é segura se nenhum caminho legítimo ficar de fora. Se
    // alguém acrescentar um formulário sem captcha, o lead volta 400 e some —
    // este teste falha antes de chegar lá.
    for (const arquivo of [
      "src/components/ContatoClientWrapper.tsx",
      "src/components/PDPClientWrapper.tsx",
      "src/components/LeadPopup.tsx",
      "src/components/CarMatch.tsx",
      "src/components/AutoAvaliacao.tsx",
    ]) {
      const fonte = lerCodigo(arquivo);
      expect(fonte, arquivo).toContain("turnstileToken");
    }
  });

  it("o formulário de contato renderiza o desafio e espera o token", () => {
    const contato = lerCodigo("src/components/ContatoClientWrapper.tsx");
    expect(contato).toContain("<Turnstile");
    expect(contato).toMatch(/disabled=\{status === "sending" \|\| !turnstileToken\}/);
  });
});

describe("B.1 · o click id sobrevive até o CRM", () => {
  it("`gbraid` e `wbraid` são capturados junto do `gclid`", () => {
    // O Google entrega `gbraid` (iOS/app) ou `wbraid` (PMax, YouTube) NO LUGAR
    // do `gclid`, não junto. Sem eles, o upload de conversão offline volta com
    // "click id inválido" justamente no tráfego que a campanha nova compra.
    const fonte = lerCodigo("src/lib/telemetry.ts");
    const lista = fonte.slice(fonte.indexOf("const keys: (keyof UtmParameters)[]"));
    for (const chave of ["gclid", "gbraid", "wbraid", "fbclid", "utm_term"]) {
      expect(lista.slice(0, 300), chave).toContain(`"${chave}"`);
    }
  });

  it("o tipo e o objeto inicial acompanham a lista", () => {
    // Três lugares descrevem o mesmo conjunto. Um deles desatualizado devolve
    // `undefined` em silêncio — o campo simplesmente não existe no payload.
    const fonte = lerCodigo("src/lib/telemetry.ts");
    const tipo = fonte.slice(
      fonte.indexOf("export interface UtmParameters"),
      fonte.indexOf("export function getUtmParameters"),
    );
    for (const chave of ["gbraid", "wbraid"]) {
      expect(tipo, `${chave} no tipo`).toContain(`${chave}: string | null`);
    }
    const vazio = getUtmParameters();
    expect(Object.keys(vazio).sort()).toEqual(
      ["fbclid", "gbraid", "gclid", "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term", "wbraid"],
    );
  });

  it("os dois fluxos de maior volume passam o objeto INTEIRO", () => {
    // Remontar campo a campo descartava `gclid`, `gbraid`, `wbraid`,
    // `utm_term` e `fbclid`. A captura já existia; o que faltava era não
    // jogar fora na hora do POST.
    const pdp = lerCodigo("src/components/PDPClientWrapper.tsx");
    expect(pdp).toMatch(/utm: utmParams,/);
    expect(pdp).not.toMatch(/utm: \{\s*utm_source: utmParams\.utm_source,/);

    const popup = lerCodigo("src/components/LeadPopup.tsx");
    // No pop-up o spread vem primeiro e os defaults depois: preserva tudo sem
    // perder a atribuição própria de quem chegou sem UTM nenhum.
    const bloco = popup.slice(popup.indexOf("utm: {"), popup.indexOf("intencao_busca"));
    expect(bloco).toContain("...utmParams");
    expect(bloco.indexOf("...utmParams")).toBeLessThan(bloco.indexOf("utm_source:"));
    expect(bloco).toContain('|| "lead-popup"');
  });
});

describe("B.3 · o cookie de anúncio respeita o banner", () => {
  it("`_fbc` só é gravado depois do aceite", () => {
    // A política publicada afirma que "enquanto você não aceitar, nenhuma
    // ferramenta de análise ou publicidade é carregada" — e declara `_fbc`
    // como cookie de atribuição de anúncio. Gravá-lo antes desmentia o texto
    // que o visitante leu.
    const fonte = lerCodigo("src/components/IntegrationsTracker.tsx");
    const escrita = fonte.indexOf("document.cookie = `_fbc=");
    expect(escrita).toBeGreaterThan(-1);

    // A escrita mora dentro da função que só roda depois do portão.
    const portao = fonte.indexOf('const consent = localStorage.getItem("ag_cookie_consent")');
    const chamada = fonte.indexOf("persistirFbc();");
    expect(chamada).toBeGreaterThan(portao);
  });

  it("quem aceita na página de entrada não perde o `fbclid`", () => {
    // A captura roda também no evento de mudança de consentimento, então o
    // aceite ainda na landing pega o parâmetro direto da URL. Some só o caso
    // de quem navega para outra página antes de aceitar.
    const fonte = ler("src/components/IntegrationsTracker.tsx");
    expect(fonte).toContain('window.addEventListener("ag-cookie-consent-updated", checkAndInitTrackors)');
  });
});
