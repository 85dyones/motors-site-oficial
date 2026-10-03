import { describe, it, expect, vi, beforeEach } from "vitest";
import { ETAPAS_PADRAO, ehTipoDeDesfecho, type MotivoDoFunil } from "../src/lib/funil";

/**
 * O PATCH de `/api/leads/gerenciar`, EXECUTADO — a porta de trás do desfecho.
 *
 * Decisão do dono em 16/09: fechar negócio exige motivo "na tela e na API".
 * `tests/funil.test.ts` chama `decidirDesfecho` com dublês e prova a regra.
 * Este arquivo prova a outra metade, que nenhuma chamada da função alcança:
 * que a rota pergunta a ela, obedece à recusa, lê o lead para saber se é
 * TRANSIÇÃO e grava o que ela devolveu. Um desvio na rota — um `if` a mais
 * antes da chamada, a recusa ignorada, os campos esquecidos — roda aqui.
 *
 * O banco é um dublê em memória: um lead, as etapas da semente e uma lista de
 * motivos. Nada aqui abre conexão.
 *
 * Desde 03/10/2026 cada perfil só mexe no lead que enxerga (`escopoDeLeads`):
 * quem chama, por padrão, é a Ana, do Comercial, e o lead é dela. O último
 * bloco troca o autor e o responsável para provar a recusa fora do escopo.
 */

const CLIENTE = { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() };
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => CLIENTE }));

const { PATCH } = await import("../src/app/api/leads/gerenciar/route");

const ID = "lead-1";

const motivo = (
  chave: string,
  tipo: MotivoDoFunil["tipo"],
  extra: Partial<MotivoDoFunil> = {},
): MotivoDoFunil => ({ chave, rotulo: chave, tipo, ordem: 1, ativo: true, escopo: "ambos", ...extra });

const MOTIVOS: MotivoDoFunil[] = [
  motivo("a_vista", "ganho"),
  motivo("credito_reprovado", "perdido", { escopo: "compra" }),
  motivo("recusou_consignacao", "perdido", { escopo: "avaliacao" }),
  motivo("sem_resposta", "perdido"),
  motivo("motivo_aposentado", "perdido", { ativo: false }),
  motivo("spam", "descartado"),
];

/** A equipe: Ana e Bia são do Comercial; o Igor, não. */
const EQUIPE = [
  { full_name: "Ana", role: "comercial", papeis: ["comercial"], is_active: true },
  { full_name: "Bia", role: "comercial", papeis: ["comercial"], is_active: true },
  { full_name: "Igor Alves", role: "admin", papeis: ["admin", "marketing"], is_active: true },
];

/** O estado do banco que cada teste ajusta. */
let lead: { situacao: string; canal: string | null; responsavel: string | null } | null;
/** O perfil de quem chama. */
let autor: { role: string; papeis: string[]; full_name: string };
/** O que a rota mandou gravar em `leads`, na ordem. */
let gravacoes: Record<string, unknown>[];
/**
 * Os filtros de cada gravação, na ordem das `gravacoes`: o `eq("id")` e os do
 * escopo, que `comEscopoDeLeads` encadeia no `update` (`eq`, `neq`, `not`).
 */
let filtrosDasGravacoes: string[][];
/** A leitura do escopo (`select("responsavel")`) falha com este erro. */
let erroDoEscopo: { message: string } | null;
/** As tabelas lidas depois da checagem de permissão. */
let lidas: string[];
/**
 * O `id` com que a rota procurou o lead PARA O DESFECHO (`situacao, canal`).
 * A leitura do escopo (`select("responsavel")`) acontece em toda chamada de
 * quem não é Admin e não conta aqui: ela fica em `idDoEscopo`.
 */
let idProcurado: unknown;
/** O `id` com que a rota procurou o lead para saber se ele está no escopo. */
let idDoEscopo: unknown;

