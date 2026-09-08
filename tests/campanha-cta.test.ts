import { describe, it, expect } from "vitest";
import { ACOES, ACOES_DE_LEADS } from "../src/lib/turnstile";
import { mensagemDaCampanha, montarLeadDeCampanha } from "../src/lib/leadDeCampanha";
import { lerCodigo } from "./fonte";
import { CAMPANHAS, type Campanha } from "../src/lib/campanhas";
import type { UtmParameters } from "../src/lib/telemetry";

const POLE: Campanha = {
  slug: "pole-position-2026",
  nome: "Pole Position",
  inicio: "2026-09-12",
  fim: "2026-09-20",
  destinoAposFim: "/estoque",
  descricao: "A largada para grandes oportunidades.",
  fraseDoCliente: "Olá, vi sobre o feirão Pole Position Motors e quero saber as condições",
};

/**
 * Visitante sem nenhum parâmetro de campanha — o caso de quem digitou a URL.
 * Os nove campos são obrigatórios em `UtmParameters`, e nulo é o valor que
 * `getUtmParameters()` devolve quando não achou nada.
 */
const SEM_UTM: UtmParameters = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  gclid: null,
  gbraid: null,
  wbraid: null,
  fbclid: null,
};

const EXTRAS = {
  agUid: "ag-1",
  eventId: "evt-1",
  turnstileToken: "tok-1",
  utm: SEM_UTM,
  eventSourceUrl: "https://motorsstore.com.br/pole-position-2026",
  fbp: null,
  fbc: null,
};

describe("a ação do captcha existe dos dois lados", () => {
  /*
   * Esquecer a segunda metade não dá erro de compilação e não quebra a tela: o
   * widget resolve o desafio, o token viaja, e o `siteverify` recusa pela
   * action — o visitante leva 403 num botão que parece funcionar.
   */
  it("`campanha` está em ACOES e é aceita por /api/leads", () => {
    expect(ACOES.campanha).toBe("campanha");
    expect([...ACOES_DE_LEADS]).toContain(ACOES.campanha);
  });

  it("o CTA declara essa ação, e não outra", () => {
    expect(lerCodigo("src/components/campanha/CtaDeCampanha.tsx")).toMatch(
      /action=\{ACOES\.campanha\}/,
    );
  });
});

describe("a mensagem é a voz do cliente", () => {
  it("é a frase declarada no registro, e não um template", () => {
    expect(mensagemDaCampanha(POLE)).toBe(POLE.fraseDoCliente);
  });

  it("cita a campanha pelo nome", () => {
    expect(mensagemDaCampanha(POLE)).toContain("Pole Position");
  });
});

/*
 * As proibições rodam sobre `CAMPANHAS` — o registro REAL —, e não sobre a
 * fixture acima.
 *
 * A primeira versão testava só o `POLE` local, e a revisão provou o buraco por
 * mutação: trocar a frase de verdade em `src/lib/campanhas.ts` por "Separei
 * ótimas opções para você: entrega em 3 dias, tudo abaixo da tabela FIPE"
 * deixava estes testes inteiramente verdes. Testar a cópia não guarda o
 * original.
 */
describe("nenhuma frase do registro promete o que a loja não controla", () => {
  it("o registro não está vazio — senão tudo abaixo passa por vacuidade", () => {
    expect(CAMPANHAS.length).toBeGreaterThan(0);
  });

  it.each(CAMPANHAS.map((c) => [c.slug, c] as const))(
    "%s: não fala na voz da loja",
    (_slug, campanha) => {
      /*
       * A frase vira `interesse` no banco e é lida por um consultor. Escrita
       * na voz da LOJA ("separei ótimas opções para você") grava um lead que
       * mente sobre quem falou — mesma regra de `mensagemDaEncomenda`.
       */
      expect(mensagemDaCampanha(campanha).toLowerCase()).not.toMatch(
        /separei|preparei|selecionei|selecionamos para voc|reservei/,
      );
    },
  );

  it.each(CAMPANHAS.map((c) => [c.slug, c] as const))(
    "%s: não cita FIPE, desconto nem prazo",
    (_slug, campanha) => {
      const frase = mensagemDaCampanha(campanha).toLowerCase();
      expect(frase).not.toMatch(/fipe|abaixo da tabela|desconto|\d+\s*(dias?|horas?|minutos?)/);
    },
  );

  it.each(CAMPANHAS.map((c) => [c.slug, c] as const))(
    "%s: a descrição pública também não promete recompra nem FIPE",
    (_slug, campanha) => {
      // `descricao` é og:description e entra no sitemap: é comunicação pública,
      // e a regra 5 do CLAUDE.md vale para ela igual.
      expect(campanha.descricao.toLowerCase()).not.toMatch(/recompra|fipe/);
    },
  );
});

