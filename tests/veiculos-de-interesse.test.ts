import { describe, it, expect } from "vitest";
import {
  AVISO_DE_VEICULOS_INDISPONIVEL,
  LIMITE_DA_NOTA,
  LIMITE_DO_LOTE,
  MOTIVOS_DE_DESCARTE,
  ROTULO_DO_MOTIVO_DE_DESCARTE,
  decidirInclusao,
  decidirLote,
  decidirResolucao,
  ehVeiculosIndisponivel,
  erroDeVeiculosNaTela,
  filtroDaBuscaDeCarro,
  finalDaPlaca,
  idDeVeiculo,
  montarRankingDeInteresse,
  montarRelatorioDoVeiculo,
  opcaoQueOGanhoEscolhe,
  pendenciasAoFechar,
  percentual,
  planejarResolucoes,
  principalComoOpcao,
  ramosDaPlaca,
  semPrincipalValido,
  rotuloDoMotivo,
  rotuloDoVeiculoNaTela,
  sucessorDoPrincipal,
  veiculosDoLeadNaTela,
  type LinhaDaOpcao,
} from "../src/lib/veiculosDeInteresse";

/**
 * `lib/veiculosDeInteresse` (05/10/2026): a metade pura dos veículos de
 * interesse do lead. As rotas, executadas, estão em
 * `tests/veiculos-de-interesse-rotas.test.ts`; o banco, em
 * `tests/migracao-dos-veiculos-de-interesse.test.ts` e no aceite da migração.
 */

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "aaaaaaaa-0000-4000-8000-000000000002";
const C = "aaaaaaaa-0000-4000-8000-000000000003";

const linha = (id: string, veiculo: number, extra: Partial<LinhaDaOpcao> = {}): LinhaDaOpcao => ({
  id,
  lead_id: "lead",
  veiculo_id: veiculo,
  veiculo_rotulo: `carro ${veiculo}`,
  veiculo_preco: 50000,
  situacao: "em_avaliacao",
  motivo_descarte: null,
  nota: null,
  adicionado_por: "Ana",
  resolvido_por: null,
  criado_em: `2026-10-0${id.slice(-1)}T12:00:00Z`,
  resolvido_em: null,
  ...extra,
});

describe("os motivos de descarte", () => {
  it("são treze, cada um com rótulo, e `outro` é o último", () => {
    expect(MOTIVOS_DE_DESCARTE).toHaveLength(13);
    expect(Object.keys(ROTULO_DO_MOTIVO_DE_DESCARTE).sort()).toEqual([...MOTIVOS_DE_DESCARTE].sort());
    for (const m of MOTIVOS_DE_DESCARTE) expect(ROTULO_DO_MOTIVO_DE_DESCARTE[m].trim()).not.toBe("");
    expect(MOTIVOS_DE_DESCARTE.at(-1)).toBe("outro");
  });

  it("rotuloDoMotivo: o rótulo, a chave crua do que não conhece, e nulo para o vazio", () => {
    expect(rotuloDoMotivo("preco")).toBe("Preço acima do que queria");
    expect(rotuloDoMotivo("motivo_novo_do_banco")).toBe("motivo_novo_do_banco");
    expect(rotuloDoMotivo(null)).toBeNull();
    expect(rotuloDoMotivo("  ")).toBeNull();
  });
});

describe("rotuloDoVeiculoNaTela — o retrato do banco na grafia da tela", () => {
  it("capitaliza pela régua do modelo, sem mexer em número", () => {
    expect(rotuloDoVeiculoNaTela("fiat uno mille fire economy 2013")).toBe("Fiat Uno Mille Fire Economy 2013");
    expect(rotuloDoVeiculoNaTela("hyundai hb20 comfort 1.0 flex 12v 2020")).toBe("Hyundai HB20 Comfort 1.0 Flex 12V 2020");
  });

  it("vazio continua vazio", () => {
    expect(rotuloDoVeiculoNaTela(null)).toBe("");
    expect(rotuloDoVeiculoNaTela("   ")).toBe("");
  });
});

describe("ehVeiculosIndisponivel — a tabela ou a função ainda não existe", () => {
  it.each([
    ["PGRST205", "Could not find the table 'public.leads_veiculos' in the schema cache"],
    ["PGRST202", "Could not find the function public.interesse_por_veiculo without parameters in the schema cache"],
    ["42P01", 'relation "public.leads_veiculos" does not exist'],
    ["42883", "function public.resumo_de_interesse_do_veiculo(bigint) does not exist"],
  ])("%s é indisponível", (code, message) => {
    expect(ehVeiculosIndisponivel({ code, message })).toBe(true);
  });

  it("sem código, vale a frase do PostgREST", () => {
    expect(ehVeiculosIndisponivel({ message: "Could not find the table 'public.leads_veiculos' in the schema cache" })).toBe(true);
    expect(ehVeiculosIndisponivel({ message: "Could not find the function public.interesse_por_veiculo in the schema cache" })).toBe(true);
    // A frase sobre OUTRO objeto não é dos veículos de interesse.
    expect(ehVeiculosIndisponivel({ message: "Could not find the function public.x in the schema cache" })).toBe(false);
  });

  it("42P01 e 42883 de OUTRO objeto são erro de verdade, e não 'ainda não ativo'", () => {
    // Uma relação que o gatilho lê, a view do estoque, uma função qualquer:
    // tratar como migração pendente esconderia o defeito atrás de uma tela normal.
    for (const [code, message] of [
      ["42P01", 'relation "public.estoque_motors" does not exist'],
      ["42P01", 'relation "public.leads" does not exist'],
      ["42P01", 'relation "public.estoque_motors_equipe" does not exist'],
      ["42883", "function public.autor_atual() does not exist"],
      ["42883", "function public.rotulo_de_veiculo(text, text, text, integer) does not exist"],
      ["42P01", ""],
    ]) {
      expect(ehVeiculosIndisponivel({ code, message }), message).toBe(false);
    }
    expect(ehVeiculosIndisponivel({ code: "42P01" })).toBe(false);
    expect(erroDeVeiculosNaTela({ code: "42P01", message: 'relation "public.estoque_motors" does not exist' })).toMatchObject({
      status: 500,
      codigo: "erro_do_banco",
    });
  });

  it.each([
    ["42703", "column leads_veiculos.x does not exist"],
    ["42501", "permission denied for table leads_veiculos"],
    ["23505", "duplicate key"],
    ["PGRST116", "JSON object requested, multiple (or no) rows returned"],
    // Código presente manda: a frase parecida não vira "indisponível".
    ["42501", "Could not find the table 'x' in the schema cache"],
  ])("%s NÃO é: é defeito, e aparece como erro", (code, message) => {
    expect(ehVeiculosIndisponivel({ code, message })).toBe(false);
  });

  it("nulo, texto e erro sem nada não são", () => {
    for (const v of [null, undefined, "PGRST205", {}, { message: "timeout" }]) expect(ehVeiculosIndisponivel(v)).toBe(false);
  });
});

