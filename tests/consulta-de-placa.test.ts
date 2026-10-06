import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACAO_CONSULTAR_PLACA,
  CNAE_DE_LOCADORA,
  MESES_PROJETADOS,
  PAPEIS_QUE_CONSULTAM_PLACA,
  dataDoFornecedor,
  decodificarChassi,
  leituraAcimaDoHodometro,
  lerRespostaDaApiBrasil,
  mesclarGratuito,
  normalizarPlaca,
  numeroDoFornecedor,
  quadroDeChecagens,
  qualificarCompra,
  serieDoGrafico,
  tendenciaDaFipe,
  type RetratoDaConsulta,
} from "../src/lib/consultaDePlaca";
import { MATRIZ_DE_PERMISSOES, PERFIS } from "../src/lib/permissoes";

/**
 * A consulta de placa (pedido do dono em 06/10/2026), na parte pura: o leitor
 * da resposta da APIBrasil, a mescla com o que vem sem custo, o quadro de
 * checagens, a qualificação e a série do gráfico.
 *
 * As duas respostas em `tests/fixtures/apibrasil/` são as REAIS que a
 * APIBrasil devolveu em 06/10, com placa, chassi, renavam, nomes e documentos
 * trocados por fictícios. A de MG tem alienação fiduciária em aberto; a do PR
 * veio SEM a base estadual, e foi comparada campo a campo com o laudo da
 * vistoria parceira.
 */

const resposta = (nome: string) =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", `${nome}.json`), "utf8")) as Record<string, unknown>;

function retratoDe(nome: string, placa: string): RetratoDaConsulta {
  const r = lerRespostaDaApiBrasil(resposta(nome), placa);
  if (!r.ok) throw new Error(r.motivo);
  return r.retrato;
}

const MG = () => retratoDe("veiculos-total-mg-com-alienacao", "ABC1D23");
const PR = () => retratoDe("veiculos-total-pr-sem-base-estadual", "BRA2E19");

describe("a placa", () => {
  it("aceita as duas máscaras e devolve a forma canônica", () => {
    expect(normalizarPlaca("abc-1234")).toBe("ABC1234");
    expect(normalizarPlaca(" bra2e19 ")).toBe("BRA2E19");
  });
  it("recusa o que não é placa", () => {
    for (const v of ["", "AB12345", "ABCD123", "ABC12D3", "ABC1D2", 1234567, null, undefined]) {
      expect(normalizarPlaca(v), String(v)).toBeNull();
    }
  });
});

describe("os números e as datas do fornecedor", () => {
  it("lê as quatro formas que apareceram nas respostas reais", () => {
    expect(numeroDoFornecedor("116904.00")).toBe(116904);
    expect(numeroDoFornecedor("87000")).toBe(87000);
    expect(numeroDoFornecedor("0,00")).toBe(0);
    // "30,000" é trinta reais com três casas, e não trinta mil.
    expect(numeroDoFornecedor("30,000")).toBe(30);
    expect(numeroDoFornecedor("1.234,56")).toBe(1234.56);
  });
  it("não inventa número de texto que não é número", () => {
    for (const v of ["", "abc", "R$ 10", null, undefined, {}, "--"]) expect(numeroDoFornecedor(v)).toBeNull();
  });
  it("data com ou sem hora vira AAAA-MM-DD, e data impossível vira null", () => {
    expect(dataDoFornecedor("16/04/2026")).toBe("2026-04-16");
    expect(dataDoFornecedor("24/02/2026 16:08:30")).toBe("2026-02-24");
    expect(dataDoFornecedor("31/02/2026")).toBeNull();
    expect(dataDoFornecedor(null)).toBeNull();
  });
});

