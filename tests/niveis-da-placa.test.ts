import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { quadroDeChecagens, qualificarCompra, type EstadoDaChecagem, type RetratoDaConsulta } from "../src/lib/consultaDePlaca";
import {
  CHECAGENS,
  LEITORES_DA_PLACA,
  NIVEIS_DA_PLACA,
  PRODUTOS_DA_PLACA,
  classificarRestricao,
  custoDaResposta,
  lerChamadaDaPlaca,
  lerCheckList,
  lerEstadual,
  lerFipeDaPlaca,
  lerHistorico,
  lerRecall,
  montarRetratoPorNivel,
  niveisParaAprofundar,
  nivelDaPlaca,
  precoDosProdutos,
  produtosQueFaltam,
  semDocumentos,
  type FragmentosDaPlaca,
  type NivelDaPlaca,
  type PrecosDaPlaca,
  type ProdutoDeVeiculo,
} from "../src/lib/niveisDaPlaca";

/**
 * A consulta de placa em NÍVEIS (19/10/2026), na parte pura: o catálogo e os
 * preços, a leitura do envelope de cada produto, os leitores (fragmentos), a
 * tranca de dado pessoal e o retrato montado por nível.
 *
 * As respostas de `tests/fixtures/apibrasil/placa-niveis.json` saíram dos
 * exemplos da documentação da APIBrasil (o miolo de cada página), com o
 * envelope padrão de produção. Os nomes e documentos fictícios da doc ficaram
 * de propósito: os leitores têm de descartá-los.
 *
 * O que estes testes seguram:
 *  - o preço de cada nível é a soma da tabela da SEMENTE da migração (lida do
 *    .sql, como em consulta-de-documento.test.ts), e o aprofundar paga só o
 *    que falta;
 *  - nenhum fragmento nem retrato leva chave que a tranca do banco recusa
 *    (a regex é lida da própria migração);
 *  - o que o nível não cobre, ou o que veio num formato que não se lê, é
 *    "não conferido" — nunca "ok" — e a qualificação nunca sai "apto" assim.
 */

type Envelope = Record<string, unknown>;
const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", "placa-niveis.json"), "utf8")) as Record<string, Envelope>;
const envelope = (produto: Exclude<ProdutoDeVeiculo, "veiculos-total">): Envelope => structuredClone(FIXTURE[produto]);

const MIGRACAO = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261019120000_niveis_da_consulta_de_placa.sql"), "utf8");
/** Os preços da semente: o insert de `parametros_consulta_veiculo` depois de "A semente". */
const PRECOS: PrecosDaPlaca = JSON.parse(MIGRACAO.match(/-- A semente[\s\S]*?'(\{"estadual"[\s\S]*?\})'::jsonb/)![1]);
/** A tranca de dado pessoal, como o CHECK `consultas_de_placa_sem_dado_pessoal` a escreve (o `~*` não distingue caixa). */
const TRANCA = new RegExp(MIGRACAO.match(/fragmentos::text \|\| ' ' \|\| tentativas::text\)\s*!~\* '([^']+)'/)![1], "i");

const PLACA = "QOZ7702";

/** O miolo de um produto, pelo leitor de envelope (como o servidor faz). */
function dadosDe(produto: Exclude<ProdutoDeVeiculo, "veiculos-total">, corpo: Envelope = envelope(produto)): unknown {
  const r = lerChamadaDaPlaca(200, corpo, produto);
  if (!r.ok) throw new Error(`${produto}: ${r.motivo}`);
  return r.dados;
}

/** Os fragmentos de um nível, a partir das respostas (cada uma pode ser trocada). */
function fragmentosDe(nivel: NivelDaPlaca, troca: Partial<Record<ProdutoDeVeiculo, Envelope>> = {}): FragmentosDaPlaca {
  const f: Record<string, unknown> = {};
  for (const p of nivelDaPlaca(nivel)!.produtos) {
    if (p === "veiculos-total") continue;
    const leitura = LEITORES_DA_PLACA[p](dadosDe(p, troca[p] ?? envelope(p)));
    if (leitura) f[p] = leitura;
  }
  return f as FragmentosDaPlaca;
}

function retratoDe(nivel: NivelDaPlaca, troca: Partial<Record<ProdutoDeVeiculo, Envelope>> = {}): RetratoDaConsulta {
  return montarRetratoPorNivel(PLACA, nivel, fragmentosDe(nivel, troca));
}

const estados = (r: RetratoDaConsulta): Record<string, EstadoDaChecagem> => Object.fromEntries(quadroDeChecagens(r).map((c) => [c.chave, c.estado]));

/** O bin_estadual da fixture, para mexer num campo. */
function estadualCom(muda: (b: Record<string, unknown>, r: Record<string, unknown>) => void): Envelope {
  const e = envelope("estadual");
  const b = (e.data as Record<string, Record<string, unknown>>).bin_estadual;
  muda(b, b.restricoes as Record<string, unknown>);
  return e;
}

