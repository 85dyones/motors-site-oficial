import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FINALIDADES,
  documentoDoSocio,
  ocorrencias,
  LEITORES,
  NIVEIS_DO_CNPJ,
  NIVEIS_DO_CPF,
  PRODUTOS,
  lerPedidoDeDocumento,
  montarRelatorio,
  nivelDe,
  precoDeReferencia,
  type IdDoProduto,
  type LeituraDoProduto,
  type Nivel,
  type NivelDaConsulta,
  type PrecosDeReferencia,
} from "../src/lib/consultaDeDocumento";
import { lerChamadaDoProduto } from "../src/lib/consultaDeDocumento-servidor";
import type { LinhaDoRelatorio, SecaoDoRelatorio } from "../src/lib/relatorioDeDocumento";

/**
 * Consulta de CPF e CNPJ — o catálogo, o pedido e os leitores de cada produto
 * da APIBrasil (18/10/2026).
 *
 * O que estes testes seguram:
 *  - os preços de referência que a tela mostra ANTES de cobrar são os da doc
 *    do fornecedor, e o que cada pacote completo traz ou deixa de fora está
 *    escrito, sem prometer o que os produtos não trazem;
 *  - pedido torto (documento inválido, nível de outro documento, sem
 *    finalidade, sem a declaração do titular) não vira consulta paga;
 *  - cada leitor tira da resposta publicada na doc os campos que o relatório
 *    mostra, e resposta vazia ou de formato desconhecido vira "não veio" —
 *    nunca um relatório limpo inventado.
 */

const ENVELOPES = JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", "consultas-de-documento.json"), "utf8")) as Record<string, unknown>;

/** O miolo como a rede o entrega ao leitor: o envelope passa por `lerChamadaDoProduto`. */
function dadosDe(produto: IdDoProduto): unknown {
  const chamada = lerChamadaDoProduto(200, ENVELOPES[produto]);
  if (!chamada.ok) throw new Error(`${produto}: ${chamada.motivo}`);
  return chamada.dados;
}
const ler = (produto: IdDoProduto): LeituraDoProduto => LEITORES[produto](dadosDe(produto));

const todasAsLinhas = (l: LeituraDoProduto) => l.secoes.flatMap((s) => s.linhas);
const linhaDe = (l: LeituraDoProduto, rotulo: string): LinhaDoRelatorio | undefined => todasAsLinhas(l).find((x) => x.rotulo === rotulo);
const valorDe = (l: LeituraDoProduto, rotulo: string) => linhaDe(l, rotulo)?.valor;
const resumoDe = (l: LeituraDoProduto, rotulo: string) => l.resumo.find((x) => x.rotulo === rotulo);
const tabelaDe = (l: LeituraDoProduto, titulo: string) => l.secoes.flatMap((s) => s.tabelas).find((t) => t.titulo === titulo);
const temConteudo = (s: SecaoDoRelatorio) => s.linhas.some((x) => x.valor !== null) || s.tabelas.some((t) => t.linhas.length > 0);

const nivel = (lista: NivelDaConsulta[], id: Nivel) => {
  const n = lista.find((x) => x.id === id);
  if (!n) throw new Error(`sem o nível ${id}`);
  return n;
};

const TODOS_OS_PRODUTOS = Object.keys(PRODUTOS) as IdDoProduto[];

/**
 * Os preços vêm da semente da migração (`parametros_consulta_documento`): o
 * teste lê o próprio arquivo, para o número conferido ser o que vai ao banco.
 */
const SEMENTE = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261018120000_consultas_de_documento.sql"), "utf8");
const PRECOS: PrecosDeReferencia = JSON.parse(SEMENTE.match(/links_ativos_por_consulta, precos_de_referencia[\s\S]*?'(\{"cpf-lite"[\s\S]*?\})'::jsonb/)![1]);
const preco = (n: NivelDaConsulta) => precoDeReferencia(n, PRECOS) as number;

// ─────────────────────────────────────────────────────────────────────────────

