import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { contextoDeMidiaDoLead, LIMITE_DO_PARAMETRO } from "../src/lib/contextoDeMidia";
import { ler, lerCodigo } from "./fonte";

/**
 * O pré-voo das conversões (2026-09-21), antes de religar Google e Meta Ads.
 *
 * Três furos, todos do mesmo tipo: o dado existia, e se perdia no caminho sem
 * erro nenhum. Nada aqui quebra tela — por isso precisa de trava.
 *
 *   1. O `tel:` do cabeçalho não passava por `trackContactClick`: o telefone
 *      mais visível do desktop não gerava `click_to_call` nem `Contact`.
 *   2. `/api/leads` e `/api/avaliacao` recebiam `utm_*`, `gclid`, `fbclid`,
 *      `fbp` e `fbc` e não gravavam nenhum na linha — 0 de 14 em 2026-09-20.
 *   3. O formulário de avaliação nunca mandava `eventId`, embora a rota o
 *      gravasse desde agosto: 0 de 2 avaliações com `event_id`.
 */

describe("contextoDeMidiaDoLead · o que vai para as colunas de mídia", () => {
  const corpoDeAnuncio = {
    utm: {
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "estoque-8-carros",
      utm_term: "hb20 usado curitiba",
      utm_content: "rsa-1",
      gclid: "Cj0KCQjw-exemplo",
      gbraid: "0AAAAA-exemplo",
      wbraid: "wb-exemplo",
      fbclid: null,
    },
    fbp: "fb.1.1726790000000.123456789",
    fbc: null,
  };

  it("lê os parâmetros de campanha de dentro de `utm` e fbp/fbc da raiz", () => {
    expect(contextoDeMidiaDoLead(corpoDeAnuncio)).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "estoque-8-carros",
      utm_term: "hb20 usado curitiba",
      utm_content: "rsa-1",
      gclid: "Cj0KCQjw-exemplo",
      fbclid: null,
      fbp: "fb.1.1726790000000.123456789",
      fbc: null,
    });
  });

  it("não devolve `gbraid`/`wbraid`: a tabela não tem coluna, e o insert inteiro cairia", () => {
    // Coluna inexistente no `insert` do PostgREST derruba a LINHA, não o
    // campo — o lead se perderia por causa de um parâmetro opcional.
    const chaves = Object.keys(contextoDeMidiaDoLead(corpoDeAnuncio));
    expect(chaves).not.toContain("gbraid");
    expect(chaves).not.toContain("wbraid");
  });

  it("apara, e vazio vira null para `count(coluna)` significar preenchido", () => {
    const r = contextoDeMidiaDoLead({ utm: { utm_source: "  meta  ", utm_medium: "   " }, fbp: "" });
    expect(r.utm_source).toBe("meta");
    expect(r.utm_medium).toBeNull();
    expect(r.fbp).toBeNull();
  });

  it("valor longo demais é descartado, nunca cortado", () => {
    // Um `gclid` truncado volta "click id inválido" no upload offline, sem
    // dizer por quê. Melhor nenhum.
    const longo = "x".repeat(LIMITE_DO_PARAMETRO + 1);
    expect(contextoDeMidiaDoLead({ utm: { gclid: longo } }).gclid).toBeNull();
    const noLimite = "x".repeat(LIMITE_DO_PARAMETRO);
    expect(contextoDeMidiaDoLead({ utm: { gclid: noLimite } }).gclid).toBe(noLimite);
  });

  it("corpo do visitante com tipo errado não quebra nem vira texto", () => {
    for (const corpo of [null, undefined, "texto", 42, [], { utm: "x" }, { utm: [] }]) {
      const r = contextoDeMidiaDoLead(corpo);
      expect(Object.values(r).every((v) => v === null), JSON.stringify(corpo)).toBe(true);
    }
    const r = contextoDeMidiaDoLead({ utm: { gclid: 123, utm_source: { a: 1 } }, fbp: true });
    expect(r.gclid).toBeNull();
    expect(r.utm_source).toBeNull();
    expect(r.fbp).toBeNull();
  });
});

describe("as duas rotas que gravam lead do site guardam o contexto de mídia", () => {
  for (const [rota, corpo] of [
    ["src/app/api/leads/route.ts", "body"],
    ["src/app/api/avaliacao/route.ts", "requestBody"],
  ] as const) {
    it(rota, () => {
      const codigo = lerCodigo(rota);
      const inicio = codigo.indexOf('.from("leads").insert({');
      expect(inicio, "insert em leads").toBeGreaterThan(-1);
      const insert = codigo.slice(inicio, codigo.indexOf("});", inicio));
      expect(insert).toContain(`...contextoDeMidiaDoLead(${corpo})`);
      // IP e User-Agent ficam fora da linha por decisão (ver contextoDeMidia.ts).
      expect(insert).not.toMatch(/\bip\s*:/);
      expect(insert).not.toMatch(/user_agent\s*:/);
    });
  }
});

