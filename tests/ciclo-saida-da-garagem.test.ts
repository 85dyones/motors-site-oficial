import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validarSaida } from "../src/lib/ciclo/saida";

const raiz = join(__dirname, "..");
const rota = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "veiculos", "[id]", "saida", "route.ts"),
  "utf-8",
);
const rotaVerificar = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "revisoes", "[id]", "verificar", "route.ts"),
  "utf-8",
);
const rotaRevisoes = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "revisoes", "route.ts"),
  "utf-8",
);
const tela = readFileSync(
  join(raiz, "src", "components", "admin", "FilaDeVerificacao.tsx"),
  "utf-8",
);

describe("marcar a saída da Garagem", () => {
  it("exige data", () => {
    expect(validarSaida({ saiu_em: "", motivo_saida: "revendido" })
      .some((p) => p.campo === "saiu_em")).toBe(true);
  });

  it("exige motivo — é o que o CHECK do banco cobra", () => {
    expect(validarSaida({ saiu_em: "2026-08-20", motivo_saida: "  " })
      .some((p) => p.campo === "motivo_saida")).toBe(true);
  });

  it("recusa data no futuro: saída é registro do que aconteceu", () => {
    expect(validarSaida({ saiu_em: "2099-01-01", motivo_saida: "revendido" })
      .some((p) => p.campo === "saiu_em")).toBe(true);
  });

  it("aceita o caso completo", () => {
    expect(validarSaida({ saiu_em: "2026-08-20", motivo_saida: "revendido" })).toEqual([]);
  });
});

describe("a rota é de staff e não apaga nada", () => {
  it("exige staff e o gate da fila de verificação", () => {
    expect(rota).toContain("ehStaff(profile)");
    expect(rota).toContain('podeFazer(perfisDe(profile), "Verificar revisão do diário de bordo")');
  });

  it("só escreve saiu_em e motivo_saida — o histórico não é apagado", () => {
    expect(rota).not.toContain(".delete(");
    expect(rota).toContain('.from("veiculos_vendidos")');
    expect(rota).toContain(".update(");
  });

  it("update que não casa linha nenhuma não vira 'ok'", () => {
    // PostgREST devolve `error: null` para um update que casa ZERO linhas. Sem
    // o `.select()`, a tela anunciava "Saída registrada" com o banco intacto —
    // id errado, ou a RLS barrando em silêncio (200 com `[]`, nunca erro).
    //
    // Ancorado na CADEIA de chamada — `.eq("id", id)` seguido de
    // `.select("id")` no MESMO update — e não numa string solta: essa mesma
    // string também está no comentário logo acima, e sobreviveria sozinha se
    // o `.select("id")` saísse da cadeia de verdade.
    expect(rota).toMatch(/\.eq\(\s*"id",\s*id\s*\)\s*\.select\(\s*"id"\s*\)/);
    expect(rota).toMatch(/\.length === 0/);
    expect(rota).toContain("status: 404");
    expect(rota).toContain("Veículo não encontrado");
  });

  it("marcar saída deixa rastro, como a rota irmã da mesma tela", () => {
    // Silenciar o programa inteiro de um cliente sem registro de quem e quando
    // é o tipo de ação que a auditoria (A17) existe para cobrir.
    expect(rotaVerificar).toContain("registrarAcaoSensivel");
    expect(rota).toContain("registrarAcaoSensivel");
    expect(rota).toContain("Marcar saída da Garagem");
    // O rastro identifica o veículo, a data e o motivo.
    expect(rota).toContain("dados.saiu_em");
    expect(rota).toContain("dados.motivo_saida");
  });
});

describe("a tela não deixa remarcar saída às cegas", () => {
  it("a lista de veículos traz saiu_em do servidor", () => {
    // Ancorado DENTRO da string do `.select(...)` que lista as colunas do
    // veículo — não em qualquer canto do arquivo. O comentário deste trecho
    // também cita "saiu_em", e ele sobreviveria sozinho se o campo saísse do
    // select de verdade.
    const selectDeVeiculos = /\.from\(\s*"veiculos_vendidos"\s*\)\s*\.select\(\s*"([^"]*)"\s*\)/.exec(
      rotaRevisoes,
    );
    expect(selectDeVeiculos, "select de veiculos_vendidos não encontrado").not.toBeNull();
    expect(selectDeVeiculos![1]).toContain("saiu_em");
    expect(tela).toMatch(/saiu_em: string \| null/);
  });

  it("o seletor da saída marca quem já saiu", () => {
    // Sem a marca, a loja remarca um carro já encerrado e SOBRESCREVE a data
    // que o cliente lê na Garagem como fim do acompanhamento.
    expect(tela).toContain("rotuloDoVeiculo");
    expect(tela).toContain("já saiu em");
    const seletor = tela.slice(tela.indexOf("value={saida.veiculo_vendido_id}"));
    expect(seletor.slice(0, seletor.indexOf("</select>"))).toContain("rotuloDoVeiculo(v)");
  });

  it("marcar saída limpa o aviso, como as duas funções irmãs", () => {
    // Sem isto, o "Lançada e verificada…" da ação anterior fica na tela ao lado
    // do erro da saída, e a loja lê o sucesso de outra coisa.
    for (const fn of ["decidir", "registrar", "marcarSaida"]) {
      const corpo = tela.slice(tela.indexOf(`const ${fn} = async`));
      expect(corpo.slice(0, corpo.indexOf("await fetch")), `${fn} não limpa o aviso`).toContain(
        'setAviso("")',
      );
    }
  });
});
