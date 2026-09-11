import { describe, it, expect, vi } from "vitest";
import { lerCodigo } from "./fonte";
import {
  montarEvento,
  criarCapturador,
  enviarPorBeacon,
  armar,
  type ContextoDoNavegador,
} from "../src/lib/observabilidade-cliente";

/**
 * A captura do navegador — a camada onde a conversão vive.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo existe para impedir
 * ---------------------------------------------------------------------------
 *  1. **Que o capturador envolva um global.** É a regra que manda no desenho
 *     todo, e ela tem dono: o Turnstile observa o ambiente da página, e quando
 *     alguém troca `fetch`, `XMLHttpRequest` ou `console`, o desafio DESISTE —
 *     sem erro, sem log, com o botão do formulário eternamente desabilitado.
 *     Um SDK comercial faz exatamente isso para montar breadcrumbs.
 *  2. **Que o relato de erro derrube quem estava navegando.** `enviar`
 *     lançando não pode propagar: seria a observabilidade custando o lead que
 *     ela existe para proteger.
 *  3. **Que a fila encha de erro que não é nosso.** Extensão de navegador e
 *     script de terceiro erram o tempo todo. Relatá-los gasta cota, esconde o
 *     defeito real e ensina a pessoa a ignorar a fila.
 *  4. **Que PII entre de carona.** A query da URL é onde moram utm, telefone e
 *     token.
 */

const CTX: ContextoDoNavegador = {
  url: "https://motorsstore.com.br/estoque?telefone=5541999998888&utm_source=meta",
  navegador: "Mozilla/5.0 (Windows NT 10.0)",
  release: "d70e2e3",
  cookie: "ag_uid=ag-abc123; outro=x",
};

describe("o que é nosso para relatar", () => {
  it("erro do nosso código passa", () => {
    const ev = montarEvento(
      { tipo: "erro", mensagem: "TypeError: x is not a function", arquivo: "/_next/static/chunks/app.js" },
      CTX,
    );
    expect(ev).not.toBeNull();
    expect(ev!.mensagem).toBe("TypeError: x is not a function");
  });

  it.each([
    ["Turnstile", "https://challenges.cloudflare.com/turnstile/v0/api.js"],
    ["Pixel do Meta", "https://connect.facebook.net/en_US/fbevents.js"],
    ["GTM", "https://www.googletagmanager.com/gtm.js"],
    ["extensão do Chrome", "chrome-extension://abcdef/inject.js"],
    ["extensão do Firefox", "moz-extension://abcdef/inject.js"],
  ])("erro vindo de %s é descartado", (_nome, arquivo) => {
    expect(montarEvento({ tipo: "erro", mensagem: "qualquer coisa", arquivo }, CTX)).toBeNull();
  });

  it("descarta pelo STACK quando o arquivo não veio", () => {
    /* Erro de script de terceiro nem sempre traz `filename`. Filtrar só por
       arquivo deixaria passar justamente o caso mais comum. */
    expect(
      montarEvento(
        {
          tipo: "erro",
          mensagem: "algo do pixel",
          arquivo: null,
          stack: "at f (https://connect.facebook.net/en_US/fbevents.js:1:1)",
        },
        CTX,
      ),
    ).toBeNull();
  });

  it.each(["ResizeObserver loop completed with undelivered notifications.", "Script error."])(
    "ruído conhecido de navegador é descartado: %s",
    (mensagem) => {
      expect(montarEvento({ tipo: "erro", mensagem, arquivo: "/app.js" }, CTX)).toBeNull();
    },
  );

  it("mensagem vazia não vira linha", () => {
    expect(montarEvento({ tipo: "erro", mensagem: "   ", arquivo: "/app.js" }, CTX)).toBeNull();
  });

  it("stack com `<anonymous>` NÃO é descartado", () => {
    /* Regressão de 2026-09-10: `anonymous` esteve na lista de origens de fora,
       para pegar script injetado. Só que `at Object.<anonymous>` é quadro
       LEGÍTIMO de stack, no navegador e no Node — e o filtro passou a engolir
       erro nosso sem deixar nem a contagem.

       A régua: filtro de menos gasta cota; filtro de mais esconde o defeito.
       Na dúvida, relatar. */
    const ev = montarEvento(
      {
        tipo: "erro",
        mensagem: "TypeError: nosso mesmo",
        arquivo: "/_next/static/chunks/app.js",
        stack: "TypeError: nosso mesmo\n    at Object.<anonymous> (/_next/static/chunks/app.js:2:9)",
      },
      CTX,
    );
    expect(ev, "erro nosso foi descartado por um filtro largo demais").not.toBeNull();
  });
});

