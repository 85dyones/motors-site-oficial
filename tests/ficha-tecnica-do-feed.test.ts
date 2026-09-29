import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ler, lerCodigo } from "./fonte";
import {
  IDADE_MINIMA_EM_ANOS,
  KM_MINIMO_PLAUSIVEL,
  kmDiscrepantes,
  motivoDeKmDiscrepante,
} from "../src/lib/kmDiscrepante";

/**
 * A ficha técnica segue o RevendaMais, e o km discrepante vira alerta.
 *
 * Queixa do dono em 2026-09-29: "alterei a quilometragem de um veículo no
 * revenda, mas ele não alterou no site". O n8n sempre mandou o km; a trava do
 * sync o descartava desde 30/08. As três decisões do mesmo dia:
 *   1. o sync traz km, ano, ano de fabricação, câmbio, combustível e cor;
 *   2. marca, modelo e versão NÃO (título e URL da ficha);
 *   3. o km vem como estiver lá e é publicado, com alerta nos discrepantes.
 */

const PASTA = "supabase/migrations";
const MIGRACAO = "20260929200000_ficha_tecnica_segue_o_feed.sql";
const FICHA = ["quilometragem", "ano", "ano_fabricacao", "cambio", "combustivel", "cor"] as const;

const executavel = (arquivo: string) =>
  ler(`${PASTA}/${arquivo}`)
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

function travaVigente(): { arquivo: string; corpo: string } {
  const cria = /create\s+or\s+replace\s+function\s+public\.estoque_motors_trava_do_sync\(/i;
  const arquivo = readdirSync(join(__dirname, "..", PASTA))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => cria.test(executavel(f)))
    .pop()!;
  const sql = executavel(arquivo);
  const inicio = sql.search(cria);
  const fim = sql.indexOf("$$;", sql.indexOf("$$", inicio) + 2);
  return { arquivo, corpo: sql.slice(inicio, fim) };
}

const contar = (texto: string, re: RegExp) => (texto.match(new RegExp(re, "g")) ?? []).length;

describe("a trava: a ficha técnica segue o feed", () => {
  const { arquivo, corpo } = travaVigente();

  it("a versão vigente é a desta entrega", () => {
    expect(arquivo).toBe(MIGRACAO);
  });

  it("cada campo da ficha tem UMA escrita, e ela vai para o histórico junto", () => {
    for (const campo of FICHA) {
      expect(contar(corpo, new RegExp(`\\bold\\.${campo}\\s*:=`)), campo).toBe(1);
      // A troca e o registro no mesmo bloco: não existe troca sem linha no
      // histórico — é o que faz o sync ser conferível.
      expect(corpo, campo).toMatch(
        new RegExp(
          `insert into public\\.historico_veiculo \\(veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em\\)\\s+` +
            `values \\(old\\.id, '${campo}',[^;]*c_autor, clock_timestamp\\(\\)\\);\\s+` +
            `old\\.${campo} := new\\.${campo};\\s+ficha_mudou := true;`,
        ),
      );
    }
    expect(corpo).toMatch(/c_autor constant text := 'RevendaMais \(sync\)';/);
  });

  it("o 'não sei' do nó do n8n nunca apaga: km 0, ano fora da faixa, N/D", () => {
    // O nó manda `parseInt(x || 0)` e `x || "N/D"`. Sem esta guarda, um feed sem
    // MILEAGE zeraria o km do site inteiro.
    expect(corpo).toMatch(/if new\.quilometragem > 0 and new\.quilometragem is distinct from old\.quilometragem then/);
    expect(corpo).toMatch(/if new\.ano between 1900 and 2100 and new\.ano is distinct from old\.ano then/);
    expect(corpo).toMatch(
      /if new\.ano_fabricacao between 1900 and 2100 and new\.ano_fabricacao is distinct from old\.ano_fabricacao then/,
    );
    for (const campo of ["cambio", "combustivel", "cor"]) {
      expect(corpo, campo).toMatch(
        new RegExp(
          `if nullif\\(btrim\\(new\\.${campo}\\), ''\\) is not null and upper\\(btrim\\(new\\.${campo}\\)\\) <> 'N/D'\\s+` +
            `and new\\.${campo} is distinct from old\\.${campo} then`,
        ),
      );
    }
  });

  it("marca, modelo e versão continuam barrados — título e URL da ficha", () => {
    for (const campo of ["marca", "modelo", "versao", "modelo_override", "versao_override"]) {
      expect(corpo, campo).not.toMatch(new RegExp(`\\bold\\.${campo}\\s*:?=`));
    }
  });

  it("mudar a ficha move o lastmod — a página mudou", () => {
    expect(corpo).toMatch(
      /if preco_mudou or opcionais_mudou or ficha_mudou or motor_preenchido then\s+old\.conteudo_atualizado_em := now\(\);/,
    );
  });
});

