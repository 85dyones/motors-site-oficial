import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTATOS_POR_LOTE,
  ORIGENS_DE_IMPORTACAO,
  agruparPorPessoa,
  dataDaPlanilha,
  lerContatoImportado,
  lerPlanilha,
  tipoDoRegistro,
  veiculoDaLinha,
} from "../src/lib/baseDeMarketing";

/**
 * A base de marketing (07/10/2026): a leitura de uma planilha de contatos e a
 * importação. As formas dos dois arquivos do RevendaMais estão aqui como o
 * dono os exportou (leads: tabela HTML de 16 colunas; clientes: xlsx de 28),
 * com pessoas inventadas.
 *
 * O que estes testes seguram: a mesma pessoa em várias linhas vira UMA; quem
 * comprou é reconhecido (pelo título de pós-venda, pelo aniversário, ou pela
 * coluna de compras do arquivo de clientes); o carro sai certo do texto; e
 * CPF, RG e endereço da planilha não passam daqui.
 */

vi.mock("../src/lib/supabase", () => ({ getEstoque: async () => ESTOQUE }));
const ESTOQUE = [
  { id: "8479269", marca: "volkswagen", modelo: "t cross highline 250 tsi aut", placa: "TBA3H95" },
  { id: "8407873", marca: "volkswagen", modelo: "polo track 1.0 flex 12v 5p", placa: "EHS8C54" },
  { id: "8516748", marca: "volkswagen", modelo: "polo track 1.0 flex 12v 5p", placa: "SEQ9J67" },
  { id: "8100652", marca: "fiat", modelo: "uno mille fire economy", placa: "" },
];
const { DATA_DESCONHECIDA } = await import("../src/lib/smsCampanhas");
const { abrirImportacao, contatoParaOBanco, correlacionarVeiculo, desfazerImportacao, importarLote, indexarEstoque, lerResumoDaBase } = await import("../src/lib/baseDeMarketing-servidor");

const LEADS = [
  ["Id", "Título", "Cliente", "E-mail", "Telefone", "Tipo", "Canal", "Estágio", "Atendente", "Data criação", "Ultima Integração", "Conversão", "Motivo", "Empresa", "Marcador", "Veículo"],
  ["100", "Novo Lead Olx", "MARIA DA SILVA", "maria@exemplo.com", "(41) 99999-0001", "", "OLX", "RESGATE", "Fulano", "10/03/2025 14:00:00", "", "Aguardando", "", "", "", "T CROSS HIGHLINE 250 TSI AUT VOLKSWAGEN Placa: TBA3H95"],
  ["101", "Nova proposta", "Maria Silva", "", "41 99999-0001", "", "WebMotors", "RESGATE", "Fulano", "01/06/2025 09:00:00", "", "Aguardando", "", "", "", "UNO MILLE FIRE ECONOMY FIAT Placa: "],
  ["102", "[Pós-Venda] vendedor: Rodrigo", "JOAO SOUZA", "", "(41) 99999-0002", "", "Revenda Mais", "RESGATE", "Fulano", "20/02/2024 10:00:00", "", "Aguardando", "", "", "", "HR-V EX CVT HONDA Placa: abc1d23"],
  ["103", "[Aniversário do cliente] vendedor: Sem Vendedor", "JOAO SOUZA", "", "(41) 99999-0002", "", "Revenda Mais", "RESGATE", "Fulano", "05/01/2026 06:00:00", "", "Aguardando", "", "", "", "Placa: "],
  ["104", "Novo Lead", "ANA", "", "(41) 99999-0003", "", "WhatsApp", "RESGATE", "Fulano", "01/09/2026 10:00:00", "", "Aguardando", "", "", "NÃO TEM INTERESSE", "Placa: "],
  ["105", "Novo Lead", "SEM CELULAR", "", "(41) 3333-0000", "", "OLX", "RESGATE", "Fulano", "01/09/2026 10:00:00", "", "Aguardando", "", "", "", "GOL 1.0 VOLKSWAGEN Placa: OLS9J75"],
  ["106", "Novo Lead", "PEDRO", "", "", "", "OLX", "RESGATE", "Fulano", "01/09/2026 10:00:00", "", "Aguardando", "", "", "", "Placa: "],
  ["107", "Novo Lead", "CARLA", "", "(41) 99999-0004", "", "Chaves na mão", "RESGATE", "Fulano", "01/08/2026 10:00:00", "", "Aguardando", "", "", "", "DISCOVERY SPORT SE LAND ROVER Placa: "],
];
const CLIENTES = [
  ["cpf_cnpj", "pessoa", "sexo", "nome", "telefone_celular", "telefone_residencial", "rg", "data_nascimento", "data_cadastro", "email", "cep", "rua", "nome_mae", "data_ultima_compra", "quantidade_veic_comprados", "clie_cod", "reve_cod"],
  ["111.222.333-44", "Física", "Masculino", "JOAO SOUZA", "41 99999-0002", "", "1234567-8", "01/01/1980", "20/02/2024", "joao@exemplo.com", "80000-000", "Rua X, 1", "MAE DO JOAO", "20/02/2024", "1", "900", "9037"],
  ["555.666.777-88", "Física", "", "NOVA PESSOA", "41 99999-0009", "", "", "", "10/05/2025", "", "", "", "", "", "0", "901", "9037"],
  ["999.888.777-66", "Física", "", "MARIA DA SILVA", "41 99999-0001", "", "", "", "10/03/2025", "", "", "", "", "15/07/2026", "2", "902", "9037"],
];

