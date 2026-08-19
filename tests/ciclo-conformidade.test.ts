import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mesesConsecutivosConformes,
  estadoDaSerie,
  estadoDoGatilho,
  LIMIAR_DE_CONFORMIDADE,
  MESES_CONSECUTIVOS_EXIGIDOS,
  MINIMO_DE_MONITORADOS,
  MESES_DE_SERIE_EXIGIDOS,
  type DiaDaSerie,
} from "../src/lib/ciclo/gatilho";

/**
 * O painel de conformidade (A22) e a leitura do gatilho §1.4.
 *
 * Os limiares são o coração: vêm do manual, e o teste os fixa para que nenhuma
 * edição os afrouxe sem tropeçar aqui — afrouxar o §1.4 é exatamente o que o
 * manual diz que não pode acontecer num momento de entusiasmo.
 */

const raiz = join(__dirname, "..");
const rota = readFileSync(join(raiz, "src", "app", "api", "ciclo", "conformidade", "route.ts"), "utf-8");
const painel = readFileSync(
  join(raiz, "src", "components", "admin", "PainelDeConformidade.tsx"),
  "utf-8",
);
const cron = readFileSync(
  join(raiz, "supabase", "migrations", "20260819120000_cron_da_conformidade.sql"),
  "utf-8",
);