describe("o leitor: o que recusa", () => {
  it("erro do fornecedor chega com HTTP 200 e `error: true`: vira motivo, não retrato", () => {
    const r = lerRespostaDaApiBrasil({ error: true, message: "Placa não encontrada" }, "ABC1D23");
    expect(r).toEqual({ ok: false, motivo: "Placa não encontrada" });
  });
  it("`error` ausente não é sucesso", () => {
    expect(lerRespostaDaApiBrasil({ data: {} }, "ABC1D23").ok).toBe(false);
  });
  it("resposta de OUTRA placa é recusada: um retrato nunca é gravado na chave errada", () => {
    const r = lerRespostaDaApiBrasil(resposta("veiculos-total-mg-com-alienacao"), "XYZ9Z99");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("outra placa");
  });
  it("em homologação o fornecedor responde com a placa de exemplo dele, e aí vale", () => {
    const corpo = { ...resposta("veiculos-total-mg-com-alienacao"), homolog: true };
    const r = lerRespostaDaApiBrasil(corpo, "XYZ9Z99");
    expect(r.ok && r.homologacao).toBe(true);
  });
});

describe("dado pessoal não entra no retrato", () => {
  it.each([
    ["MG", MG],
    ["PR", PR],
  ])("%s: nem nome, nem CPF, nem a conta do fornecedor", (_uf, retrato) => {
    const texto = JSON.stringify(retrato());
    for (const pessoal of ["FULANO", "000.000.001-01", "000.000.002-02", "00000000202", "conta@exemplo.invalid"]) {
      expect(texto, pessoal).not.toContain(pessoal);
    }
    // As chaves que a tabela recusa (consultas_de_placa_sem_dado_pessoal).
    expect(texto).not.toMatch(/"(proprietario|pronome|pronomeAnterior|cpfCnpj|cpf|documentoFinanciado|restricaoArrendatario|restricaoDocArrendatario|email|cellphone)"\s*:/i);
  });
  it("as fixtures TÊM o dado pessoal que o leitor precisa descartar (senão o teste acima não prova nada)", () => {
    const bruto = JSON.stringify(resposta("veiculos-total-mg-com-alienacao"));
    expect(bruto).toContain("FULANO DE TAL");
    expect(bruto).toContain("documentoFinanciado");
  });
  it("dos documentos fica só a contagem", () => {
    expect(MG().pessoas).toEqual({ donosNoHistorico: 1, financiadosDistintos: 2 });
    expect(PR().pessoas).toEqual({ donosNoHistorico: 0, financiadosDistintos: 1 });
  });
  it("o CNPJ de faturamento fica: é de empresa", () => {
    expect(MG().primeiroFaturamento).toEqual({ para: "empresa", cnpj: "00000000000191", uf: "MG" });
  });
  it("faturamento para pessoa física não guarda o documento", () => {
    const corpo = resposta("veiculos-total-mg-com-alienacao");
    const dados = corpo.data as Record<string, unknown>;
    dados.docFaturado = "12345678901";
    (dados.baseNacional as Record<string, unknown>).tipoDocFaturado = "FISICA";
    const r = lerRespostaDaApiBrasil(corpo, "ABC1D23");
    expect(r.ok && r.retrato.primeiroFaturamento).toEqual({ para: "pessoa", cnpj: null, uf: "MG" });
    expect(JSON.stringify(r)).not.toContain("12345678901");
  });
});

describe("MG: o carro com alienação em aberto", () => {
  it("o gravame aberto é impeditivo, com banco e data; o baixado não é", () => {
    const r = MG();
    const impeditivos = r.apontamentos.filter((a) => a.gravidade === "impeditivo");
    expect(impeditivos).toHaveLength(1);
    expect(impeditivos[0].chave).toBe("gravame");
    expect(impeditivos[0].detalhe).toContain("SAFRA");
    expect(impeditivos[0].detalhe).toContain("02/04/2026");
    expect(r.gravames.map((g) => g.baixado)).toEqual([true, false]);
  });
  it("dois financiados e um dono no histórico: aponta que houve mais donos", () => {
    expect(MG().apontamentos.map((a) => a.chave)).toContain("donos");
  });
  it("a base estadual veio: débitos zerados são débitos conferidos", () => {
    const r = MG();
    expect(r.debitos).toEqual({ ipva: 0, licenciamento: 0, multas: 0, dpvat: 0 });
    expect(r.naoVeio.map((b) => b.chave)).toEqual(["recall"]);
    expect(r.veiculo.emissaoDoCrv).toBe("2026-04-16");
  });
  it("custo e saldo saem como o fornecedor informou", () => {
    const r = lerRespostaDaApiBrasil(resposta("veiculos-total-mg-com-alienacao"), "ABC1D23");
    expect(r.ok && [r.custo, r.saldo, r.homologacao]).toEqual([30, 970, false]);
  });
});