describe("a planilha", () => {
  it("reconhece a exportação de leads do RevendaMais e ignora o que não usa", () => {
    const r = lerPlanilha(LEADS);
    expect(r).toMatchObject({ ok: true, origem: "revenda_mais", colunasIgnoradas: ["Tipo", "Atendente", "Ultima Integração", "Conversão", "Motivo", "Empresa"] });
    expect(r.ok && r.linhas[0]).toMatchObject({ origemId: "100", nome: "MARIA DA SILVA", canal: "OLX", ocorreuEm: "2025-03-10T17:00:00.000Z" });
  });

  it("no arquivo de clientes, CPF, RG, nascimento, endereço e nome da mãe não são lidos", () => {
    const r = lerPlanilha(CLIENTES);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.colunasIgnoradas).toEqual(expect.arrayContaining(["cpf_cnpj", "rg", "data_nascimento", "cep", "rua", "nome_mae", "telefone_residencial"]));
    const tudo = JSON.stringify([r.linhas, agruparPorPessoa(r.linhas, r.origem)]);
    for (const sensivel of ["111.222.333-44", "1234567-8", "1980", "80000-000", "Rua X", "MAE DO JOAO"]) expect(tudo, sensivel).not.toContain(sensivel);
    expect(r.linhas[0]).toMatchObject({ nome: "JOAO SOUZA", telefone: "41 99999-0002", comprouEm: "2024-02-20T15:00:00.000Z", compras: 1 });
  });

  it("sem coluna de telefone, ou vazia, não há o que importar", () => {
    expect(lerPlanilha([["Nome", "E-mail"], ["A", "a@b.c"]])).toMatchObject({ ok: false });
    expect(lerPlanilha([["Nome", "Telefone"]])).toMatchObject({ ok: false });
    expect(lerPlanilha([])).toMatchObject({ ok: false });
  });

  it("planilha comum, com cabeçalhos livres", () => {
    const r = lerPlanilha([["Nome", "WhatsApp", "Carro", "Data"], ["Zé", "41999990005", "Corolla XEi", "2026-08-01"]]);
    expect(r).toMatchObject({ ok: true, origem: "planilha" });
    expect(r.ok && r.linhas[0]).toMatchObject({ telefone: "41999990005", veiculoTexto: "Corolla XEi", ocorreuEm: "2026-08-01T15:00:00.000Z" });
  });

  it("datas", () => {
    expect(dataDaPlanilha("31/12/2025 23:38:18")).toBe("2026-01-01T02:38:18.000Z");
    expect(dataDaPlanilha("20/02/2024")).toBe("2024-02-20T15:00:00.000Z");
    for (const ruim of ["", null, "ontem", "31/02/abc", "00/00/0000"]) expect(dataDaPlanilha(ruim), String(ruim)).toBeNull();
  });
});