describe("erroDeVeiculosNaTela — a constraint pelo nome, na frase da tela", () => {
  const violou = (code: string, nome: string) => ({
    code,
    message: `new row for relation "leads_veiculos" violates check constraint "${nome}"`,
  });

  it.each([
    ["23505", "leads_veiculos_lead_veiculo_unico", 409, "veiculo_repetido"],
    ["23505", "leads_veiculos_um_escolhido_por_lead", 409, "ja_ha_escolhido"],
    ["23514", "leads_veiculos_situacao_valida", 400, "situacao_invalida"],
    ["23514", "leads_veiculos_motivo_valido", 400, "motivo_invalido"],
    ["23514", "leads_veiculos_motivo_so_no_descarte", 400, "motivo_de_descarte_obrigatorio"],
    ["23514", "leads_veiculos_outro_pede_nota", 400, "nota_obrigatoria"],
    ["23514", "leads_veiculos_nota_cabe", 400, "nota_longa"],
    ["23503", "leads_veiculos_lead_id_fkey", 404, "lead_nao_encontrado"],
  ])("%s %s → %i %s", (code, nome, status, codigo) => {
    const r = erroDeVeiculosNaTela(violou(code, nome));
    expect(r).toMatchObject({ status, codigo });
    // A frase é para gente: não leva o nome da constraint.
    expect(r.erro).not.toContain("leads_veiculos_");
  });

  it("as regras do gatilho vêm sem o nome no texto: pelo SQLSTATE", () => {
    expect(
      erroDeVeiculosNaTela({ code: "23503", message: "O veículo 999 não está no estoque: só entra como opção do lead um carro que existe." }),
    ).toEqual({ status: 422, codigo: "veiculo_desconhecido", erro: "Este carro não está no estoque." });
    expect(
      erroDeVeiculosNaTela({ code: "23514", message: "A opção não troca de lead nem de carro: adicione o outro carro e descarte este." }),
    ).toMatchObject({ status: 400, codigo: "regra_do_banco" });
  });

  it("tabela ausente é 503 `veiculos_indisponivel`, com frase sem jargão", () => {
    const r = erroDeVeiculosNaTela({ code: "PGRST205", message: "Could not find the table" });
    expect(r).toEqual({ status: 503, codigo: "veiculos_indisponivel", erro: AVISO_DE_VEICULOS_INDISPONIVEL });
    expect(r.erro).not.toMatch(/migra|schema|tabela|PGRST/i);
  });

  it("permissão negada é 403; o resto é 500 com a mensagem do banco", () => {
    expect(erroDeVeiculosNaTela({ code: "42501", message: "permission denied" })).toMatchObject({ status: 403, codigo: "sem_permissao" });
    expect(erroDeVeiculosNaTela({ code: "57014", message: "canceling statement" })).toEqual({
      status: 500,
      codigo: "erro_do_banco",
      erro: "canceling statement",
    });
    expect(erroDeVeiculosNaTela(null)).toMatchObject({ status: 500, codigo: "erro_do_banco" });
  });
});

describe("decidirInclusao", () => {
  it("aceita o id em número ou em texto, e `principal`", () => {
    expect(decidirInclusao({ veiculo_id: 8203724 })).toEqual({ ok: true, veiculo_id: 8203724, principal: false });
    expect(decidirInclusao({ veiculo_id: " 8203724 ", principal: true })).toEqual({ ok: true, veiculo_id: 8203724, principal: true });
  });

  it.each([
    [null, "corpo_invalido"],
    [[{ veiculo_id: 1 }], "corpo_invalido"],
    [{}, "veiculo_invalido"],
    [{ veiculo_id: "abc" }, "veiculo_invalido"],
    [{ veiculo_id: 0 }, "veiculo_invalido"],
    [{ veiculo_id: -3 }, "veiculo_invalido"],
    [{ veiculo_id: 1.5 }, "veiculo_invalido"],
    [{ veiculo_id: "1e3" }, "veiculo_invalido"],
    [{ veiculo_id: 1, principal: "sim" }, "principal_invalido"],
    [{ veiculo_id: 1, situacao: "escolhido" }, "campo_desconhecido"],
  ])("%j → %s", (corpo, codigo) => {
    expect(decidirInclusao(corpo)).toMatchObject({ ok: false, status: 400, codigo });
  });

  it("idDeVeiculo", () => {
    expect(idDeVeiculo("42")).toBe(42);
    expect(idDeVeiculo(42)).toBe(42);
    for (const v of ["", "4 2", "-1", null, undefined, {}, 2 ** 60]) expect(idDeVeiculo(v)).toBeNull();
  });
});