describe("o corpo do POST", () => {
  const corpo = montarLeadDeCampanha(
    { nome: "Maria", email: "", whatsapp: "41999999999" },
    POLE,
    EXTRAS,
  );

  it("carimba o canal com o nome da campanha — é o que o consultor lê no Kanban", () => {
    expect(corpo.canal).toBe("Pole Position");
  });

  it("manda a frase em `mensagem`, de onde /api/leads deriva `interesse`", () => {
    expect(corpo.mensagem).toBe(POLE.fraseDoCliente);
  });

  /*
   * Decisão do dono em 08/09: a LP tem um CTA de campanha, não um por carro.
   * O lead entra SEM veículo, e isso é escolha registrada — não esquecimento a
   * ser "consertado" depois.
   */
  it("não inventa veículo", () => {
    expect("veiculo" in corpo).toBe(false);
  });

  it("leva o slug estruturado, para o n8n e o Motor de Gatilhos", () => {
    expect(corpo.intencao_busca).toMatchObject({
      campanha: "pole-position-2026",
      caminho: "/pole-position-2026",
    });
  });

  it("repassa identidade e token sem alterar", () => {
    expect(corpo.agUid).toBe("ag-1");
    expect(corpo.eventId).toBe("evt-1");
    expect(corpo.turnstileToken).toBe("tok-1");
  });

  it("omite e-mail vazio em vez de gravar string vazia", () => {
    expect(corpo.cliente.email).toBeUndefined();
  });

  /*
   * Sem `contentName`, `/api/leads` cai em `undefined` e a CAPI do SERVIDOR
   * manda o evento sem nome de conteúdo, enquanto o pixel do NAVEGADOR manda
   * "Pole Position Campanha" pelo mesmo `event_id`. Dois lados descrevendo
   * coisas diferentes é o que a deduplicação do Meta não perdoa — e é o mesmo
   * defeito que `src/lib/encomenda.ts` já corrige na superfície irmã.
   */
  it("manda contentName — senão a CAPI vai sem nome de conteúdo", () => {
    expect(corpo.contentName).toBeTruthy();
    expect(corpo.contentName).toContain("Pole Position");
  });

  it("e a rota realmente lê esse campo quando não há veículo", () => {
    expect(lerCodigo("src/app/api/leads/route.ts")).toMatch(/content_name:[^,]*contentName/);
  });

  it("mas leva o e-mail quando ele existe", () => {
    const comEmail = montarLeadDeCampanha(
      { nome: "Maria", email: " maria@exemplo.com ", whatsapp: "41999999999" },
      POLE,
      EXTRAS,
    );
    expect(comEmail.cliente.email).toBe("maria@exemplo.com");
  });
});

describe("o CTA não contorna o funil", () => {
  const codigo = () => lerCodigo("src/components/campanha/CtaDeCampanha.tsx");

  /*
   * Virar `<a href="wa.me">` troca captura com contexto por link genérico: sem
   * lead gravado, sem Turnstile, sem Pixel/CAPI e sem UTM. É o que a PDP já
   * perdeu uma vez.
   */
  it("passa pelo modal, e não por link solto de WhatsApp", () => {
    expect(codigo()).toMatch(/LeadCaptureModal/);
    expect(codigo()).not.toMatch(/href=["']https:\/\/(wa\.me|api\.whatsapp)/);
  });

  /*
   * Um `generate_lead` por tentativa infla a conversão e ensina o Ads a
   * comprar clique de quem desiste no meio. A ordem é: grava, conta, abre.
   */
  it("conta a conversão depois do POST, não no clique do botão", () => {
    const texto = codigo();
    /*
     * `fetch("/api/leads"` e não só `/api/leads`: o componente cita a rota
     * também na mensagem de `console.warn`, e ancorar no texto solto fazia o
     * teste passar com o POST REMOVIDO — provado por mutação em 08/09.
     */
    const post = texto.indexOf('fetch("/api/leads"');
    /*
     * `trackLeadSubmission(` COM parêntese: a primeira ocorrência do nome sozinho
     * é o `import` no topo do arquivo, que vem antes de tudo e faria esta
     * asserção reprovar código correto. Foi o que aconteceu na primeira versão.
     */
    const conversao = texto.indexOf("trackLeadSubmission(");
    /*
     * As guardas não são decoração. Sem elas, um arquivo que PERDEU o POST
     * devolve -1 aqui, e `-1 < 50` é verdadeiro: a asserção fica verde
     * exatamente no caso que ela existe para gritar.
     */
    expect(post, "o POST para /api/leads sumiu do componente").toBeGreaterThan(-1);
    expect(conversao, "a chamada de conversão sumiu do componente").toBeGreaterThan(-1);
    expect(post).toBeLessThan(conversao);
  });
});