describe("o que o evento carrega", () => {
  it("a query da url é cortada — utm e telefone não entram", () => {
    const ev = montarEvento({ tipo: "erro", mensagem: "x", arquivo: "/app.js" }, CTX)!;
    expect(ev.url).toBe("https://motorsstore.com.br/estoque");
    expect(JSON.stringify(ev)).not.toContain("5541999998888");
  });

  it("lê o ag_uid do cookie NA HORA do erro", () => {
    /* O visitante pode virar lead no meio da sessão. Guardar o valor na
       montagem do capturador perderia justamente o elo do caso interessante. */
    const ev = montarEvento({ tipo: "erro", mensagem: "x", arquivo: "/app.js" }, CTX)!;
    expect(ev.ag_uid).toBe("ag-abc123");

    const semLead = montarEvento(
      { tipo: "erro", mensagem: "x", arquivo: "/app.js" },
      { ...CTX, cookie: "outro=x" },
    )!;
    expect(semLead.ag_uid).toBeNull();
  });

  it("trunca mensagem, stack, url e navegador", () => {
    const ev = montarEvento(
      {
        tipo: "erro",
        mensagem: "m".repeat(2000),
        stack: "s".repeat(9000),
        arquivo: "/app.js",
      },
      { ...CTX, url: "https://motorsstore.com.br/" + "u".repeat(2000), navegador: "n".repeat(1000) },
    )!;
    expect(ev.mensagem.length).toBe(500);
    expect(ev.stack!.length).toBe(4000);
    expect(ev.url.length).toBe(500);
    expect(ev.navegador.length).toBe(300);
  });
});

describe("o capturador", () => {
  function capturadorDeTeste(teto?: number) {
    const enviados: string[] = [];
    const cap = criarCapturador({
      enviar: (corpo) => void enviados.push(corpo),
      ctx: () => CTX,
      tetoPorSessao: teto,
    });
    return { cap, enviados };
  }

  it("o mesmo erro duas vezes vira um relato", () => {
    const { cap, enviados } = capturadorDeTeste();
    const bruto = { tipo: "erro" as const, mensagem: "TypeError: x", stack: "a\nat f (/app.js)", arquivo: "/app.js" };

    cap.capturar(bruto);
    cap.capturar(bruto);

    expect(enviados).toHaveLength(1);
  });

  it("respeita o teto por sessão", () => {
    const { cap, enviados } = capturadorDeTeste(3);
    for (let i = 0; i < 10; i++) {
      cap.capturar({ tipo: "erro", mensagem: `erro ${i}`, arquivo: "/app.js" });
    }
    expect(enviados).toHaveLength(3);
  });

  it("`enviar` lançando NÃO propaga — o lead não paga pela observabilidade", () => {
    const cap = criarCapturador({
      enviar: () => {
        throw new Error("beacon recusou");
      },
      ctx: () => CTX,
    });

    expect(() => cap.capturar({ tipo: "erro", mensagem: "x", arquivo: "/app.js" })).not.toThrow();
  });

  it("`aoErro` lê o Error do evento, com stack", () => {
    const { cap, enviados } = capturadorDeTeste();
    cap.aoErro({ message: "ignorado", filename: "/app.js", error: new Error("de verdade") });

    const ev = JSON.parse(enviados[0]);
    expect(ev.mensagem).toBe("Error: de verdade");
    expect(ev.stack).toContain("Error: de verdade");
    expect(ev.tipo).toBe("erro");
  });

  it("`aoRejeicao` cobre promessa sem catch", () => {
    const { cap, enviados } = capturadorDeTeste();
    cap.aoRejeicao({ reason: new Error("promessa solta") });

    const ev = JSON.parse(enviados[0]);
    expect(ev.mensagem).toBe("Error: promessa solta");
    expect(ev.tipo).toBe("rejeicao");
  });
});

describe("os ouvintes", () => {
  it("arma os dois e desarma os dois", () => {
    const registrados: string[] = [];
    const removidos: string[] = [];
    const janela = {
      addEventListener: (t: string) => void registrados.push(t),
      removeEventListener: (t: string) => void removidos.push(t),
    };

    const cap = criarCapturador({ enviar: () => {}, ctx: () => CTX });
    const desarmar = armar(janela, cap);

    expect(registrados).toEqual(["error", "unhandledrejection"]);
    desarmar();
    expect(removidos).toEqual(["error", "unhandledrejection"]);
  });
});

