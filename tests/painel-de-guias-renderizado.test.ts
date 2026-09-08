import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NOME_DA_SECAO } from "../src/lib/guias";
import { salvarCabecalho } from "../src/lib/salvarCabecalho";

/**
 * A tela `/admin/guias`, renderizada de verdade.
 *
 * Nasce de um achado que é o inverso exato do da véspera. Ali a trava olhava o
 * DADO e não o USO, e uma linha apagava o link de `/guias` do RODAPÉ com a
 * suíte verde — o rodapé, e não o cabeçalho: o item de menu é de outro branch.
 * Aqui havia trava para tudo que o SITE renderiza — página, grafo,
 * sitemap, rota de escrita — e nenhuma para a TELA. A revisão apagou as 70
 * linhas do bloco "Cabeçalho da seção", que é literalmente a entrega que o dono
 * pediu, e mediu: **129 arquivos, 2229 testes, todos verdes**, e `tsc` exit 0
 * de quebra, porque não há `noUnusedLocals` no `tsconfig` e os símbolos órfãos
 * não incomodam ninguém.
 *
 * O precedente de ferramental já existia e eu não tinha usado:
 * `tests/fotos-do-veiculo.test.ts:530` renderiza o client component
 * `EditorDeVeiculo` com `renderToStaticMarkup`, e anota que "sem jsdom no
 * projeto, `renderToStaticMarkup` executa hooks".
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo NÃO alcança, dito antes que perguntem
 * ---------------------------------------------------------------------------
 * `renderToStaticMarkup` produz TEXTO: `onClick` não aparece, e o estado
 * inicial da tela (`carregando = true`) desabilita os botões de qualquer jeito.
 * Este arquivo cobre o que ESTÁ no HTML servido — o bloco, os campos, as
 * frases de contrato — e a lógica do salvamento, que mora em
 * `lib/salvarCabecalho.ts`.
 *
 * A FIAÇÃO — o `onClick`, o `setCabecalhoLido`, a carga preenchendo os campos —
 * é assunto de `tests/painel-de-guias-fiacao.test.ts`, que monta a tela em
 * `jsdom` e clica de verdade. Ela ficou descoberta por quatro rodadas de
 * revisão, e era onde morava o clique que, no desenho antigo, apagava o texto
 * do dono.
 *
 * Também não aparece aqui o `placeholder` com o texto padrão: ele vem do
 * `fetch` do `useEffect`, que não roda no servidor.
 *
 * A trava que impede gravar por cima do que está no ar tem, hoje, testemunha
 * nas três camadas: a decisão em `podeSalvarCabecalho`
 * (`carga-do-painel-de-guias.test.ts`), o `disabled` servido
 * (`cabecalho-da-secao-na-tela.test.ts`) e a fiação que liga uma coisa à outra
 * (`painel-de-guias-fiacao.test.ts`). Cada camada ficou verde sozinha em
 * alguma rodada — foi preciso as três.
 */

async function tela(): Promise<string> {
  const { default: EditorDeGuias } = await import("../src/components/admin/EditorDeGuias");
  return renderToStaticMarkup(createElement(EditorDeGuias, {}));
}

/** O texto visível, sem tags, colapsado. */
function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("a tela nomeia a seção que edita", () => {
  it("o título é o nome da seção, e sai da mesma constante do site", async () => {
    expect(texto(await tela())).toContain(NOME_DA_SECAO);
  });
});

describe("o bloco do cabeçalho da seção chega à tela", () => {
  it("tem o bloco, com os dois campos e os dois botões", async () => {
    const html = await tela();
    const visivel = texto(html);

    // Cada item aqui é uma peça da entrega. Apagar o bloco derruba todos de
    // uma vez; apagar um campo derruba o dele.
    expect(visivel).toContain("Cabeçalho da seção");
    expect(visivel).toContain("Título da aba e da busca");
    expect(visivel).toContain("Parágrafo de abertura");
    expect(visivel).toContain("Salvar cabeçalho");
    expect(visivel).toContain("Voltar ao padrão");

    // Um campo de linha para o título e um de várias para o parágrafo — a
    // diferença não é estética: parágrafo de 155 caracteres não se escreve
    // confortavelmente num `<input>`.
    expect(html).toMatch(/<input[^>]*maxlength="300"/i);
    expect(html).toMatch(/<textarea[^>]*maxlength="300"/i);
  });

  it("diz o que salvar faz, e o que esvaziar um campo faz", async () => {
    // É o contrato da tela numa frase, e ele mudou em 07/09. “Campo vazio volta
    // ao padrão” descrevia o desenho antigo, em que a requisição levava sempre
    // os dois campos. Hoje viaja só o que a pessoa mudou, e é preciso dizer
    // isso — senão quem vê os campos em branco depois de uma falha de leitura
    // conclui que salvar vai apagar o site.
    const html = texto(await tela());
    expect(html).toContain("Salvar manda só os campos que você mudou");
    expect(html).toContain("esvaziar um campo e salvar devolve aquele campo ao texto padrão");
  });

  it("avisa que o sufixo da loja é da página, não do campo", async () => {
    expect(texto(await tela())).toContain("| Motors Store");
  });

  it("mostra o contador da régua da busca", async () => {
    // Contador, e não bloqueio — quem decide o texto é quem escreve. Começa em
    // zero porque o `fetch` que carrega o gravado só roda no navegador.
    expect(texto(await tela())).toContain("0/155 caracteres");
  });

  it("diz onde o parágrafo aparece, e são quatro lugares", async () => {
    const visivel = texto(await tela());

    // A frase existe porque a consequência não é óbvia: editar aqui mexe na
    // busca e no card do WhatsApp, não só no topo da página.
    expect(visivel).toContain("sob o título da página");
    expect(visivel).toContain("no resultado do Google");
    expect(visivel).toContain("no card do WhatsApp");
  });
});

