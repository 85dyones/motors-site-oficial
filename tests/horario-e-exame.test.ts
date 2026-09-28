import { describe, it, expect } from "vitest";
import {
  HORARIO_DA_LOJA,
  dataEmCuritiba,
  ddmmEmCuritiba,
  ehHojeEmCuritiba,
  especificacaoDoHorario,
  horaParaLer,
} from "../src/lib/horarioDaLoja";
import {
  diaAceitoParaOExame,
  diasDoExame,
  rotuloCompletoDoDia,
  turnoDoExame,
} from "../src/lib/exameNoPatio";
import { PAGINAS_GEO } from "../src/lib/paginasGeo";
import { schemaDaLoja } from "../src/lib/schemaLoja";
import type { CompanySettings } from "../src/types";

/**
 * O horário da loja virou dado (decisão 12 do PR 3): o exame no pátio precisa
 * CALCULAR com ele, e calcular em cima de uma frase seria a terceira cópia.
 * Estes testes provam que a fonte nova não mudou o que o site já publicava, e
 * que "hoje" é o dia de Curitiba — não o do servidor, que roda em UTC.
 */
const QUARTA_MEIO_DIA = new Date("2026-09-23T15:00:00Z"); // qua 23/09, 12h em Curitiba

describe("o horário da loja é uma fonte só", () => {
  it("o AutoDealer publica o mesmo horário de antes", () => {
    const loja = schemaDaLoja({ name: "Motors Store" } as CompanySettings);
    expect(loja.openingHoursSpecification).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "08:30",
        closes: "18:30",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Saturday"],
        opens: "08:30",
        closes: "15:00",
      },
    ]);
  });

  it("e o que ele publica sai da constante", () => {
    expect(schemaDaLoja({ name: "Motors Store" } as CompanySettings).openingHoursSpecification).toEqual(
      especificacaoDoHorario(),
    );
  });

  it("o texto das páginas geográficas diz o mesmo horário", () => {
    const texto = PAGINAS_GEO.flatMap((p) => [...p.paragrafos, ...p.faq.map((f) => f.resposta)]).join(" ");
    for (const expediente of HORARIO_DA_LOJA) {
      expect(texto).toContain(`das ${horaParaLer(expediente.abre)} às ${horaParaLer(expediente.fecha)}`);
    }
  });
});

describe("o dia é o de Curitiba", () => {
  it("às 23h30 de quarta em Curitiba ainda é quarta, com o servidor já na quinta", () => {
    const noite = new Date("2026-09-24T02:30:00Z");
    expect(dataEmCuritiba(noite)).toBe("2026-09-23");
    expect(diasDoExame(noite).map((d) => d.rotulo)).toEqual(["Qui 24", "Sex 25", "Sáb 26"]);
  });

  it("dd/mm de coluna date e de timestamptz", () => {
    expect(ddmmEmCuritiba("2026-09-22")).toBe("22/09");
    expect(ddmmEmCuritiba("2026-09-25T01:00:00+00:00")).toBe("24/09");
    expect(ddmmEmCuritiba("2026-02-31")).toBeNull();
    expect(ddmmEmCuritiba("lixo")).toBeNull();
    expect(ddmmEmCuritiba(null)).toBeNull();
  });

  it("hoje é hoje em Curitiba", () => {
    expect(ehHojeEmCuritiba("2026-09-23T13:00:00Z", QUARTA_MEIO_DIA)).toBe(true);
    expect(ehHojeEmCuritiba("2026-09-23T02:00:00Z", QUARTA_MEIO_DIA)).toBe(false); // 23h de terça
    expect(ehHojeEmCuritiba(null, QUARTA_MEIO_DIA)).toBe(false);
  });
});

describe("os dias do exame", () => {
  it("os três próximos dias de loja aberta, depois de hoje", () => {
    expect(diasDoExame(QUARTA_MEIO_DIA)).toEqual([
      { data: "2026-09-24", rotulo: "Qui 24", rotuloCompleto: "Qui 24/09" },
      { data: "2026-09-25", rotulo: "Sex 25", rotuloCompleto: "Sex 25/09" },
      { data: "2026-09-26", rotulo: "Sáb 26", rotuloCompleto: "Sáb 26/09" },
    ]);
  });

  it("domingo fica de fora", () => {
    const sexta = new Date("2026-09-25T15:00:00Z");
    expect(diasDoExame(sexta).map((d) => d.data)).toEqual(["2026-09-26", "2026-09-28", "2026-09-29"]);
  });

  it("o rótulo completo leva dia e mês", () => {
    expect(rotuloCompletoDoDia("2026-09-26")).toBe("Sáb 26/09");
  });

  it("aceita de hoje até o fim da janela, e só dia de loja aberta", () => {
    expect(diaAceitoParaOExame("2026-09-24", QUARTA_MEIO_DIA)).toBe(true);
    expect(diaAceitoParaOExame("2026-09-26", QUARTA_MEIO_DIA)).toBe(true);
    // A ficha fica em cache: uma aba aberta de véspera ainda oferece o dia que virou hoje.
    expect(diaAceitoParaOExame("2026-09-23", QUARTA_MEIO_DIA)).toBe(true);
    expect(diaAceitoParaOExame("2026-09-22", QUARTA_MEIO_DIA)).toBe(false); // ontem
    expect(diaAceitoParaOExame("2026-09-27", QUARTA_MEIO_DIA)).toBe(false); // domingo
    expect(diaAceitoParaOExame("2026-09-28", QUARTA_MEIO_DIA)).toBe(false); // depois da janela
    expect(diaAceitoParaOExame("26/09", QUARTA_MEIO_DIA)).toBe(false);
    expect(diaAceitoParaOExame(20260926, QUARTA_MEIO_DIA)).toBe(false);
  });

  it("domingo dentro da janela é recusado mesmo estando entre hoje e o último dia", () => {
    // Sex 25/09 em Curitiba: a janela pula o domingo e chega até terça —
    // só quem confere `lojaAbreNoDia` barra o 27, que o limite superior sozinho não pegaria.
    const sexta = new Date("2026-09-25T15:00:00Z");
    expect(diasDoExame(sexta).map((d) => d.data)).toEqual(["2026-09-26", "2026-09-28", "2026-09-29"]);
    expect(diaAceitoParaOExame("2026-09-26", sexta)).toBe(true);
    expect(diaAceitoParaOExame("2026-09-27", sexta)).toBe(false); // domingo, dentro de [26, 29]
    expect(diaAceitoParaOExame("2026-09-28", sexta)).toBe(true);
  });

  it("turno é manhã ou tarde", () => {
    expect(turnoDoExame("manha")).toBe("manha");
    expect(turnoDoExame("tarde")).toBe("tarde");
    expect(turnoDoExame("noite")).toBeNull();
    expect(turnoDoExame(undefined)).toBeNull();
  });
});
