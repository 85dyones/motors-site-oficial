import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { CABECALHOS_DO_LINK, CABECALHOS_DO_RELATORIO, escapar, relatorioEmHtml, type RelatorioDeDocumento } from "../src/lib/relatorioDeDocumento";
import * as linkDoRelatorio from "../src/lib/linkDoRelatorio";

const { CAMINHO_DO_LINK, gerarTokenDoLink, hashDoToken, tokenTemForma } = linkDoRelatorio;

/**
 * O relatório de CPF e CNPJ como página, e o link que o consultor manda
 * (18/10/2026).
 *
 * O relatório é texto de terceiros (o fornecedor) com dado pessoal dentro, e
 * o link abre sem login. O que estes testes seguram:
 *  - tudo que veio do fornecedor sai escapado — titular, linhas, células,
 *    títulos e o "não veio";
 *  - a página é fechada: sem script de fora, sem GTM, sem Pixel, sem aviso de
 *    cookies, com cabeçalhos de não guardar e não indexar;
 *  - o token do link: forma fixa (o que não tem a forma nem chega ao banco) e
 *    o hash sha256.
 *
 * A rota pública `/relatorio/[token]` (GET = porta sem dados, POST = abre)
 * está em `relatorio-compartilhado-rota.test.ts`.
 */

const HOSTIL = `<script>alert("x")</script>`;
const ATRIBUTO = `"><img src=x onerror=alert(1)>`;

const RELATORIO: RelatorioDeDocumento = {
  tipo: "cpf",
  documento: "123.456.789-09",
  titular: `JOAO ${HOSTIL}`,
  nivel: "Completo integral",
  geradoEm: "2026-10-18T15:30:00.000Z",
  homologacao: false,
  resumo: [
    { rotulo: "Decisão do bureau", valor: `NÃO RECOMENDADA ${ATRIBUTO}`, estado: "impeditivo" },
    { rotulo: "Score", valor: null },
  ],
  secoes: [
    {
      titulo: `Cadastro ${HOSTIL}`,
      origem: `CPF Dados ${ATRIBUTO}`,
      linhas: [
        { rotulo: `Nome ${ATRIBUTO}`, valor: `<b>negrito</b> & 'aspas'` },
        { rotulo: "Vazio", valor: "   " },
      ],
      tabelas: [
        { titulo: `Processos ${HOSTIL}`, colunas: [`Tribunal ${ATRIBUTO}`, "Número"], linhas: [[`<iframe src="//mal.example">`, null]] },
        { titulo: "Ações cíveis", colunas: ["Registro"], linhas: [] },
      ],
    },
  ],
  faltou: [{ produto: `Plus PF ${HOSTIL}`, motivo: `a APIBrasil recusou: ${ATRIBUTO}` }],
};

/** O HTML sem o que é nosso (o botão de imprimir), para procurar o que veio de fora. */
const html = (r: RelatorioDeDocumento = RELATORIO, opcoes = { rodape: `Rodapé ${HOSTIL}`, imprimir: false }) => relatorioEmHtml(r, opcoes);

