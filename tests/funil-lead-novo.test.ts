import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mensagemDeLeadNovo, type LinhaDaFilaDoFunil } from "../src/lib/funil";
import { urlDoLead } from "../src/lib/filaDoFunil";
import { urlDoSite } from "../src/lib/site";

/**
 * O lead novo vai ao administrador, e não ao rodízio (2026-10-10).
 *
 * Decisão do dono: *"avise o administrador quando entrar lead novo, Dyones.
 * ele vai determinar o dono e depois começa a dança"* — e o gestor recebe a
 * entrada também. O banco (migração 20261010160000) não escolhe mais dono
 * para o lead sem dono: devolve o aviso `lead_novo`, e é a rota que decide
 * quem recebe, pelo cadastro.
 *
 * A rota é chamada com o banco em memória, como em `funil-alertas-link`.
 */

type Linha = Record<string, unknown>;

let fila: Linha[];
let atendimentos: Linha[];
let perfis: Linha[];
let falhaNosPerfis: boolean;
let leituras: string[];

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  const executar = async () => {
    leituras.push(tabela);
    if (tabela === "profiles" && falhaNosPerfis) return { data: null, error: { message: "perfis fora do ar" } };
    const linhas = tabela === "atendimentos" ? atendimentos : tabela === "profiles" ? perfis : null;
    if (!linhas) throw new Error(`tabela inesperada: ${tabela}`);
    return { data: linhas.filter((l) => filtros.every((f) => f(l))), error: null };
  };
  const q = {
    select: () => q,
    in: (coluna: string, valores: unknown[]) => (filtros.push((l) => valores.includes(String(l[coluna]))), q),
    eq: (coluna: string, valor: unknown) => (filtros.push((l) => l[coluna] === valor), q),
    contains: (coluna: string, valores: unknown[]) => (
      filtros.push((l) => valores.every((v) => (l[coluna] as unknown[] | undefined)?.includes(v))),
      q
    ),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => executar().then(ok, erro),
  };
  return q;
}

vi.mock("../src/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    rpc: async () => ({ data: fila, error: null }),
    from: (tabela: string) => consulta(tabela),
  }),
}));
vi.mock("../src/lib/autorizacaoDoFunil", () => ({ autorizarFunil: async () => ({ erro: null }) }));
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: { name: "Motors Store" } }),
}));

const rota = await import("../src/app/api/funil/alertas/route");

const DYONES = {
  full_name: "Dyones Oliveira",
  telefone_e164: "+5541999990009",
  papeis: ["admin", "comercial", "marketing", "financeiro"],
  is_active: true,
};
const IGOR = { full_name: "Igor Alves", telefone_e164: "+5541999990463", papeis: ["admin", "marketing"], is_active: true };
const SILVIO = { full_name: "Silvio Ney", telefone_e164: "+5541999996127", papeis: ["gestor"], is_active: true };
const RODRIGO = { full_name: "Rodrigo Naumowicz", telefone_e164: "+5541999991088", papeis: ["comercial"], is_active: true };

function leadNovo(extra: Linha = {}): Linha {
  return {
    lead_id: "lead-ana",
    nome: "Ana Souza",
    telefone: "5541984660000",
    interesse: "Jeep Compass 2021",
    canal: "WhatsApp Proposta",
    situacao: "novo",
    etapa: "Novo",
    minutos_parado: 7,
    aviso: "lead_novo",
    responsavel: null,
    responsavel_whatsapp: null,
    novo_responsavel: null,
    novo_whatsapp: null,
    suprimido_por: null,
    ...extra,
  };
}

type ItemDaFila = {
  lead_id: string;
  aviso: string;
  para: string;
  destinatario: { nome: string; whatsapp: string };
  responsavel_anterior: string | null;
  mensagem: string;
};

async function pedirAFila() {
  const r = await rota.POST(
    new Request("https://motorsstore.com.br/api/funil/alertas", {
      method: "POST",
      body: JSON.stringify({ reservar: true }),
      headers: { "content-type": "application/json" },
    }),
  );
  return (await r.json()) as {
    fila: ItemDaFila[];
    sem_destinatario?: Linha[];
    conversas_no_chatwoot?: unknown;
  };
}