/** Um construtor de consulta do supabase-js: encadeia, e resolve no fim. */
function consulta(
  resolver: (filtros: Record<string, unknown>) => unknown,
  falhar: () => { message: string } | null = () => null,
) {
  const filtros: Record<string, unknown> = {};
  const resposta = () => {
    const erro = falhar();
    return erro ? { data: null, error: erro } : { data: resolver(filtros), error: null };
  };
  const q: any = {
    select: () => q,
    eq: (coluna: string, valor: unknown) => {
      filtros[coluna] = valor;
      return q;
    },
    single: async () => resposta(),
    maybeSingle: async () => resposta(),
    then: (ok: any, falha: any) => Promise.resolve(resposta()).then(ok, falha),
  };
  return q;
}

/** O que `update()` devolve: aceita os filtros encadeados e resolve no `await`. */
interface Gravacao {
  eq: (coluna: string, valor: unknown) => Gravacao;
  neq: (coluna: string, valor: unknown) => Gravacao;
  not: (coluna: string, operador: string, valor: unknown) => Gravacao;
  then: (ok: (r: { error: null }) => unknown, falha?: (e: unknown) => unknown) => Promise<unknown>;
}

function gravacao(campos: Record<string, unknown>): Gravacao {
  const filtros: string[] = [];
  gravacoes.push(campos);
  filtrosDasGravacoes.push(filtros);
  const q: Gravacao = {
    eq: (coluna: string, valor: unknown) => (filtros.push(`${coluna} = ${String(valor)}`), q),
    neq: (coluna: string, valor: unknown) => (filtros.push(`${coluna} <> '${String(valor)}'`), q),
    not: (coluna: string, operador: string, valor: unknown) => (filtros.push(`${coluna} not ${operador} ${String(valor)}`), q),
    then: (ok, falha) => Promise.resolve({ error: null }).then(ok, falha),
  };
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  lead = { situacao: "proposta", canal: "Formulário Contato", responsavel: "Ana" };
  autor = { role: "comercial", papeis: ["comercial"], full_name: "Ana" };
  gravacoes = [];
  filtrosDasGravacoes = [];
  erroDoEscopo = null;
  lidas = [];
  idProcurado = undefined;
  idDoEscopo = undefined;

  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") {
      // Com `eq("id")` é o perfil de quem chama; sem filtro é a equipe, que o
      // PATCH lê para recusar responsável fora do Comercial (2026-09-23).
      return consulta((f) => (f.id !== undefined ? autor : EQUIPE));
    }
    lidas.push(tabela);
    if (tabela === "funil_etapas") {
      return consulta((f) => ETAPAS_PADRAO.find((e) => e.chave === f.chave) ?? null);
    }
    if (tabela === "funil_motivos") {
      return consulta(() => MOTIVOS);
    }
    if (tabela === "leads") {
      return {
        select: (colunas?: string) =>
          consulta(
            (f) => {
              // A leitura do escopo pede só o responsável; a do desfecho, a
              // etapa e o canal.
              if (colunas === "responsavel") {
                idDoEscopo = f.id;
                return lead && { responsavel: lead.responsavel };
              }
              idProcurado = f.id;
              return lead;
            },
            () => (colunas === "responsavel" ? erroDoEscopo : null),
          ),
        update: gravacao,
      };
    }
    throw new Error(`tabela inesperada: ${tabela}`);
  });
});

const chamar = (corpo: Record<string, unknown>) =>
  PATCH(
    new Request("http://x/api/leads/gerenciar", {
      method: "PATCH",
      body: JSON.stringify({ id: ID, ...corpo }),
      headers: { "content-type": "application/json" },
    }) as any,
  );