describe("a migração se prova antes de gravar", () => {
  const sql = executavel(MIGRACAO);

  it("ensaia o caso real: km 186.600 → 1 chega, vai para o histórico, e modelo não passa", () => {
    expect(sql).toMatch(/values \(id_a, 'aceiteficha', 'modelo novo', 'versao nova', 50000, 2014, 1, clock_timestamp\(\)\)/);
    expect(sql).toMatch(/valor_anterior = '186600'\s+and valor_novo = '1' and autor_nome = 'RevendaMais \(sync\)'/);
    expect(sql).toMatch(/depois\.modelo is distinct from 'modelo antigo'/);
  });

  it("o lastmod de ensaio nasce ontem, e o fim apaga a linha E o histórico dela", () => {
    expect(sql).toMatch(/ontem\s+timestamptz := now\(\) - interval '1 day';/);
    expect(sql).toMatch(/delete from public\.historico_veiculo where veiculo_id = id_a;\s+delete from public\.estoque_motors where id = id_a;/);
    expect(sql).toMatch(/raise exception 'Autoconferência falhou em % ponto\(s\)\.'/);
  });

  it("termina com o rodapé do livro-razão", () => {
    expect(sql).toMatch(
      /insert into supabase_migrations\.schema_migrations \(version, name\)\s+values \('20260929200000', 'ficha_tecnica_segue_o_feed'\)\s+on conflict \(version\) do nothing;\s*$/,
    );
  });
});

// ---------------------------------------------------------------------------
// O alerta
// ---------------------------------------------------------------------------

const HOJE = new Date("2026-09-29T12:00:00-03:00");
const SPIN = { id: "8446229", marca: "chevrolet", modelo: "spin", ano: 2014, quilometragem: 1 };

describe("km discrepante: o site publica, o painel avisa", () => {
  it("o caso que motivou: 1 km numa Spin 2014", () => {
    expect(motivoDeKmDiscrepante(SPIN, [], HOJE)).toBe("1 km num carro de 2014");
  });

  it("a queda de km registrada pelo sync acusa, mesmo com km plausível", () => {
    const motivo = motivoDeKmDiscrepante(
      { ...SPIN, quilometragem: 150000 },
      [{ veiculo_id: 8446229, valor_anterior: "186600", valor_novo: "150000" }],
      HOJE,
    );
    expect(motivo).toBe("o km diminuiu no RevendaMais: 186.600 km → 150.000 km");
  });

  it("km subindo é o normal — não acusa", () => {
    expect(
      motivoDeKmDiscrepante(
        { ...SPIN, quilometragem: 190000 },
        [{ veiculo_id: 8446229, valor_anterior: "186600", valor_novo: "190000" }],
        HOJE,
      ),
    ).toBeNull();
  });

  it("carro novo com km baixo é legítimo; o limite é a idade", () => {
    expect(motivoDeKmDiscrepante({ ...SPIN, ano: 2026, quilometragem: 12 }, [], HOJE)).toBeNull();
    expect(motivoDeKmDiscrepante({ ...SPIN, ano: 2025, quilometragem: 12 }, [], HOJE)).toBeNull();
    expect(motivoDeKmDiscrepante({ ...SPIN, ano: 2026 - IDADE_MINIMA_EM_ANOS, quilometragem: 12 }, [], HOJE)).not.toBeNull();
    expect(motivoDeKmDiscrepante({ ...SPIN, quilometragem: KM_MINIMO_PLAUSIVEL }, [], HOJE)).toBeNull();
  });

  it("histórico com valor que não é número não derruba nem acusa", () => {
    expect(
      motivoDeKmDiscrepante(
        { ...SPIN, quilometragem: 150000 },
        [{ veiculo_id: 8446229, valor_anterior: null, valor_novo: "150000" }],
        HOJE,
      ),
    ).toBeNull();
  });

  it("a lista junta o histórico por carro, e não de um carro no outro", () => {
    const achados = kmDiscrepantes(
      [
        { id: "1", marca: "a", modelo: "x", ano: 2020, quilometragem: 90000 },
        { id: "2", marca: "b", modelo: "y", ano: 2020, quilometragem: 90000 },
      ],
      [{ veiculo_id: 2, valor_anterior: "95000", valor_novo: "90000" }],
      HOJE,
    );
    expect(achados.map((a) => a.veiculo.id)).toEqual(["2"]);
  });
});

describe("o painel mostra o alerta", () => {
  const painel = lerCodigo("src/app/admin/page.tsx");

  it("lê as trocas de km do sync e monta o alerta urgente", () => {
    const leitura = lerCodigo("src/lib/kmDiscrepante.ts");
    expect(leitura).toContain('.eq("campo", "quilometragem")');
    expect(leitura).toContain('.eq("autor_nome", "RevendaMais (sync)")');
    expect(painel).toMatch(/kmDiscrepantes\(disponiveis, await trocasDeKmRecentes\(supabase\)\)/);
    expect(painel).toMatch(/com km discrepante no RevendaMais`,[\s\S]{0,600}?urgente: true/);
  });
});