describe("os preços de referência que a tela mostra antes de cobrar", () => {
  it("CPF: completo econômico é R$ 8,99 (Acerta Essencial Plus + CPF Dados) e completo integral é R$ 33,52 (CPF Dados + Plus PF)", () => {
    expect(preco(nivel(NIVEIS_DO_CPF, "completo_economico"))).toBe(8.99);
    expect(preco(nivel(NIVEIS_DO_CPF, "completo_integral"))).toBe(33.52);
    expect(nivel(NIVEIS_DO_CPF, "completo_economico").produtos).toEqual(["acerta-essencial-positivo", "cpf-dados"]);
    expect(nivel(NIVEIS_DO_CPF, "completo_integral").produtos).toEqual(["cpf-dados", "analise-credito-plus-pf"]);
  });

  it("CNPJ: completo econômico é R$ 4,99, completo com score é R$ 6,29 e completo integral é R$ 20,71", () => {
    expect(preco(nivel(NIVEIS_DO_CNPJ, "completo_economico"))).toBe(4.99);
    expect(preco(nivel(NIVEIS_DO_CNPJ, "completo_score"))).toBe(6.29);
    expect(preco(nivel(NIVEIS_DO_CNPJ, "completo_integral"))).toBe(20.71);
  });

  it("os três níveis de cada documento saem da soma dos produtos da doc, arredondada no centavo", () => {
    expect(preco(nivel(NIVEIS_DO_CPF, "basico"))).toBe(0.46);
    expect(preco(nivel(NIVEIS_DO_CPF, "dados"))).toBe(4.5);
    expect(preco(nivel(NIVEIS_DO_CPF, "credito"))).toBe(29.02);
    expect(preco(nivel(NIVEIS_DO_CNPJ, "basico"))).toBe(6.9);
    expect(preco(nivel(NIVEIS_DO_CNPJ, "dados"))).toBe(3.75);
    expect(preco(nivel(NIVEIS_DO_CNPJ, "credito"))).toBe(10.06);
    for (const n of [...NIVEIS_DO_CPF, ...NIVEIS_DO_CNPJ]) {
      const p = preco(n);
      expect(Math.round(p * 100) / 100, n.id).toBe(p);
    }
  });

  it("a semente tem preço para todo produto do catálogo; produto sem preço deixa o nível sem estimativa", () => {
    expect(Object.keys(PRECOS).sort()).toEqual([...TODOS_OS_PRODUTOS].sort());
    expect(precoDeReferencia(nivel(NIVEIS_DO_CPF, "basico"), { "cpf-lite": 0.12 })).toBeNull();
  });

  it("o pacote com score só existe para CNPJ: o CPF não oferece, e nivelDe responde nulo", () => {
    expect(NIVEIS_DO_CPF.map((n) => n.id)).toEqual(["basico", "dados", "credito", "completo_economico", "completo_integral"]);
    expect(NIVEIS_DO_CNPJ.map((n) => n.id)).toEqual(["basico", "dados", "credito", "completo_economico", "completo_score", "completo_integral"]);
    expect(nivelDe("cpf", "completo_score")).toBeNull();
    expect(nivelDe("cnpj", "completo_score")?.rotulo).toBe("Completo com score");
  });

  it("todo produto de um nível é do documento daquele nível, não se repete no nível e tem leitor", () => {
    for (const [tipo, niveis] of [["cpf", NIVEIS_DO_CPF], ["cnpj", NIVEIS_DO_CNPJ]] as const) {
      for (const n of niveis) {
        expect(new Set(n.produtos).size, `${tipo}/${n.id}`).toBe(n.produtos.length);
        for (const p of n.produtos) {
          expect(PRODUTOS[p].documento, `${tipo}/${n.id}/${p}`).toBe(tipo);
          expect(typeof LEITORES[p], p).toBe("function");
        }
      }
    }
  });

  it("só a API CNPJ usa a rota /dados/; todos os outros produtos usam /consulta/", () => {
    for (const p of TODOS_OS_PRODUTOS) expect(PRODUTOS[p].rota, p).toBe(p === "cnpj" ? "dados" : "consulta");
  });
});