describe("PATCH /api/leads/gerenciar — fechar o negócio exige motivo", () => {
  it("recusa com 400 fechar sem motivo, nos TRÊS desfechos, e não grava nada", async () => {
    const terminais = ETAPAS_PADRAO.filter((e) => ehTipoDeDesfecho(e.tipo));
    expect(terminais.map((e) => e.tipo)).toContain("descartado");

    for (const etapa of terminais) {
      gravacoes = [];
      const r = await chamar({ situacao: etapa.chave });
      expect(r.status, `${etapa.chave} sem motivo`).toBe(400);
      const corpo = await r.json();
      expect(corpo.motivo_obrigatorio).toBe(true);
      expect(corpo.error).toContain(etapa.rotulo);
      expect(gravacoes, `${etapa.chave} gravou sem motivo`).toEqual([]);
    }
  });

  it("recusa com 400 o motivo de outro tipo, o inexistente, o desativado e o de outro escopo", async () => {
    const casos: Array<Record<string, unknown> & { diz: string }> = [
      { situacao: "descartado", desfecho_motivo: "sem_resposta", diz: "perda" },
      { situacao: "perdido", desfecho_motivo: "inventado", diz: "inventado" },
      { situacao: "perdido", desfecho_motivo: "motivo_aposentado", diz: "desativado" },
      // O lead padrão chegou pelo formulário: é de compra.
      { situacao: "perdido", desfecho_motivo: "recusou_consignacao", diz: "vender" },
    ];
    for (const { diz, ...corpo } of casos) {
      gravacoes = [];
      const r = await chamar(corpo);
      expect(r.status, JSON.stringify(corpo)).toBe(400);
      const resposta = await r.json();
      expect(resposta.motivo_obrigatorio).toBe(false);
      expect(resposta.error).toContain(diz);
      expect(gravacoes, `${JSON.stringify(corpo)} gravou`).toEqual([]);
    }
  });

  it("o escopo é o do lead NO BANCO: avaliação aceita o motivo de quem vende e recusa o de quem compra", async () => {
    lead = { situacao: "novo", canal: "Avaliação", responsavel: "Ana" };

    const deCompra = await chamar({ situacao: "perdido", desfecho_motivo: "credito_reprovado" });
    expect(deCompra.status).toBe(400);
    expect(gravacoes).toEqual([]);

    const deAvaliacao = await chamar({ situacao: "perdido", desfecho_motivo: "recusou_consignacao" });
    expect(deAvaliacao.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].desfecho_motivo).toBe("recusou_consignacao");
    expect(idProcurado).toBe(ID);
  });

  it("com o motivo certo grava a etapa e o desfecho juntos", async () => {
    const r = await chamar({ situacao: "descartado", desfecho_motivo: "spam", desfecho_nota: " robô " });
    expect(r.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0]).toMatchObject({
      situacao: "descartado",
      desfecho_motivo: "spam",
      desfecho_valor: null,
      desfecho_nota: "robô",
    });
  });

  it("só na TRANSIÇÃO: o lead já fechado sem motivo continua editável", async () => {
    // Produção tem descartes fechados antes de a caixa perguntar o motivo.
    lead = { situacao: "descartado", canal: null, responsavel: "Ana" };

    // A Ana passa o lead dela para a Bia: outro campo, sem mudar de etapa.
    const outroCampo = await chamar({ responsavel: "Bia" });
    expect(outroCampo.status).toBe(200);

    // Mesmo reenviando a etapa em que ele já está: não é mudança de etapa.
    const mesmaEtapa = await chamar({ situacao: "descartado", observacoes: "legado" });
    expect(mesmaEtapa.status).toBe(200);

    expect(gravacoes).toHaveLength(2);
    expect(gravacoes[0]).toMatchObject({ responsavel: "Bia" });
    expect(gravacoes[1]).toMatchObject({ situacao: "descartado", observacoes: "legado" });
    for (const g of gravacoes) expect(g).not.toHaveProperty("desfecho_motivo");
  });

  it("responsável fora do Comercial é recusado pela ROTA, e nada é gravado (23/09)", async () => {
    const r = await chamar({ responsavel: "Igor Alves" });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/comercial/i);
    expect(gravacoes).toEqual([]);

    // Tirar o dono continua valendo para quem pode: o Administrador (03/10).
    autor = { role: "admin", papeis: ["admin"], full_name: "Dono" };
    const semDono = await chamar({ responsavel: null });
    expect(semDono.status).toBe(200);
    expect(gravacoes[0]).toMatchObject({ responsavel: null });
  });

  it("mover entre etapas em andamento grava direto, sem ler lead nem motivo", async () => {
    const r = await chamar({ situacao: "em_contato" });
    expect(r.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0]).toMatchObject({ situacao: "em_contato" });
    expect(lidas.filter((t) => t !== "funil_etapas" && t !== "leads")).toEqual([]);
    expect(idProcurado, "leu o lead para uma etapa que não cobra nada").toBeUndefined();
  });
});