describe("o veículo e o tipo do registro", () => {
  it("no RevendaMais a marca vem no fim, e a placa depois", () => {
    expect(veiculoDaLinha({ veiculoTexto: "T CROSS HIGHLINE 250 TSI AUT VOLKSWAGEN Placa: tba3h95", marca: null, modelo: null, placa: null }, "revenda_mais")).toEqual({ marca: "VOLKSWAGEN", modelo: "T CROSS HIGHLINE 250 TSI AUT", placa: "TBA3H95" });
    expect(veiculoDaLinha({ veiculoTexto: "DISCOVERY SPORT SE LAND ROVER Placa: ", marca: null, modelo: null, placa: null }, "revenda_mais")).toEqual({ marca: "LAND ROVER", modelo: "DISCOVERY SPORT SE", placa: null });
    expect(veiculoDaLinha({ veiculoTexto: "Placa: ", marca: null, modelo: null, placa: null }, "revenda_mais")).toEqual({ marca: null, modelo: null, placa: null });
    // A exportação corta a marca no fim do texto: o começo único de uma marca conhecida é ela.
    expect(veiculoDaLinha({ veiculoTexto: "FASTBACK IMPETUS 200 T. AUT (HIBRÍDO) FI Placa: ", marca: null, modelo: null, placa: null }, "revenda_mais").marca).toBe("FIAT");
    expect(veiculoDaLinha({ veiculoTexto: "C 180 CGI MERCEDES BENZ Placa: ", marca: null, modelo: null, placa: null }, "revenda_mais")).toMatchObject({ marca: "MERCEDES BENZ", modelo: "C 180 CGI" });
    // "C" é começo de várias: fica como veio.
    expect(veiculoDaLinha({ veiculoTexto: "ONIX LT C Placa: ", marca: null, modelo: null, placa: null }, "revenda_mais").marca).toBe("C");
    // Placa torta não é placa.
    expect(veiculoDaLinha({ veiculoTexto: "GOL VOLKSWAGEN Placa: TBK7J3", marca: null, modelo: null, placa: null }, "revenda_mais").placa).toBeNull();
  });

  it("em planilha comum, colunas próprias mandam, e texto solto vira modelo", () => {
    expect(veiculoDaLinha({ veiculoTexto: null, marca: "Toyota", modelo: "Corolla XEi", placa: "ABC-1D23" }, "planilha")).toEqual({ marca: "Toyota", modelo: "Corolla XEi", placa: "ABC1D23" });
    expect(veiculoDaLinha({ veiculoTexto: "Corolla XEi", marca: null, modelo: null, placa: null }, "planilha")).toEqual({ marca: null, modelo: "Corolla XEi", placa: null });
  });

  it("pós-venda é compra; aniversário, estágio ganho e 'cliente nosso' são cliente", () => {
    expect(tipoDoRegistro({ titulo: "[Pós-Venda] vendedor: X", estagio: "RESGATE", marcador: null })).toBe("compra");
    expect(tipoDoRegistro({ titulo: "[Aniversário do cliente] vendedor: Sem Vendedor", estagio: null, marcador: null })).toBe("cliente");
    expect(tipoDoRegistro({ titulo: "Novo Lead", estagio: "GANHO", marcador: null })).toBe("cliente");
    expect(tipoDoRegistro({ titulo: "Novo Lead", estagio: "NOVO", marcador: "CLIENTE NOSSO!" })).toBe("cliente");
    expect(tipoDoRegistro({ titulo: "Novo Lead Olx", estagio: "RESGATE", marcador: "LEAD FRIO" })).toBe("interesse");
  });
});