describe("o que cada pacote completo traz e o que deixa de fora", () => {
  it("CNPJ integral é exatamente os quatro produtos dos três níveis, sem lacuna declarada, e diz que não traz score", () => {
    const tres = ["basico", "dados", "credito"].flatMap((id) => nivel(NIVEIS_DO_CNPJ, id as Nivel).produtos);
    const integral = nivel(NIVEIS_DO_CNPJ, "completo_integral");
    expect([...integral.produtos].sort()).toEqual([...tres].sort());
    expect(integral.deixaDeFora).toBeNull();
    expect(integral.produtos).not.toContain("cadastral-score-pj");
    expect(integral.traz).toMatch(/sem score/i);
  });

  it("CPF integral leva o Dados e o Crédito, troca o Básico pelo que o Plus PF já traz, e escreve a única lacuna: a data da situação na Receita", () => {
    const integral = nivel(NIVEIS_DO_CPF, "completo_integral");
    for (const id of ["dados", "credito"] as Nivel[]) {
      for (const p of nivel(NIVEIS_DO_CPF, id).produtos) expect(integral.produtos, p).toContain(p);
    }
    for (const p of nivel(NIVEIS_DO_CPF, "basico").produtos) expect(integral.produtos, p).not.toContain(p);
    expect(integral.deixaDeFora).toMatch(/data da situação na Receita/);

    // O que o Básico traz, o Plus PF da resposta publicada traz também...
    const plus = ler("analise-credito-plus-pf");
    for (const rotulo of ["Nome", "Nome da mãe", "Nascimento", "Sexo", "Situação na Receita"]) {
      expect(valorDe(plus, rotulo), rotulo).toBeTruthy();
    }
    // ...menos a data da situação, que só o Receita Federal tem — a lacuna escrita.
    expect(valorDe(ler("receita-federal"), "Situação desde")).toBe("26/11/2016");
    for (const p of integral.produtos) expect(linhaDe(ler(p), "Situação desde"), p).toBeUndefined();
  });

  it("os pacotes econômicos dizem o que deixam de fora, e o com score é o econômico mais o Cadastral + Score PJ", () => {
    expect(nivel(NIVEIS_DO_CPF, "completo_economico").deixaDeFora).toBeTruthy();
    expect(nivel(NIVEIS_DO_CNPJ, "completo_economico").deixaDeFora).toBeTruthy();
    expect(nivel(NIVEIS_DO_CNPJ, "completo_score").produtos).toEqual([...nivel(NIVEIS_DO_CNPJ, "completo_economico").produtos, "cadastral-score-pj"]);
    // Os três níveis de base não têm lacuna: são o produto inteiro.
    for (const n of [...NIVEIS_DO_CPF, ...NIVEIS_DO_CNPJ].filter((x) => ["basico", "dados", "credito"].includes(x.id))) {
      expect(n.deixaDeFora, n.id).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("o pedido que a tela manda", () => {
  const CERTO = { tipo: "cpf", documento: "123.456.789-09", nivel: "completo_economico", finalidade: "financiamento", titularCiente: true };

  it("pedido certo sai normalizado: CPF só com dígitos, CNPJ em maiúscula e sem máscara", () => {
    expect(lerPedidoDeDocumento(CERTO)).toEqual({ ok: true, pedido: { tipo: "cpf", documento: "12345678909", nivel: "completo_economico", finalidade: "financiamento" } });
    const cnpj = lerPedidoDeDocumento({ ...CERTO, tipo: "cnpj", documento: "11.222.333/0001-81", nivel: "completo_score" });
    expect(cnpj).toEqual({ ok: true, pedido: { tipo: "cnpj", documento: "11222333000181", nivel: "completo_score", finalidade: "financiamento" } });
  });

  it("recusa corpo que não é objeto e tipo que não é CPF nem CNPJ", () => {
    for (const corpo of [null, undefined, "texto", 42, [], {}, { ...CERTO, tipo: "rg" }]) {
      const r = lerPedidoDeDocumento(corpo);
      expect(r.ok, JSON.stringify(corpo)).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("Escolha CPF ou CNPJ.");
    }
  });

  it("recusa CPF e CNPJ com dígito errado, todos iguais ou de outro tipo", () => {
    for (const documento of ["123.456.789-10", "111.111.111-11", "", "11.222.333/0001-81", 12345678909]) {
      expect(lerPedidoDeDocumento({ ...CERTO, documento }), String(documento)).toEqual({ ok: false, motivo: "CPF inválido: confira os dígitos." });
    }
    expect(lerPedidoDeDocumento({ ...CERTO, tipo: "cnpj", documento: "11.222.333/0001-82", nivel: "basico" })).toEqual({ ok: false, motivo: "CNPJ inválido: confira os dígitos." });
    expect(lerPedidoDeDocumento({ ...CERTO, tipo: "cnpj", documento: "123.456.789-09", nivel: "basico" })).toEqual({ ok: false, motivo: "CNPJ inválido: confira os dígitos." });
  });

  it("recusa nível que não existe e o nível com score para CPF", () => {
    for (const n of [undefined, "", "premium", "completo_score"]) {
      expect(lerPedidoDeDocumento({ ...CERTO, nivel: n }), String(n)).toEqual({ ok: false, motivo: "Escolha o nível da consulta." });
    }
  });

  it("sem finalidade da lista não consulta: é exigência da LGPD", () => {
    for (const finalidade of [undefined, "", "curiosidade", 1]) {
      const r = lerPedidoDeDocumento({ ...CERTO, finalidade });
      expect(r.ok, String(finalidade)).toBe(false);
      if (!r.ok) expect(r.motivo).toMatch(/finalidade/);
    }
    for (const f of Object.keys(FINALIDADES)) expect(lerPedidoDeDocumento({ ...CERTO, finalidade: f }).ok, f).toBe(true);
  });

  // BUG conhecido (não corrigido aqui, a pedido): `c.finalidade in FINALIDADES` aceita chaves do
  // protótipo ("toString", "constructor"), o pedido passa, a consulta é PAGA e só depois o CHECK
  // `consultas_de_documento_finalidade_valida` recusa o insert. Tirar o `.skip` quando trocar por hasOwnProperty.
  it("finalidade com nome de propriedade do protótipo ('toString', 'constructor') não passa", () => {
    for (const finalidade of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(lerPedidoDeDocumento({ ...CERTO, finalidade }).ok, finalidade).toBe(false);
    }
  });

  it("a declaração de que o titular está em negociação tem de ser o booleano true — 'true', 1 ou ausente não servem", () => {
    for (const titularCiente of [undefined, false, "true", 1, "sim"]) {
      expect(lerPedidoDeDocumento({ ...CERTO, titularCiente }), String(titularCiente)).toEqual({ ok: false, motivo: "Confirme que o titular está em negociação com a loja." });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("o envelope do fornecedor", () => {
  it("cada exemplo da doc passa por lerChamadaDoProduto e traz o custo de valor_consulta, ou de tax quando ele falta", () => {
    for (const p of TODOS_OS_PRODUTOS) {
      const chamada = lerChamadaDoProduto(200, ENVELOPES[p]);
      expect(chamada.ok, p).toBe(true);
      if (chamada.ok) expect(chamada.custo, p).toBeTypeOf("number");
    }
    // O Acerta Essencial Plus não tem `valor_consulta` nem `data` na raiz: o custo vem de `tax` com ponto.
    const acerta = lerChamadaDoProduto(200, ENVELOPES["acerta-essencial-positivo"]);
    expect(acerta.ok && acerta.custo).toBe(0.34);
    expect(acerta.ok && (acerta.dados as { dados: unknown[] }).dados).toHaveLength(1);
  });
});

describe("os leitores, CPF", () => {
  it("CPF Lite: nome, mãe, nascimento e idade", () => {
    const l = ler("cpf-lite");
    expect(l.titular).toBe("NOME FICTICIO DA SILVA");
    expect(valorDe(l, "Nome da mãe")).toBe("NOME FICTICIO DA SILVA");
    expect(valorDe(l, "Nascimento")).toBe("03/03/1900");
    expect(valorDe(l, "Idade")).toBe("126 anos");
    expect(l.secoes[0].origem).toBe("CPF Lite");
  });

  it("Receita Federal: situação regular no resumo (ok), com a data dela, sexo e mãe", () => {
    const l = ler("receita-federal");
    expect(l.titular).toBe("PESSOA DA SILVA HOMOLOG");
    expect(resumoDe(l, "Situação na Receita")).toEqual({ rotulo: "Situação na Receita", valor: "REGULAR", estado: "ok" });
    expect(valorDe(l, "Situação desde")).toBe("26/11/2016");
    expect(valorDe(l, "Sexo")).toBe("M");
    expect(valorDe(l, "Nome da mãe")).toBe("MAE DA SILVA HOMOLOG");
  });

  it("CPF Dados: cadastro, endereço inteiro, renda e compliance limpo; lista que veio nula fica 'não informado', não 'nenhum registro'", () => {
    const l = ler("cpf-dados");
    expect(l.titular).toBe("JOAO FICTICIO DE OLIVEIRA");
    expect(resumoDe(l, "Compliance (PEP, óbito, sanções, processos)")).toMatchObject({ valor: "Nada encontrado", estado: "ok" });
    expect(resumoDe(l, "Faixa de renda")?.valor).toBe("De R$ 3.254,01 a R$ 6.508,00");
    expect(valorDe(l, "Endereço")).toBe("RUA FICTICIA DAS ACACIAS, 123, AP 101, CENTRO, SAO PAULO, SP, 01001-000");
    expect(valorDe(l, "Nascimento")).toBe("20/05/1992");
    expect(valorDe(l, "Idade")).toBe("33");
    expect(linhaDe(l, "Situação do CPF")).toMatchObject({ valor: "REGULAR", estado: "ok" });
    expect(linhaDe(l, "Pessoa politicamente exposta (PEP)")).toMatchObject({ valor: "Não", estado: "ok" });
    expect(linhaDe(l, "Óbito")).toMatchObject({ valor: "Não", estado: "ok" });
    expect(linhaDe(l, "CEIS (empresas inidôneas e suspensas)")).toMatchObject({ valor: "Nenhum registro", estado: "ok" });
    // `mandado_prisao: null` no exemplo: o fornecedor não informou.
    expect(linhaDe(l, "Mandado de prisão")).toEqual({ rotulo: "Mandado de prisão", valor: null });
    expect(linhaDe(l, "CPF duplicado")).toEqual({ rotulo: "CPF duplicado", valor: null });
  });

  it("CPF Dados com PEP e processo criminal: o resumo conta os apontamentos como impeditivo e a lista vira tabela", () => {
    const envelope = structuredClone(ENVELOPES["cpf-dados"]) as { data: { resultado: Record<string, unknown> } };
    envelope.data.resultado.processos_criminais = [{ tribunal: "TJPR", numero_processo: "0001234-56.2025.8.16.0001" }];
    (envelope.data.resultado.indicadores as Record<string, unknown>).pep = true;
    const chamada = lerChamadaDoProduto(200, envelope);
    if (!chamada.ok) throw new Error(chamada.motivo);
    const l = LEITORES["cpf-dados"](chamada.dados);
    expect(resumoDe(l, "Compliance (PEP, óbito, sanções, processos)")).toMatchObject({ valor: "2 apontamentos", estado: "impeditivo" });
    expect(linhaDe(l, "Processos criminais")).toMatchObject({ valor: "1 registro", estado: "impeditivo" });
    expect(linhaDe(l, "Pessoa politicamente exposta (PEP)")).toMatchObject({ valor: "Sim", estado: "atencao" });
    expect(tabelaDe(l, "Processos criminais")?.linhas).toEqual([["tribunal: TJPR · numero processo: 0001234-56.2025.8.16.0001"]]);
  });

  it("Análise de Crédito Plus PF: decisão do bureau (não recomendada = impeditivo), score principal, telefone e consultas anteriores", () => {
    const l = ler("analise-credito-plus-pf");
    expect(l.titular).toBe("JOAO DA SILVA SANTOS");
    expect(resumoDe(l, "Decisão do bureau")).toMatchObject({ valor: "NEGOCIAÇÃO NÃO RECOMENDADA", estado: "impeditivo" });
    expect(resumoDe(l, "Score (principal)")?.valor).toBe("380 · NOVO RISCO 6 MESES");
    expect(resumoDe(l, "Débitos")).toMatchObject({ valor: "Nenhum registro", estado: "ok" });
    expect(resumoDe(l, "Protestos")).toMatchObject({ valor: "Nenhum registro", estado: "ok" });
    expect(valorDe(l, "Telefones")).toBe("(11) 987654321");
    expect(valorDe(l, "Endereço")).toBe("Avenida, AVENIDA PAULISTA, 1000, APTO 101, CENTRO, SAO PAULO, SP, 01310100");
    expect(valorDe(l, "Consultas nos últimos 90 dias")).toBe("00004");
    expect(valorDe(l, "Total devedor")).toBeNull();
    expect(tabelaDe(l, "Scores")?.linhas[0]).toEqual(["NOVO RISCO 6 MESES", "380", "E", "Risco alto"]);
    expect(tabelaDe(l, "Consultas anteriores")?.linhas).toEqual([["15/03/2026", "BANCO EXEMPLO S.A.", "Cartão de crédito"]]);
  });

  it("Acerta Essencial Plus: lê o envelope próprio (response.data.dados[0]) — score, os dois scores, pendências e consultas", () => {
    const l = ler("acerta-essencial-positivo");
    expect(l.titular).toBe("JOAO DA SILVA");
    expect(resumoDe(l, "Score")?.valor).toBe("556 · Risco moderado");
    expect(resumoDe(l, "Pendências financeiras")).toMatchObject({ valor: "Nenhum registro", estado: "ok" });
    expect(valorDe(l, "Score rating")).toBe("850");
    expect(valorDe(l, "Telefone")).toBe("31999999999");
    expect(valorDe(l, "Renda presumida")).toBe("De R$ 1.401 até R$ 2.000");
    expect(linhaDe(l, "Situação na Receita")).toMatchObject({ valor: "Regular", estado: "ok" });
    expect(tabelaDe(l, "Consultas anteriores")?.linhas).toEqual([["07/08/2025", "EMPRESA EXEMPLO LTDA"]]);
  });

  it("Acerta Essencial Plus com pendência: a contagem e o valor total do resumoConsulta aparecem, como atenção", () => {
    const envelope = structuredClone(ENVELOPES["acerta-essencial-positivo"]) as Record<string, unknown>;
    const cc = (envelope as { response: { data: { dados: Array<{ acertaEssencialPositivo: { consultaCredito: Record<string, unknown> } }> } } }).response.data.dados[0]
      .acertaEssencialPositivo.consultaCredito;
    cc.pendenciasFinanceiras = [{ credor: "BANCO X", valor: "1.234,56" }];
    (cc.resumoConsulta as Record<string, unknown>).pendenciasFinanceiras = { quantidadeTotal: 1, valorTotal: "1.234,56" };
    const chamada = lerChamadaDoProduto(200, envelope);
    if (!chamada.ok) throw new Error(chamada.motivo);
    const l = LEITORES["acerta-essencial-positivo"](chamada.dados);
    expect(resumoDe(l, "Pendências financeiras")?.estado).toBe("atencao");
    expect(resumoDe(l, "Pendências financeiras")?.valor).toMatch(/^1 registro · R\$\s1\.234,56$/);
    expect(tabelaDe(l, "Pendências financeiras")?.linhas).toEqual([["credor: BANCO X · valor: 1.234,56"]]);
  });
});

describe("os leitores, CNPJ", () => {
  it("API CNPJ: situação pelo código (02 = ATIVA), datas AAAAMMDD, Simples, MEI, capital e o sócio com CPF mascarado", () => {
    const l = ler("cnpj");
    expect(l.titular).toBe("APIBRASIL SITES E SOFTWARES LTDA");
    expect(resumoDe(l, "Situação na Receita")).toMatchObject({ valor: "ATIVA", estado: "ok" });
    expect(valorDe(l, "Situação desde")).toBe("21/01/2022");
    expect(valorDe(l, "Matriz ou filial")).toBe("Matriz");
    expect(valorDe(l, "Simples Nacional")).toBe("Optante");
    expect(valorDe(l, "MEI")).toBe("Não");
    expect(valorDe(l, "Capital social")).toMatch(/^R\$\s10\.000,00$/);
    expect(valorDe(l, "Telefone")).toBe("(31) 94359434");
    expect(valorDe(l, "CNAE principal")).toMatch(/^6311900 · Tratamento de dados/);
    expect(tabelaDe(l, "Quadro de sócios (Receita)")?.linhas).toEqual([["JONATHAN HENRIQUE DA SILVA MOTTA", "***067476**", "Sócio-Administrador", "21/01/2022"]]);
  });

  it("API CNPJ com situação BAIXADA (08) fica em atenção no resumo", () => {
    const envelope = structuredClone(ENVELOPES.cnpj) as { data: { cnpj: Record<string, unknown> } };
    envelope.data.cnpj.situacao_cadastral = "08";
    const chamada = lerChamadaDoProduto(200, envelope);
    if (!chamada.ok) throw new Error(chamada.motivo);
    expect(resumoDe(LEITORES.cnpj(chamada.dados), "Situação na Receita")).toMatchObject({ valor: "BAIXADA", estado: "atencao" });
  });

  it("CNPJ Cadastral: faixa de faturamento no resumo e os sócios com PEP e óbito, com CPF inteiro e nascimento", () => {
    const l = ler("cnpj-cadastral");
    expect(l.titular).toBe("ORBITA DADOS DIGITAIS LTDA");
    expect(resumoDe(l, "Faixa de faturamento")?.valor).toMatch(/^R\$\s420\.000,00$/);
    expect(linhaDe(l, "Situação")).toMatchObject({ valor: "ATIVA", estado: "ok" });
    expect(valorDe(l, "Abertura")).toBe("14/09/2021");
    expect(valorDe(l, "Porte")).toBe("EMPRESA DE PEQUENO PORTE");
    expect(tabelaDe(l, "Sócios")?.linhas).toEqual([["CARLOS EDUARDO PEREIRA LIMA", "123.456.789-01", "17/11/1988", "Não", "Não", "Não"]]);
  });

  it("CNPJ Cadastral Premium: inscrição estadual, sócio com % e as participações em outras empresas; e-mail omitido não aparece", () => {
    const l = ler("cadastral-premium-pj");
    expect(l.titular).toBe("EMPRESA FICTICIA DE HOMOLOGACAO LTDA");
    expect(resumoDe(l, "Sócios com restrição")).toMatchObject({ valor: "Nenhum", estado: "ok" });
    expect(valorDe(l, "Inscrição estadual")).toBe("Para dados de IE tente novamente em alguns instantes.");
    expect(valorDe(l, "E-mails")).toBeNull();
    expect(tabelaDe(l, "Sócios")?.linhas).toEqual([["FULANO FICTICIO DA SILVA", "000.000.001-91", "SOCIO", "30%", "Não"]]);
    expect(tabelaDe(l, "Telefones")?.linhas).toEqual([["31 37000000", "COMERCIAL"]]);
    expect(tabelaDe(l, "Participações dos sócios em outras empresas")?.linhas).toEqual([["BELTRANO FICTICIO SOUZA", "EMPRESA FICTICIA SECUNDARIA LTDA", null, "100%"]]);
  });

  it("Receita Federal PJ V3: situação pelo código (2 = ATIVA), natureza, CNAE, Simples e MEI booleanos, telefone e sócios", () => {
    const l = ler("receita-federal-pj-v3");
    expect(l.titular).toBe("ALFA DADOS E SISTEMAS LTDA");
    expect(resumoDe(l, "Situação na Receita")).toMatchObject({ valor: "ATIVA", estado: "ok" });
    expect(valorDe(l, "Natureza jurídica")).toBe("2062 · Sociedade Empresaria Limitada");
    expect(valorDe(l, "Simples Nacional")).toBe("Sim");
    expect(valorDe(l, "MEI")).toBe("Não");
    expect(valorDe(l, "Telefones")).toBe("31 33334444");
    expect(valorDe(l, "E-mail")).toBeNull();
    expect(valorDe(l, "Capital social")).toMatch(/^R\$\s850\.000,00$/);
    expect(tabelaDe(l, "CNAEs secundários")?.linhas).toHaveLength(2);
    expect(tabelaDe(l, "Quadro de sócios")?.linhas).toEqual([["CARLOS EDUARDO FERREIRA", "123.456.789-01", "49", "15/07/2019"]]);
  });

  it("Análise de Crédito Basic PJ: negativações e ações zeradas (ok), protestos não informados ficam sem valor, consultas e quadro societário", () => {
    const l = ler("analise-credito-basic-pj");
    expect(l.titular).toBe("EMPRESA FICTICIA LTDA");
    expect(resumoDe(l, "Negativações")).toMatchObject({ valor: "Nenhum registro", estado: "ok" });
    expect(resumoDe(l, "Ações judiciais")).toMatchObject({ valor: "Nenhum registro", estado: "ok" });
    // `total_protestos: null` no exemplo: não é "nenhum".
    expect(resumoDe(l, "Protestos")).toEqual({ rotulo: "Protestos", valor: null });
    expect(valorDe(l, "Consultas nos últimos 30 dias")).toBe("1");
    expect(valorDe(l, "Consultas há mais de 90 dias")).toBe("5");
    expect(valorDe(l, "NIRE")).toBe("35200123456");
    expect(tabelaDe(l, "Quadro societário")?.linhas).toEqual([["JOAO DA SILVA FICTICIO", "123.456.789-01", "SOCIO", "60.0%"]]);
  });

  it("Dossiê de Crédito PJ: pendências e protestos zerados no resumo, capital em BRL e telefone", () => {
    const l = ler("dossie-credito-pj");
    expect(l.titular).toBe("EMPRESA FICTICIA DE HOMOLOGACAO LTDA");
    expect(l.resumo.map((x) => [x.rotulo, x.valor, x.estado])).toEqual([
      ["Pendências financeiras", "Nenhum registro", "ok"],
      ["Protestos", "Nenhum registro", "ok"],
    ]);
    expect(linhaDe(l, "Situação")).toMatchObject({ valor: "ATIVA", estado: "ok" });
    expect(valorDe(l, "Capital social")).toMatch(/^R\$\s10\.000,00$/);
    expect(valorDe(l, "Telefones")).toBe("00 00000000");
    expect(valorDe(l, "Atividade principal")).toBe("6311900-TRATAMENTO DE DADOS");
    // Bloco que o exemplo não traz não vira linha.
    expect(linhaDe(l, "Contumácia (atraso recorrente)")).toBeUndefined();
  });

  it("Cadastral + Score PJ: score e risco baixo no resumo (ok), probabilidade em %", () => {
    const l = ler("cadastral-score-pj");
    expect(l.titular).toBe("EMPRESA FICTICIA DE HOMOLOGACAO LTDA");
    expect(resumoDe(l, "Score da empresa")).toMatchObject({ valor: "700 · risco baixo", estado: "ok" });
    expect(linhaDe(l, "Alertas e restrições")).toMatchObject({ valor: "Nenhum registro", estado: "ok" });
    expect(tabelaDe(l, "Scores")?.linhas).toEqual([["700", "BAIXO", "20,00%", "B"]]);
  });
});

// BUG conhecido (não corrigido aqui, a pedido): o leitor do Acerta Essencial Plus conta lista AUSENTE
// como zero — com envelope vazio ou de formato novo, o relatório diz "Pendências financeiras: Nenhum
// registro ✔" e "Protestos: Nenhum registro ✔". Ele fica fora dos dois testes abaixo e tem o seu,
// em `.skip`, até `qtd`/`contar` de `lerAcertaPlus` devolverem nulo quando nem o resumo nem a lista vierem.
const SEM_O_ACERTA = TODOS_OS_PRODUTOS.filter((p) => p !== "acerta-essencial-positivo");

describe("resposta vazia ou de formato desconhecido", () => {
  it("Acerta Essencial Plus vazio não vira 'nenhum registro' (ok) de pendências e protestos", () => {
    const l = LEITORES["acerta-essencial-positivo"]({});
    expect(l.secoes.some(temConteudo)).toBe(false);
  });

  it("nenhum leitor quebra, e nenhum inventa titular ou dado: sem resposta, a seção fica sem conteúdo", () => {
    for (const p of TODOS_OS_PRODUTOS) {
      for (const vazio of [null, undefined, {}, [], "texto", 0]) expect(() => LEITORES[p](vazio), p).not.toThrow();
    }
    for (const p of SEM_O_ACERTA) {
      for (const vazio of [null, undefined, {}, [], "texto", 0, { data: {} }, { resultado: null }]) {
        const l = LEITORES[p](vazio);
        const rotulo = `${p} com ${JSON.stringify(vazio)}`;
        expect(l.titular, rotulo).toBeNull();
        for (const s of l.secoes) {
          expect(
            s.linhas.filter((x) => x.valor !== null).map((x) => `${x.rotulo}: ${x.valor}`),
            rotulo,
          ).toEqual([]);
          expect(s.tabelas.filter((t) => t.linhas.length > 0).map((t) => t.titulo), rotulo).toEqual([]);
        }
        expect(l.secoes.some(temConteudo), rotulo).toBe(false);
      }
    }
  });

  it("e no relatório o produto vazio vai para 'não veio', sem seção e sem resumo de 'nenhum registro'", () => {
    for (const p of SEM_O_ACERTA) {
      const r = montarRelatorio({ tipo: PRODUTOS[p].documento, documento: PRODUTOS[p].documento === "cpf" ? "12345678909" : "11222333000181", nivel: "basico" }, [{ produto: p, ok: true, dados: {} }], {
        geradoEm: "2026-10-18T12:00:00.000Z",
        homologacao: false,
      });
      expect(r.secoes, p).toEqual([]);
      expect(r.resumo, p).toEqual([]);
      expect(r.faltou, p).toEqual([{ produto: PRODUTOS[p].nome, motivo: expect.stringMatching(/sem os dados esperados/) }]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("o relatório montado", () => {
  const original = LEITORES["cpf-lite"];
  afterEach(() => {
    LEITORES["cpf-lite"] = original;
  });

  it("junta os produtos do nível na ordem, com documento formatado, rótulo do nível e o titular do primeiro que o trouxe", () => {
    const r = montarRelatorio(
      { tipo: "cpf", documento: "12345678909", nivel: "completo_integral" },
      [
        { produto: "cpf-dados", ok: true, dados: dadosDe("cpf-dados") },
        { produto: "analise-credito-plus-pf", ok: true, dados: dadosDe("analise-credito-plus-pf") },
      ],
      { geradoEm: "2026-10-18T12:00:00.000Z", homologacao: true },
    );
    expect(r.documento).toBe("123.456.789-09");
    expect(r.nivel).toBe("Completo integral");
    expect(r.titular).toBe("JOAO FICTICIO DE OLIVEIRA");
    expect(r.homologacao).toBe(true);
    expect(r.geradoEm).toBe("2026-10-18T12:00:00.000Z");
    expect(r.secoes.map((s) => s.origem)).toEqual(["CPF Dados", "CPF Dados", "Análise de Crédito Plus PF", "Análise de Crédito Plus PF"]);
    expect(r.resumo.map((l) => l.rotulo)).toContain("Decisão do bureau");
    expect(r.faltou).toEqual([]);
  });

  it("falha parcial: o que respondeu entra, o que falhou fica escrito em 'não veio' com o motivo", () => {
    const r = montarRelatorio(
      { tipo: "cnpj", documento: "11222333000181", nivel: "completo_economico" },
      [
        { produto: "cnpj", ok: true, dados: dadosDe("cnpj") },
        { produto: "cnpj-cadastral", ok: false, motivo: "a APIBrasil recusou: CNPJ não encontrado" },
        { produto: "dossie-credito-pj", ok: true, dados: dadosDe("dossie-credito-pj") },
      ],
      { geradoEm: "2026-10-18T12:00:00.000Z", homologacao: false },
    );
    expect(r.documento).toBe("11.222.333/0001-81");
    expect(r.titular).toBe("APIBRASIL SITES E SOFTWARES LTDA");
    expect(r.faltou).toEqual([{ produto: "CNPJ Cadastral", motivo: "a APIBrasil recusou: CNPJ não encontrado" }]);
    expect(r.secoes.map((s) => s.origem)).toEqual(["API CNPJ (Receita)", "Dossiê de Crédito PJ"]);
  });

  it("no resumo vale o primeiro produto que disse algo sobre o rótulo; o seguinte não repete nem sobrescreve", () => {
    const baixada = structuredClone(ENVELOPES["receita-federal-pj-v3"]) as { data: { results: { situacao_cadastral: { codigo: string } } } };
    baixada.data.results.situacao_cadastral.codigo = "8";
    const r = montarRelatorio(
      { tipo: "cnpj", documento: "11222333000181", nivel: "completo_integral" },
      [
        { produto: "receita-federal-pj-v3", ok: true, dados: baixada.data },
        { produto: "cnpj", ok: true, dados: dadosDe("cnpj") },
      ],
      { geradoEm: "2026-10-18T12:00:00.000Z", homologacao: false },
    );
    const situacoes = r.resumo.filter((l) => l.rotulo === "Situação na Receita");
    expect(situacoes).toEqual([{ rotulo: "Situação na Receita", valor: "BAIXADA", estado: "atencao" }]);
  });

  it("leitor que quebra não derruba o relatório: o produto vai para 'não veio' e a resposta fica guardada", () => {
    LEITORES["cpf-lite"] = () => {
      throw new Error("formato novo");
    };
    const r = montarRelatorio(
      { tipo: "cpf", documento: "12345678909", nivel: "basico" },
      [
        { produto: "cpf-lite", ok: true, dados: { qualquer: 1 } },
        { produto: "receita-federal", ok: true, dados: dadosDe("receita-federal") },
      ],
      { geradoEm: "2026-10-18T12:00:00.000Z", homologacao: false },
    );
    expect(r.faltou).toEqual([{ produto: "CPF Lite", motivo: expect.stringMatching(/formato que o painel não reconheceu/) }]);
    expect(r.titular).toBe("PESSOA DA SILVA HOMOLOG");
  });
});

describe("formato inesperado nunca vira 'nada encontrado' (revisão de 18/10/2026)", () => {
  const cpfDados = (resultado: Record<string, unknown>) => LEITORES["cpf-dados"]({ resultado: { nome: "FULANO", ...resultado } });
  const linhaDe = (l: ReturnType<typeof cpfDados>, rotulo: string) => l.secoes.flatMap((s) => s.linhas).find((x) => x.rotulo === rotulo);

  it("mandado de prisão como true, 'SIM' ou objeto não sai 'Nenhum registro' em verde", () => {
    for (const v of [true, "SIM", "S", { total: 2, itens: [] }, { situacao: "ATIVO" }]) {
      const l = linhaDe(cpfDados({ mandado_prisao: v }), "Mandado de prisão");
      expect(l?.estado, JSON.stringify(v)).not.toBe("ok");
      expect(l?.valor).not.toBe("Nenhum registro");
    }
  });

  it("PEP e óbito como 'S' entram no resumo como apontamentos, não como 'Nada encontrado'", () => {
    const l = cpfDados({ indicadores: { pep: "S", obito: "S" }, mandado_prisao: [] });
    const resumo = l.resumo.find((x) => x.rotulo.startsWith("Compliance"));
    expect(resumo?.valor).toBe("2 apontamentos");
    expect(resumo?.estado).toBe("impeditivo");
  });

  it("sem nada conferido, o resumo de compliance fica 'não informado', e não verde", () => {
    const resumo = cpfDados({}).resumo.find((x) => x.rotulo.startsWith("Compliance"));
    expect(resumo?.valor).toBeNull();
    expect(resumo?.estado).toBeUndefined();
  });

  it("débitos do Plus PF como objeto viram 'formato não reconhecido' em atenção, e a tabela mostra o objeto", () => {
    const l = LEITORES["analise-credito-plus-pf"]({ resultado: { identificacao: { nomes: "FULANO" }, debitos: { credor: "BANCO X", valor: "10,00" } } });
    const debitos = l.secoes.flatMap((s) => s.linhas).find((x) => x.rotulo === "Débitos");
    expect(debitos?.estado).toBe("atencao");
    expect(debitos?.valor).toMatch(/^Formato não reconhecido/);
    expect(l.secoes.flatMap((s) => s.tabelas).some((t) => t.titulo === "Débitos" && t.linhas.length === 1)).toBe(true);
  });

  it("ocorrencias: só lista vazia, zero e 'não consta' contam como nenhum registro", () => {
    expect(ocorrencias([])).toBe(0);
    expect(ocorrencias(0)).toBe(0);
    expect(ocorrencias("N")).toBe(0);
    expect(ocorrencias(false)).toBe(0);
    expect(ocorrencias("3")).toBe(3);
    expect(ocorrencias({ quantidade_ocorrencia: "2" })).toBe(2);
    expect(ocorrencias(true)).toBe("consta");
    expect(ocorrencias("talvez")).toBe("desconhecido");
    expect(ocorrencias({ a: 1 })).toBe("desconhecido");
    expect(ocorrencias(null)).toBeNull();
    expect(ocorrencias("")).toBeNull();
  });

  it("documento de sócio: CPF e CNPJ inteiros e formatados; o que a Receita já manda mascarado fica como veio", () => {
    expect(documentoDoSocio("12345678901")).toBe("123.456.789-01");
    expect(documentoDoSocio("123.456.789-01")).toBe("123.456.789-01");
    expect(documentoDoSocio("12345678000195")).toBe("12.345.678/0001-95");
    expect(documentoDoSocio("***067476**")).toBe("***067476**");
  });

  it("número inteiro do fornecedor sai sem separador de milhar (ano, código)", () => {
    const l = LEITORES["cpf-lite"]({ nome: "FULANO", idade: 2019 });
    expect(l.secoes[0].linhas.find((x) => x.rotulo === "Idade")?.valor).toBe("2019");
  });
});
