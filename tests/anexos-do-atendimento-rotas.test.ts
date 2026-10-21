import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * As duas portas dos anexos (2026-10-20), executadas:
 *
 *   POST /api/leads/[id]/conversa/anexo              a URL de upload
 *   GET  /api/leads/[id]/conversa/midia/[mensagem]   o arquivo, por 307
 *
 * O que se trava: a GUARDA do lead vem antes de qualquer assinatura (quem não
 * vê o lead leva a recusa da guarda e o bucket nem é tocado); a mensagem é
 * lida pela sessão e precisa ser DESTE lead, com o arquivo na pasta dele; o
 * download leva o nome do arquivo; nada diferencia "não existe" de "não é
 * seu".
 *
 * A guarda (`sessaoDeLeads` + `lerLeadNoEscopo`) é a da gestão do lead, já
 * travada em `gestao-do-lead-rotas.test.ts`; aqui ela é dublê, e o que se
 * prova é a rota respeitá-la.
 */

const LEAD = "6b0c2a3e-1f4d-4c8b-9a7e-2d5f8c1b3a90";
const MSG = "11111111-2222-4333-8444-555555555555";

let recusaDaGuarda: NextResponse | null;
let mensagens: Record<string, unknown>[];
let leituras: string[];
let assinaturas: { caminho: string; segundos: number; opcoes?: unknown }[];
let uploads: string[];

vi.mock("../src/lib/gestaoDoLead-servidor", () => ({
  sessaoDeLeads: async () => ({
    supabase: {
      from: (tabela: string) => {
        const filtros: Record<string, unknown> = {};
        const q = {
          select: () => q,
          eq: (c: string, v: unknown) => {
            filtros[c] = v;
            return q;
          },
          maybeSingle: async () => {
            leituras.push(tabela);
            const linha = mensagens.find((m) => Object.entries(filtros).every(([c, v]) => m[c] === v)) ?? null;
            return { data: linha, error: null };
          },
        };
        return q;
      },
    },
    visao: { escopo: "meus", meuNome: "Carla Souza" },
    recusa: null,
  }),
  lerLeadNoEscopo: async () => (recusaDaGuarda ? { lead: null, recusa: recusaDaGuarda } : { lead: { id: LEAD }, recusa: null }),
}));

vi.mock("../src/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async (caminho: string, segundos: number, opcoes?: unknown) => {
          assinaturas.push({ caminho, segundos, opcoes });
          return { data: { signedUrl: `https://storage.teste/${caminho}?token=x` }, error: null };
        },
        createSignedUploadUrl: async (caminho: string) => {
          uploads.push(caminho);
          return { data: { path: caminho, token: "tok", signedUrl: `https://storage.teste/upload/${caminho}` }, error: null };
        },
      }),
    },
  }),
}));

const anexo = await import("../src/app/api/leads/[id]/conversa/anexo/route");
const midia = await import("../src/app/api/leads/[id]/conversa/midia/[mensagem]/route");

const pedirMidia = (mensagem: string, query = "") =>
  midia.GET(new Request(`http://x/api/leads/${LEAD}/conversa/midia/${mensagem}${query}`) as never, {
    params: Promise.resolve({ id: LEAD, mensagem }),
  });
const pedirUpload = (corpo: unknown) =>
  anexo.POST(new Request(`http://x/api/leads/${LEAD}/conversa/anexo`, { method: "POST", body: JSON.stringify(corpo) }) as never, {
    params: Promise.resolve({ id: LEAD }),
  });

beforeEach(() => {
  recusaDaGuarda = null;
  leituras = [];
  assinaturas = [];
  uploads = [];
  mensagens = [
    { id: MSG, lead_id: LEAD, midia_caminho: `${LEAD}/${MSG}.pdf`, midia_nome: "holerite.pdf" },
    { id: "22222222-2222-4333-8444-555555555555", lead_id: LEAD, midia_caminho: null, midia_nome: null },
    // Um caminho fora da pasta do lead nunca é assinado, mesmo que a linha o tenha.
    { id: "33333333-2222-4333-8444-555555555555", lead_id: LEAD, midia_caminho: "0f1e2d3c-4b5a-4968-8776-655443322110/x.pdf", midia_nome: null },
  ];
});

describe("GET /api/leads/[id]/conversa/midia/[mensagem]", () => {
  it("abre o arquivo por 307 para a URL assinada de 5 minutos, sem cache", async () => {
    const r = await pedirMidia(MSG);
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe(`https://storage.teste/${LEAD}/${MSG}.pdf?token=x`);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(assinaturas).toEqual([{ caminho: `${LEAD}/${MSG}.pdf`, segundos: 300, opcoes: undefined }]);
  });

  it("`?baixar=1` pede o download com o nome do arquivo", async () => {
    await pedirMidia(MSG, "?baixar=1");
    expect(assinaturas[0].opcoes).toEqual({ download: "holerite.pdf" });
  });

  it("quem não vê o lead leva a recusa da guarda, e nem a mensagem é lida", async () => {
    recusaDaGuarda = NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
    const r = await pedirMidia(MSG);
    expect(r.status).toBe(404);
    expect(leituras).toEqual([]);
    expect(assinaturas).toEqual([]);
  });

  it("sem arquivo, de outro lead, fora da pasta ou id torto: o mesmo 404, sem assinar", async () => {
    for (const id of ["22222222-2222-4333-8444-555555555555", "33333333-2222-4333-8444-555555555555", "44444444-2222-4333-8444-555555555555", "nao-e-uuid"]) {
      const r = await pedirMidia(id);
      expect(r.status, id).toBe(404);
      expect(await r.json()).toEqual({ error: "Arquivo não encontrado." });
    }
    expect(assinaturas).toEqual([]);
  });
});

describe("POST /api/leads/[id]/conversa/anexo", () => {
  it("devolve o caminho na pasta do lead e o token de upload", async () => {
    const r = await pedirUpload({ nome: "foto.jpg", tipo: "image/jpeg", bytes: 1000 });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.caminho).toMatch(new RegExp(`^${LEAD}/painel-[0-9a-f-]{36}\\.jpg$`));
    expect(d.token).toBe("tok");
    expect(uploads).toEqual([d.caminho]);
  });

  it("arquivo que o WhatsApp não aceita: 422, sem URL", async () => {
    const r = await pedirUpload({ nome: "x.exe", tipo: "application/x-msdownload", bytes: 10 });
    expect(r.status).toBe(422);
    expect(uploads).toEqual([]);
  });

  it("quem não vê o lead leva a recusa da guarda, e nada é assinado", async () => {
    recusaDaGuarda = NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
    const r = await pedirUpload({ nome: "foto.jpg", tipo: "image/jpeg", bytes: 1000 });
    expect(r.status).toBe(404);
    expect(uploads).toEqual([]);
  });
});
