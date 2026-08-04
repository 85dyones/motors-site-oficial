import { describe, it, expect } from "vitest";
import { apenasDoUltimoSync } from "../src/lib/supabase";

/**
 * Filtro de reconciliação do estoque com o feed do RevendaMais.
 *
 * O sync é upsert puro — nunca remove. Em 2026-08-04 o feed tinha 45 veículos e
 * a tabela 88: 43 anúncios de carros que a loja não lista mais, todos com
 * `vendido = false`, todos visíveis no site. `last_seen_at` + este filtro são a
 * correção.
 *
 * Por que estes testes existem e não são cerimônia:
 *
 * Este filtro decide o que o site público exibe. Se ele errar para menos, a
 * concessionária fica com a vitrine vazia — ou, pior, cai no `MOCK_ESTOQUE` e
 * publica 5 carros fictícios como se fossem estoque real. É um modo de falha
 * silencioso: ninguém recebe erro, o site só fica errado.
 *
 * O risco é concreto porque o workflow n8n NÃO tem agendamento — só gatilho
 * manual, `active: false`. Qualquer corte por relógio de parede esvaziaria a
 * vitrine sozinho numa semana sem ninguém clicar. Daí a regra central abaixo:
 * a referência é o carimbo mais recente da própria tabela, nunca `Date.now()`.
 */

const MIN = 60 * 1000;
const H = 60 * MIN;

/** Carimbo em ISO, deslocado do instante base. */
function em(base: number, deslocamentoMs: number) {
  return new Date(base + deslocamentoMs).toISOString();
}

describe("apenasDoUltimoSync", () => {
  const agora = Date.UTC(2026, 7, 4, 20, 0, 0);

  it("mantém o ciclo mais recente e descarta o anterior", () => {
    const linhas = [
      { id: 1, last_seen_at: em(agora, 0) },
      { id: 2, last_seen_at: em(agora, -12 * 1000) }, // mesmo ciclo, segundos depois
      { id: 3, last_seen_at: em(agora, -6 * H) }, // ciclo anterior — saiu do feed
      { id: 4, last_seen_at: em(agora, -30 * 24 * H) }, // vendido há um mês
    ];
    expect(apenasDoUltimoSync(linhas).map((l) => l.id)).toEqual([1, 2]);
  });

  it("tolera a duração de um ciclo — o n8n grava uma linha por requisição", () => {
    // 45 requisições levam segundos; a janela de 30 min é folga deliberada.
    const linhas = [
      { id: 1, last_seen_at: em(agora, 0) },
      { id: 2, last_seen_at: em(agora, -29 * MIN) },
      { id: 3, last_seen_at: em(agora, -31 * MIN) },
    ];
    expect(apenasDoUltimoSync(linhas).map((l) => l.id)).toEqual([1, 2]);
  });

  it("NÃO usa relógio de parede — sem sync há meses, a vitrine continua servida", () => {
    // A garantia que impede a vitrine de esvaziar sozinha. Todos os carimbos
    // são antigos; nenhum é recente. Um corte do tipo `now() - 24h` devolveria
    // vazio aqui e derrubaria o site no MOCK_ESTOQUE.
    const linhas = [
      { id: 1, last_seen_at: em(agora, -90 * 24 * H) },
      { id: 2, last_seen_at: em(agora, -90 * 24 * H + 5 * MIN) },
      { id: 3, last_seen_at: em(agora, -200 * 24 * H) },
    ];
    const visiveis = apenasDoUltimoSync(linhas).map((l) => l.id);
    expect(visiveis).toEqual([1, 2]);
    expect(visiveis.length).toBeGreaterThan(0);
  });

  it("sem nenhum carimbo, não filtra nada", () => {
    // Estado entre a migração `last_seen_at` e o primeiro sync que a preenche.
    // Filtrar aqui esconderia o estoque inteiro.
    const linhas = [{ id: 1 }, { id: 2, last_seen_at: null }, { id: 3 }];
    expect(apenasDoUltimoSync(linhas).map((l) => l.id)).toEqual([1, 2, 3]);
  });

  it("linha sem carimbo é mantida mesmo quando há carimbos", () => {
    // Inserção manual pelo painel não passa pelo sync e nunca teria carimbo.
    // Sumir do site em silêncio seria pior que aparecer indevidamente.
    const linhas = [
      { id: 1, last_seen_at: em(agora, 0) },
      { id: 2, last_seen_at: null },
      { id: 3, last_seen_at: em(agora, -6 * H) },
    ];
    expect(apenasDoUltimoSync(linhas).map((l) => l.id)).toEqual([1, 2]);
  });

  it("lista vazia entra e sai vazia, sem estourar", () => {
    // Math.max() de conjunto vazio devolve -Infinity; o caminho precisa sair
    // antes disso.
    expect(apenasDoUltimoSync([])).toEqual([]);
  });

  it("carimbo inválido não contamina a referência", () => {
    // `new Date("qualquer coisa").getTime()` é NaN, e NaN em Math.max
    // envenenaria o corte e devolveria lista vazia — vitrine apagada.
    const linhas = [
      { id: 1, last_seen_at: "nao e uma data" },
      { id: 2, last_seen_at: em(agora, 0) },
      { id: 3, last_seen_at: em(agora, -6 * H) },
    ];
    const visiveis = apenasDoUltimoSync(linhas).map((l) => l.id);
    expect(visiveis).toContain(2);
    expect(visiveis).not.toContain(3);
  });

  it("reproduz o caso real de 2026-08-04: 88 linhas, 45 no feed", () => {
    const doFeed = Array.from({ length: 45 }, (_, i) => ({
      id: i,
      last_seen_at: em(agora, -i * 200), // ciclo espalhado por ~9s
    }));
    const orfaos = Array.from({ length: 43 }, (_, i) => ({
      id: 100 + i,
      last_seen_at: em(agora, -7 * H - i * 200),
    }));
    const visiveis = apenasDoUltimoSync([...doFeed, ...orfaos]);
    expect(visiveis).toHaveLength(45);
    expect(visiveis.every((l) => l.id < 45)).toBe(true);
  });
});