describe("decidirResolucao", () => {
  const emAvaliacao = { situacao: "em_avaliacao", motivo_descarte: null, nota: null };

  it("descartar pede motivo da lista", () => {
    expect(decidirResolucao({ situacao: "descartado", motivo_descarte: "preco" }, emAvaliacao)).toEqual({
      ok: true,
      campos: { situacao: "descartado", motivo_descarte: "preco" },
      principal: false,
    });
    expect(decidirResolucao({ situacao: "descartado" }, emAvaliacao)).toMatchObject({ ok: false, codigo: "motivo_de_descarte_obrigatorio" });
    expect(decidirResolucao({ situacao: "descartado", motivo_descarte: "" }, emAvaliacao)).toMatchObject({ codigo: "motivo_de_descarte_obrigatorio" });
    expect(decidirResolucao({ situacao: "descartado", motivo_descarte: "caro" }, emAvaliacao)).toMatchObject({ codigo: "motivo_invalido" });
  });

  it("`outro` pede nota: a do pedido ou a que a opção já tem", () => {
    expect(decidirResolucao({ situacao: "descartado", motivo_descarte: "outro" }, emAvaliacao)).toMatchObject({ codigo: "nota_obrigatoria" });
    expect(decidirResolucao({ situacao: "descartado", motivo_descarte: "outro", nota: "   " }, emAvaliacao)).toMatchObject({ codigo: "nota_obrigatoria" });
    expect(decidirResolucao({ situacao: "descartado", motivo_descarte: "outro", nota: " Achou o banco duro " }, emAvaliacao)).toEqual({
      ok: true,
      campos: { situacao: "descartado", motivo_descarte: "outro", nota: "Achou o banco duro" },
      principal: false,
    });
    expect(
      decidirResolucao({ situacao: "descartado", motivo_descarte: "outro" }, { ...emAvaliacao, nota: "já anotado" }),
    ).toMatchObject({ ok: true, campos: { situacao: "descartado", motivo_descarte: "outro" } });
  });

  it("apagar a nota de um descarte `outro` é recusado", () => {
    const atual = { situacao: "descartado", motivo_descarte: "outro", nota: "o porquê" };
    expect(decidirResolucao({ nota: "" }, atual)).toMatchObject({ ok: false, codigo: "nota_obrigatoria" });
    expect(decidirResolucao({ nota: "outro porquê" }, atual)).toEqual({ ok: true, campos: { nota: "outro porquê" }, principal: false });
  });

  it("reabrir e escolher limpam o motivo, e guardam a nota", () => {
    const descartado = { situacao: "descartado", motivo_descarte: "preco", nota: "achou caro" };
    expect(decidirResolucao({ situacao: "em_avaliacao" }, descartado)).toEqual({
      ok: true,
      campos: { situacao: "em_avaliacao", motivo_descarte: null },
      principal: false,
    });
    expect(decidirResolucao({ situacao: "escolhido" }, descartado)).toEqual({
      ok: true,
      campos: { situacao: "escolhido", motivo_descarte: null },
      principal: false,
    });
    // `null` explícito no motivo é o mesmo pedido.
    expect(decidirResolucao({ situacao: "em_avaliacao", motivo_descarte: null }, descartado)).toMatchObject({ ok: true });
  });

  it("motivo com situação que não é descarte é contradição, e é recusada", () => {
    expect(decidirResolucao({ situacao: "escolhido", motivo_descarte: "preco" }, emAvaliacao)).toMatchObject({ codigo: "motivo_so_no_descarte" });
    expect(decidirResolucao({ situacao: "em_avaliacao", motivo_descarte: "km" }, emAvaliacao)).toMatchObject({ codigo: "motivo_so_no_descarte" });
    expect(decidirResolucao({ motivo_descarte: "km" }, emAvaliacao)).toMatchObject({ codigo: "motivo_so_no_descarte" });
  });

  it("trocar só o motivo de um descarte já feito", () => {
    const descartado = { situacao: "descartado", motivo_descarte: "preco", nota: null };
    expect(decidirResolucao({ motivo_descarte: "km" }, descartado)).toEqual({ ok: true, campos: { motivo_descarte: "km" }, principal: false });
    expect(decidirResolucao({ motivo_descarte: null }, descartado)).toMatchObject({ codigo: "motivo_de_descarte_obrigatorio" });
  });

  it("a nota: texto, aparada, vazia vira nula, e cabe na coluna", () => {
    expect(decidirResolucao({ nota: "  gostou da cor " }, emAvaliacao)).toEqual({ ok: true, campos: { nota: "gostou da cor" }, principal: false });
    expect(decidirResolucao({ nota: "" }, emAvaliacao)).toEqual({ ok: true, campos: { nota: null }, principal: false });
    expect(decidirResolucao({ nota: 12 }, emAvaliacao)).toMatchObject({ codigo: "nota_invalida" });
    expect(decidirResolucao({ nota: "x".repeat(LIMITE_DA_NOTA) }, emAvaliacao)).toMatchObject({ ok: true });
    expect(decidirResolucao({ nota: "x".repeat(LIMITE_DA_NOTA + 1) }, emAvaliacao)).toMatchObject({ codigo: "nota_longa" });
  });

  it("`principal` só aceita true, e carro descartado não é o principal", () => {
    expect(decidirResolucao({ principal: true }, emAvaliacao)).toEqual({ ok: true, campos: {}, principal: true });
    expect(decidirResolucao({ principal: false }, emAvaliacao)).toMatchObject({ codigo: "principal_invalido" });
    expect(decidirResolucao({ principal: true }, { situacao: "descartado", motivo_descarte: "km" })).toMatchObject({ codigo: "principal_descartado" });
    expect(decidirResolucao({ principal: true, situacao: "descartado", motivo_descarte: "km" }, emAvaliacao)).toMatchObject({
      codigo: "principal_descartado",
    });
    // Reabrindo no mesmo pedido, pode.
    expect(decidirResolucao({ principal: true, situacao: "em_avaliacao" }, { situacao: "descartado", motivo_descarte: "km" })).toMatchObject({
      ok: true,
      principal: true,
    });
  });

  it.each([
    [null, "corpo_invalido"],
    ["descartado", "corpo_invalido"],
    [{}, "sem_campos"],
    [{ situacao: undefined }, "sem_campos"],
    [{ situacao: "vendido" }, "situacao_invalida"],
    [{ situacao: "escolhido", veiculo_id: 9 }, "campo_desconhecido"],
    [{ resolvido_por: "Outro" }, "campo_desconhecido"],
  ])("%j → %s", (corpo, codigo) => {
    expect(decidirResolucao(corpo, emAvaliacao)).toMatchObject({ ok: false, status: 400, codigo });
  });
});