describe("escapar", () => {
  it("troca os cinco caracteres que quebram HTML, e o & primeiro não é escapado duas vezes", () => {
    expect(escapar(`<a href="x" title='y'>&amp;</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;amp;&lt;/a&gt;");
    expect(escapar("texto comum, com acentuação")).toBe("texto comum, com acentuação");
  });
});

describe("relatorioEmHtml: o que veio do fornecedor sai escapado", () => {
  it("nenhum script, img, iframe ou atributo de evento do fornecedor sobrevive como marcação", () => {
    const pagina = html();
    expect(pagina).not.toMatch(/<script/i);
    expect(pagina).not.toMatch(/<img/i);
    expect(pagina).not.toMatch(/<iframe/i);
    expect(pagina).not.toMatch(/<b>/);
    expect(pagina).not.toMatch(/<[^>]*\sonerror=/i);
  });

  it("titular, resumo, títulos, origem, rótulos, células, colunas, 'não veio' e rodapé chegam escapados, como texto", () => {
    const pagina = html();
    const script = "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;";
    const img = "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;";
    expect(pagina).toContain(`<p class="titular">JOAO ${script}</p>`);
    expect(pagina).toContain(`NÃO RECOMENDADA ${img}`);
    expect(pagina).toContain(`<h2>Cadastro ${script} <small>· CPF Dados ${img}</small></h2>`);
    expect(pagina).toContain(`<th scope="row">Nome ${img}</th>`);
    expect(pagina).toContain("&lt;b&gt;negrito&lt;/b&gt; &amp; &#39;aspas&#39;");
    expect(pagina).toContain(`<caption>Processos ${script}</caption>`);
    expect(pagina).toContain(`<th scope="col">Tribunal ${img}</th>`);
    expect(pagina).toContain("<td>&lt;iframe src=&quot;//mal.example&quot;&gt;</td>");
    expect(pagina).toContain(`<li><strong>Plus PF ${script}</strong>: a APIBrasil recusou: ${img}</li>`);
    expect(pagina).toContain(`<footer>Rodapé ${script}</footer>`);
    // O título é genérico: é o que aparece na aba e na pré-visualização de quem recebe o link.
    expect(pagina).toContain("<title>Relatório confidencial — Motors Store</title>");
    expect(pagina).not.toMatch(/<title>[^<]*123\.456/);
  });

  it("valor nulo ou em branco aparece como 'não informado', e tabela sem linha diz 'nenhum registro'", () => {
    const pagina = html();
    expect(pagina).toContain('<th scope="row">Score</th><td><span class="vazio">não informado</span></td>');
    expect(pagina).toContain('<th scope="row">Vazio</th><td><span class="vazio">não informado</span></td>');
    expect(pagina).toContain("<strong>Ações cíveis:</strong> nenhum registro.");
  });

  it("o estado do item vai com sinal e cor, e o que não tem estado não ganha sinal", () => {
    const pagina = html();
    expect(pagina).toMatch(/<span class="sinal" style="color:#c62828" aria-hidden="true">✖<\/span> NÃO RECOMENDADA/);
    expect(pagina).toContain('<th scope="row">Score</th><td><span class="vazio">');
  });

  it("em homologação vem a faixa de MODO DE TESTE; fora dela, não", () => {
    expect(html({ ...RELATORIO, homologacao: true })).toContain("MODO DE TESTE DO FORNECEDOR");
    expect(html()).not.toContain("MODO DE TESTE");
  });

  it("o botão de imprimir só aparece com imprimir:true, e é o único script da página (inline, sem origem externa)", () => {
    expect(html(RELATORIO, { rodape: "r", imprimir: false })).not.toContain("window.print");
    const comBotao = html(RELATORIO, { rodape: "r", imprimir: true });
    expect(comBotao).toContain('<button type="button" class="imprimir" onclick="window.print()">Imprimir / salvar PDF</button>');
    expect(comBotao.match(/onclick=/g)).toHaveLength(1);
    expect(comBotao).not.toMatch(/<script/i);
  });

  it("a página é fechada: sem fonte, script ou imagem de fora, sem rastreador e com noindex", () => {
    const pagina = html(RELATORIO, { rodape: "r", imprimir: true });
    expect(pagina).not.toMatch(/(src|href)=["']?(https?:)?\/\//i);
    expect(pagina).not.toMatch(/googletagmanager|gtag\(|dataLayer|fbq\(|connect\.facebook|pixel|cookie/i);
    expect(pagina).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
    expect(pagina).toContain('<meta name="referrer" content="no-referrer">');
    expect(pagina.startsWith("<!doctype html>")).toBe(true);
  });

  it("CNPJ leva 'Consulta de CNPJ' no título, e relatório sem titular não desenha a linha vazia", () => {
    const pagina = html({ ...RELATORIO, tipo: "cnpj", documento: "11.222.333/0001-81", titular: null });
    expect(pagina).toContain("<h1>Consulta de CNPJ · 11.222.333/0001-81</h1>");
    expect(pagina).not.toContain('class="titular"');
  });
});

describe("os cabeçalhos de toda resposta com o relatório", () => {
  it("painel e link: não guarda, não indexa, não manda referência, e a CSP não deixa nada de fora carregar", () => {
    for (const [nome, c] of [
      ["painel", CABECALHOS_DO_RELATORIO],
      ["link", CABECALHOS_DO_LINK],
    ] as const) {
      expect(c["Content-Type"], nome).toBe("text/html; charset=utf-8");
      expect(c["Cache-Control"], nome).toBe("private, no-store");
      expect(c["X-Robots-Tag"], nome).toBe("noindex, nofollow, noarchive");
      expect(c["Referrer-Policy"], nome).toBe("no-referrer");
      expect(c["X-Content-Type-Options"], nome).toBe("nosniff");
      const csp = c["Content-Security-Policy"];
      expect(csp, nome).toContain("default-src 'none'");
      expect(csp, nome).toContain("base-uri 'none'");
      expect(csp, nome).not.toMatch(/https?:|\*/);
    }
  });

  it("o painel emoldura só a si mesmo e não tem formulário; o link não é emoldurado por ninguém e só posta para si", () => {
    expect(CABECALHOS_DO_RELATORIO["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(CABECALHOS_DO_RELATORIO["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
    expect(CABECALHOS_DO_RELATORIO["Content-Security-Policy"]).toContain("form-action 'none'");
    expect(CABECALHOS_DO_LINK["X-Frame-Options"]).toBe("DENY");
    expect(CABECALHOS_DO_LINK["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(CABECALHOS_DO_LINK["Content-Security-Policy"]).toContain("form-action 'self'");
  });
});

describe("o token do link", () => {
  it("tem 32 bytes aleatórios em base64url (43 caracteres), e dois nunca saem iguais", () => {
    const tokens = new Set(Array.from({ length: 50 }, gerarTokenDoLink));
    expect(tokens.size).toBe(50);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(t, "base64url")).toHaveLength(32);
      expect(tokenTemForma(t)).toBe(true);
    }
  });

  it("o hash é o sha256 em hex, e é dele que o banco sabe", () => {
    const t = gerarTokenDoLink();
    expect(hashDoToken(t)).toBe(createHash("sha256").update(t).digest("hex"));
    expect(hashDoToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoToken(t)).not.toContain(t);
  });

  it("forma errada não é token: curto, longo, com barra, ponto, espaço, %, ou um uuid", () => {
    for (const t of ["", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}/`, `${"A".repeat(42)}.`, `${"A".repeat(42)} `, `${"A".repeat(40)}%2F`, "0f8fad5b-d9cb-469f-a165-70867728950e", "../../etc/passwd"]) {
      expect(tokenTemForma(t), JSON.stringify(t)).toBe(false);
    }
  });

  it("o link mora em /relatorio, e a validade não é número do código (vem de parametros_consulta_documento.dias_do_link)", () => {
    expect(CAMINHO_DO_LINK).toBe("/relatorio");
    expect(Object.keys(linkDoRelatorio)).not.toContain("DIAS_DO_LINK");
  });
});

describe("o script único do botão de imprimir (revisão de 18/10/2026)", () => {
  it("a CSP libera só o hash do onclick do botão, e nenhum 'unsafe-inline' de script", async () => {
    const { createHash } = await import("node:crypto");
    const { SCRIPT_DO_BOTAO, CABECALHOS_DO_RELATORIO: painel, CABECALHOS_DO_LINK: link } = await import("../src/lib/relatorioDeDocumento");
    const hash = createHash("sha256").update(SCRIPT_DO_BOTAO).digest("base64");
    for (const c of [painel, link]) {
      expect(c["Content-Security-Policy"]).toContain(`'sha256-${hash}'`);
      expect(c["Content-Security-Policy"]).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    }
    expect(link["X-Frame-Options"]).toBe("DENY");
    expect(link["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(link["Content-Security-Policy"]).toContain("form-action 'self'");
  });
});