describe("todo `tel:` do site passa por `trackContactClick`", () => {
  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nome) => {
      const caminho = join(dir, nome);
      return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
    });
  }

  const raiz = join(__dirname, "..");
  const componentes = arquivos(join(raiz, "src", "components"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => relative(raiz, f).split(sep).join("/"));

  it("o cabeçalho mede o clique no telefone", () => {
    const codigo = lerCodigo("src/components/Header.tsx");
    const inicio = codigo.indexOf("href={`tel:");
    expect(inicio).toBeGreaterThan(-1);
    // Até o fechamento da tag de abertura: o `>` da seta do onClick não conta.
    const abertura = codigo.slice(inicio, codigo.indexOf("\n        >", inicio));
    expect(abertura).toContain('onClick={() => trackContactClick("phone", "Header - Telefone")}');
  });

  it("nenhum componente escreve um `tel:` sem medir", () => {
    // Trava a reincidência: o próximo `tel:` que alguém escrever num
    // componente precisa vir com o clique medido, como os dois de hoje.
    const semMedida = componentes.filter((f) => {
      const codigo = lerCodigo(f);
      return /href=\{?[`"']tel:/.test(codigo) && !codigo.includes('trackContactClick("phone"');
    });
    expect(semMedida).toEqual([]);
  });

  it("o do rodapé segue ligado pela coluna de contato", () => {
    expect(lerCodigo("src/lib/colunasDoRodape.ts")).toMatch(/tel:[\s\S]{0,200}contato: "phone"/);
    expect(lerCodigo("src/components/Footer.tsx")).toContain("trackContactClick(");
  });
});

describe("a avaliação manda o id do evento que a rota grava", () => {
  const codigo = lerCodigo("src/components/AutoAvaliacao.tsx");
  const inicio = codigo.indexOf('fetch("/api/avaliacao"');
  const envio = codigo.slice(inicio, codigo.indexOf("trackAppraisalSubmit", inicio));

  it("o id nasce antes do envio, e o portão da oposição fica na medição", () => {
    expect(codigo).toContain("const eventIdDaAvaliacao = idDoEventoDaAvaliacao();");
    expect(codigo.indexOf("const eventIdDaAvaliacao")).toBeLessThan(inicio);
    // O componente não gera id por fora — a mesma trava do B.7.
    expect(codigo).not.toMatch(/generateEventId\(/);

    const telemetria = lerCodigo("src/lib/telemetry.ts");
    const corpo = telemetria.slice(
      telemetria.indexOf("export function idDoEventoDaAvaliacao"),
      telemetria.indexOf("export function trackAppraisalSubmit"),
    );
    expect(corpo).toContain('return rastreamentoRecusado() ? null : generateEventId("CompleteRegistration");');
  });

  it("o corpo leva `eventId`, `fbp` e `fbc`", () => {
    expect(envio).toContain("eventId: eventIdDaAvaliacao");
    expect(envio).toContain("...getMatchParamsRespeitandoRecusa()");
  });

  it("o CompleteRegistration usa o MESMO id que foi para a linha do lead", () => {
    const chamada = codigo.slice(codigo.indexOf("trackAppraisalSubmit(vehicleType"));
    expect(chamada.slice(0, chamada.indexOf(";"))).toMatch(/,\s*eventIdDaAvaliacao\)$/);
    const telemetria = lerCodigo("src/lib/telemetry.ts");
    expect(telemetria).toContain('const eventId = presetEventId || generateEventId("CompleteRegistration");');
  });
});

describe("a view de saúde da atribuição não abre PII", () => {
  const sql = ler("supabase/migrations/20260921090901_saude_da_atribuicao_dos_leads.sql");
  const corpo = sql.slice(sql.indexOf("create or replace view"), sql.indexOf("from public.leads"));

  it("é security_invoker e fechada para anon", () => {
    expect(sql).toContain("with (security_invoker = true)");
    expect(sql).toContain("revoke all on public.saude_da_atribuicao_dos_leads from anon;");
  });

  it("só contagem, dia e canal", () => {
    for (const pessoal of ["nome", "telefone", "email", "ip", "user_agent", "ag_uid"]) {
      expect(corpo, pessoal).not.toMatch(new RegExp(`\\bl\\.${pessoal}\\b(?!\\))`));
    }
    expect(corpo).toContain("count(*)");
  });
});