describe("planejarResolucoes — a ordem das gravações e o veículo principal", () => {
  it("escolher torna o carro o principal", () => {
    const plano = planejarResolucoes([linha(A, 1), linha(B, 2)], 1, [
      { opcao: B, campos: { situacao: "escolhido", motivo_descarte: null } },
    ]);
    expect(plano).toEqual({
      ok: true,
      passos: [{ opcao: B, campos: { situacao: "escolhido", motivo_descarte: null }, implicito: false }],
      principal: 2,
    });
  });

  it("escolher com outro já escolhido: o anterior é reaberto ANTES (o índice único parcial)", () => {
    const plano = planejarResolucoes([linha(A, 1, { situacao: "escolhido" }), linha(B, 2)], 1, [
      { opcao: B, campos: { situacao: "escolhido", motivo_descarte: null } },
    ]);
    expect(plano).toEqual({
      ok: true,
      passos: [
        { opcao: A, campos: { situacao: "em_avaliacao", motivo_descarte: null }, implicito: true },
        { opcao: B, campos: { situacao: "escolhido", motivo_descarte: null }, implicito: false },
      ],
      principal: 2,
    });
  });

  it("no lote, o escolhido vai por último, venha em que posição vier", () => {
    const plano = planejarResolucoes([linha(A, 1, { situacao: "escolhido" }), linha(B, 2), linha(C, 3)], 1, [
      { opcao: B, campos: { situacao: "escolhido", motivo_descarte: null } },
      { opcao: A, campos: { situacao: "descartado", motivo_descarte: "outro_da_loja" } },
      { opcao: C, campos: { situacao: "descartado", motivo_descarte: "preco" } },
    ]);
    expect(plano.ok && plano.passos.map((p) => p.opcao)).toEqual([A, C, B]);
    expect(plano.ok && plano.passos.every((p) => !p.implicito)).toBe(true);
    expect(plano.ok && plano.principal).toBe(2);
  });

  it("o escolhido anterior que o lote só ANOTA é reaberto no mesmo passo", () => {
    const plano = planejarResolucoes([linha(A, 1, { situacao: "escolhido" }), linha(B, 2)], 1, [
      { opcao: A, campos: { nota: "preferiu o outro" } },
      { opcao: B, campos: { situacao: "escolhido", motivo_descarte: null } },
    ]);
    expect(plano.ok && plano.passos).toEqual([
      { opcao: A, campos: { nota: "preferiu o outro", situacao: "em_avaliacao", motivo_descarte: null }, implicito: false },
      { opcao: B, campos: { situacao: "escolhido", motivo_descarte: null }, implicito: false },
    ]);
  });

  it("dois escolhidos no mesmo pedido: recusa", () => {
    expect(
      planejarResolucoes([linha(A, 1), linha(B, 2)], 1, [
        { opcao: A, campos: { situacao: "escolhido" } },
        { opcao: B, campos: { situacao: "escolhido" } },
      ]),
    ).toMatchObject({ ok: false, status: 400, codigo: "varios_escolhidos" });
  });

  it("descartar o principal passa o principal à opção em avaliação mais antiga", () => {
    const opcoes = [linha(A, 1), linha(C, 3), linha(B, 2)];
    const plano = planejarResolucoes(opcoes, 1, [{ opcao: A, campos: { situacao: "descartado", motivo_descarte: "km" } }]);
    expect(plano.ok && plano.principal).toBe(2);
  });

  it("descartar o principal sem outra opção em avaliação: o principal fica", () => {
    const sozinho = planejarResolucoes([linha(A, 1)], 1, [{ opcao: A, campos: { situacao: "descartado", motivo_descarte: "km" } }]);
    expect(sozinho.ok && sozinho.principal).toBeUndefined();
    const outroDescartado = planejarResolucoes([linha(A, 1), linha(B, 2, { situacao: "descartado", motivo_descarte: "cor" })], 1, [
      { opcao: A, campos: { situacao: "descartado", motivo_descarte: "km" } },
    ]);
    expect(outroDescartado.ok && outroDescartado.principal).toBeUndefined();
  });

  it("descartar quem NÃO é o principal, reabrir e anotar não mexem no principal", () => {
    const opcoes = [linha(A, 1), linha(B, 2, { situacao: "escolhido" })];
    for (const campos of [{ situacao: "descartado" as const, motivo_descarte: "km" as const }, { nota: "x" }]) {
      const plano = planejarResolucoes(opcoes, 2, [{ opcao: A, campos }]);
      expect(plano.ok && plano.principal).toBeUndefined();
    }
    const reabrir = planejarResolucoes(opcoes, 2, [{ opcao: B, campos: { situacao: "em_avaliacao", motivo_descarte: null } }]);
    expect(reabrir.ok && reabrir.principal).toBeUndefined();
  });

  it("`principal: true` troca o principal; sem passo quando é só isso", () => {
    const plano = planejarResolucoes([linha(A, 1), linha(B, 2)], 1, [{ opcao: B, campos: {}, principal: true }]);
    expect(plano).toEqual({ ok: true, passos: [], principal: 2 });
    // Já é o principal: nada a fazer.
    const igual = planejarResolucoes([linha(A, 1), linha(B, 2)], "2", [{ opcao: B, campos: {}, principal: true }]);
    expect(igual).toEqual({ ok: true, passos: [], principal: undefined });
  });

  it("com um carro escolhido, outro não vira o principal: 409", () => {
    expect(
      planejarResolucoes([linha(A, 1, { situacao: "escolhido" }), linha(B, 2)], 1, [{ opcao: B, campos: {}, principal: true }]),
    ).toMatchObject({ ok: false, status: 409, codigo: "principal_ja_escolhido", opcao: B });
  });

  it("opção que não é do lead: 404; a mesma opção duas vezes: 400", () => {
    expect(planejarResolucoes([linha(A, 1)], 1, [{ opcao: B, campos: { nota: "x" } }])).toMatchObject({
      ok: false,
      status: 404,
      codigo: "opcao_nao_encontrada",
      opcao: B,
    });
    expect(
      planejarResolucoes([linha(A, 1)], 1, [
        { opcao: A, campos: { nota: "x" } },
        { opcao: A, campos: { nota: "y" } },
      ]),
    ).toMatchObject({ ok: false, status: 400, codigo: "opcao_repetida" });
  });

  it("principal num carro DESCARTADO é como não ter principal: a opção reaberta assume", () => {
    const descartado = { situacao: "descartado", motivo_descarte: "km" as const };
    const opcoes = [linha(A, 1, descartado), linha(B, 2, descartado)];
    // O principal (A) está descartado; reabrir B o torna o principal.
    const plano = planejarResolucoes(opcoes, 1, [{ opcao: B, campos: { situacao: "em_avaliacao", motivo_descarte: null } }]);
    expect(plano.ok && plano.principal).toBe(2);
    // Reabrir o próprio principal: ele já é o principal.
    const oProprio = planejarResolucoes(opcoes, 1, [{ opcao: A, campos: { situacao: "em_avaliacao", motivo_descarte: null } }]);
    expect(oProprio.ok && oProprio.principal).toBeUndefined();
    // Com o principal em avaliação, reabrir outro não o desloca.
    const valido = planejarResolucoes([linha(A, 1), linha(B, 2, descartado)], 1, [
      { opcao: B, campos: { situacao: "em_avaliacao", motivo_descarte: null } },
    ]);
    expect(valido.ok && valido.principal).toBeUndefined();
    // Só anotar a opção descartada não é reabrir.
    const anotar = planejarResolucoes(opcoes, 1, [{ opcao: B, campos: { nota: "x" } }]);
    expect(anotar.ok && anotar.principal).toBeUndefined();
  });

  it("semPrincipalValido: sem `veiculo_id`, ou com ele numa opção descartada", () => {
    const descartada = linha(A, 1, { situacao: "descartado", motivo_descarte: "km" });
    expect(semPrincipalValido([linha(A, 1)], null)).toBe(true);
    expect(semPrincipalValido([], undefined)).toBe(true);
    expect(semPrincipalValido([descartada, linha(B, 2)], 1)).toBe(true);
    expect(semPrincipalValido([descartada, linha(B, 2)], "2")).toBe(false);
    expect(semPrincipalValido([linha(A, 1, { situacao: "escolhido" })], 1)).toBe(false);
    // Principal sem linha: é um carro de verdade, e segura o lugar.
    expect(semPrincipalValido([descartada], 9)).toBe(false);
  });

  it("sucessorDoPrincipal: o escolhido, senão a em avaliação mais antiga, senão nulo", () => {
    expect(sucessorDoPrincipal([linha(B, 2), linha(A, 1)])).toBe(1);
    expect(sucessorDoPrincipal([linha(A, 1), linha(B, 2, { situacao: "escolhido" })])).toBe(2);
    expect(sucessorDoPrincipal([linha(A, 1, { situacao: "descartado", motivo_descarte: "km" })])).toBeNull();
    expect(sucessorDoPrincipal([])).toBeNull();
  });
});