beforeEach(() => {
  fila = [leadNovo()];
  atendimentos = [];
  perfis = [DYONES, IGOR, SILVIO, RODRIGO];
  falhaNosPerfis = false;
  leituras = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("o lead novo não fala com o Chatwoot");
    }),
  );
  vi.stubEnv("NEXT_PUBLIC_CHATWOOT_URL", "https://app.chat.v2o5.com.br");
  vi.stubEnv("NEXT_PUBLIC_CHATWOOT_CONTA_ID", "3");
  vi.stubEnv("CHATWOOT_API_TOKEN", "tok-123");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("o lead novo vai a quem distribui e ao gestor", () => {
  it("o administrador do comercial e o gestor; nem o admin só do marketing nem o vendedor", async () => {
    const { fila: avisos } = await pedirAFila();

    expect(avisos.map((a) => [a.para, a.destinatario.nome, a.destinatario.whatsapp])).toEqual([
      ["administrador", "Dyones Oliveira", "5541999990009"],
      ["gestor", "Silvio Ney", "5541999996127"],
    ]);
    expect(avisos.every((a) => a.aviso === "lead_novo" && a.responsavel_anterior === null)).toBe(true);
  });

  it("ao administrador vai a ordem, com o link do lead no painel para escolher o dono", async () => {
    atendimentos = [{ lead_id: "lead-ana", chatwoot_conversation_id: 512, iniciado_em: "2026-10-10T15:00:00Z" }];

    const { fila: avisos } = await pedirAFila();
    const adm = avisos.find((a) => a.para === "administrador")!;

    expect(adm.mensagem).toBe(
      "[Motors Store] Lead novo sem responsável. Defina quem atende.\n\n" +
        "Ana Souza — Jeep Compass 2021\n\n" +
        "Status no sistema:\n" +
        "• Etapa: Novo\n" +
        "• Responsável: ninguém ainda\n" +
        "• Esperando há 7 min\n" +
        "• Canal: WhatsApp Proposta\n\n" +
        `Definir o responsável: ${urlDoSite(urlDoLead("lead-ana"))}\n` +
        "Conversa: https://app.chat.v2o5.com.br/app/accounts/3/conversations/512",
    );
  });

  it("ao gestor vai o registro, com o mesmo status", async () => {
    const { fila: avisos } = await pedirAFila();
    const copia = avisos.find((a) => a.para === "gestor")!;

    expect(copia.mensagem).toContain("Lead novo entrou, aguardando o administrador definir o responsável.");
    expect(copia.mensagem).toContain("• Responsável: ninguém ainda");
    expect(copia.mensagem).toContain(`Abrir no painel: ${urlDoSite(urlDoLead("lead-ana"))}`);
    expect(copia.mensagem).toMatch(/Abrir no painel: https?:\/\/\S+\/admin\/leads\/lead-ana/);
    expect(copia.mensagem).not.toContain("Conversa:");
  });

  it("quem é administrador e gestor recebe uma vez, como administrador", async () => {
    perfis = [{ ...DYONES, papeis: [...DYONES.papeis, "gestor"] }, RODRIGO];

    const { fila: avisos } = await pedirAFila();

    expect(avisos.map((a) => [a.para, a.destinatario.nome])).toEqual([["administrador", "Dyones Oliveira"]]);
  });

  it("sem administrador do comercial, o gestor ainda recebe", async () => {
    perfis = [IGOR, SILVIO, RODRIGO];

    const { fila: avisos } = await pedirAFila();

    expect(avisos.map((a) => [a.para, a.destinatario.nome])).toEqual([["gestor", "Silvio Ney"]]);
  });

  it("sem ninguém para receber, o lead sai em `sem_destinatario` — ele já foi marcado como avisado", async () => {
    perfis = [IGOR, RODRIGO, { ...SILVIO, telefone_e164: null }];

    const corpo = await pedirAFila();

    expect(corpo.fila).toEqual([]);
    expect(corpo.sem_destinatario).toEqual([{ lead_id: "lead-ana", nome: "Ana Souza", aviso: "lead_novo" }]);
  });

  it("a leitura do cadastro que falha não derruba a fila", async () => {
    falhaNosPerfis = true;

    const corpo = await pedirAFila();

    expect(corpo.fila).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith("[Funil] Sem o administrador para o aviso de lead novo:", "perfis fora do ar");
  });

  it("o lead novo não mexe no Chatwoot: sem dono, não há a quem atribuir a conversa", async () => {
    atendimentos = [{ lead_id: "lead-ana", chatwoot_conversation_id: 512, status_conversa: "open" }];

    const corpo = await pedirAFila();

    expect(fetch).not.toHaveBeenCalled();
    expect(corpo.conversas_no_chatwoot).toBeUndefined();
  });

  it("lead novo suprimido (fora do horário, ou avisado há menos de 20 h) não sai, e o cadastro nem é lido", async () => {
    fila = [leadNovo({ suprimido_por: "fora_do_horario" }), leadNovo({ lead_id: "lead-2", suprimido_por: "alerta_recente" })];

    const corpo = await pedirAFila();

    expect(corpo.fila).toEqual([]);
    expect(leituras).not.toContain("profiles");
  });
});

describe("a mensagem do lead novo, por fora da rota", () => {
  const linha = leadNovo() as unknown as LinhaDaFilaDoFunil;

  it("sem prazo legível, não inventa um", () => {
    const texto = mensagemDeLeadNovo({ ...linha, minutos_parado: null as unknown as number });
    expect(texto).not.toContain("Esperando há");
  });

  it("sem link nenhum, termina no status", () => {
    const texto = mensagemDeLeadNovo({ ...linha, canal: null }, { loja: null });
    expect(texto.endsWith("• Esperando há 7 min")).toBe(true);
  });
});