describe("PR: bloco que não veio não é nada consta", () => {
  it("sem base estadual, os débitos são `null` e o bloco aparece em `naoVeio`", () => {
    const r = PR();
    expect(r.debitos).toBeNull();
    expect(r.naoVeio.map((b) => b.chave)).toEqual(["base_estadual", "recall", "proprietarios"]);
    expect(r.apontamentos).toEqual([]);
  });
  it("o quadro marca débitos e restrições do Detran como NÃO CONFERIDOS, nunca como ok", () => {
    const quadro = Object.fromEntries(quadroDeChecagens(PR()).map((c) => [c.chave, c.estado]));
    expect(quadro.debitos).toBe("nao_conferido");
    expect(quadro.restricoes).toBe("nao_conferido");
    expect(quadro.recall).toBe("nao_conferido");
    expect(quadro.donos).toBe("nao_conferido");
    expect(quadro.leilao).toBe("ok");
    expect(quadro.gravame).toBe("ok");
  });
  it("sem impeditivo, mas com coisa por conferir: ressalvas, e não apto", () => {
    const q = qualificarCompra(PR());
    expect(q.nivel).toBe("ressalvas");
    expect(q.motivos.join(" ")).toContain("Base estadual");
  });
});

describe("os apontamentos que as respostas reais não têm", () => {
  const com = (mexer: (dados: Record<string, unknown>) => void) => {
    const corpo = resposta("veiculos-total-mg-com-alienacao");
    mexer(corpo.data as Record<string, unknown>);
    const r = lerRespostaDaApiBrasil(corpo, "ABC1D23");
    if (!r.ok) throw new Error(r.motivo);
    return r.retrato;
  };
  const chaves = (r: RetratoDaConsulta, gravidade: string) =>
    r.apontamentos.filter((a) => a.gravidade === gravidade).map((a) => a.chave);

  it("leilão com registro é impeditivo", () => {
    const r = com((d) => {
      (d.leilao as Record<string, unknown>).registros = [{ lote: "1" }, { lote: "2" }];
    });
    expect(chaves(r, "impeditivo")).toContain("leilao");
    expect(r.apontamentos.find((a) => a.chave === "leilao")?.detalhe).toBe("2 registros de leilão.");
  });
  it("roubo ativo é impeditivo; ocorrência encerrada é atenção", () => {
    expect(chaves(com((d) => { d.rouboFurto = { constaOcorrencia: true, constaOcorrenciaAtiva: true, historico: [] }; }), "impeditivo")).toContain("roubo_furto");
    expect(chaves(com((d) => { d.rouboFurto = { constaOcorrencia: true, constaOcorrenciaAtiva: false, historico: [{}] }; }), "atencao")).toContain("roubo_furto_historico");
  });
  it("Renajud e restrição judicial são impeditivos", () => {
    const r = com((d) => {
      const e = d.baseEstadual as Record<string, unknown>;
      e.restricaoRenajud = "BLOQUEIO DE TRANSFERENCIA";
      e.restricaoJudicial = "PENHORA";
    });
    expect(chaves(r, "impeditivo")).toEqual(expect.arrayContaining(["renajud", "restricao_judicial"]));
  });
  it("débito em aberto é atenção, com a soma", () => {
    const r = com((d) => {
      const e = d.baseEstadual as Record<string, unknown>;
      e.debitoLicenciamento = "94,61";
      e.debitoMultas = "195,23";
    });
    const debitos = r.apontamentos.find((a) => a.chave === "debitos");
    expect(debitos?.gravidade).toBe("atencao");
    // Só o número: o `toLocaleString` separa o "R$" com espaço não separável.
    expect(debitos?.detalhe).toContain("289,84");
  });
  it("sinistro, locadora, recall e comunicação de venda são atenção", () => {
    const r = com((d) => {
      d.indicioSinistro = { classificacao: "MEDIA MONTA", descricao: "CONSTA INDICIO DE SINISTRO" };
      d.registroEmLocadora = { registroEmLocadora: true };
      d.recall = { descricaoRetorno: "ok", detalhes: [], recallsPendente: [{ id: 1 }] };
      (d.baseEstadual as Record<string, unknown>).comunicacaoVenda = "CONSTA COMUNICACAO DE VENDA";
    });
    expect(chaves(r, "atencao")).toEqual(expect.arrayContaining(["sinistro", "locadora", "recall", "comunicacao_de_venda"]));
    expect(r.recallsPendentes).toBe(1);
    expect(r.naoVeio.map((b) => b.chave)).not.toContain("recall");
  });
  it("carro fora de circulação é impeditivo", () => {
    const r = com((d) => {
      (d.baseEstadual as Record<string, unknown>).situacaoVeiculo = "BAIXADO";
    });
    expect(chaves(r, "impeditivo")).toContain("situacao");
  });
  it("o parecer do fornecedor sai sem o emoji", () => {
    expect(MG().risco.parecer).toBe("Veículo com baixo risco de recusa em comercialização/seguro");
    expect(MG().sinistro.descricao).toBe("NÃO CONSTA INDÍCIO DE SINISTRO PARA O VEÍCULO INFORMADO");
  });
});

