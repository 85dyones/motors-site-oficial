import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { ler, lerCodigo } from "./fonte";
import { getUtmParameters, persistirParametrosDeCampanha } from "../src/lib/telemetry";

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

  it("`pushLead` também põe o lead_type depois do spread", () => {
    // Esta função ficou de fora do conserto de 27/08 porque a inversão dela
    // não causava defeito visível: o tipo de `dados` não tem `lead_type`,
    // então o TypeScript já barra o chamador. Mas a proteção morava no tipo, e
    // tipo se afrouxa — um `as any`, ou um campo novo em `ContextoDeVeiculo`,
    // e o valor forçado volta a ser sobrescrevível sem nada acusar.
    //
    // `generate_lead` é o evento que vira conversão de LEAD no Google Ads e
    // alimenta o lance, então é o pior lugar para deixar a garantia frouxa.
    const bloco = fonte.slice(fonte.indexOf("export function pushLead"));
    const corpo = bloco.slice(0, bloco.indexOf("\n}"));
    const spread = corpo.indexOf("...dados");
    const forcado = corpo.indexOf("lead_type: tipo");
    expect(spread, "não achei o spread em pushLead").toBeGreaterThan(-1);
    expect(forcado, "não achei o lead_type forçado em pushLead").toBeGreaterThan(-1);
    expect(spread).toBeLessThan(forcado);
  });
});