/** Gera a série contínua entre duas datas, com pct fixo (ou nulo). */
function faixa(
  inicio: string,
  fim: string,
  pct: number | null,
  retroativa = false,
): DiaDaSerie[] {
  const dias: DiaDaSerie[] = [];
  const d = new Date(`${inicio}T00:00:00Z`);
  const limite = Date.parse(`${fim}T00:00:00Z`);
  while (d.getTime() <= limite) {
    dias.push({
      dia: d.toISOString().slice(0, 10),
      veiculos_ciclo_ativo: 10,
      veiculos_com_revisao_devida: pct === null ? 0 : 4,
      veiculos_em_dia: pct === null ? 0 : Math.round((4 * pct) / 100),
      pct,
      retroativa,
    });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}

describe("os limiares do §1.4 — fixados, não configuráveis", () => {
  it("são os do manual", () => {
    expect(LIMIAR_DE_CONFORMIDADE).toBe(70);
    expect(MESES_CONSECUTIVOS_EXIGIDOS).toBe(3);
    expect(MINIMO_DE_MONITORADOS).toBe(150);
    expect(MESES_DE_SERIE_EXIGIDOS).toBe(6);
  });
});

describe("meses consecutivos de conformidade", () => {
  const hoje = "2026-08-14";

  it("conta meses completos, de trás para a frente, ignorando o mês corrente", () => {
    // Maio, junho e julho inteiros a 80%; agosto (corrente) não conta.
    const serie = faixa("2026-05-01", "2026-08-14", 80);
    expect(mesesConsecutivosConformes(serie, hoje)).toBe(3);
  });

  it("um dia abaixo do limiar derruba o mês inteiro", () => {
    const serie = faixa("2026-05-01", "2026-08-14", 80);
    const junho15 = serie.find((d) => d.dia === "2026-06-15")!;
    junho15.pct = 69;
    // Julho conforme; junho quebrado corta a sequência.
    expect(mesesConsecutivosConformes(serie, hoje)).toBe(1);
  });

  it("mês inteiro sem medição zera a contagem — o gatilho abre com dado, não com vácuo", () => {
    const serie = [
      ...faixa("2026-05-01", "2026-05-31", 90),
      ...faixa("2026-06-01", "2026-06-30", null), // ninguém devido o mês todo
      ...faixa("2026-07-01", "2026-08-14", 90),
    ];
    expect(mesesConsecutivosConformes(serie, hoje)).toBe(1);
  });

  it("série vazia é zero, não erro", () => {
    expect(mesesConsecutivosConformes([], hoje)).toBe(0);
  });
});

describe("a série da caderneta", () => {
  const hoje = "2026-08-14";

  it("14/02 a 14/08 são 6 meses completos", () => {
    const s = estadoDaSerie(faixa("2026-02-14", "2026-08-14", 50), hoje);
    expect(s.meses).toBe(6);
    expect(s.desatualizada).toBe(false);
  });

  it("um buraco zera a contagem — dia sem cálculo quebra a série", () => {
    const comBuraco = faixa("2026-02-14", "2026-08-14", 50).filter(
      (d) => d.dia !== "2026-05-10",
    );
    expect(estadoDaSerie(comBuraco, hoje).meses).toBe(0);
  });

  it("série parada no passado aparece como desatualizada", () => {
    const s = estadoDaSerie(faixa("2026-02-14", "2026-08-12", 50), hoje);
    expect(s.desatualizada).toBe(true);
  });

  it("a fração retroativa é exposta — reconstrução não se disfarça de medição", () => {
    const serie = [
      ...faixa("2026-08-01", "2026-08-10", 80, true),
      ...faixa("2026-08-11", "2026-08-14", 80, false),
    ];
    const s = estadoDaSerie(serie, hoje);
    expect(s.fracao_retroativa).toBeCloseTo(10 / 14, 5);
  });
});

describe("o veredito do gatilho", () => {
  const hoje = "2026-08-14";

  it("só abre com as TRÊS condições — e 149 monitorados não abre", () => {
    // 7 meses de série a 80%: conformidade e série atingidas.
    const serie = faixa("2026-01-01", "2026-08-14", 80);
    const quase = estadoDoGatilho(serie, 149, hoje);
    expect(quase.aberto).toBe(false);
    expect(quase.condicoes.filter((c) => c.atingida)).toHaveLength(2);

    const aberto = estadoDoGatilho(serie, 150, hoje);
    expect(aberto.aberto).toBe(true);
  });

  it("série curta trava a condição de meses mesmo com conformidade alta", () => {
    const serie = faixa("2026-06-01", "2026-08-14", 100);
    const g = estadoDoGatilho(serie, 200, hoje);
    expect(g.aberto).toBe(false);
    expect(g.condicoes.find((c) => c.unidade === "meses" && c.rotulo.includes("Série"))?.atingida).toBe(false);
  });
});

describe("a rota e a tela", () => {
  it("a rota exige o perfil da matriz e apura monitorados pela emenda", () => {
    expect(rota).toContain('"Acompanhar a conformidade do Ciclo"');
    // Ciclo ativo sem elegibilidade perdida…
    expect(rota).toContain('.neq("status_elegibilidade", "perdida")');
    // …com revisão confirmada nos últimos 12 meses…
    expect(rota).toContain('.not("confirmada_em", "is", null)');
    // …ou dentro da janela da primeira revisão.
    expect(rota).toContain('.eq("numero_revisao", 1)');
  });

  it("o gráfico é honesto: lacuna para dia sem devidos, atenuação para retroativo", () => {
    expect(painel).toContain("if (d.pct === null) return null;");
    expect(painel).toContain("opacity={d.retroativa ? 0.35 : 1}");
  });

  it("o painel informa, não aciona — gatilho atingido não liga a recompra", () => {
    expect(painel).toContain("quem abre o");
    expect(painel).toContain("Bloco B é a diretoria");
    // Nenhuma escrita em contratos_ciclo a partir do painel.
    expect(painel).not.toContain("recompra_habilitada");
  });
});

describe("a série anda sozinha (Pacote 4)", () => {
  it("o portão do cron é fechado para quem não é equipe", () => {
    // `rodar_conformidade_diaria` se apresenta como chamador sem JWT, o que
    // PULA a checagem de staff da função que ela chama. O Postgres concede
    // EXECUTE a PUBLIC por padrão: sem o revoke, qualquer sessão autenticada
    // — inclusive papel `cliente` — rodaria o cálculo. É a linha que separa
    // "entrada do cron" de "escada de privilégio".
    expect(cron).toContain(
      "revoke all on function public.rodar_conformidade_diaria() from public, anon, authenticated",
    );
    expect(cron).not.toMatch(/grant execute on function public.rodar_conformidade_diaria() to [^;]*authenticated/);
    // E a migração prova isso contra o banco, não só no texto.
    expect(cron).toContain("has_function_privilege");
  });

  it("a data da série é a de Curitiba, não a do servidor", () => {
    // O banco roda em UTC. Sem isto, `current_date` dentro da função seria a
    // data UTC e a série do §1.4 — um calendário de loja — andaria trocada.
    expect(cron).toContain("set timezone = 'America/Sao_Paulo'");
  });

  it("roda no fim do dia, porque dia gravado nunca é reescrito", () => {
    // 02:30 UTC = 23h30 em Curitiba. Rodar de manhã congelaria o dia no
    // estado em que ele amanheceu — e a função não volta para corrigir.
    expect(cron).toContain("'30 2 * * *'");
    expect(cron).toContain("conformidade-diaria");
  });

  it("o agendamento vive no banco, versionado — não num workflow", () => {
    // A cópia versionada de workflow do n8n já divergiu do que roda duas
    // vezes neste projeto. Migração não diverge em silêncio.
    expect(cron).toContain("create extension if not exists pg_cron");
    expect(cron).toContain("cron.schedule");
  });
});