describe("a tendência da FIPE", () => {
  it("MG: os números conferidos à mão em 06/10", () => {
    const t = tendenciaDaFipe(MG().fipe!.historico)!;
    expect(t.referencia).toBe("2026-10");
    expect(t.valorAtual).toBe(116904);
    expect(t.variacoes.map((v) => [v.meses, v.pct])).toEqual([[6, -2.7], [12, -3.2], [24, -2.5]]);
    expect(t.pico).toEqual({ ano: 2022, mes: 3, valor: 142853, pct: -18.2 });
    expect(t.ritmo).toBe("acelerando");
  });
  it("PR: os números conferidos à mão em 06/10", () => {
    const t = tendenciaDaFipe(PR().fipe!.historico)!;
    expect(t.variacoes.map((v) => [v.meses, v.pct])).toEqual([[6, -6], [12, -10.4], [24, -16.5]]);
    expect(t.pico.pct).toBe(-35.9);
  });
  it("série curta só mostra as janelas que alcança, e não inventa ritmo", () => {
    const t = tendenciaDaFipe([
      { ano: 2026, mes: 1, valor: 100 },
      { ano: 2026, mes: 7, valor: 90 },
    ])!;
    expect(t.variacoes).toEqual([{ meses: 6, de: 100, pct: -10 }]);
    expect(t.ritmo).toBeNull();
    expect(tendenciaDaFipe([])).toBeNull();
  });
  it("a janela é por mês de calendário: buraco na série não desloca a conta", () => {
    const t = tendenciaDaFipe([
      { ano: 2025, mes: 10, valor: 200 },
      // Faltam novembro a março.
      { ano: 2026, mes: 4, valor: 150 },
      { ano: 2026, mes: 10, valor: 100 },
    ])!;
    expect(t.variacoes.map((v) => [v.meses, v.pct])).toEqual([[6, -33.3], [12, -50]]);
  });
});

describe("o chassi, lido sem consultar ninguém", () => {
  it("os dois carros reais: o ano da 10ª posição confere com o ano-modelo", () => {
    // Mesmo código de ano dos chassis verdadeiros (M = 2021, N = 2022).
    expect(MG().chassi).toEqual({ ano: 2021, origem: "Brasil", confereComOCadastro: true });
    expect(PR().chassi).toEqual({ ano: 2022, origem: "Argentina ou outro país da América do Sul", confereComOCadastro: true });
  });
  it("o código se repete a cada 30 anos: vale o ciclo mais perto do cadastro", () => {
    expect(decodificarChassi("9BWZZZ377VT004251", [1997])?.ano).toBe(1997);
    expect(decodificarChassi("9BWZZZ377VT004251", [2027, 2027])?.ano).toBe(2027);
  });
  it("bater com o ano de fabricação OU com o ano-modelo confere", () => {
    expect(decodificarChassi("9BRZZZ00XM0000001", [2020, 2021])?.confereComOCadastro).toBe(true);
    expect(decodificarChassi("9BRZZZ00XM0000001", [2021, 2022])?.confereComOCadastro).toBe(true);
    expect(decodificarChassi("9BRZZZ00XM0000001", [2018, 2019])?.confereComOCadastro).toBe(false);
  });
  it("chassi que não tem 17 posições válidas não é lido", () => {
    expect(decodificarChassi("9BRZZZ00XM000000", [2021])).toBeNull();
    expect(decodificarChassi("9BRZZZ00XO0000001", [2021])).toBeNull(); // "O" não existe em chassi
    expect(decodificarChassi(null)).toBeNull();
  });
  it("ano do chassi diferente do cadastro vira apontamento de atenção", () => {
    const corpo = resposta("veiculos-total-mg-com-alienacao");
    (corpo.data as Record<string, unknown>).chassi = "9BRZZZ00XJ0000001"; // J = 2018
    const r = lerRespostaDaApiBrasil(corpo, "ABC1D23");
    expect(r.ok && r.retrato.apontamentos.find((a) => a.chave === "chassi_ano")?.detalhe).toContain("2018");
    expect(r.ok && quadroDeChecagens(r.retrato).find((c) => c.chave === "chassi")?.estado).toBe("atencao");
  });
});