describe("PATCH /api/leads/gerenciar — só se mexe no lead que se enxerga (03/10)", () => {
  const SDR = { role: "sdr", papeis: ["sdr"], full_name: "Felipe" };
  const GESTOR = { role: "gestor", papeis: ["gestor"], full_name: "Gil" };
  const ADMIN = { role: "admin", papeis: ["admin"], full_name: "Dono" };

  /** Fora do escopo: 404 com a frase de lead inexistente, e nenhuma escrita. */
  const esperarRecusa = async (r: Response) => {
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "Lead não encontrado" });
    expect(gravacoes).toEqual([]);
    expect(CLIENTE.rpc).not.toHaveBeenCalled();
  };

  it("vendedor no lead de outro vendedor: 404, e nada é gravado", async () => {
    lead = { situacao: "proposta", canal: "Formulário Contato", responsavel: "Bia" };
    // Com o clique de contato junto: o registro por RPC é a primeira escrita
    // da rota, e a recusa tem de vir antes dela.
    await esperarRecusa(await chamar({ situacao: "em_contato", observacoes: "é meu", contato: "whatsapp" }));
    expect(idDoEscopo).toBe(ID);
    // Nem para pegar o lead para si.
    await esperarRecusa(await chamar({ responsavel: "Ana" }));
  });

  it("vendedor no lead sem responsável: 404", async () => {
    for (const responsavel of [null, "", "   "]) {
      lead = { situacao: "novo", canal: "Formulário Contato", responsavel };
      await esperarRecusa(await chamar({ responsavel: "Ana" }));
    }
  });

  it("SDR no lead sem responsável: 404", async () => {
    autor = SDR;
    for (const responsavel of [null, "", "   "]) {
      lead = { situacao: "novo", canal: "Formulário Contato", responsavel };
      await esperarRecusa(await chamar({ situacao: "em_contato" }));
      await esperarRecusa(await chamar({ responsavel: "Ana" }));
    }
  });

  it("lead que não existe: o mesmo 404 de quem está fora do escopo", async () => {
    lead = null;
    await esperarRecusa(await chamar({ observacoes: "oi" }));
  });

  it("gestor no lead com responsável: passa, e grava", async () => {
    autor = GESTOR;
    lead = { situacao: "proposta", canal: "Formulário Contato", responsavel: "Bia" };
    const r = await chamar({ situacao: "em_contato", observacoes: "cobrar retorno" });
    expect(r.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0]).toMatchObject({ situacao: "em_contato", observacoes: "cobrar retorno" });
  });

  it("gestor no lead sem responsável: 404", async () => {
    autor = GESTOR;
    lead = { situacao: "novo", canal: "Formulário Contato", responsavel: null };
    await esperarRecusa(await chamar({ situacao: "em_contato" }));
  });

  it("SDR no lead que já tem responsável: passa", async () => {
    autor = SDR;
    lead = { situacao: "proposta", canal: "Formulário Contato", responsavel: "Bia" };
    const r = await chamar({ observacoes: "ligar amanhã" });
    expect(r.status).toBe(200);
    expect(gravacoes[0]).toMatchObject({ observacoes: "ligar amanhã" });
  });

  it("Admin distribui o lead novo, sem responsável, e nem lê o escopo", async () => {
    autor = ADMIN;
    lead = { situacao: "novo", canal: "Formulário Contato", responsavel: null };
    const r = await chamar({ responsavel: "Ana" });
    expect(r.status).toBe(200);
    expect(gravacoes[0]).toMatchObject({ responsavel: "Ana" });
    expect(idDoEscopo).toBeUndefined();
  });

  it("leitura do escopo que falhou: 500 com a mensagem do banco, e não 404; nada é gravado", async () => {
    erroDoEscopo = { message: "connection reset" };
    for (const quem of [autor, SDR, GESTOR]) {
      autor = quem;
      const r = await chamar({ observacoes: "oi", contato: "whatsapp" });
      expect(r.status, quem.role).toBe(500);
      expect(await r.json(), quem.role).toEqual({ error: "connection reset" });
    }
    expect(gravacoes).toEqual([]);
    expect(CLIENTE.rpc).not.toHaveBeenCalled();
  });

  it("o `update` leva o filtro do escopo de quem grava, além do id", async () => {
    // Se o lead mudou de dono entre a leitura do guarda e a gravação, o
    // `update` não alcança linha nenhuma.
    const filtrosDe = async (quem: typeof autor) => {
      autor = quem;
      filtrosDasGravacoes = [];
      expect((await chamar({ observacoes: "oi" })).status, quem.role).toBe(200);
      expect(filtrosDasGravacoes, quem.role).toHaveLength(1);
      return filtrosDasGravacoes[0];
    };

    expect(await filtrosDe(autor)).toEqual([`id = ${ID}`, "responsavel = Ana"]);
    for (const quem of [SDR, GESTOR]) {
      expect(await filtrosDe(quem)).toEqual([`id = ${ID}`, "responsavel not is null", "responsavel <> ''"]);
    }
    expect(await filtrosDe(ADMIN)).toEqual([`id = ${ID}`]);
  });

  it("o filtro da gravação é o do dono de ANTES: a Ana passando o lead para a Bia", async () => {
    const r = await chamar({ responsavel: "Bia" });
    expect(r.status).toBe(200);
    expect(gravacoes[0]).toMatchObject({ responsavel: "Bia" });
    expect(filtrosDasGravacoes[0]).toEqual([`id = ${ID}`, "responsavel = Ana"]);
  });

  it("o nome do perfil com espaço sobrando ainda acha o lead, e filtra pelo nome aparado", async () => {
    autor = { role: "comercial", papeis: ["comercial"], full_name: "  Ana " };
    const r = await chamar({ observacoes: "oi" });
    expect(r.status).toBe(200);
    expect(filtrosDasGravacoes[0]).toEqual([`id = ${ID}`, "responsavel = Ana"]);
  });
});