describe("o envio", () => {
  it("prefere o sendBeacon, com o corpo em STRING", () => {
    /* String vai como `text/plain;charset=UTF-8`, que é CORS-safelisted. Blob
       de `application/json` não é, e o Chrome já bloqueou esse caminho. */
    // Tipado com os dois parâmetros: sem isso `mock.calls[0]` é a tupla vazia
    // e a asserção do TIPO do corpo — que é o ponto deste teste — não compila.
    const sendBeacon = vi.fn((_url: string, _corpo?: BodyInit | null) => true);
    const buscar = vi.fn();

    enviarPorBeacon('{"a":1}', { navigator: { sendBeacon }, fetch: buscar as unknown as typeof fetch });

    expect(sendBeacon).toHaveBeenCalledWith("/api/erros", '{"a":1}');
    expect(typeof sendBeacon.mock.calls[0][1]).toBe("string");
    expect(buscar, "o fetch correu junto — seriam dois relatos").not.toHaveBeenCalled();
  });

  it("sem sendBeacon, cai para fetch com keepalive", () => {
    /* `keepalive` é o que faz a requisição sobreviver à navegação — e o erro
       costuma acontecer justamente quando a pessoa está saindo. */
    const buscar = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

    enviarPorBeacon('{"a":1}', { navigator: undefined, fetch: buscar as unknown as typeof fetch });

    expect(buscar).toHaveBeenCalledTimes(1);
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/erros");
    expect(init.keepalive).toBe(true);
    expect(JSON.stringify(init.headers)).toContain("text/plain");
  });

  it("sendBeacon recusando o corpo cai para o fetch", () => {
    // O navegador recusa beacon por cota ou tamanho — devolvendo `false`.
    const buscar = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

    enviarPorBeacon("x", {
      navigator: { sendBeacon: () => false },
      fetch: buscar as unknown as typeof fetch,
    });

    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("sem navigator e sem fetch, não lança", () => {
    expect(() => enviarPorBeacon("x", { navigator: undefined, fetch: undefined })).not.toThrow();
  });
});

describe("a fiação — quem arma a captura, e quando", () => {
  /**
   * A trava que faltava, e a ausência dela custou uma regressão.
   *
   * Até 11/09 a captura era montada por um `useEffect` de `<CapturaDeErros>`,
   * dentro do layout raiz. NENHUM teste importava esse componente, nem
   * `error.tsx`, nem `global-error.tsx` — apagar o efeito deixava os 2727
   * testes verdes. E foi assim que passou o defeito:
   *
   *   `global-error.tsx` SUBSTITUI o layout raiz. O React destrói a subárvore
   *   onde o componente morava e roda a limpeza dela — que zerava o capturador
   *   — antes de montar o fallback. A ponte caía num no-op exatamente no
   *   cenário para o qual ela existe.
   *
   * Testar a biblioteca e não testar a fiação é o buraco que estes `it`
   * fecham. O que se afirma aqui é o COMPORTAMENTO depois da montagem, não o
   * texto do arquivo.
   */

  function comoNavegador() {
    const ouvintes: string[] = [];
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as { addEventListener?: unknown }).addEventListener = (t: string) =>
      void ouvintes.push(t);
    (globalThis as { removeEventListener?: unknown }).removeEventListener = () => {};
    (globalThis as { location?: unknown }).location = { href: "https://motorsstore.com.br/estoque" };
    (globalThis as { document?: unknown }).document = { cookie: "ag_uid=ag-1" };
    return ouvintes;
  }

  function limparNavegador() {
    for (const k of ["window", "addEventListener", "removeEventListener", "location", "document"]) {
      delete (globalThis as Record<string, unknown>)[k];
    }
  }

  it("`instrumentation-client` arma os ouvintes ao ser CARREGADO", async () => {
    /* Não é um componente: o Next exige este módulo em `app-next.js:10`, antes
       do `appBootstrap`. O efeito colateral acontece no import. */
    const ouvintes = comoNavegador();
    try {
      vi.resetModules();
      await import("../src/instrumentation-client");
      expect(ouvintes).toEqual(["error", "unhandledrejection"]);
    } finally {
      limparNavegador();
    }
  });

  it("depois de carregado, a ponte dos boundaries REPORTA", async () => {
    /* A regressão em uma linha: `capturarErroDeBoundary` é no-op enquanto
       ninguém tiver chamado `configurar`. Com a montagem num componente do
       layout raiz, no cenário do `global-error` ninguém tinha. */
    comoNavegador();
    /* Medido pelo caminho do `fetch`, e não do `sendBeacon`: no Node 24
       `globalThis.navigator` existe e IGNORA atribuição — só tem getter. Um
       teste que tentasse dublá-lo por cima ficaria verde medindo o navegador
       do Node. O `enviarPorBeacon` cai para o `fetch` quando não há
       `sendBeacon`, que é justamente o caso aqui. */
    const chamou = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    try {
      vi.resetModules();
      await import("../src/instrumentation-client");
      const { capturarErroDeBoundary } = await import("../src/lib/observabilidade-cliente");

      capturarErroDeBoundary(
        Object.assign(new Error("a raiz quebrou"), { digest: "123@E61" }),
        "global-error",
      );

      expect(chamou, "o boundary chamou a ponte e nada saiu").toHaveBeenCalledTimes(1);
      const [url, init] = chamou.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("/api/erros");
      const evento = JSON.parse(String(init.body));
      expect(evento.tipo).toBe("boundary");
      expect(evento.digest).toBe("123@E61");
    } finally {
      chamou.mockRestore();
      limparNavegador();
    }
  });

  it("o módulo NUNCA propaga erro — a hidratação depende disso", async () => {
    /* O Next faz `require` cru deste módulo (`lib/require-instrumentation-client.js`),
       sem `try` em volta, ANTES do `hydrate`. Se ele lançar, a página fica
       servida e morta — e numa página morta o formulário de lead não envia. */
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as { addEventListener?: unknown }).addEventListener = () => {
      throw new Error("o navegador recusou o ouvinte");
    };
    try {
      vi.resetModules();
      await expect(import("../src/instrumentation-client")).resolves.toBeDefined();
    } finally {
      limparNavegador();
    }
  });

  it("os dois boundaries chamam a ponte", () => {
    /* Trava de fonte, e ela é o complemento do comportamento acima: garante
       que os arquivos que o Next monta como fallback de fato chamam a ponte.
       Sem isto, a captura existe e ninguém a aciona. */
    for (const arquivo of ["src/app/error.tsx", "src/app/global-error.tsx"]) {
      const fonte = lerCodigo(arquivo);
      expect(fonte, `${arquivo} não relata o erro que exibe`).toContain(
        "capturarErroDeBoundary(",
      );
      expect(fonte, `${arquivo} precisa do efeito para relatar`).toContain("useEffect(");
    }
  });

  it("a montagem não voltou para dentro da árvore React", () => {
    /* `src/components/CapturaDeErros.tsx` foi removido em 11/09. Recriá-lo e
       montá-lo no layout reintroduz os dois buracos: a janela pré-hidratação e
       o `global-error` mudo. */
    expect(lerCodigo("src/app/layout.tsx")).not.toContain("CapturaDeErros");
    expect(lerCodigo("src/instrumentation-client.ts")).toContain("configurar(");
  });
});

describe("a regra que manda no desenho", () => {
  const fonte = lerCodigo("src/lib/observabilidade-cliente.ts");

  it("NENHUM global é envolvido", () => {
    /* O Turnstile observa o ambiente da página. Trocar `fetch`, `console` ou
       `XMLHttpRequest` faz a Cloudflare desistir do desafio — sem erro, sem
       log, com o botão do formulário eternamente desabilitado. É o que um SDK
       comercial faz para montar breadcrumbs, e é o que aqui não se faz. */
    for (const proibido of [
      "window.fetch =",
      "globalThis.fetch =",
      "console.error =",
      "console.log =",
      "XMLHttpRequest.prototype",
      "Object.defineProperty(window",
      "Object.defineProperty(globalThis",
      "new Proxy(",
    ]) {
      expect(fonte, `envolveu um global: ${proibido}`).not.toContain(proibido);
    }
  });

  it("não importa nada do servidor", () => {
    for (const proibido of ['"./supabase', '"./observabilidade"', "@supabase", '"next/']) {
      expect(fonte, `importou ${proibido}, que não pertence ao navegador`).not.toContain(proibido);
    }
  });
});
