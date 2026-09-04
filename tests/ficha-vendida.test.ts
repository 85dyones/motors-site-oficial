import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";
import { decidirPublicacao, resolverDatasDeVenda } from "../src/lib/publicacao";
import { montarTextosDaFicha } from "../src/lib/tituloDaFicha";

/**
 * O ciclo de vida do veículo vendido — as três pontas que não fechavam.
 *
 * ---------------------------------------------------------------------------
 * O que a conferência de 2026-09-03 encontrou
 * ---------------------------------------------------------------------------
 * A máquina de estados estava escrita e correta: carência de 90 dias com a
 * ficha no ar, depois `noindex` e 308 para o hub. O que não funcionava era o
 * RELÓGIO dela, e em três lugares diferentes:
 *
 *   1. `veiculos_vendidos` — a fonte da data — exige `cliente_id`, `chassi` e
 *      `placa`. É o registro de venda do CICLO. O painel, ao marcar "vendido"
 *      na tela de estoque, não tem nada disso e nunca escreveu ali: zero
 *      linhas em 03/09. Sobrava o proxy `last_seen_at`, que funciona para quem
 *      SAI do feed — mas o carro vendido que segue anunciado no RevendaMais é
 *      re-carimbado a cada seis horas, e para ele a carência nunca começa.
 *   2. O SITEMAP decidia por um relógio diferente do da ficha: passava
 *      `dataVenda` e não `ultimaPresenca`. Com a tabela vazia, o `noindex`
 *      dali nunca virava `true` — a URL seguiria listada mesmo depois de a
 *      página passar a responder 308.
 *   3. Enquanto indexável, o `<title>` anunciava o preço, sem a palavra
 *      "Vendido". O snippet do Google oferecia carro que a loja não tem.
 *
 * ---------------------------------------------------------------------------
 * A correção que este arquivo protege
 * ---------------------------------------------------------------------------
 * A data passa a vir também do `historico_veiculo`, que o painel JÁ escrevia
 * em toda mudança de campo — dado que existia e ninguém lia. Sem tabela nova,
 * sem coluna nova.
 */

describe("o relógio da carência", () => {
  const HOJE = new Date("2026-09-04T12:00:00Z");
  const base = { vendido: true, foraDoFeed: false };

  it("a data da venda VENCE a última presença no feed", () => {
    /* O caso que motivou tudo: o carro vendido que continua anunciado no
       RevendaMais. `last_seen_at` é de hoje — o sync acabou de passar — e
       sozinho ele reiniciaria a carência quatro vezes por dia, para sempre. */
    const r = decidirPublicacao({
      ...base,
      dataVenda: "2026-01-01",
      ultimaPresenca: HOJE.toISOString(),
    }, HOJE);

    expect(r.noindex, "a data da venda foi ignorada em favor do carimbo do sync").toBe(true);
    expect(r.arquivar).toBe(true);
  });

  it("sem data de venda, a última presença ainda serve — quem saiu do feed vence a carência", () => {
    // O proxy continua valendo: é o que cobre os vendidos anteriores a esta
    // correção, que não têm linha no histórico.
    const r = decidirPublicacao({
      ...base,
      ultimaPresenca: "2026-01-01T00:00:00Z",
    }, HOJE);

    expect(r.noindex).toBe(true);
  });

  it("dentro da carência fica no ar, indexável e rotulado", () => {
    const r = decidirPublicacao({
      ...base,
      dataVenda: "2026-08-20",
    }, HOJE);

    expect(r.indisponivel).toBe(true);
    expect(r.rotulo).toBe("VENDIDO");
    expect(r.noindex, "saiu do índice antes dos 90 dias").toBe(false);
    expect(r.arquivar).toBe(false);
  });

  it("sem NENHUMA referência de data, a carência não vence", () => {
    /* A regra que faz o módulo errar sempre para o mesmo lado. Manter no
       índice é recuperável; sumir do índice leva semanas para desfazer. */
    const r = decidirPublicacao({ ...base }, HOJE);

    expect(r.noindex).toBe(false);
    expect(r.arquivar).toBe(false);
  });
});