/** O check_list_veicular da fixture, para mexer num item. */
function checkListCom(muda: (itens: Record<string, Record<string, unknown>>) => void): Envelope {
  const e = envelope("check-list");
  muda((e.data as { veicular: { check_list_veicular: Record<string, Record<string, unknown>> } }).veicular.check_list_veicular);
  return e;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("o catálogo e os preços da semente", () => {
  it("a semente tem os seis produtos, e os níveis custam 3,18 / 5,58 / 10,58 / 30", () => {
    expect(Object.keys(PRECOS).sort()).toEqual(Object.keys(PRODUTOS_DA_PLACA).sort());
    expect(NIVEIS_DA_PLACA.map((n) => [n.id, precoDosProdutos(n.produtos, PRECOS)])).toEqual([
      ["basico", 3.18],
      ["intermediario", 5.58],
      ["economico", 10.58],
      ["completo", 30],
    ]);
  });

  it("produto sem preço (ou com preço inválido) deixa o nível sem estimativa, e não pela metade", () => {
    const { recall: _fora, ...semRecall } = PRECOS;
    void _fora;
    expect(precoDosProdutos(["estadual", "recall", "fipe"], semRecall)).toBeNull();
    expect(precoDosProdutos(["estadual"], { estadual: -1 })).toBeNull();
    expect(precoDosProdutos(["estadual"], { estadual: Number.NaN })).toBeNull();
  });

  it("os níveis se contêm: cada um é o anterior mais um produto; o completo é o Veículos Total sozinho", () => {
    const [b, i, e, c] = NIVEIS_DA_PLACA;
    expect(b.produtos).toEqual(["estadual", "recall", "fipe"]);
    expect(i.produtos).toEqual([...b.produtos, "check-list"]);
    expect(e.produtos).toEqual([...i.produtos, "historico-proprietarios"]);
    expect(c.produtos).toEqual(["veiculos-total"]);
    // O econômico confere as dez; o básico deixa leilão, sinistro e donos de fora.
    const confere = (n: typeof b) => new Set(n.produtos.flatMap((p) => PRODUTOS_DA_PLACA[p].confere));
    expect([...confere(e)].sort()).toEqual([...CHECAGENS].sort());
    expect(CHECAGENS.filter((x) => !confere(b).has(x))).toEqual(["leilao", "sinistro", "donos"]);
  });

  it("produtosQueFaltam: básico → econômico paga check-list e histórico; → completo paga o Veículos Total inteiro", () => {
    const basico = nivelDaPlaca("basico")!.produtos;
    expect(produtosQueFaltam("economico", basico)).toEqual(["check-list", "historico-proprietarios"]);
    expect(produtosQueFaltam("intermediario", basico)).toEqual(["check-list"]);
    expect(produtosQueFaltam("completo", nivelDaPlaca("economico")!.produtos)).toEqual(["veiculos-total"]);
    expect(produtosQueFaltam("basico", basico)).toEqual([]);
    expect(produtosQueFaltam("inventado" as NivelDaPlaca, basico)).toEqual([]);
    // Os R$ 7,40 que a tela mostra no botão de aprofundar.
    expect(precoDosProdutos(produtosQueFaltam("economico", basico), PRECOS)).toBe(7.4);
  });

  it("niveisParaAprofundar só oferece os níveis acima, cada um com o que falta", () => {
    expect(niveisParaAprofundar("intermediario", nivelDaPlaca("intermediario")!.produtos).map((x) => [x.nivel.id, x.faltam])).toEqual([
      ["economico", ["historico-proprietarios"]],
      ["completo", ["veiculos-total"]],
    ]);
    expect(niveisParaAprofundar("completo", ["veiculos-total"])).toEqual([]);
  });
});

describe("o envelope de cada produto (lerChamadaDaPlaca)", () => {
  it("402 é a conta sem saldo: não cobrou e é da conta", () => {
    const r = lerChamadaDaPlaca(402, { error: true, message: "Saldo insuficiente" }, "estadual");
    expect(r).toMatchObject({ ok: false, status: 402, daConta: true, podeTerCobrado: false });
    expect(!r.ok && r.motivo).toContain("sem saldo");
  });

  it.each([401, 403])("%i é o token recusado: da conta, sem cobrança", (status) => {
    const r = lerChamadaDaPlaca(status, null, "recall");
    expect(r).toMatchObject({ ok: false, status, daConta: true, podeTerCobrado: false });
    expect(!r.ok && r.motivo).toContain("token");
  });

  it.each([500, 502, 504])("%i é fora do ar, e PODE ter cobrado (cobraEmErro)", (status) => {
    for (const produto of ["estadual", "check-list", "historico-proprietarios"] as const) {
      const r = lerChamadaDaPlaca(status, null, produto);
      expect(r).toMatchObject({ ok: false, status, daConta: false, podeTerCobrado: true });
    }
  });

  it("erro com HTTP 200 (`error: true`) é falha, com a mensagem do fornecedor e a cobrança possível", () => {
    const r = lerChamadaDaPlaca(200, { error: true, message: "Placa nao encontrada na base estadual", valor_consulta: 2.5 }, "estadual");
    expect(r).toMatchObject({ ok: false, status: 200, podeTerCobrado: true, custo: 2.5 });
    expect(!r.ok && r.motivo).toBe("a APIBrasil recusou: Placa nao encontrada na base estadual");
  });

  it("'saldo insuficiente' na mensagem de um 200 também é da conta", () => {
    expect(lerChamadaDaPlaca(200, { error: true, message: "Credito insuficiente para esta consulta" }, "fipe")).toMatchObject({ ok: false, daConta: true, podeTerCobrado: false });
  });

  it("o motivo de erro sai sem CPF nem CNPJ", () => {
    const r = lerChamadaDaPlaca(200, { error: true, message: "Documento 123.456.789-01 / 11222333000181 sem permissao" }, "estadual");
    expect(!r.ok && r.motivo).toBe("a APIBrasil recusou: Documento [omitido] / [omitido] sem permissao");
  });

  it("corpo ilegível, ou sem `data`, é falha que PODE ter cobrado", () => {
    expect(lerChamadaDaPlaca(200, "isto não é json", "recall")).toMatchObject({ ok: false, podeTerCobrado: true });
    expect(lerChamadaDaPlaca(200, { error: false, message: "ok", data: null }, "recall")).toMatchObject({ ok: false, podeTerCobrado: true });
  });

  it("resposta boa devolve o miolo, o custo e se veio da homologação", () => {
    const r = lerChamadaDaPlaca(200, envelope("estadual"), "estadual");
    expect(r).toMatchObject({ ok: true, custo: 2.5, homologacao: false });
    expect(r.ok && (r.dados as { bin_estadual: { placa: string } }).bin_estadual.placa).toBe(PLACA);
    for (const homolog of [{ homolog: true }, { homolog: "true" }, { api_limit_for: "homolog" }]) {
      expect(lerChamadaDaPlaca(200, { ...envelope("recall"), ...homolog }, "recall")).toMatchObject({ ok: true, homologacao: true });
    }
    // O Agregados manda a string "false": não é homologação.
    expect(lerChamadaDaPlaca(200, { ...envelope("recall"), homolog: "false" }, "recall")).toMatchObject({ ok: true, homologacao: false });
  });

  describe("o Histórico de Proprietários tem envelope próprio", () => {
    it("`status: true` + `dados`: o miolo é `dados`, e o custo é `consulta.valor` debitado", () => {
      const r = lerChamadaDaPlaca(200, envelope("historico-proprietarios"), "historico-proprietarios");
      expect(r).toMatchObject({ ok: true, custo: 5 });
      expect(r.ok && (r.dados as { total_registros: number }).total_registros).toBe(4);
    });

    it("`status: false` é falha, com a `msg` sem documento", () => {
      const r = lerChamadaDaPlaca(200, { status: false, msg: "Nada encontrado para o CPF 12345678901" }, "historico-proprietarios");
      expect(r).toMatchObject({ ok: false, podeTerCobrado: true });
      expect(!r.ok && r.motivo).toBe("a APIBrasil recusou: Nada encontrado para o CPF [omitido]");
    });

    it("HTTP de erro vence `status: true`: não é resposta boa", () => {
      expect(lerChamadaDaPlaca(400, envelope("historico-proprietarios"), "historico-proprietarios")).toMatchObject({ ok: false, status: 400 });
      expect(lerChamadaDaPlaca(200, { ...envelope("historico-proprietarios"), status: false }, "historico-proprietarios")).toMatchObject({ ok: false });
      expect(lerChamadaDaPlaca(200, { ...envelope("historico-proprietarios"), error: true }, "historico-proprietarios")).toMatchObject({ ok: false });
    });

    it("no envelope padrão (`data.dados`) também se lê; sem miolo nenhum é falha", () => {
      const dados = envelope("historico-proprietarios").dados;
      const r = lerChamadaDaPlaca(200, { error: false, data: { dados } }, "historico-proprietarios");
      expect(r.ok && r.dados).toEqual(dados);
      expect(lerChamadaDaPlaca(200, { msg: "ok" }, "historico-proprietarios")).toMatchObject({ ok: false, podeTerCobrado: true });
    });
  });

  describe("o custo (custoDaResposta)", () => {
    it("`valor_consulta` primeiro; `tax` não serve", () => {
      expect(custoDaResposta({ valor_consulta: 3.78, tax: "0,000" })).toBe(3.78);
      expect(custoDaResposta({ valor_consulta: 0 })).toBe(0);
      expect(custoDaResposta({ tax: "2,500" })).toBeNull();
      expect(custoDaResposta({ valor_consulta: -1 })).toBeNull();
      expect(custoDaResposta(null)).toBeNull();
    });

    it("`consulta.valor` do histórico só vale debitado", () => {
      expect(custoDaResposta({ consulta: { debitado: true, valor: 16 } })).toBe(16);
      expect(custoDaResposta({ consulta: { debitado: false, valor: 16 } })).toBeNull();
    });

    it("da mensagem, só 'foi tarifado em R$ X'", () => {
      expect(custoDaResposta({ message: "Dados validos! Voce foi tarifado em R$ 0,14." })).toBe(0.14);
      expect(custoDaResposta({ message: "Dados validos! Voce foi tarifado em R$ 0.62." })).toBe(0.62);
      expect(custoDaResposta({ msg: "Consulta ok, foi tarifado em R$ 5,00" })).toBe(5);
    });

    it("'não foi tarifado… limite 990000' não vira custo", () => {
      expect(custoDaResposta({ message: "Dados validos em homologacao! Voce nao foi tarifado. Limite mensal 990000." })).toBeNull();
      expect(custoDaResposta({ message: "Você não foi tarifado em R$ 2,50 (homologação)" })).toBeNull();
      expect(custoDaResposta({ message: "Limite de 990000 consultas tarifadas" })).toBeNull();
    });
  });
});

describe("texto do fornecedor sem documento (semDocumentos)", () => {
  it.each([
    ["CPF 123.456.789-01 encontrado", "CPF [omitido] encontrado"],
    ["CPF 12345678901 encontrado", "CPF [omitido] encontrado"],
    ["CNPJ 11.222.333/0001-81", "CNPJ [omitido]"],
    ["CNPJ 11222333000181", "CNPJ [omitido]"],
    ["dono ***.396.586-** anterior", "dono [omitido] anterior"],
  ])("%s", (entrada, saida) => {
    expect(semDocumentos(entrada)).toBe(saida);
  });

  it("o resto fica: placa, ano, valor e números curtos", () => {
    const t = "Placa QOZ7702, ano 2025, R$ 2,50, renavam 0123456789, protocolo 123456789012";
    expect(semDocumentos(t)).toBe(t);
  });
});

describe("os leitores (fragmentos)", () => {
  describe("Base Estadual", () => {
    it("lê o cadastro, as quatro flags, os débitos zerados, e descarta o proprietário", () => {
      const f = lerEstadual(dadosDe("estadual"))!;
      expect(f.veiculo).toMatchObject({ descricao: "MONTADORA/PROTO HOMOLOG", marca: "MONTADORA", anoFabricacao: 2024, anoModelo: 2025, chassi: "9ZX0H0M0L0G4T001X", uf: "PR", potenciaCv: 110, cilindradas: 1600, renavam: "00000000000", emissaoDoCrv: "2024-05-09" });
      expect(f.restricao).toEqual({ financiamento: false, geral: false, renajud: false, rouboFurto: false });
      expect(f.baixado).toBe(false);
      expect(f.situacao).toBe("EM CIRCULACAO");
      expect(f.situacaoDoChassi).toBe("REGULAR");
      expect(f.debitos).toEqual({ ipva: 0, licenciamento: 0, multas: 0, dpvat: 0 });
      expect(f.debitosSemValor).toEqual([]);
      expect(f.financiamento).toBeNull();
      // A mensagem da homologação não é restrição.
      expect(f.restricoesListadas).toEqual([]);
      expect(f.cnpjDoFaturamento).toBeNull();
      const json = JSON.stringify(f);
      for (const pessoal of ["USUARIO HOMOLOG", "000.000.000-00", "proprietario", "codigo_seguranca", "1234567890\""]) expect(json).not.toContain(pessoal);
    });

    it("sem o bloco de restrições, ou com a consulta não concluída, não há fragmento", () => {
      expect(lerEstadual(dadosDe("estadual", estadualCom((b) => delete b.restricoes)))).toBeNull();
      expect(lerEstadual(dadosDe("estadual", estadualCom((b) => (b.status_retorno = { codigo: "2", descricao: "PLACA NAO ENCONTRADA" }))))).toBeNull();
      expect(lerEstadual(dadosDe("estadual", estadualCom((b) => (b.status_retorno = { codigo: 0 }))))).toBeNull();
      // Uma resposta que só ecoa a placa não é "nada consta".
      expect(lerEstadual({ bin_estadual: { placa: PLACA } })).toBeNull();
      expect(lerEstadual(null)).toBeNull();
      // Sem `status_retorno`, ele não decide.
      expect(lerEstadual(dadosDe("estadual", estadualCom((b) => delete b.status_retorno)))).not.toBeNull();
    });

    it("a mensagem de restrição vira só a categoria: nem o nome nem o CPF do comprador ficam", () => {
      const corpo = estadualCom((_b, r) => {
        r.existe_restricao_geral = "1";
        r.mensagens_restricoes = [{ mensagem: "COMUNICACAO DE VENDA - COMPRADOR JOAO DA SILVA CPF 123.456.789-01" }];
      });
      const f = lerEstadual(dadosDe("estadual", corpo))!;
      expect(f.restricoesListadas).toEqual(["Comunicação de venda"]);
      const retrato = retratoDe("basico", { estadual: corpo });
      const apontamento = retrato.apontamentos.find((a) => a.chave === "restricao_outra")!;
      expect(apontamento.gravidade).toBe("impeditivo");
      expect(apontamento.detalhe).toContain("Comunicação de venda");
      for (const texto of [JSON.stringify(f), JSON.stringify(retrato)]) {
        expect(texto).not.toContain("JOAO");
        expect(texto).not.toContain("123.456.789-01");
        expect(texto).not.toContain("12345678901");
      }
      expect(estados(retrato).restricoes).toBe("impeditivo");
    });

    it.each([
      ["RESTRICAO JUDICIAL: SIM - EXISTE ALERTA", "Restrição judicial"],
      ["ALIENACAO FIDUCIARIA - BANCO X - FINANCIADO MARIA", "Alienação ou financiamento"],
      ["VEICULO EM PATIO", "Veículo em pátio ou removido"],
      ["XPTO 123", "Outra restrição (detalhe no Detran)"],
    ])("classificarRestricao(%j) = %j", (mensagem, categoria) => {
      expect(classificarRestricao(mensagem)).toBe(categoria);
    });

    it("'nada consta' e repetidas não viram restrição listada", () => {
      const f = lerEstadual(
        dadosDe(
          "estadual",
          estadualCom((_b, r) => {
            r.mensagens_restricoes = [{ mensagem: "NADA CONSTA" }, { mensagem: "RENAJUD ATIVO" }, "RESTRICAO JUDICIAL"];
          }),
        ),
      )!;
      expect(f.restricoesListadas).toEqual(["Restrição judicial"]);
    });

    it("pendência confirmada sem valor vira 'Débito sem valor informado'; com valor, 'Débitos em aberto'", () => {
      const corpo = estadualCom((_b, r) => {
        r.ipva = { existe_pendencia: "1", observacoes: "", valor_pendencia: "" };
        r.multas = { existe_pendencia: "1", observacoes: "", valor_pendencia: "1.234,56" };
      });
      const f = lerEstadual(dadosDe("estadual", corpo))!;
      expect(f.debitos).toEqual({ ipva: null, licenciamento: 0, multas: 1234.56, dpvat: 0 });
      expect(f.debitosSemValor).toEqual(["IPVA"]);
      const retrato = retratoDe("basico", { estadual: corpo });
      const titulos = retrato.apontamentos.filter((a) => a.chave === "debitos").map((a) => a.titulo);
      expect(titulos).toEqual(["Débitos em aberto", "Débito sem valor informado"]);
      expect(estados(retrato).debitos).toBe("atencao");
    });

    it("o financiamento guarda agente, tipo e data — o financiado nunca", () => {
      const corpo = estadualCom((_b, r) => {
        r.existe_restricao_financiamento = "1";
        Object.assign(r.financiamento as object, {
          nome_agente_financeiro: "BANCO HOMOLOGACAO S/A",
          tipo_restricao_financiamento: "ALIENACAO FIDUCIARIA",
          data_inclusao: "10/06/2020",
          nome_financiado: "FINANCIADO DE TAL",
          cpf_cnpj_financiado: "123.456.789-01",
        });
      });
      const f = lerEstadual(dadosDe("estadual", corpo))!;
      expect(f.financiamento).toEqual({ agente: "BANCO HOMOLOGACAO S/A", tipo: "ALIENACAO FIDUCIARIA", dataInclusao: "2020-06-10" });
      const json = JSON.stringify(f);
      expect(json).not.toContain("FINANCIADO DE TAL");
      expect(json).not.toContain("123.456.789-01");
    });

    describe("o CNPJ do faturamento, por lista positiva", () => {
      const comFaturado = (tipo: string, numero: string) =>
        lerEstadual(
          dadosDe(
            "estadual",
            estadualCom((b) => {
              b.tipo_documento_do_faturado = tipo;
              b.numero_identificacao_do_faturado = numero;
            }),
          ),
        )!.cnpjDoFaturamento;

      it.each(["J", "JURIDICA", "JURÍDICA", "juridica", "CNPJ", "PJ"])("tipo %j com CNPJ válido: fica", (tipo) => {
        expect(comFaturado(tipo, "11.222.333/0001-81")).toBe("11222333000181");
      });

      it.each(["FÍSICA", "FISICA", "F", "PF", "CPF", ""])("tipo %j: nada", (tipo) => {
        expect(comFaturado(tipo, "11222333000181")).toBeNull();
      });

      it("CNPJ inválido, ou CPF completado com zeros, não fica nem com tipo jurídico", () => {
        expect(comFaturado("JURIDICA", "11222333000180")).toBeNull();
        expect(comFaturado("JURIDICA", "00012345678901")).toBeNull();
        expect(comFaturado("JURIDICA", "12345678901")).toBeNull();
      });
    });
  });

  describe("Recall", () => {
    it("o exemplo da doc ('não possui recall pendente') é zero", () => {
      expect(lerRecall(dadosDe("recall"))).toEqual({ pendentes: 0, texto: "Prezado cliente, o veiculo de placa QOZ7702 nao possui recall pendente desde 17/03/2011" + "." });
    });

    it("frase a frase: 'possui recall pendente. Não há outros recalls' é pendente", () => {
      expect(lerRecall({ status: true, msg: "O veiculo possui recall pendente. Nao ha outros recalls." })!.pendentes).toBe(1);
      expect(lerRecall({ status: true, msg: "Nao ha outros recalls. Existe recall em aberto para o airbag." })!.pendentes).toBe(1);
    });

    it("ambíguo, ou sem texto, é null ('não informado'), nunca zero", () => {
      expect(lerRecall({ status: true, msg: "Consulte a montadora sobre recall" })!.pendentes).toBeNull();
      expect(lerRecall({ status: true, msg: "Consulta realizada" })!.pendentes).toBeNull();
      expect(lerRecall({ status: true })).toEqual({ pendentes: null, texto: null });
      expect(lerRecall("texto solto")).toBeNull();
    });

    it("a lista estruturada conta as campanhas", () => {
      expect(lerRecall({ recallsPendente: [{ campanha: "A" }, { campanha: "B" }] })!.pendentes).toBe(2);
      expect(lerRecall({ recall: { recallsPendente: [{ campanha: "A" }] } })!.pendentes).toBe(1);
    });

    it("o texto guardado sai sem documento", () => {
      expect(lerRecall({ msg: "Recall pendente para o proprietario CPF 123.456.789-01" })!.texto).toBe("Recall pendente para o proprietario CPF [omitido]");
    });
  });

  describe("FIPE", () => {
    it("o item principal, o histórico em ordem e o cadastro — sem o chassi mascarado", () => {
      const f = lerFipeDaPlaca(dadosDe("fipe"))!;
      expect(f.fipe).toMatchObject({ codigo: "001177-0", marca: "Fiat", valorAtual: 15693 });
      expect(f.fipe!.historico).toEqual([
        { ano: 2025, mes: 11, valor: 15920 },
        { ano: 2025, mes: 12, valor: 15810 },
        { ano: 2026, mes: 1, valor: 15693 },
      ]);
      expect(f.veiculo).toMatchObject({ anoFabricacao: 2003, anoModelo: 2004, cor: "PRATA", potenciaCv: 73, uf: "SP" });
      expect(JSON.stringify(f)).not.toContain("****");
    });

    it("com vários códigos, vale o `principal`", () => {
      const d = dadosDe("fipe") as { data: Array<Record<string, unknown>> };
      d.data = [{ ...d.data[0], codigoFipe: "999999-9", principal: false, valor: 1 }, d.data[0]];
      expect(lerFipeDaPlaca(d)!.fipe!.codigo).toBe("001177-0");
    });

    it("sem item nem veículo, nada", () => {
      expect(lerFipeDaPlaca({})).toBeNull();
      expect(lerFipeDaPlaca({ data: [] })).toBeNull();
    });
  });

  describe("Check List", () => {
    it("um item por indício, com a contagem — o pdf e o status_retorno não são itens", () => {
      const f = lerCheckList(dadosDe("check-list"))!;
      expect(f.itens).toHaveLength(19);
      expect(f.itens.every((i) => i.quantidade === 0)).toBe(true);
      expect(f.itens.map((i) => i.chave)).toContain("leiloes");
      expect(f.itens.map((i) => i.chave)).not.toContain("pdf");
      expect(f.itens.map((i) => i.chave)).not.toContain("status_retorno");
    });

    it("consulta não concluída, ou sem a raiz, não é fragmento", () => {
      expect(lerCheckList(dadosDe("check-list", checkListCom((r) => (r.status_retorno = { codigo: 0, descricao: "FALHA" }))))).toBeNull();
      expect(lerCheckList({})).toBeNull();
      expect(lerCheckList({ veicular: { check_list_veicular: { pdf: "x" } } })).toBeNull();
    });

    it("a descrição do item sai sem documento", () => {
      const f = lerCheckList(dadosDe("check-list", checkListCom((r) => (r.leiloes.descricao = "Leilao do lote de 11222333000181"))))!;
      expect(f.itens.find((i) => i.chave === "leiloes")!.descricao).toBe("Leilao do lote de [omitido]");
    });
  });

  describe("Histórico de Proprietários", () => {
    it("só a contagem e, de cada transferência, data, lugar e se era pessoa ou empresa", () => {
      const f = lerHistorico(dadosDe("historico-proprietarios"))!;
      expect(f.total).toBe(4);
      expect(f.transferencias).toEqual([
        { data: "2014-01-20", uf: "MG", municipio: "BELO HORIZONTE", dono: "empresa" },
        { data: "2016-06-30", uf: "MG", municipio: "BELO HORIZONTE", dono: "empresa" },
        { data: "2019-03-12", uf: "MG", municipio: "CONTAGEM", dono: "pessoa" },
        { data: "2025-11-04", uf: "MG", municipio: "BELO HORIZONTE", dono: "pessoa" },
      ]);
      const json = JSON.stringify(f);
      for (const pessoal of ["PROPRIETARIO TESTE", "LOCADORA TESTE", "396.586", "0001-91", "nome_razao", "documento"]) expect(json).not.toContain(pessoal);
    });

    it("sem total nem lista, nada", () => {
      expect(lerHistorico({})).toBeNull();
      expect(lerHistorico({ total_registros: "x" })).toBeNull();
      expect(lerHistorico({ registros: [] })).toEqual({ total: 0, transferencias: [] });
    });
  });
});

describe("nenhum fragmento nem retrato leva chave que a tranca do banco recusa", () => {
  it("a regex da migração pega as chaves pessoais da resposta crua (senão o teste não provaria nada)", () => {
    expect(TRANCA.test(JSON.stringify(FIXTURE.estadual))).toBe(true);
    expect(TRANCA.test(JSON.stringify(FIXTURE["historico-proprietarios"]))).toBe(true);
    for (const chave of ["nome", "documento", "nome_razao", "proprietario", "cpf", "NOME"]) expect(TRANCA.test(`{"${chave}": 1}`), chave).toBe(true);
    expect(TRANCA.test('{"descricao": 1, "razaoSocial": 2, "nomeFantasia": 3}')).toBe(false);
  });

  it.each(["basico", "intermediario", "economico"] as const)("%s: fragmentos e retrato passam na tranca, e sem os nomes da resposta", (nivel) => {
    const fragmentos = fragmentosDe(nivel);
    const retrato = montarRetratoPorNivel(PLACA, nivel, fragmentos);
    for (const json of [JSON.stringify(fragmentos), JSON.stringify(retrato)]) {
      expect(TRANCA.test(json)).toBe(false);
      for (const pessoal of ["USUARIO HOMOLOG", "PROPRIETARIO TESTE", "LOCADORA TESTE", "000.000.000-00", "396.586"]) expect(json).not.toContain(pessoal);
    }
  });

  it("nem com financiado, comprador e faturado pessoa física preenchidos", () => {
    const corpo = estadualCom((b, r) => {
      b.tipo_documento_do_faturado = "FISICA";
      b.numero_identificacao_do_faturado = "12345678901";
      r.existe_restricao_geral = "1";
      r.existe_restricao_financiamento = "1";
      r.mensagens_restricoes = [{ mensagem: "COMUNICACAO DE VENDA - COMPRADOR JOAO DA SILVA CPF 123.456.789-01" }];
      Object.assign(r.financiamento as object, { nome_agente_financeiro: "BANCO X", nome_financiado: "MARIA FINANCIADA", cpf_cnpj_financiado: "98765432100" });
    });
    const fragmentos = fragmentosDe("economico", { estadual: corpo });
    const retrato = montarRetratoPorNivel(PLACA, "economico", fragmentos);
    for (const json of [JSON.stringify(fragmentos), JSON.stringify(retrato)]) {
      expect(TRANCA.test(json)).toBe(false);
      for (const pessoal of ["JOAO", "MARIA FINANCIADA", "98765432100", "12345678901", "123.456.789-01"]) expect(json).not.toContain(pessoal);
    }
  });
});

describe("o retrato por nível (montarRetratoPorNivel)", () => {
  it("básico: leilão, sinistro e donos 'não conferido', e a qualificação nunca 'apto'", () => {
    const r = retratoDe("basico");
    expect(r.nivel).toBe("basico");
    const e = estados(r);
    expect([e.leilao, e.sinistro, e.donos]).toEqual(["nao_conferido", "nao_conferido", "nao_conferido"]);
    for (const c of ["gravame", "roubo_furto", "renajud", "restricoes", "debitos", "chassi", "recall"]) expect(e[c], c).toBe("ok");
    expect(r.naoVeio.map((b) => b.chave)).toEqual(["leilao", "sinistro", "proprietarios"]);
    const q = qualificarCompra(r);
    expect(q.nivel).toBe("ressalvas");
    expect(q.motivos).toContain("Leilão: não conferido");
  });

  it("intermediário: só os donos ficam de fora", () => {
    const e = estados(retratoDe("intermediario"));
    expect(Object.entries(e).filter(([, v]) => v !== "ok")).toEqual([["donos", "nao_conferido"]]);
    expect(qualificarCompra(retratoDe("intermediario")).nivel).toBe("ressalvas");
  });

  it("econômico com tudo limpo: as dez checagens ok, nada faltando, e 'apto'", () => {
    const r = retratoDe("economico");
    const quadro = quadroDeChecagens(r);
    expect(quadro).toHaveLength(10);
    expect(quadro.filter((c) => c.estado !== "ok")).toEqual([]);
    expect(r.cobertura).toEqual(Object.fromEntries(CHECAGENS.map((c) => [c, true])));
    expect(r.naoVeio).toEqual([]);
    expect(r.apontamentos).toEqual([]);
    expect(r.pessoas.donosNoHistorico).toBe(4);
    expect(r.transferencias).toHaveLength(4);
    expect(quadro.find((c) => c.chave === "donos")!.resumo).toBe("4 donos no histórico");
    expect(qualificarCompra(r).nivel).toBe("apto");
  });

  it("econômico com as flags do Detran vazias NUNCA dá 'apto': cada uma vira 'não conferido'", () => {
    const corpo = estadualCom((_b, r) => {
      for (const k of ["existe_restricao_financiamento", "existe_restricao_geral", "existe_restricao_renajud", "existe_restricao_roubo_furto", "veiculo_baixado"]) r[k] = "";
    });
    const r = retratoDe("economico", { estadual: corpo });
    const e = estados(r);
    for (const c of ["gravame", "roubo_furto", "renajud", "restricoes"]) expect(e[c], c).toBe("nao_conferido");
    expect(qualificarCompra(r).nivel).not.toBe("apto");
  });

  it("restrições do Detran sem nenhum campo dentro: nada do Detran vira ok", () => {
    const corpo = estadualCom((b) => {
      b.restricoes = {};
      b.situacao = "";
      b.situacao_chassi = "";
    });
    const r = retratoDe("basico", { estadual: corpo });
    const e = estados(r);
    for (const c of ["gravame", "roubo_furto", "renajud", "restricoes", "debitos", "chassi"]) expect(e[c], c).toBe("nao_conferido");
    expect(qualificarCompra(r).nivel).toBe("ressalvas");
  });

  it.each([
    ["existe_restricao_roubo_furto", "roubo_furto", "Roubo ou furto em aberto"],
    ["existe_restricao_renajud", "renajud", "Bloqueio judicial (Renajud)"],
    ["existe_restricao_financiamento", "gravame", "Financiamento em aberto"],
    ["veiculo_baixado", "restricoes", "Veículo baixado"],
  ])("estadual com %s = '1' vira impeditivo na linha %s", (flag, linha, titulo) => {
    const r = retratoDe("economico", { estadual: estadualCom((_b, res) => (res[flag] = "1")) });
    expect(estados(r)[linha]).toBe("impeditivo");
    expect(r.apontamentos.map((a) => a.titulo)).toContain(titulo);
    expect(qualificarCompra(r).nivel).toBe("nao_comprar");
  });

  it("situação do chassi: 'NORMAL' é ok; qualquer outra é impeditivo", () => {
    expect(estados(retratoDe("basico", { estadual: estadualCom((b) => (b.situacao_chassi = "NORMAL")) })).chassi).toBe("ok");
    const r = retratoDe("basico", { estadual: estadualCom((b) => (b.situacao_chassi = "REMARCADO")) });
    expect(estados(r).chassi).toBe("impeditivo");
  });

  it("chassi sem situação no Detran: o básico não confere; o Check List legível confere", () => {
    const corpo = estadualCom((b) => (b.situacao_chassi = ""));
    expect(estados(retratoDe("basico", { estadual: corpo })).chassi).toBe("nao_conferido");
    expect(estados(retratoDe("intermediario", { estadual: corpo })).chassi).toBe("ok");
    const semIndicio = checkListCom((r) => {
      r.indicio_chassi_adulterado.quantidade_ocorrencias = "";
      delete r.indicio_chassi_adulterado.ocorrencias;
    });
    expect(estados(retratoDe("intermediario", { estadual: corpo, "check-list": semIndicio })).chassi).toBe("nao_conferido");
  });

  it("Check List com leilões > 0 vira impeditivo na linha Leilão", () => {
    const r = retratoDe("intermediario", { "check-list": checkListCom((r) => (r.leiloes.quantidade_ocorrencias = 2)) });
    expect(estados(r).leilao).toBe("impeditivo");
    expect(r.leilao).toEqual({ consta: true, registros: 2, descricao: null });
    expect(qualificarCompra(r).nivel).toBe("nao_comprar");
  });

  it("perda total e salvados são impeditivo de sinistro; locadora é atenção nos donos", () => {
    const r = retratoDe("economico", {
      "check-list": checkListCom((r) => {
        r.historico_indenizacao_integral.quantidade_ocorrencias = 1;
        r.frota_locadora.quantidade_ocorrencias = "3";
      }),
    });
    const e = estados(r);
    expect(e.sinistro).toBe("impeditivo");
    expect(e.donos).toBe("atencao");
    expect(r.sinistro.consta).toBe(true);
    expect(r.locadora).toBe(true);
  });

  it("item do Check List que a doc não descreve aparece na linha Sinistro, e não some", () => {
    const r = retratoDe("intermediario", {
      "check-list": checkListCom((r) => {
        r.item_novo_do_fornecedor = { descricao: "Indicio novo", ocorrencias: [{}], quantidade_ocorrencias: 1, relevancia: "MEDIA" };
      }),
    });
    expect(r.apontamentos).toEqual([expect.objectContaining({ chave: "check_list", gravidade: "atencao", titulo: "Indicio novo" })]);
    expect(estados(r).sinistro).toBe("atencao");
  });

  it("leilão com quantidade ilegível e sem lista de ocorrências: não conferido", () => {
    for (const q of ["", null, "null", "muitas"]) {
      const chk = checkListCom((r) => {
        r.leiloes.quantidade_ocorrencias = q;
        delete r.leiloes.ocorrencias;
      });
      const r = retratoDe("economico", { "check-list": chk });
      expect(estados(r).leilao, String(q)).toBe("nao_conferido");
      expect(qualificarCompra(r).nivel).not.toBe("apto");
    }
  });

  // Regressão (19/10/2026): quantidade ilegível com `ocorrencias: []` (o formato da doc) contava 0 e o leilão saía "ok".
  it("leilão com quantidade \"\" e `ocorrencias: []` (o formato da doc): não conferido", () => {
    const chk = checkListCom((r) => (r.leiloes.quantidade_ocorrencias = ""));
    expect(estados(retratoDe("economico", { "check-list": chk })).leilao).toBe("nao_conferido");
  });

  it("sinistro exige indenização integral E salvados legíveis", () => {
    for (const item of ["historico_indenizacao_integral", "comercio_lojas_salvados"]) {
      const chk = checkListCom((r) => delete r[item]);
      const r = retratoDe("economico", { "check-list": chk });
      expect(estados(r).sinistro, item).toBe("nao_conferido");
      expect(qualificarCompra(r).nivel).not.toBe("apto");
    }
  });

  it("formato inesperado não vira ok: produto que não se lê some, e o que ele conferia fica 'não conferido'", () => {
    const fragmentos: FragmentosDaPlaca = {};
    const lidos = {
      estadual: lerEstadual({ bin_estadual: { placa: PLACA, chassi: "9ZX0H0M0L0G4T001X" } }),
      recall: lerRecall({ status: true, msg: "Consulta realizada" }),
      fipe: lerFipeDaPlaca({ resultado: "ok" }),
      "check-list": lerCheckList({ veicular: { outro_formato: [] } }),
      "historico-proprietarios": lerHistorico({ lista: [] }),
    };
    for (const [p, f] of Object.entries(lidos)) if (f) (fragmentos as Record<string, unknown>)[p] = f;
    const r = montarRetratoPorNivel(PLACA, "economico", fragmentos);
    const quadro = quadroDeChecagens(r);
    expect(quadro.filter((c) => c.estado === "ok")).toEqual([]);
    expect(quadro.every((c) => c.estado === "nao_conferido")).toBe(true);
    expect(r.naoVeio.map((b) => b.chave)).toContain("fipe");
    expect(qualificarCompra(r).nivel).toBe("ressalvas");
  });

  it("recall pendente vira atenção; a FIPE que falhou entra no que não veio", () => {
    const recall = { ...envelope("recall"), data: { status: true, msg: "O veiculo possui recall pendente do airbag." } };
    expect(estados(retratoDe("basico", { recall })).recall).toBe("atencao");
    const semFipe = fragmentosDe("basico");
    delete semFipe.fipe;
    const r = montarRetratoPorNivel(PLACA, "basico", semFipe, ["fipe"]);
    expect(r.naoVeio.filter((b) => b.chave === "fipe")).toEqual([{ chave: "fipe", titulo: "Tabela FIPE", detalhe: "A FIPE do fornecedor não veio nesta consulta." }]);
    expect(r.fipe).toBeNull();
  });

  it("o cadastro junta Base Estadual e FIPE, a estadual primeiro", () => {
    const r = retratoDe("basico");
    // Ano, cor e UF da estadual; nada da FIPE sobrescreve.
    expect(r.veiculo).toMatchObject({ anoFabricacao: 2024, anoModelo: 2025, cor: "AZUL", uf: "PR", chassi: "9ZX0H0M0L0G4T001X" });
    // O que a estadual não trouxe, a FIPE completa.
    const semCor = retratoDe("basico", { estadual: estadualCom((b) => (b.cor_veiculo = "")) });
    expect(semCor.veiculo.cor).toBe("PRATA");
  });
});

describe("recall: 'sem pendência' só com a negação explícita (2ª revisão, 19/10/2026)", () => {
  const casos: Array<[string, number | null]> = [
    ["Não foi possível consultar recall no momento", null],
    ["Serviço de recall não disponível", null],
    ["Recall não informado pela montadora", null],
    ["O chassi não foi localizado na base de recall", null],
    ["Não há recall pendente, mas possui recall em aberto", 1],
    ["possui recall pendente. Não há outros recalls", 1],
    ["O veículo não possui recall pendente desde 17/03/2011", 0],
    ["Veículo possui 2 recalls pendentes", 1],
    ["Nenhum recall pendente encontrado", 0],
    ["Sem recall pendente", 0],
  ];
  for (const [msg, esperado] of casos) {
    it(`"${msg}" → ${esperado === null ? "não informado" : esperado}`, () => {
      expect(lerRecall({ msg })?.pendentes).toBe(esperado);
    });
  }
});