describe("por pessoa", () => {
  const leads = lerPlanilha(LEADS);
  const clientes = lerPlanilha(CLIENTES);
  if (!leads.ok || !clientes.ok) throw new Error("fixture");

  it("uma pessoa por celular, com todos os registros dela; ninguém fica de fora por não ter carro", () => {
    const { contatos, resumo } = agruparPorPessoa(leads.linhas, leads.origem);
    expect(resumo).toMatchObject({ linhas: 8, semCelular: 2, pessoas: 4, clientes: 1, comDataDeCompra: 1, semInteresse: 1, interessadosComCarro: 2, interessadosSemCarro: 1, registrosComCarro: 4 });
    const maria = contatos.find((c) => c.telefone === "5541999990001")!;
    expect(maria).toMatchObject({ nome: "MARIA DA SILVA", email: "maria@exemplo.com", cliente: false, canais: ["OLX", "WebMotors"] });
    expect(maria.registros.map((r) => [r.origemId, r.marca, r.placa])).toEqual([["100", "VOLKSWAGEN", "TBA3H95"], ["101", "FIAT", null]]);
    const joao = contatos.find((c) => c.telefone === "5541999990002")!;
    // O pós-venda traz o carro comprado e a data; o aniversário só confirma o cliente e não vira registro.
    expect(joao).toMatchObject({ cliente: true, comprouEm: "2024-02-20T13:00:00.000Z" });
    expect(joao.registros).toEqual([expect.objectContaining({ tipo: "compra", marca: "HONDA", modelo: "HR-V EX CVT", placa: "ABC1D23" })]);
    expect(contatos.find((c) => c.telefone === "5541999990003")).toMatchObject({ semInteresse: true });
    expect(resumo.canais).toContainEqual({ canal: "OLX", pessoas: 1 });
  });

  it("o arquivo de clientes marca quem comprou, com a data, sem inventar registro de carro", () => {
    const { contatos, resumo } = agruparPorPessoa(clientes.linhas, clientes.origem);
    expect(resumo).toMatchObject({ pessoas: 3, clientes: 2, comDataDeCompra: 2, interessadosSemCarro: 1, registrosComCarro: 0 });
    expect(contatos.find((c) => c.telefone === "5541999990001")).toMatchObject({ cliente: true, comprouEm: "2026-07-15T15:00:00.000Z", registros: [] });
    // A data de cadastro vai com a pessoa: é ela que o filtro de período usa.
    expect(contatos.find((c) => c.telefone === "5541999990009")).toMatchObject({ cliente: false, comprouEm: null, registros: [], primeiroContatoEm: "2025-05-10T15:00:00.000Z", ultimoContatoEm: "2025-05-10T15:00:00.000Z" });
  });
});

describe("o que o servidor aceita de um contato", () => {
  it("refaz o telefone, corta o excesso e larga qualquer chave a mais", () => {
    const c = lerContatoImportado({
      telefone: "(41) 99999-0001",
      nome: "Maria",
      cpf: "111.222.333-44",
      endereco: "Rua X",
      cliente: false,
      comprouEm: "2026-07-15T15:00:00.000Z",
      canais: ["OLX", "", 5],
      registros: [{ origemId: "100", tipo: "qualquer", marca: "VW", modelo: "x".repeat(300), placa: "tba3h95", ocorreuEm: "lixo", rg: "1" }],
    });
    expect(c).toMatchObject({ telefone: "5541999990001", canais: ["OLX"], comprouEm: "2026-07-15T15:00:00.000Z" });
    expect(JSON.stringify(c)).not.toMatch(/111\.222|Rua X|"rg"|"cpf"/);
    expect(c!.registros[0]).toMatchObject({ tipo: "interesse", placa: "TBA3H95", ocorreuEm: null });
    expect(c!.registros[0].modelo).toHaveLength(120);
    for (const ruim of [null, {}, { telefone: "4133330000" }, "texto"]) expect(lerContatoImportado(ruim)).toBeNull();
  });
});