describe("as duas fontes da data de venda", () => {
  const publicacao = lerCodigo("src/lib/publicacao.ts");

  it("lê o histórico do painel ALÉM das vendas do Ciclo", () => {
    /* `veiculos_vendidos` cobre só a venda formalizada, com cliente e
       contrato. A virada da chave no painel — que é o que acontece na maioria
       das vendas hoje — vive em `historico_veiculo`. */
    expect(publicacao).toContain('from("veiculos_vendidos")');
    expect(publicacao).toContain('from("historico_veiculo")');
    expect(publicacao).toContain('.eq("campo", "vendido")');
  });

  it("a RECOMPRA não nasce com a carência vencida", () => {
    /* O contraexemplo que derrubou a precedência por fonte, exercitado de
       verdade: vendido pelo Ciclo em janeiro, recomprado, de volta à vitrine,
       revendido pelo painel em setembro. Se janeiro vencesse, a ficha viraria
       308 no mesmo dia da segunda venda. */
    const r = resolverDatasDeVenda(
      [{ estoque_id: 42, data_venda: "2026-01-10" }],
      [{ veiculo_id: 42, valor_novo: "true", registrado_em: "2026-09-01T10:00:00Z" }]
    );

    expect(r["42"].slice(0, 7), "a data antiga do Ciclo venceu a venda nova").toBe("2026-09");
  });

  it("a venda do Ciclo vence quando ELA é a mais recente", () => {
    // A regra é simétrica: não é "o painel vence", é "a mais recente vence".
    const r = resolverDatasDeVenda(
      [{ estoque_id: 42, data_venda: "2026-09-01" }],
      [{ veiculo_id: 42, valor_novo: "true", registrado_em: "2026-01-10T10:00:00Z" }]
    );

    expect(r["42"]).toBe("2026-09-01");
  });

  it("carro DESMARCADO perde a data — voltou à venda", () => {
    /* Filtrando só `valor_novo = "true"` no banco, a marcação antiga
       sobreviveria à desmarcação. Passados 90 dias dela, a ficha de um carro
       à venda responderia 308 para o hub no instante em que alguém
       remarcasse. */
    const r = resolverDatasDeVenda(
      [],
      [
        { veiculo_id: 7, valor_novo: "true", registrado_em: "2026-01-05T10:00:00Z" },
        { veiculo_id: 7, valor_novo: "false", registrado_em: "2026-02-05T10:00:00Z" },
      ]
    );

    expect(r["7"], "a data sobreviveu à desmarcação").toBeUndefined();
  });

  it("remarcado depois de desmarcado usa a data NOVA", () => {
    const r = resolverDatasDeVenda(
      [],
      [
        { veiculo_id: 7, valor_novo: "true", registrado_em: "2026-01-05T10:00:00Z" },
        { veiculo_id: 7, valor_novo: "false", registrado_em: "2026-02-05T10:00:00Z" },
        { veiculo_id: 7, valor_novo: "true", registrado_em: "2026-08-30T10:00:00Z" },
      ]
    );

    expect(r["7"]).toBe("2026-08-30T10:00:00Z");
  });

  it("linha malformada não derruba nem inventa data", () => {
    const r = resolverDatasDeVenda(
      [{ estoque_id: null, data_venda: "2026-01-01" }, { estoque_id: 9, data_venda: null }],
      [{ veiculo_id: 9, valor_novo: null, registrado_em: "2026-03-01T00:00:00Z" }]
    );

    expect(r).toEqual({});
  });

  it("uma fonte que falhe não leva a outra junto", () => {
    /* Perder o histórico e ficar só com o Ciclo é pior que hoje, mas não é o
       fim — o `last_seen_at` continua atrás das duas. Só as DUAS falhando
       justificam desistir. */
    expect(publicacao).toContain("if (vendasDoCiclo.error && mudancasNoPainel.error)");
  });

  it("só as colunas necessárias saem — o resto de historico_veiculo é PII", () => {
    /* Isto roda no caminho de renderização de página pública, e
       `historico_veiculo` guarda `valor_anterior`/`valor_novo` em texto livre
       — em produção há `preco_compra` e `placa` ali dentro. Só as três
       colunas do registro de `vendido` saem. */
    expect(publicacao).toContain('.select("estoque_id, data_venda")');
    expect(publicacao).toContain('.select("veiculo_id, valor_novo, registrado_em")');
    expect(publicacao).not.toContain("valor_anterior");
    expect(publicacao).not.toContain("autor_");
  });

  it("a ÚLTIMA mudança da chave manda — desmarcar apaga a data antiga", () => {
    /* Filtrando só `valor_novo = "true"`, o carro marcado vendido e depois
       DESMARCADO guardaria a data antiga. Se ela já passasse dos 90 dias, a
       ficha viva responderia 308 para o hub no instante da remarcação — e o
       carro está à venda. */
    expect(publicacao, "voltou a filtrar no banco em vez de olhar a última linha").not.toContain(
      '.eq("valor_novo", "true")'
    );
    expect(publicacao).toContain('ultima.valor === "true"');
  });

  it("o formato do valor casa com quem ESCREVE o histórico", () => {
    /* O contrato entre dois módulos, e ele é uma string. `estoqueEscrita.ts`
       serializa com `String(novo)` — booleano `true` vira `"true"` —, e
       `publicacao.ts` compara com `"true"`. Se alguém trocar a serialização
       (rótulo "Vendido", JSON, migração para `estado_cadastro`), a carência
       para de vencer EM SILÊNCIO.
       O teste não conserta o acoplamento; ele faz o rompimento aparecer aqui
       em vez de aparecer no índice do Google três meses depois. */
    const escrita = lerCodigo("src/lib/estoqueEscrita.ts");
    expect(escrita, "a serialização do histórico mudou de forma").toMatch(
      /valor_novo:\s*[^,\n]*String\(/
    );
    expect(String(true), "o JavaScript mudou (não vai acontecer)").toBe("true");
  });
});

describe("o sitemap decide pelo MESMO relógio da ficha", () => {
  const sitemap = lerCodigo("src/app/sitemap.ts");

  it("passa a última presença para decidirPublicacao", () => {
    /* Sem isto o sitemap listava para sempre: `dataVenda` era `undefined` para
       todo mundo enquanto `veiculos_vendidos` esteve vazia, então o `noindex`
       daqui nunca virava `true` — nem depois de a ficha começar a redirecionar. */
    expect(sitemap).toContain("ultimaPresenca: ultimasPresencas[String(veiculo.id)]");
    expect(sitemap).toContain("getUltimasPresencas()");
  });

  it("a leitura das presenças entra no mesmo Promise.all das outras", () => {
    // Quatro idas independentes ao banco em série seriam quatro vezes o tempo
    // de revalidação do sitemap.
    // Âncora no destructuring, não em "Promise.all" — o arquivo tem mais de
    // um, e o primeiro é o de `destaquesParaSitemap`.
    const i = sitemap.indexOf("const [carimbos,");
    expect(i, "o Promise.all das leituras do sitemap mudou de forma").toBeGreaterThan(-1);
    const bloco = sitemap.slice(i, i + 320);
    expect(bloco).toContain("getUltimasPresencas()");
    expect(bloco).toContain("getDatasDeVenda()");
  });
});

describe("o que a ficha anuncia fora da página", () => {
  const base = {
    nome: "Chevrolet Spin 1.8 LT Automático",
    ano: 2014,
    precoTexto: "R$ 43.900",
    descricaoDisponivel: "Spin 2014 com 80.000 km, cor prata. Motors Store, Curitiba.",
  };

  it("carro À VENDA: preço no título e no card", () => {
    // A correção não pode custar o título que converte.
    const t = montarTextosDaFicha({
      ...base,
      publicacao: { indisponivel: false, rotulo: null },
    });

    expect(t.titulo).toBe("Chevrolet Spin 1.8 LT Automático - R$ 43.900 | Motors Store");
    expect(t.descricao).toBe(base.descricaoDisponivel);
    expect(t.tituloDoCard).toContain("R$ 43.900");
  });

  it("carro VENDIDO: nenhum preço, em lugar nenhum", () => {
    /* O caso real medido em 03/09: o `<title>` do Spin dizia
       "… - R$ 43.900 | Motors Store" enquanto a página exibia o selo VENDIDO.
       O selo não viaja para o snippet do Google nem para o card do WhatsApp;
       o preço, sim. E no carro que segue no feed ele era mantido fresco pelo
       sync a cada seis horas. */
    const t = montarTextosDaFicha({
      ...base,
      publicacao: { indisponivel: true, rotulo: "VENDIDO" },
    });

    expect(t.titulo).toContain("Vendido");
    for (const texto of [t.titulo, t.descricao, t.tituloDoCard]) {
      expect(texto, `preço vazou em: ${texto}`).not.toContain("43.900");
      expect(texto).not.toMatch(/R\$/);
    }
  });

  it("o rótulo acompanha o MOTIVO da saída", () => {
    /* "Indisponível" é o carro que sumiu do feed sem a loja dizer por quê —
       repasse, reserva, anúncio expirado. Chamá-lo de vendido seria afirmar
       um fato que ninguém verificou. */
    const t = montarTextosDaFicha({
      ...base,
      publicacao: { indisponivel: true, rotulo: "INDISPONÍVEL" },
    });

    expect(t.titulo).toContain("Indisponível");
    expect(t.titulo).not.toContain("Vendido");
    expect(t.descricao).toContain("indisponível");
  });

  it("a descrição do indisponível CONTINUA descrevendo o carro", () => {
    /* A ficha fica indexada 90 dias justamente para capturar a cauda longa —
       "spin 2014 prata". Trocar a description por uma frase de molde igual em
       todas as 24 jogaria fora o que a carência existe para preservar. O que
       sai é só o preço. */
    const t = montarTextosDaFicha({
      ...base,
      cor: "Prata",
      km: 80000,
      publicacao: { indisponivel: true, rotulo: "VENDIDO" },
    });

    expect(t.descricao).toContain("2014");
    expect(t.descricao).toContain("Prata");
    expect(t.descricao).toContain("80.000 km");
    // E ainda oferece o próximo passo: a página continua de pé com similares.
    expect(t.descricao).toContain("opções semelhantes");
    expect(t.descricao).not.toMatch(/R\$/);
  });

  it("cor e km ausentes não deixam buraco no texto", () => {
    // Campo vazio é comum no feed; a frase não pode sair com vírgula solta.
    const t = montarTextosDaFicha({
      ...base,
      publicacao: { indisponivel: true, rotulo: "VENDIDO" },
    });

    expect(t.descricao).toContain("2014 — vendido");
    expect(t.descricao).not.toMatch(/,\s*—/);
    expect(t.descricao).not.toContain(", ,");
  });

  it("a ficha usa a função, e não monta o título por conta própria", () => {
    // Sem isto a regra existiria testada e não aplicada.
    const pdp = lerCodigo("src/app/[categoria]/[marca]/[modelo]/[ficha]/page.tsx");
    expect(pdp).toContain("montarTextosDaFicha({");
    expect(pdp).toContain("title: textos.titulo");
    expect(pdp).toContain("tituloPadrao: textos.tituloDoCard");
    expect(pdp, "voltou a interpolar o preço no título").not.toContain(
      "title: `${nomeDoVeiculo} - ${priceText}"
    );
  });

  it("o JSON-LD continua declarando o preço", () => {
    /* Ali `price` junto de `OutOfStock` é o par CORRETO — o schema.org espera
       o preço da oferta que existiu. O que muda é só o texto que uma pessoa
       lê antes de clicar. */
    const schema = lerCodigo("src/lib/schemaVeiculo.ts");
    expect(schema).toContain("price: preco.toFixed(2)");
    expect(schema).toContain("OutOfStock");
  });
});