describe("a mescla com o que veio sem custo", () => {
  const empresa = (cnae: string) => ({ razaoSocial: "FROTA SA", nomeFantasia: "Frota", cnae, atividade: "Locação de automóveis sem condutor", locadora: cnae === CNAE_DE_LOCADORA });

  it("locadora no CNPJ de faturamento vira apontamento, mesmo com o fornecedor dizendo que não", () => {
    const base = PR();
    expect(base.locadora).toBe(false);
    const r = mesclarGratuito(base, { empresaDoFaturamento: empresa(CNAE_DE_LOCADORA), fipeOficial: null, falhas: [] });
    expect(r.apontamentos.map((a) => a.chave)).toEqual(["locadora"]);
    expect(quadroDeChecagens(r).find((c) => c.chave === "donos")?.estado).toBe("atencao");
    // O de entrada não muda.
    expect(base.apontamentos).toEqual([]);
    expect(base.gratuito).toBeNull();
  });
  it("concessionária no CNPJ não aponta nada", () => {
    const r = mesclarGratuito(PR(), { empresaDoFaturamento: empresa("4511101"), fipeOficial: null, falhas: [] });
    expect(r.apontamentos).toEqual([]);
    expect(r.gratuito?.empresaDoFaturamento?.razaoSocial).toBe("FROTA SA");
  });
  it("FIPE pública igual à do fornecedor só confirma", () => {
    const r = mesclarGratuito(PR(), { empresaDoFaturamento: null, fipeOficial: { valor: 128430, mesReferencia: "outubro de 2026" }, falhas: [] });
    expect(r.apontamentos).toEqual([]);
    expect(r.fipe?.valorAtual).toBe(128430);
  });
  it("FIPE pública diferente: aponta, e a conta passa a usar a pública", () => {
    const r = mesclarGratuito(PR(), { empresaDoFaturamento: null, fipeOficial: { valor: 127000, mesReferencia: null }, falhas: [] });
    expect(r.apontamentos.map((a) => a.chave)).toEqual(["fipe_divergente"]);
    expect(r.fipe?.valorAtual).toBe(127000);
  });
  it("falha da parte gratuita não tira nada do retrato pago", () => {
    const base = MG();
    const r = mesclarGratuito(base, { empresaDoFaturamento: null, fipeOficial: null, falhas: ["x"] });
    expect({ ...r, gratuito: null }).toEqual(base);
    expect(r.gratuito?.falhas).toEqual(["x"]);
  });
});