describe("decidirLote", () => {
  it("separa a opção do corpo de cada item", () => {
    expect(
      decidirLote([
        { opcao: A, situacao: "escolhido" },
        { opcao: B, situacao: "descartado", motivo_descarte: "preco", nota: "caro" },
      ]),
    ).toEqual({
      ok: true,
      itens: [
        { opcao: A, corpo: { situacao: "escolhido" } },
        { opcao: B, corpo: { situacao: "descartado", motivo_descarte: "preco", nota: "caro" } },
      ],
    });
  });

  it.each([
    [{ resolucoes: [] }, "lote_invalido"],
    [null, "lote_invalido"],
    [[], "lote_vazio"],
    [[{ situacao: "escolhido" }], "opcao_invalida"],
    [[{ opcao: "1", situacao: "escolhido" }], "opcao_invalida"],
    [["x"], "opcao_invalida"],
    [[{ opcao: A }], "situacao_invalida"],
    [[{ opcao: A, situacao: "vendido" }], "situacao_invalida"],
    [[{ opcao: A, situacao: "escolhido" }, { opcao: A.toUpperCase(), situacao: "em_avaliacao" }], "opcao_repetida"],
  ])("%j → %s", (corpo, codigo) => {
    expect(decidirLote(corpo)).toMatchObject({ ok: false, status: 400, codigo });
  });

  it("tem teto", () => {
    const muitos = Array.from({ length: LIMITE_DO_LOTE + 1 }, (_, i) => ({
      opcao: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`,
      situacao: "em_avaliacao",
    }));
    expect(decidirLote(muitos)).toMatchObject({ ok: false, codigo: "lote_grande" });
    expect(decidirLote(muitos.slice(1))).toMatchObject({ ok: true });
  });
});

describe("veiculosDoLeadNaTela", () => {
  const linhas = [
    linha(B, 2, { veiculo_rotulo: "fiat uno mille 2013", veiculo_preco: "21900.00", situacao: "descartado", motivo_descarte: "km", nota: "rodado demais", resolvido_por: "Ana", resolvido_em: "2026-10-04T12:00:00Z" }),
    linha(A, 1, { veiculo_rotulo: "chevrolet onix lt 1.0 2020", veiculo_preco: 62900 }),
    linha(C, 3, { veiculo_rotulo: "", veiculo_preco: null }),
  ];
  const carros = [
    { id: 1, quilometragem: 45000, preco: 59900, vendido: false },
    { id: "2", quilometragem: "120000", preco: "21900.00", vendido: true },
  ];

  it("o principal primeiro, depois por ordem de entrada; preço da época e de hoje lado a lado", () => {
    const v = veiculosDoLeadNaTela(linhas, carros, 2);
    expect(v.map((o) => o.id)).toEqual([B, A, C]);
    expect(v[0]).toEqual({
      id: B,
      veiculo_id: 2,
      rotulo: "Fiat Uno Mille 2013",
      preco_na_epoca: 21900,
      preco_atual: 21900,
      km: 120000,
      no_estoque: true,
      vendido: true,
      situacao: "descartado",
      motivo_descarte: "km",
      motivo_rotulo: "Quilometragem",
      nota: "rodado demais",
      adicionado_por: "Ana",
      criado_em: "2026-10-02T12:00:00Z",
      resolvido_por: "Ana",
      resolvido_em: "2026-10-04T12:00:00Z",
      principal: true,
    });
    expect(v[1]).toMatchObject({ rotulo: "Chevrolet Onix LT 1.0 2020", preco_na_epoca: 62900, preco_atual: 59900, principal: false, motivo_rotulo: null });
  });

  it("carro que saiu do estoque: o retrato fica, `no_estoque` é falso", () => {
    const v = veiculosDoLeadNaTela(linhas, carros, null);
    expect(v.find((o) => o.id === C)).toMatchObject({ rotulo: "Veículo nº 3", preco_atual: null, km: null, no_estoque: false, vendido: null, principal: false });
    expect(v.every((o) => !o.principal)).toBe(true);
  });

  it("estoque ilegível: `no_estoque` nulo, e não falso", () => {
    const v = veiculosDoLeadNaTela(linhas, null, 1);
    for (const o of v) expect(o).toMatchObject({ no_estoque: null, vendido: null, preco_atual: null });
  });

  it("principalComoOpcao: o carro único como uma opção sem linha", () => {
    expect(
      principalComoOpcao(
        { veiculo_id: 1, interesse: "Onix 2020", created_at: "2026-09-25T12:00:00Z" },
        { id: 1, nome: "Chevrolet Onix LT 1.0 2020", quilometragem: 45000, preco: 62900, vendido: false },
      ),
    ).toEqual({
      id: null,
      veiculo_id: 1,
      rotulo: "Chevrolet Onix LT 1.0 2020",
      preco_na_epoca: null,
      preco_atual: 62900,
      km: 45000,
      no_estoque: true,
      vendido: false,
      situacao: "em_avaliacao",
      motivo_descarte: null,
      motivo_rotulo: null,
      nota: null,
      adicionado_por: null,
      criado_em: "2026-09-25T12:00:00Z",
      resolvido_por: null,
      resolvido_em: null,
      principal: true,
    });
    // Fora do estoque: o interesse do lead, e em último caso o número.
    expect(principalComoOpcao({ veiculo_id: 7, interesse: " Uno 2013 " }, null)).toMatchObject({ rotulo: "Uno 2013", no_estoque: false });
    expect(principalComoOpcao({ veiculo_id: "7" }, null)).toMatchObject({ veiculo_id: 7, rotulo: "Veículo nº 7" });
    expect(principalComoOpcao({ veiculo_id: null }, null)).toBeNull();
  });
});

describe("pendenciasAoFechar", () => {
  const o = (id: string | null, situacao: "em_avaliacao" | "escolhido" | "descartado", veiculo = 1) => ({
    id,
    veiculo_id: veiculo,
    rotulo: `Carro ${veiculo}`,
    situacao,
  });

  it("lead aberto ou perdido: toda opção em avaliação é pendência", () => {
    const opcoes = [o(A, "em_avaliacao", 1), o(B, "descartado", 2), o(C, "em_avaliacao", 3)];
    for (const desfecho of [null, undefined, "perdido", "descartado"]) {
      expect(pendenciasAoFechar(opcoes, desfecho)).toEqual({
        pendentes: [
          { opcao: A, veiculo_id: 1, rotulo: "Carro 1" },
          { opcao: C, veiculo_id: 3, rotulo: "Carro 3" },
        ],
        escolha_automatica: null,
        falta_escolhido: false,
      });
    }
  });

  it("ganho com UMA opção em avaliação: ela é escolhida sozinha, e não é pendência", () => {
    expect(pendenciasAoFechar([o(A, "em_avaliacao")], "ganho")).toEqual({ pendentes: [], escolha_automatica: A, falta_escolhido: false });
    // Perdido com uma opção: continua pendência.
    expect(pendenciasAoFechar([o(A, "em_avaliacao")], "perdido").pendentes).toHaveLength(1);
  });

  it("ganho com várias em avaliação e nenhuma escolhida: tudo pendente, e falta o escolhido", () => {
    const r = pendenciasAoFechar([o(A, "em_avaliacao", 1), o(B, "em_avaliacao", 2)], "ganho");
    expect(r.pendentes.map((p) => p.opcao)).toEqual([A, B]);
    expect(r).toMatchObject({ escolha_automatica: null, falta_escolhido: true });
  });

  it("ganho com escolhido: só as outras em avaliação", () => {
    const r = pendenciasAoFechar([o(A, "escolhido", 1), o(B, "em_avaliacao", 2), o(C, "descartado", 3)], "ganho");
    expect(r).toEqual({ pendentes: [{ opcao: B, veiculo_id: 2, rotulo: "Carro 2" }], escolha_automatica: null, falta_escolhido: false });
  });

  it("ganho com a única opção já descartada: nada é escolhido por cima, e falta o escolhido", () => {
    expect(pendenciasAoFechar([o(A, "descartado")], "ganho")).toEqual({ pendentes: [], escolha_automatica: null, falta_escolhido: true });
  });

  it("opção sem linha (`id: null`) não entra; sem opção, nada pende", () => {
    expect(pendenciasAoFechar([o(null, "em_avaliacao")], null).pendentes).toEqual([]);
    expect(pendenciasAoFechar([], "perdido")).toEqual({ pendentes: [], escolha_automatica: null, falta_escolhido: false });
  });

  it("o principal sem linha CONTA como carro: com ele ao lado de uma opção, o ganho não escolhe sozinho", () => {
    // É o que a tela mostra: dois carros. Quem diz qual foi comprado é o vendedor.
    const r = pendenciasAoFechar([o(null, "em_avaliacao", 9), o(A, "em_avaliacao", 1)], "ganho");
    expect(r).toEqual({ pendentes: [{ opcao: A, veiculo_id: 1, rotulo: "Carro 1" }], escolha_automatica: null, falta_escolhido: true });
    // Só o principal sem linha: nada a escolher nem a resolver.
    expect(pendenciasAoFechar([o(null, "em_avaliacao", 9)], "ganho")).toEqual({ pendentes: [], escolha_automatica: null, falta_escolhido: true });
  });

  it("opcaoQueOGanhoEscolhe: UM carro ao todo (linhas + principal sem linha), e em avaliação", () => {
    const uma = (situacao: string) => [{ id: A, situacao, veiculo_id: 1 }];
    expect(opcaoQueOGanhoEscolhe(uma("em_avaliacao"), null)).toBe(A);
    expect(opcaoQueOGanhoEscolhe(uma("em_avaliacao"), 1)).toBe(A);
    expect(opcaoQueOGanhoEscolhe(uma("em_avaliacao"), "1")).toBe(A);
    // O principal aponta para OUTRO carro, que não tem linha: são dois carros.
    expect(opcaoQueOGanhoEscolhe(uma("em_avaliacao"), 9)).toBeNull();
    expect(opcaoQueOGanhoEscolhe(uma("descartado"), 1)).toBeNull();
    expect(opcaoQueOGanhoEscolhe(uma("escolhido"), 1)).toBeNull();
    expect(opcaoQueOGanhoEscolhe([...uma("em_avaliacao"), { id: B, situacao: "descartado", veiculo_id: 2 }], 1)).toBeNull();
    expect(opcaoQueOGanhoEscolhe([], 1)).toBeNull();
  });
});

describe("montarRelatorioDoVeiculo", () => {
  const DO_BANCO = {
    veiculo_id: 8203724,
    total: 8,
    em_avaliacao: 3,
    sem_resolucao: 1,
    escolhido: 1,
    descartado: 4,
    motivos: [
      { motivo: "preco", total: 2 },
      { motivo: "km", total: 1 },
      { motivo: "outro", total: 1 },
    ],
    notas: [
      { motivo: "outro", nota: " Achou o banco duro ", em: "2026-10-04T15:00:00+00:00" },
      { motivo: "preco", nota: "queria 5 mil a menos", em: "2026-10-02T15:00:00+00:00" },
    ],
    primeiro_interesse_em: "2026-09-01T12:00:00+00:00",
    ultimo_interesse_em: "2026-10-04T12:00:00+00:00",
  };

  it("contagens, percentuais sobre o total, motivos com rótulo sobre os descartes, notas", () => {
    expect(montarRelatorioDoVeiculo([DO_BANCO])).toEqual({
      veiculo_id: 8203724,
      total: 8,
      em_avaliacao: 3,
      sem_resolucao: 1,
      escolhido: 1,
      descartado: 4,
      percentuais: { em_avaliacao: 37.5, sem_resolucao: 12.5, escolhido: 12.5, descartado: 50 },
      motivo_principal: { motivo: "preco", rotulo: "Preço acima do que queria", total: 2, percentual: 50 },
      motivos: [
        { motivo: "preco", rotulo: "Preço acima do que queria", total: 2, percentual: 50 },
        { motivo: "km", rotulo: "Quilometragem", total: 1, percentual: 25 },
        { motivo: "outro", rotulo: "Outro", total: 1, percentual: 25 },
      ],
      notas: [
        { texto: "Achou o banco duro", motivo: "outro", motivo_rotulo: "Outro", em: "2026-10-04T15:00:00+00:00" },
        { texto: "queria 5 mil a menos", motivo: "preco", motivo_rotulo: "Preço acima do que queria", em: "2026-10-02T15:00:00+00:00" },
      ],
      primeiro_interesse_em: "2026-09-01T12:00:00+00:00",
      ultimo_interesse_em: "2026-10-04T12:00:00+00:00",
    });
    // A linha solta vale o mesmo que a lista de uma linha.
    expect(montarRelatorioDoVeiculo(DO_BANCO)).toEqual(montarRelatorioDoVeiculo([DO_BANCO]));
  });

  it("os motivos saem do mais citado ao menos, venham em que ordem vierem", () => {
    const r = montarRelatorioDoVeiculo({ ...DO_BANCO, motivos: [{ motivo: "km", total: 1 }, { motivo: "preco", total: 2 }, { motivo: "cor", total: 1 }] });
    expect(r.motivos.map((m) => m.motivo)).toEqual(["preco", "cor", "km"]);
  });

  it("ninguém considerou: zeros, e nenhum NaN", () => {
    const vazio = montarRelatorioDoVeiculo([{ veiculo_id: 5, total: 0, em_avaliacao: 0, sem_resolucao: 0, escolhido: 0, descartado: 0, motivos: [], notas: [], primeiro_interesse_em: null, ultimo_interesse_em: null }]);
    expect(vazio).toMatchObject({
      total: 0,
      percentuais: { em_avaliacao: 0, sem_resolucao: 0, escolhido: 0, descartado: 0 },
      motivo_principal: null,
      motivos: [],
      notas: [],
      primeiro_interesse_em: null,
    });
    expect(montarRelatorioDoVeiculo([])).toMatchObject({ veiculo_id: null, total: 0, descartado: 0, motivos: [], notas: [] });
    expect(montarRelatorioDoVeiculo(null).total).toBe(0);
    expect(montarRelatorioDoVeiculo(undefined).percentuais.descartado).toBe(0);
  });

  it("o que a função do banco devolver A MAIS não passa: nem lead, nem nome, nem telefone, nem autor", () => {
    const vazando = {
      ...DO_BANCO,
      lead_id: "a0000000-0000-4000-8000-000000000001",
      nome: "Joana Prado",
      telefone: "5541991176299",
      email: "joana@exemplo.com",
      responsavel: "Ana",
      motivos: [{ motivo: "preco", total: 2, leads: ["Joana Prado"], resolvido_por: "Ana" }],
      notas: [{ motivo: "preco", nota: "queria menos", em: "2026-10-02T15:00:00Z", autor: "Ana", lead_id: "a0000000", nome: "Joana Prado", telefone: "5541991176299" }],
    };
    const texto = JSON.stringify(montarRelatorioDoVeiculo([vazando]));
    for (const dado of ["Joana", "5541991176299", "joana@", "a0000000", "Ana", "lead_id", "telefone", "responsavel", "autor", "resolvido_por", "adicionado_por"]) {
      expect(texto, dado).not.toContain(dado);
    }
    expect(Object.keys(montarRelatorioDoVeiculo([vazando])).sort()).toEqual(
      [
        "descartado", "em_avaliacao", "escolhido", "motivo_principal", "motivos", "notas", "percentuais",
        "primeiro_interesse_em", "sem_resolucao", "total", "ultimo_interesse_em", "veiculo_id",
      ].sort(),
    );
  });

  it("percentual: uma casa, e todo zero dá zero", () => {
    expect(percentual(1, 3)).toBe(33.3);
    expect(percentual(2, 3)).toBe(66.7);
    expect(percentual(0, 0)).toBe(0);
    expect(percentual(5, 5)).toBe(100);
  });
});

describe("montarRankingDeInteresse", () => {
  it("cada carro com o rótulo na grafia da tela e o motivo principal com rótulo", () => {
    const ranking = montarRankingDeInteresse([
      {
        veiculo_id: 1,
        veiculo_rotulo: "chevrolet onix lt 1.0 2020",
        no_estoque: true,
        vendido: false,
        preco_atual: "62900.00",
        total: 5,
        em_avaliacao: 1,
        sem_resolucao: 0,
        escolhido: 1,
        descartado: 3,
        motivo_principal: "preco",
        motivos: [{ motivo: "preco", total: 2 }, { motivo: "cor", total: 1 }],
        ultimo_interesse_em: "2026-10-04T12:00:00+00:00",
        // A mais, e não passa:
        nome: "Joana",
      },
      { veiculo_id: 9, veiculo_rotulo: "fiat uno 2013", no_estoque: false, vendido: null, preco_atual: null, total: 0, em_avaliacao: 0, sem_resolucao: 0, escolhido: 0, descartado: 0, motivo_principal: null, motivos: [], ultimo_interesse_em: null },
    ]);
    expect(ranking).toEqual([
      {
        veiculo_id: 1,
        rotulo: "Chevrolet Onix LT 1.0 2020",
        no_estoque: true,
        vendido: false,
        preco_atual: 62900,
        total: 5,
        em_avaliacao: 1,
        sem_resolucao: 0,
        escolhido: 1,
        descartado: 3,
        motivo_principal: "preco",
        motivo_principal_rotulo: "Preço acima do que queria",
        motivos: [
          { motivo: "preco", rotulo: "Preço acima do que queria", total: 2, percentual: 66.7 },
          { motivo: "cor", rotulo: "Cor", total: 1, percentual: 33.3 },
        ],
        ultimo_interesse_em: "2026-10-04T12:00:00+00:00",
      },
      {
        veiculo_id: 9,
        rotulo: "Fiat Uno 2013",
        no_estoque: false,
        vendido: null,
        preco_atual: null,
        total: 0,
        em_avaliacao: 0,
        sem_resolucao: 0,
        escolhido: 0,
        descartado: 0,
        motivo_principal: null,
        motivo_principal_rotulo: null,
        motivos: [],
        ultimo_interesse_em: null,
      },
    ]);
  });

  it("o que não é lista vira lista vazia", () => {
    for (const v of [null, undefined, {}, "x"]) expect(montarRankingDeInteresse(v)).toEqual([]);
  });
});

describe("filtroDaBuscaDeCarro — o seletor de carro", () => {
  it("cada palavra em marca, modelo ou versão; um `or` por palavra", () => {
    expect(filtroDaBuscaDeCarro("  Onix   LT ")).toEqual({
      termos: ["Onix", "LT"],
      ramos: [
        "marca.ilike.*Onix*,modelo.ilike.*Onix*,versao.ilike.*Onix*",
        "marca.ilike.*LT*,modelo.ilike.*LT*,versao.ilike.*LT*",
      ],
    });
  });

  it("só dígitos: também o código do carro; quatro dígitos, também o ano", () => {
    expect(filtroDaBuscaDeCarro("8203724")!.ramos).toEqual([
      "marca.ilike.*8203724*,modelo.ilike.*8203724*,versao.ilike.*8203724*,id.eq.8203724",
    ]);
    expect(filtroDaBuscaDeCarro("onix 2020")!.ramos[1]).toBe(
      "marca.ilike.*2020*,modelo.ilike.*2020*,versao.ilike.*2020*,ano.eq.2020,id.eq.2020",
    );
    // "1.0" não é código nem ano.
    expect(filtroDaBuscaDeCarro("1.0")!.ramos[0]).not.toMatch(/\.eq\./);
  });

  it("a placa só entra para quem pode ler placa", () => {
    expect(filtroDaBuscaDeCarro("abc1d23")!.ramos[0]).not.toContain("placa");
    expect(filtroDaBuscaDeCarro("abc1d23", { comPlaca: false })!.ramos[0]).not.toContain("placa");
    expect(filtroDaBuscaDeCarro("abc1d23", { comPlaca: true })!.ramos[0]).toContain("placa.ilike.*abc1d23*");
  });

  it("só o que tem CARA de placa é procurado na placa: 'fox' é um carro, não a placa FOX1234", () => {
    const daPlaca = (q: string) => filtroDaBuscaDeCarro(q, { comPlaca: true })!.ramos.flatMap((r) => r.split(",").filter((x) => x.startsWith("placa.")));
    // Nome de carro, palavra sem dígito, cilindrada, código, pedaço solto: nada.
    for (const q of ["fox", "onix", "gol", "up", "hb20", "x1", "1.0", "abc1d", "foxabcd", "8203724", "12", "abcd", "t-cross", "abc12345", "a1b2c3d", "d123"]) {
      expect(daPlaca(q), q).toEqual([]);
    }
    expect(ramosDaPlaca("fox")).toEqual([]);
    // A placa inteira: sete letras e números com dígito. Sem hífen e com ele.
    expect(daPlaca("abc1d23")).toEqual(["placa.ilike.*abc1d23*", "placa.ilike.*abc-1d23*"]);
    expect(daPlaca("ABC1234")).toEqual(["placa.ilike.*ABC1234*", "placa.ilike.*ABC-1234*"]);
    expect(daPlaca("abc-1234")).toEqual(["placa.ilike.*abc1234*", "placa.ilike.*abc-1234*"]);
    // O final: quatro com dígito, casando só o FIM da placa.
    expect(daPlaca("1d23")).toEqual(["placa.ilike.*1d23"]);
    expect(daPlaca("9876")).toEqual(["placa.ilike.*9876"]);
    // Cada palavra é julgada sozinha.
    expect(daPlaca("fox 1d23")).toEqual(["placa.ilike.*1d23"]);
  });

  it("menos de dois caracteres úteis: não busca", () => {
    for (const q of [null, undefined, "", " ", "a", " a ", "%", "%%%", "*", "_", "**", "a%", ",(", '"']) {
      expect(filtroDaBuscaDeCarro(q), JSON.stringify(q)).toBeNull();
    }
    expect(filtroDaBuscaDeCarro("up")).not.toBeNull();
  });

  it("curingas do ilike (%, _, *) e a barra não chegam ao filtro", () => {
    for (const q of ["100%", "o_ix", "on*x", "on\\ix", "%onix%", "**onix**"]) {
      const f = filtroDaBuscaDeCarro(q, { comPlaca: true })!;
      const valores = f.ramos.join(",").replace(/\.ilike\.\*/g, ".ilike.").replace(/\*(,|$)/g, "$1");
      expect(valores, q).not.toMatch(/[%_*\\]/);
    }
    expect(filtroDaBuscaDeCarro("100%")!.termos).toEqual(["100"]);
    expect(filtroDaBuscaDeCarro("on*x")!.termos).toEqual(["on", "x"]);
  });

  it("vírgula, parênteses e aspas não partem o `or` nem abrem outro ramo", () => {
    const f = filtroDaBuscaDeCarro('onix,placa.ilike.*a*) or (id.gt.0 "x"', { comPlaca: false })!;
    for (const ramo of f.ramos) {
      // Três colunas de texto (mais, no máximo, ano e código): nunca um ramo a mais.
      expect(ramo.split(",").every((r) => /^(marca|modelo|versao)\.ilike\.\*[^,()"]*\*$|^(ano|id)\.eq\.\d+$/.test(r)), ramo).toBe(true);
      expect(ramo).not.toMatch(/[()"]/);
    }
  });

  it("no máximo seis palavras", () => {
    expect(filtroDaBuscaDeCarro("a1 b2 c3 d4 e5 f6 g7 h8")!.termos).toHaveLength(6);
  });

  it("finalDaPlaca: os quatro últimos, sem hífen, em maiúsculas", () => {
    expect(finalDaPlaca("ABC1D23")).toBe("1D23");
    expect(finalDaPlaca("abc-1234")).toBe("1234");
    expect(finalDaPlaca(" abc 1d23 ")).toBe("1D23");
    for (const v of [null, undefined, "", "AB1", 1234]) expect(finalDaPlaca(v)).toBeNull();
  });
});