describe("A.3 · o captcha", () => {
  const rota = lerCodigo("src/app/api/leads/route.ts");
  const rotaAvaliacao = lerCodigo("src/app/api/avaliacao/route.ts");
  const verificacao = lerCodigo("src/lib/turnstile.ts");

  /**
   * O escopo deste bloco cresceu em 27/08, depois de o conserto anterior ter
   * passado batido por metade do problema.
   *
   * A versão antiga lia só `src/app/api/leads/route.ts`. A função de
   * verificação, porém, existia DUAS vezes — copiada em `/api/avaliacao` — e
   * a cópia de lá continuou com a secret de teste "always passes" no fallback
   * por mais um mês, verde no CI o tempo todo. Teste que vigia um arquivo não
   * protege o gêmeo dele.
   *
   * Agora a verificação mora em `src/lib/turnstile.ts`, uma vez só, e os testes
   * abaixo cobrem as duas rotas E vigiam a volta da duplicata.
   */

  it("a chave de teste da Cloudflare saiu do código", () => {
    // `1x0000000000000000000000000000000AA` é a secret "always passes" e
    // `1x00000000000000000000AA` é a sitekey equivalente. Como FALLBACK, elas
    // faziam o captcha virar enfeite em qualquer ambiente sem a variável — sem
    // uma linha de log dizendo isso. Como variável de ambiente de Preview,
    // escritas de propósito, continuam sendo o comportamento certo; o que não
    // pode é o código cair nelas sozinho.
    for (const [nome, fonte] of [
      ["lib/turnstile.ts", verificacao],
      ["api/leads", rota],
      ["api/avaliacao", rotaAvaliacao],
      ["components/Turnstile.tsx", lerCodigo("src/components/Turnstile.tsx")],
    ] as const) {
      expect(fonte, nome).not.toContain("1x0000000000000000000000000000000AA");
      expect(fonte, nome).not.toContain("1x00000000000000000000AA");
    }
  });

  it("sem a chave, RECUSA o lead — não aceita em silêncio", () => {
    const fn = verificacao.slice(verificacao.indexOf("export async function verificarTurnstile"));
    // `\n}\n` e não `\n}`: a assinatura desestrutura o argumento, então o
    // primeiro `\n}` do texto é o fim da lista de parâmetros — `}: EntradaTurnstile)` —
    // e cortar ali deixaria o corpo de fora.
    const corpo = fn.slice(0, fn.indexOf("\n}\n"));
    expect(corpo.length).toBeGreaterThan(200);
    expect(corpo).toMatch(/if \(!secret\)/);
    expect(corpo).toMatch(/ok: false/);
    // Falhar fechado só é seguro porque a chave ESTÁ configurada em produção
    // — medido em 27/08 mandando um token inválido e recebendo 403. Se um dia
    // sumir, o formulário para de aceitar lead, visível no mesmo dia, em vez
    // de aceitar bot para sempre.
    expect(corpo).toMatch(/console\.error/);
  });

  it("as duas rotas protegidas usam a MESMA verificação", () => {
    // Este é o teste que teria pego o bug original. Enquanto as duas rotas
    // chamarem a função compartilhada, o próximo conserto vale para as duas.
    for (const [nome, fonte] of [["api/leads", rota], ["api/avaliacao", rotaAvaliacao]] as const) {
      expect(fonte, nome).toMatch(/verificarTurnstile\(/);
      expect(fonte, nome).toMatch(/from "\.\.\/\.\.\/\.\.\/lib\/turnstile"/);
    }
  });

  it("nenhuma rota fala com o siteverify por conta própria", () => {
    // A duplicata volta assim: alguém copia o fetch para "resolver rápido" e a
    // divergência recomeça. O endereço do siteverify só pode aparecer em um
    // arquivo do projeto.
    for (const [nome, fonte] of [["api/leads", rota], ["api/avaliacao", rotaAvaliacao]] as const) {
      expect(fonte, nome).not.toContain("challenges.cloudflare.com/turnstile/v0/siteverify");
    }
    expect(verificacao).toContain("challenges.cloudflare.com/turnstile/v0/siteverify");
  });

  it("valida hostname e action, não só `success`", () => {
    // `success: true` diz que o desafio foi resolvido — não diz ONDE nem em
    // QUAL formulário. Até 27/08 o widget tinha `localhost` e `127.0.0.1` na
    // lista de domínios: qualquer um subia uma página local com a nossa
    // sitekey (que é pública), colhia token que a Cloudflare assinava, e
    // postava na produção. Os dois hosts saíram da lista no mesmo dia; esta
    // conferência é o que impede a brecha de voltar se alguém reabrir a lista.
    expect(verificacao).toMatch(/hostsAceitos\.has\(hostname\)/);
    expect(verificacao).toMatch(/acoesAceitas\.includes\(action\)/);
  });

  it("em produção, a lista de hostnames é obrigatória", () => {
    // Fora de produção ela pode faltar — é o que deixa Preview e o dev local
    // usarem as chaves de teste, cujo hostname nenhuma lista prevê. Em
    // produção, faltar é recusar: quem decide é `VERCEL_ENV`, que o servidor
    // injeta, e não um campo do corpo do POST como a régua que saiu em 27/08.
    expect(verificacao).toMatch(/VERCEL_ENV === "production"/);
    const guarda = verificacao.slice(verificacao.indexOf("hostsAceitos.size === 0 && estaEmProducao()"));
    expect(guarda.slice(0, 400)).toMatch(/ok: false/);
  });

  it("o token é validado antes de sair para a Cloudflare", () => {
    // O corpo do POST é JSON livre. Sem teto, um campo de 10 MB viraria upload
    // nosso para a borda da Cloudflare; sem checar o tipo, um número ou objeto
    // chegaria coagido a string.
    expect(verificacao).toMatch(/typeof token !== "string"/);
    expect(verificacao).toMatch(/TAMANHO_MAXIMO_DO_TOKEN/);
    // Sem timeout, uma chamada pendurada segura a invocação serverless até o
    // limite da plataforma, com o visitante olhando o botão girar.
    expect(verificacao).toMatch(/AbortSignal\.timeout/);
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
    const lista = fonte.slice(fonte.indexOf("const CHAVES_DE_CAMPANHA: (keyof UtmParameters)[]"));
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


/**
 * B.4 · o identificador de anúncio também respeita o banner.
 *
 * Irmão do B.3. O `_fbc` entrou no portão em 27/08; `gclid`, `gbraid`, `wbraid`
 * e os `utm_*` continuaram sendo gravados no `localStorage` sem consultar o
 * aceite, pela mesma política que declara os dois como identificador de
 * anúncio.
 *
 * O que a investigação achou de mais importante não foi o portão que faltava,
 * e sim que a gravação estava no lugar errado: ela morava dentro de
 * `getUtmParameters`, chamada só de handler de ENVIO de formulário. Guardava o
 * parâmetro apenas quando a pessoa enviava algo com ele ainda na URL — e aí o
 * valor já tinha sido lido da URL na mesma iteração. A jornada que o fallback
 * aparentava proteger (chegar do anúncio, navegar, enviar depois) nunca esteve
 * coberta: custo de privacidade sem benefício de atribuição.
 *
 * Capturar na entrada, atrás do portão, corrige os dois lados: passa a valer o
 * texto da política E passa a existir a atribuição que não existia.
 */
describe("B.4 · a última decisão da pessoa é a que vale", () => {
  /**
   * ATENÇÃO a quem lê isto achando que é uma brecha: não é descuido.
   *
   * Até 28/08 este bloco exigia o contrário — nada gravado antes do aceite. A
   * régua inverteu por decisão do dono, com o motivo dele: *"a pessoa pode
   * mudar de ideia e sempre teremos a decisão dela gravada por último"*.
   *
   * A memória de sessão cobria quem navega e aceita na mesma aba; não cobria
   * quem recarrega ou volta noutro dia e só então aceita. Gravar na chegada
   * fecha esse caso.
   *
   * O que torna a frase verdadeira — e o que estes testes guardam — é a outra
   * metade: **recusar apaga**. Sem isso o identificador ficaria no dispositivo
   * contradizendo a última decisão, que é o oposto do argumento.
   *
   * O texto da política foi ajustado na mesma rodada para descrever isso. Há
   * um teste no fim deste bloco vigiando os dois juntos: se a gravação na
   * chegada sair do código, o parágrafo tem de sair da política.
   */
  function comAmbiente(url: string, consentimento: string | null) {
    const dados = new Map<string, string>();
    if (consentimento) dados.set("ag_cookie_consent", consentimento);
    (globalThis as Record<string, unknown>).window = {
      location: { search: new URL(url).search },
    };
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => (dados.has(k) ? dados.get(k)! : null),
      setItem: (k: string, v: string) => void dados.set(k, v),
      removeItem: (k: string) => void dados.delete(k),
    };
    return dados;
  }

  /** O módulo recém-importado, com a memória de sessão zerada. */
  async function moduloLimpo() {
    vi.resetModules();
    return import("../src/lib/telemetry");
  }

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  const COM_ANUNCIO = "https://motorsstore.com.br/?gclid=ABC123&utm_source=google&fbclid=XYZ789";

  const chavesDeCampanha = (dados: Map<string, string>) =>
    [...dados.keys()].filter((k) => k.startsWith("ag_") && k !== "ag_cookie_consent").sort();

  it("sem decisão nenhuma, grava na chegada", async () => {
    const dados = comAmbiente(COM_ANUNCIO, null);
    const { persistirParametrosDeCampanha } = await moduloLimpo();
    persistirParametrosDeCampanha();
    expect(dados.get("ag_gclid")).toBe("ABC123");
    expect(dados.get("ag_fbclid")).toBe("XYZ789");
  });

  it("RECUSAR apaga o que já estava gravado", async () => {
    // O coração da decisão de 28/08: gravar cedo só se sustenta se a recusa
    // desfizer. Sem esta linha, "a última decisão vale" seria falso.
    const dados = comAmbiente(COM_ANUNCIO, null);
    const { persistirParametrosDeCampanha } = await moduloLimpo();
    persistirParametrosDeCampanha();
    expect(chavesDeCampanha(dados).length).toBeGreaterThan(0);

    dados.set("ag_cookie_consent", "rejected");
    persistirParametrosDeCampanha();
    expect(chavesDeCampanha(dados)).toEqual([]);
  });

  it("recusar e depois ACEITAR regrava — a mudança de ideia funciona", async () => {
    // É o caso que o dono nomeou. A memória de sessão sobrevive à recusa de
    // propósito: ela não é armazenamento no dispositivo, e é o que permite
    // reconstruir a atribuição quando a pessoa muda de ideia na mesma aba.
    const dados = comAmbiente(COM_ANUNCIO, "rejected");
    const { persistirParametrosDeCampanha } = await moduloLimpo();
    persistirParametrosDeCampanha();
    expect(chavesDeCampanha(dados)).toEqual([]);

    dados.set("ag_cookie_consent", "accepted");
    persistirParametrosDeCampanha();
    expect(dados.get("ag_gclid")).toBe("ABC123");
  });

  it("depois do aceite, grava", async () => {
    const dados = comAmbiente(COM_ANUNCIO, "accepted");
    const { persistirParametrosDeCampanha } = await moduloLimpo();
    persistirParametrosDeCampanha();
    expect(dados.get("ag_gclid")).toBe("ABC123");
    expect(dados.get("ag_utm_source")).toBe("google");
  });

  it("a LEITURA nunca teve portão — o lead não perde atribuição", async () => {
    // O retorno vai no payload de um formulário que a pessoa está enviando com
    // nome e telefone. O `gclid` é o dado menos sensível daquele POST.
    comAmbiente(COM_ANUNCIO, null);
    const { getUtmParameters } = await moduloLimpo();
    const utm = getUtmParameters();
    expect(utm.gclid).toBe("ABC123");
    expect(utm.utm_source).toBe("google");
  });

  it("o que foi guardado antes serve de fallback quando a URL não traz nada", async () => {
    // Visitante que volta digitando o endereço: nem a URL nem a memória desta
    // sessão têm parâmetro, e o que sobra é o da visita anterior.
    const dados = comAmbiente("https://motorsstore.com.br/estoque", "accepted");
    dados.set("ag_gclid", "DE_UMA_VISITA_ANTERIOR");
    const { getUtmParameters } = await moduloLimpo();
    expect(getUtmParameters().gclid).toBe("DE_UMA_VISITA_ANTERIOR");
  });

  it("a captura roda na ENTRADA, antes do retorno antecipado do tracker", async () => {
    // `persistirParametrosDeCampanha` trata recusa e gravação por dentro. Se a
    // chamada ficasse depois do `return` de quem não aceitou, ela nunca rodaria
    // para quem ainda não decidiu — nem gravando, nem apagando numa recusa.
    const fonte = lerCodigo("src/components/IntegrationsTracker.tsx");
    const portao = fonte.indexOf('const consent = localStorage.getItem("ag_cookie_consent")');
    const chamada = fonte.indexOf("persistirParametrosDeCampanha();");
    expect(chamada, "o tracker não chama a captura").toBeGreaterThan(-1);
    expect(chamada, "a captura precisa vir ANTES do retorno antecipado").toBeLessThan(portao);
  });

  it("o `_fbc`, esse sim, continua atrás do aceite", async () => {
    // Não mudou em 28/08 e não deve mudar por tabela: `persistirFbc` escreve o
    // cookie direto, sem tratamento interno de recusa, e depende do `return` de
    // cima. GA4, Ads e Meta seguem no mesmo regime.
    const fonte = lerCodigo("src/components/IntegrationsTracker.tsx");
    const portao = fonte.indexOf('const consent = localStorage.getItem("ag_cookie_consent")');
    expect(fonte.indexOf("persistirFbc();")).toBeGreaterThan(portao);
  });

  it("a política descreve a gravação na chegada", async () => {
    // Código e política não podem contar histórias diferentes. Se um dia a
    // gravação voltar a esperar o aceite, este teste falha e lembra de tirar o
    // parágrafo do texto publicado.
    const codigo = lerCodigo("src/lib/telemetry.ts");
    const politica = lerCodigo("src/app/privacidade/page.tsx");

    const gravaNaChegada = codigo.includes("descartarParametrosDeCampanha();");
    expect(gravaNaChegada, "o código deixou de gravar na chegada?").toBe(true);

    expect(politica, "a política não avisa que grava antes da resposta")
      .toMatch(/antes da sua resposta ao aviso/);
    expect(politica, "a política não avisa que a recusa apaga")
      .toMatch(/recusar, ele é apagado/);
  });
});


/**
 * B.5 · a jornada que se perdia: navegar antes de decidir.
 *
 * O pedido foi "se melhora a métrica, grave antes do aceite". Gravar no
 * DISPOSITIVO antes do aceite melhora quase nada além do que a memória de
 * sessão já resolve, e custa contrariar o texto da política — inclusive para
 * quem clicou em RECUSAR.
 *
 * O que de fato se perdia era a jornada: chegar do anúncio, navegar para outra
 * página (a URL some com o `gclid`) e só então aceitar, ou enviar um
 * formulário. `capturadoNestaSessao` cobre os dois casos sem tocar no disco
 * antes da hora.
 */
describe("B.5 · navegar antes de decidir não perde a atribuição", () => {
  const COM_ANUNCIO = "https://motorsstore.com.br/?gclid=DA_ENTRADA_123&utm_source=google";
  const SEM_PARAMETRO = "https://motorsstore.com.br/estoque";

  let dados: Map<string, string>;

  function irPara(url: string) {
    (globalThis as Record<string, unknown>).window = { location: { search: new URL(url).search } };
  }

  function aceitar(valor: string) {
    dados.set("ag_cookie_consent", valor);
  }

  beforeEach(() => {
    // `capturadoNestaSessao` é estado de módulo — sem reimportar, um teste
    // herdaria a captura do anterior e todos passariam por engano.
    vi.resetModules();
    dados = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => (dados.has(k) ? dados.get(k)! : null),
      setItem: (k: string, v: string) => void dados.set(k, v),
      removeItem: (k: string) => void dados.delete(k),
    };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  const chavesGravadas = () =>
    [...dados.keys()].filter((k) => k.startsWith("ag_") && k !== "ag_cookie_consent").sort();

  it("aceitar DEPOIS de navegar mantém o gclid da entrada", async () => {
    const tel = await import("../src/lib/telemetry");

    // 1. Chega do anúncio e não decide nada. Desde 28/08 já grava aqui.
    irPara(COM_ANUNCIO);
    tel.persistirParametrosDeCampanha();
    expect(dados.get("ag_gclid")).toBe("DA_ENTRADA_123");

    // 2. Navega — a URL não tem mais o parâmetro.
    irPara(SEM_PARAMETRO);
    tel.persistirParametrosDeCampanha();

    // 3. Aceita o banner aqui, longe da página de entrada.
    aceitar("accepted");
    tel.persistirParametrosDeCampanha();

    // O valor da ENTRADA sobrevive às duas passagens. Nem a URL vazia do passo
    // 2 nem o aceite tardio do passo 3 o substituem por nada.
    expect(dados.get("ag_gclid")).toBe("DA_ENTRADA_123");
    expect(dados.get("ag_utm_source")).toBe("google");
  });

  it("quem NUNCA responde ao banner leva o gclid junto no lead", async () => {
    const tel = await import("../src/lib/telemetry");

    irPara(COM_ANUNCIO);
    tel.persistirParametrosDeCampanha();
    irPara(SEM_PARAMETRO);

    // O payload do lead nunca teve portão — é um formulário que a pessoa
    // escolheu enviar, e o gclid é o dado menos sensível dele. Depois de
    // navegar, quem ainda tem o valor é a memória de sessão e o dispositivo.
    expect(tel.getUtmParameters().gclid).toBe("DA_ENTRADA_123");
  });

  it("quem RECUSA não tem nada gravado, nem depois de navegar", async () => {
    const tel = await import("../src/lib/telemetry");

    irPara(COM_ANUNCIO);
    tel.persistirParametrosDeCampanha();
    aceitar("rejected");
    irPara(SEM_PARAMETRO);
    tel.persistirParametrosDeCampanha();
    tel.getUtmParameters();

    expect(chavesGravadas()).toEqual([]);
  });

  it("a URL de ENTRADA vence uma que apareça depois", async () => {
    // Senão um link interno com `?utm_source=...` reescreveria a origem da
    // visita, e a campanha que pagou pelo clique perderia o crédito.
    const tel = await import("../src/lib/telemetry");

    irPara(COM_ANUNCIO);
    tel.persistirParametrosDeCampanha();
    irPara("https://motorsstore.com.br/estoque?utm_source=newsletter");
    tel.persistirParametrosDeCampanha();
    aceitar("accepted");
    tel.persistirParametrosDeCampanha();

    expect(dados.get("ag_utm_source")).toBe("google");
  });
});