describe("a qualificação", () => {
  it("impeditivo manda: não comprar, com o impeditivo primeiro na lista", () => {
    const q = qualificarCompra(MG());
    expect(q.nivel).toBe("nao_comprar");
    expect(q.motivos[0]).toBe("Financiamento em aberto");
  });
  it("retrato limpo e completo: apto", () => {
    const limpo: RetratoDaConsulta = { ...PR(), naoVeio: [], apontamentos: [] };
    expect(qualificarCompra(limpo)).toEqual({ nivel: "apto", titulo: "Sem impedimento na consulta", motivos: [] });
  });
  it("deságio acima do teto da curva vira não comprar, mesmo com o retrato limpo", () => {
    const limpo: RetratoDaConsulta = { ...PR(), naoVeio: [], apontamentos: [] };
    const q = qualificarCompra(limpo, { acimaDoTeto: true });
    expect(q.nivel).toBe("nao_comprar");
    expect(q.motivos[0]).toContain("repasse");
  });
  it("hodômetro abaixo de leitura anterior vira não comprar", () => {
    const r = PR();
    const acima = leituraAcimaDoHodometro(r.leiturasDeKm, 20000);
    expect(acima).toEqual({ data: "2024-01-15", km: 31135 });
    expect(qualificarCompra(r, { leituraAcima: acima }).nivel).toBe("nao_comprar");
    expect(leituraAcimaDoHodometro(r.leiturasDeKm, 31135)).toBeNull();
    expect(leituraAcimaDoHodometro(r.leiturasDeKm, null)).toBeNull();
  });
});

describe("a série do gráfico", () => {
  it("36 meses de tabela mais a projeção, com a faixa de compra em cada ponto", () => {
    const pontos = serieDoGrafico(PR().fipe!.historico, { min: 15, max: 20 });
    expect(pontos).toHaveLength(36 + MESES_PROJETADOS);
    const atual = pontos[35];
    expect([atual.ano, atual.mes, atual.fipe, atual.projetado]).toEqual([2026, 10, 128430, false]);
    // O maior deságio dá o menor valor.
    expect([atual.compraMin, atual.compraMax]).toEqual([102744, 109166]);
  });
  it("a projeção repete o ritmo dos últimos 6 meses e atravessa a virada do ano", () => {
    const projetados = serieDoGrafico(PR().fipe!.historico, null).filter((p) => p.projetado);
    expect(projetados.map((p) => `${p.ano}-${p.mes}`)).toEqual(["2026-11", "2026-12", "2027-1"]);
    // 136697 → 128430 em 6 meses: cerca de -1,03% ao mês.
    expect(projetados[0].fipe).toBe(127102);
    expect(projetados[2].fipe).toBeLessThan(projetados[0].fipe);
    expect(projetados.every((p) => p.compraMin === null)).toBe(true);
  });
  it("sem 6 meses de série não há projeção", () => {
    const curta = [
      { ano: 2026, mes: 8, valor: 100 },
      { ano: 2026, mes: 9, valor: 99 },
    ];
    expect(serieDoGrafico(curta, null).some((p) => p.projetado)).toBe(false);
    expect(serieDoGrafico([], null)).toEqual([]);
  });
});

describe("quem consulta", () => {
  it("a matriz dá a consulta a Administrador, Gestor e Comercial, e a mais ninguém", () => {
    const linha = MATRIZ_DE_PERMISSOES.find((l) => l.acao === ACAO_CONSULTAR_PLACA);
    expect(linha, "a linha da matriz existe").toBeTruthy();
    expect(PERFIS.filter((p) => linha!.permissoes[p] === "faz")).toEqual(["admin", "gestor", "comercial"]);
    expect([...PAPEIS_QUE_CONSULTAM_PLACA]).toEqual(["admin", "gestor", "comercial"]);
  });
  it("o trilho e a RLS repetem os mesmos três papéis", () => {
    const raiz = join(__dirname, "..");
    const trilho = readFileSync(join(raiz, "src", "components", "admin", "SidebarNav.tsx"), "utf8");
    expect(trilho).toMatch(/name: "Consulta de placa", href: "\/admin\/consulta-placa", roles: \["admin", "gestor", "comercial"\]/);
    const sql = readFileSync(join(raiz, "supabase", "migrations", "20261006180000_consultas_de_placa.sql"), "utf8");
    for (const papel of PAPEIS_QUE_CONSULTAM_PLACA) expect(sql).toContain(`tem_papel(auth.uid(), '${papel}')`);
    expect(sql).not.toMatch(/tem_papel\(auth\.uid\(\), '(marketing|financeiro|sdr)'\)/);
  });
  it("as chaves pessoais que o banco recusa são as que o teste do leitor confere", () => {
    const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261006180000_consultas_de_placa.sql"), "utf8");
    expect(sql).toContain("(proprietario|pronome|pronomeAnterior|cpfCnpj|cpf|documentoFinanciado|restricaoArrendatario|restricaoDocArrendatario|email|cellphone)");
  });
});