describe("a correlação com o estoque", () => {
  const indice = indexarEstoque(ESTOQUE);

  it("a placa decide; sem placa, marca e família só decidem quando há um carro só", () => {
    expect(correlacionarVeiculo({ marca: "QUALQUER", modelo: "COISA", placa: "TBA3H95" }, indice)).toBe(8479269);
    expect(correlacionarVeiculo({ marca: "FIAT", modelo: "UNO MILLE FIRE ECONOMY", placa: null }, indice)).toBe(8100652);
    // Dois Polos no cadastro: dizer qual seria inventar.
    expect(correlacionarVeiculo({ marca: "VOLKSWAGEN", modelo: "POLO TRACK 1.0", placa: null }, indice)).toBeNull();
    expect(correlacionarVeiculo({ marca: "HONDA", modelo: "HR-V", placa: "ZZZ9Z99" }, indice)).toBeNull();
    expect(correlacionarVeiculo({ marca: null, modelo: null, placa: null }, indice)).toBeNull();
  });

  it("o id de origem leva o prefixo da fonte, e planilha comum vai sem id", () => {
    const contato = { telefone: "5541999990001", nome: "Maria", email: null, cliente: false, comprouEm: null, semInteresse: false, canais: ["OLX"], primeiroContatoEm: null as string | null, ultimoContatoEm: null as string | null, registros: [{ origemId: "100", tipo: "interesse" as const, marca: "VOLKSWAGEN", modelo: "T CROSS", placa: "TBA3H95", canal: "OLX", marcador: null, ocorreuEm: "2025-03-10T17:00:00.000Z" }, { origemId: "101", tipo: "interesse" as const, marca: "FIAT", modelo: "UNO", placa: null, canal: null, marcador: null, ocorreuEm: "2025-06-01T12:00:00.000Z" }] };
    const doRevenda = contatoParaOBanco(contato, "revenda_mais", indice);
    expect(doRevenda).toMatchObject({ telefone: "5541999990001", cliente: false, primeiro_em: "2025-03-10T17:00:00.000Z", ultimo_em: "2025-06-01T12:00:00.000Z" });
    expect(doRevenda.registros.map((r) => [r.origem_id, r.veiculo_id])).toEqual([["rm:100", 8479269], ["rm:101", 8100652]]);
    expect(contatoParaOBanco(contato, "planilha", indice).registros.every((r) => r.origem_id === null)).toBe(true);
    // A data de cadastro da pessoa conta, mesmo sem registro; e registro sem data não vira "hoje".
    const soCadastro = contatoParaOBanco({ ...contato, primeiroContatoEm: "2019-05-01T15:00:00.000Z", ultimoContatoEm: "2019-05-01T15:00:00.000Z", registros: [{ ...contato.registros[0], ocorreuEm: null }] }, "revenda_mais", indice);
    expect(soCadastro).toMatchObject({ primeiro_em: "2019-05-01T15:00:00.000Z", ultimo_em: "2019-05-01T15:00:00.000Z" });
    expect(soCadastro.registros[0].ocorreu_em).toBe(DATA_DESCONHECIDA);
    // Data de compra faz o cliente, mesmo que a tela não tenha marcado.
    expect(contatoParaOBanco({ ...contato, comprouEm: "2026-01-01T12:00:00.000Z" }, "revenda_mais", indice).cliente).toBe(true);
  });
});

