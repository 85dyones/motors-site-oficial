import { describe, expect, it } from "vitest";
import {
  DURACAO_ATENDIMENTO_MS,
  GRADE_VAZIA,
  TETO_VOLUME,
  faixaVigente,
  horaDeMinutos,
  limitarVolume,
  minutosDeHora,
  normalizarGrade,
  type GradeMusica,
} from "../src/lib/musicaGrade";

/**
 * Guarda da grade de música do showroom — tela A18 do design doc do admin.
 *
 * Os três números do doc (teto 70%, abaixamento de 90 s, troca por horário)
 * estão aqui porque são regra de operação da loja, não detalhe de tela: quem
 * mexer neles tem que passar por um teste que diz de onde vieram.
 */

// 2026-08-10 é uma segunda-feira; 2026-08-15, um sábado. Datas fixas e não
// `new Date()`: um teste de grade horária que depende do relógio da máquina
// passa a semana inteira e quebra no sábado.
const segunda = (hora: number, min = 0) => new Date(2026, 7, 10, hora, min);
const sabado = (hora: number, min = 0) => new Date(2026, 7, 15, hora, min);

const grade: GradeMusica = {
  ativa: true,
  faixas: [
    {
      id: "manha",
      inicioMin: 9 * 60,
      fimMin: 12 * 60,
      dias: "semana",
      playlistUri: "spotify:playlist:dia",
      playlistNome: "Showroom Dia",
      volume: 55,
      sobDemanda: false,
    },
    {
      id: "almoco",
      inicioMin: 12 * 60,
      fimMin: 14 * 60,
      dias: "semana",
      playlistUri: "spotify:playlist:dia",
      playlistNome: "Showroom Dia",
      volume: 38,
      sobDemanda: false,
    },
    {
      id: "sabado",
      inicioMin: 9 * 60,
      fimMin: 14 * 60,
      dias: "sabado",
      playlistUri: "spotify:playlist:sabado",
      playlistNome: "Sábado Cheio",
      volume: 62,
      sobDemanda: false,
    },
    {
      id: "geral",
      inicioMin: 0,
      fimMin: 24 * 60,
      dias: "todos",
      playlistUri: "spotify:playlist:geral",
      playlistNome: "Geral",
      volume: 50,
      sobDemanda: false,
    },
    {
      id: "testdrive",
      inicioMin: 0,
      fimMin: 0,
      dias: "todos",
      playlistUri: "spotify:playlist:testdrive",
      playlistNome: "Test Drive",
      volume: 70,
      sobDemanda: true,
    },
  ],
};

describe("números que vêm do design doc A18", () => {
  it("teto de volume é 70 e o abaixamento dura 90 s", () => {
    // Se alguém mudar isto, mudou uma regra de operação da loja — não um
    // detalhe de implementação.
    expect(TETO_VOLUME).toBe(70);
    expect(DURACAO_ATENDIMENTO_MS).toBe(90_000);
  });

  it("nenhum caminho manda volume acima do teto", () => {
    expect(limitarVolume(100)).toBe(TETO_VOLUME);
    expect(limitarVolume(71)).toBe(TETO_VOLUME);
    expect(limitarVolume(55)).toBe(55);
    expect(limitarVolume(-10)).toBe(0);
  });
});

describe("conversão de horário", () => {
  it("vai e volta", () => {
    expect(minutosDeHora("09:00")).toBe(540);
    expect(minutosDeHora("17:30")).toBe(1050);
    expect(horaDeMinutos(540)).toBe("09:00");
    expect(horaDeMinutos(1050)).toBe("17:30");
  });

  it("recusa o que não é HH:MM", () => {
    expect(minutosDeHora("25:00")).toBeNull();
    expect(minutosDeHora("09:70")).toBeNull();
    expect(minutosDeHora("nove")).toBeNull();
    expect(minutosDeHora("")).toBeNull();
  });
});

describe("faixa vigente", () => {
  it("escolhe pela hora do dia", () => {
    expect(faixaVigente(grade, segunda(10))?.id).toBe("manha");
    expect(faixaVigente(grade, segunda(13))?.id).toBe("almoco");
  });

  it("o fim do intervalo é exclusivo — 12:00 já é o almoço", () => {
    // Sem isso, as duas faixas casariam ao meio-dia em ponto e o desempate
    // decidiria o volume por acaso.
    expect(faixaVigente(grade, segunda(11, 59))?.id).toBe("manha");
    expect(faixaVigente(grade, segunda(12, 0))?.id).toBe("almoco");
  });

  it("sábado vence 'qualquer dia' — o desempate é por especificidade, não por ordem no array", () => {
    expect(faixaVigente(grade, sabado(10))?.id).toBe("sabado");
    // Fora do horário de sábado, sobra a faixa geral.
    expect(faixaVigente(grade, sabado(16))?.id).toBe("geral");
  });

  it("domingo cai na faixa 'todos' — a loja não abre, mas a regra não inventa exceção", () => {
    const domingo = new Date(2026, 7, 16, 10, 0);
    expect(faixaVigente(grade, domingo)?.id).toBe("geral");
  });

  it("faixa sob demanda nunca entra sozinha", () => {
    // 'Test Drive' cobre 'todos' e o dia inteiro; se entrasse no rodízio,
    // trocaria a música da loja no meio do expediente.
    const so = { ativa: true, faixas: [grade.faixas[4]] };
    expect(faixaVigente(so, segunda(10))).toBeNull();
  });

  it("grade desligada não vale nada", () => {
    expect(faixaVigente({ ...grade, ativa: false }, segunda(10))).toBeNull();
    expect(faixaVigente(GRADE_VAZIA, segunda(10))).toBeNull();
  });

  it("faixa sem playlist é ignorada", () => {
    const semUri = {
      ativa: true,
      faixas: [{ ...grade.faixas[0], playlistUri: "" }],
    };
    expect(faixaVigente(semUri, segunda(10))).toBeNull();
  });
});

describe("normalização do que vem do banco", () => {
  it("descarta linha sem intervalo utilizável em vez de deixá-la valer o dia inteiro", () => {
    const g = normalizarGrade({
      ativa: true,
      faixas: [
        { id: "ok", inicioMin: 540, fimMin: 720, dias: "semana", playlistUri: "u", volume: 50 },
        { id: "sem-fim", inicioMin: 540, dias: "semana", playlistUri: "u", volume: 50 },
        { id: "invertida", inicioMin: 720, fimMin: 540, dias: "semana", playlistUri: "u", volume: 50 },
      ],
    });
    expect(g.faixas.map((f) => f.id)).toEqual(["ok"]);
  });

  it("aplica o teto ao volume gravado", () => {
    // Uma grade salva por uma versão anterior do painel, sem o teto, não pode
    // voltar tocando a 95%.
    const g = normalizarGrade({
      ativa: true,
      faixas: [{ id: "alta", inicioMin: 540, fimMin: 720, playlistUri: "u", volume: 95 }],
    });
    expect(g.faixas[0].volume).toBe(TETO_VOLUME);
  });

  it("lixo vira grade vazia e não explode", () => {
    expect(normalizarGrade(null)).toEqual(GRADE_VAZIA);
    expect(normalizarGrade("grade")).toEqual(GRADE_VAZIA);
    expect(normalizarGrade({ ativa: true })).toEqual(GRADE_VAZIA);
    expect(normalizarGrade({ faixas: [1, 2, null] }).faixas).toEqual([]);
  });
});