/**
 * O salvamento, que é o comportamento que o render não alcança.
 *
 * `onClick` não aparece em markup estático, então a ligação botão→função fica
 * descoberta. O que NÃO precisa ficar é o que a função faz — e é isso que este
 * bloco cobre: para onde ela manda, o que devolve à tela, e como distingue os
 * dois desfechos que confundem quem edita ("salvei o seu texto" contra
 * "devolvi ao automático").
 */
describe("o salvamento do cabeçalho", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  function respondendo(corpo: unknown, ok = true) {
    const espia = vi.fn(async () => ({ ok, json: async () => corpo }) as never);
    globalThis.fetch = espia as never;
    return espia;
  }

  it("manda PUT com EXATAMENTE o que recebeu, e nada além", async () => {
    // O corpo é o diff, montado por `camposAlterados`. Acrescentar campo aqui
    // desfaria o desenho: chave presente significa "escreva nesta coluna".
    const espia = respondendo({ cabecalho: { titulo_seo: null, resumo: "R" } });
    await salvarCabecalho({ resumo: "R" });

    const [url, opcoes] = espia.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/guias/secao");
    expect(opcoes.method).toBe("PUT");
    expect(JSON.parse(String(opcoes.body))).toEqual({ resumo: "R" });
  });

  it("devolve à tela o que o servidor gravou, e não o que foi digitado", async () => {
    // O servidor corta no teto e o gatilho normaliza vazio. Devolver o digitado
    // deixaria a tela mostrando um texto que o banco não tem.
    respondendo({ cabecalho: { titulo_seo: "cortado", resumo: null } });
    const r = await salvarCabecalho({ tituloSeo: "muito longo", resumo: "" });

    expect(r.ok && r.cabecalho).toEqual({ tituloSeo: "cortado", resumo: "" });
  });

  it("a mensagem diz em que estado a seção ficou", async () => {
    // Sem os dois textos, quem esvazia os campos fica sem saber se apagou o
    // conteúdo do site ou se a seção voltou ao automático. A frase não promete
    // que APAGOU o override — quem faz isso é o DELETE, com botão próprio.
    respondendo({ cabecalho: { titulo_seo: null, resumo: null } });
    const vazio = await salvarCabecalho({ tituloSeo: "", resumo: "" });
    expect(vazio.ok && vazio.texto).toContain("no texto padrão");

    respondendo({ cabecalho: { titulo_seo: null, resumo: "Tem texto." } });
    const cheio = await salvarCabecalho({ resumo: "Tem texto." });
    expect(cheio.ok && cheio.texto).toContain("Cabeçalho salvo");
  });

  it("passa adiante o aviso da régua da busca", async () => {
    respondendo({ cabecalho: { titulo_seo: null, resumo: "x" }, avisos: ["passou de 155"] });
    const r = await salvarCabecalho({ tituloSeo: "", resumo: "x" });

    expect(r.ok && r.avisos).toEqual(["passou de 155"]);
  });

  it("erro do servidor vira frase, e não exceção", async () => {
    respondendo({ error: "Sem permissão" }, false);
    const r = await salvarCabecalho({ tituloSeo: "", resumo: "x" });

    expect(r.ok).toBe(false);
    expect(!r.ok && r.texto).toBe("Sem permissão");
  });

  it("rede caída também vira frase", async () => {
    // Sem isto a exceção sobe e deixa a tela em branco no meio de uma edição.
    globalThis.fetch = (async () => {
      throw new Error("Failed to fetch");
    }) as never;
    const r = await salvarCabecalho({ tituloSeo: "", resumo: "x" });

    expect(r.ok).toBe(false);
    expect(!r.ok && r.texto).toBe("Failed to fetch");
  });

  it.each([
    ["corpo ilegível", {}],
    ["200 sem o campo cabecalho", { avisos: [] }],
  ])("%s: grava mas NÃO afirma o que ficou, e exige recarga", async (_caso, corpo) => {
    // A última porta de apagamento que a revisão achou, e a mais sutil: o PUT
    // GRAVOU (foi 200), mas o corpo não diz o quê. Antes, os dois campos caíam
    // para "" e a tela dizia "de volta ao texto padrão" — mentira sobre o que
    // aconteceu —, e o clique seguinte apagaria o texto de verdade.
    //
    // Com o desenho de 07/09 o clique seguinte não apaga mais nada, e a mentira
    // continua sendo mentira: a tela estaria afirmando um estado do banco que
    // ninguém confirmou. Por isso o desfecho é `exigeRecarga`, e não um "salvo"
    // otimista.
    respondendo(corpo);
    const r = await salvarCabecalho({ tituloSeo: "T", resumo: "R" });

    expect(r.ok).toBe(false);
    expect(!r.ok && r.exigeRecarga).toBe(true);
    expect(!r.ok && r.texto).toContain("Recarregue");
    // E não pode dizer que voltou ao padrão: era essa frase que empurrava o
    // operador para o clique destrutivo.
    expect(!r.ok && r.texto).not.toContain("de volta ao texto padrão");
  });

  it("200 com cabeçalho presente continua sendo sucesso", async () => {
    // Controle: a guarda acima não pode ter transformado o caminho feliz em
    // erro. `resumo: null` é o gatilho normalizando vazio, e é legítimo.
    respondendo({ cabecalho: { titulo_seo: null, resumo: null } });
    const r = await salvarCabecalho({ tituloSeo: "", resumo: "" });

    expect(r.ok).toBe(true);
    expect(r.ok && r.texto).toContain("no texto padrão");
  });
});