describe("a importação", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  function banco(opcoes: { importacao?: object | null; erroDoLote?: boolean } = {}) {
    const chamadas: Array<{ nome: string; args: Record<string, unknown> }> = [];
    const inseridas: object[] = [];
    const admin = {
      from: () => ({
        insert: (v: object) => (inseridas.push(v), { select: () => ({ single: async () => ({ data: { id: ID }, error: null }) }) }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opcoes.importacao === undefined ? { id: ID, origem: "revenda_mais" } : opcoes.importacao, error: null }) }) }),
      }),
      rpc: async (nome: string, args: Record<string, unknown>) => {
        chamadas.push({ nome, args });
        if (nome === "marketing_importar_lote") return opcoes.erroDoLote ? { data: null, error: { message: "x" } } : { data: [{ contatos_novos: 1, contatos_atualizados: 0, registros_novos: 2 }], error: null };
        return { data: [{ contatos_removidos: 3, registros_removidos: 5 }], error: null };
      },
    };
    return { admin: admin as never, chamadas, inseridas };
  }

  it("abrir: origem e linhas conferidas, autor gravado", async () => {
    const b = banco();
    expect(await abrirImportacao(b.admin, { origem: "revenda_mais", arquivo: " leads.xls ", linhas: 7964 }, { id: "u1", nome: "Dyones" })).toEqual({ ok: true, id: ID });
    expect(b.inseridas[0]).toEqual({ origem: "revenda_mais", arquivo: "leads.xls", linhas: 7964, criado_por: "u1", criado_por_nome: "Dyones" });
    for (const ruim of [{ origem: "outra", linhas: 1 }, { origem: "planilha", linhas: 0 }, null]) expect(await abrirImportacao(b.admin, ruim, { id: "u", nome: null })).toMatchObject({ ok: false, status: 400 });
  });

  it("lote: confere de novo cada contato, liga o carro e entrega ao banco no formato dele", async () => {
    const b = banco();
    const r = await importarLote(b.admin, ID, {
      contatos: [
        { telefone: "41 99999-0001", nome: "Maria", cpf: "111.222.333-44", canais: ["OLX"], registros: [{ origemId: "100", tipo: "interesse", marca: "VOLKSWAGEN", modelo: "T CROSS", placa: "TBA3H95" }] },
        { telefone: "4133330000", nome: "Fixo" },
      ],
    });
    expect(r).toEqual({ ok: true, contatosNovos: 1, contatosAtualizados: 0, registrosNovos: 2, recusados: 1 });
    const enviado = b.chamadas[0].args;
    expect(enviado.p_importacao).toBe(ID);
    expect(enviado.p_contatos).toHaveLength(1);
    expect(JSON.stringify(enviado)).not.toContain("111.222");
    expect((enviado.p_contatos as Array<{ registros: Array<Record<string, unknown>> }>)[0].registros[0]).toMatchObject({ origem_id: "rm:100", veiculo_id: 8479269, tipo: "interesse" });
  });

  it("lote grande demais, vazio, id torto ou importação que não existe não chegam ao banco", async () => {
    const b = banco();
    expect(await importarLote(b.admin, ID, { contatos: Array.from({ length: CONTATOS_POR_LOTE + 1 }, () => ({ telefone: "41999990001" })) })).toMatchObject({ ok: false, status: 400 });
    expect(await importarLote(b.admin, ID, { contatos: [] })).toMatchObject({ ok: false, status: 400 });
    expect(await importarLote(b.admin, "nao-e-uuid", { contatos: [{ telefone: "41999990001" }] })).toMatchObject({ ok: false, status: 404 });
    expect(await importarLote(banco({ importacao: null }).admin, ID, { contatos: [{ telefone: "41999990001" }] })).toMatchObject({ ok: false, status: 404 });
    expect(b.chamadas).toEqual([]);
    expect(await importarLote(banco({ erroDoLote: true }).admin, ID, { contatos: [{ telefone: "41999990001" }] })).toMatchObject({ ok: false, status: 502 });
  });

  it("desfazer devolve o que saiu", async () => {
    expect(await desfazerImportacao(banco().admin, ID)).toEqual({ ok: true, contatosRemovidos: 3, registrosRemovidos: 5 });
    expect(await desfazerImportacao(banco({ importacao: null }).admin, ID)).toMatchObject({ ok: false, status: 404 });
  });

  it("o resumo do banco vira o tipo da tela, e lixo vira zero", () => {
    expect(lerResumoDaBase({ pessoas: 3, clientes: "1", com_data_de_compra: 1, sem_interesse: 0, interessados_com_carro: 1, interessados_sem_carro: 1, canais: [{ canal: "OLX", pessoas: 2 }, { canal: "" }], marcas: [{ marca: "FIAT", pessoas: 1 }] })).toEqual({
      pessoas: 3, clientes: 1, comDataDeCompra: 1, semInteresse: 0, interessadosComCarro: 1, interessadosSemCarro: 1, canais: [{ canal: "OLX", pessoas: 2 }], marcas: [{ marca: "FIAT", pessoas: 1 }],
    });
    expect(lerResumoDaBase(null).pessoas).toBe(0);
  });
});

describe("as camadas da base dizem a mesma coisa", () => {
  const ler = (c: string) => readFileSync(join(__dirname, "..", c), "utf8");

  it("as rotas da base passam pela porta das campanhas", () => {
    for (const rota of ["route.ts", "[id]/route.ts", "[id]/lote/route.ts"]) expect(ler(`src/app/api/marketing/base/importacoes/${rota}`), rota).toContain("await autorizarCampanhasDeSms()");
  });

  it("nenhuma sessão do painel lê a base no banco, e as origens são as do código", () => {
    const sql = ler("supabase/migrations/20261007120000_sms_campanhas.sql");
    for (const tabela of ["marketing_contatos", "marketing_interesses", "marketing_importacoes"]) {
      expect(sql, tabela).toContain(`public.${tabela}`);
      expect(sql, tabela).not.toMatch(new RegExp(`grant[^;]*on public\\.${tabela} to authenticated`));
      expect(sql, tabela).not.toMatch(new RegExp(`create policy[^;]*on public\\.${tabela}`));
    }
    for (const origem of ORIGENS_DE_IMPORTACAO) expect(sql).toContain(`'${origem}'`);
  });
});