describe("PATCH /api/leads/gerenciar — o responsável é gravado aparado (03/10)", () => {
  it('"  Bia  " é gravado como "Bia"', async () => {
    // Com espaço sobrando o nome não casaria com o `full_name` de ninguém: a
    // Bia receberia o lead e não o veria.
    const r = await chamar({ responsavel: "  Bia  " });
    expect(r.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].responsavel).toBe("Bia");
  });

  it('"  Ana  " também, por quem distribui', async () => {
    autor = { role: "admin", papeis: ["admin"], full_name: "Dono" };
    lead = { situacao: "novo", canal: "Formulário Contato", responsavel: null };
    const r = await chamar({ responsavel: "  Ana  " });
    expect(r.status).toBe(200);
    expect(gravacoes[0].responsavel).toBe("Ana");
  });

  it("aparado não é aceito às cegas: quem não é do Comercial segue recusado", async () => {
    const r = await chamar({ responsavel: "  Igor Alves  " });
    expect(r.status).toBe(422);
    expect(gravacoes).toEqual([]);
  });

  it("tirar o dono, por quem pode (o Admin), continua gravando nulo", async () => {
    autor = { role: "admin", papeis: ["admin"], full_name: "Dono" };
    await chamar({ responsavel: null });
    expect(gravacoes[0].responsavel).toBeNull();
  });
});
