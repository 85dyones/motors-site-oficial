import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dentroDaJanela,
  validarRevisao,
  revisaoPodeSerRegistrada,
} from "../src/lib/ciclo/revisao";
import { TOLERANCIA_KM } from "../src/lib/ciclo/vendaFechamento";

/**
 * A caderneta: o carimbo e a régua da janela (manual v1.1 §1.5 e §5.7).
 *
 * A regra que define o programa: registro sem carimbo NÃO conta para a
 * conformidade. A prova em banco vive na autoconferência da migração
 * `20260814150000_carimbo_e_conformidade.sql`; aqui ficam a régua da janela
 * — que precisa ser idêntica nas duas camadas — e as decisões que uma edição
 * futura não pode desfazer por descuido.
 */

const raiz = join(__dirname, "..");
const migracao = readFileSync(
  join(raiz, "supabase", "migrations", "20260814150000_carimbo_e_conformidade.sql"),
  "utf-8",
);
const rotaFila = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "revisoes", "route.ts"),
  "utf-8",
);
const rotaCarimbo = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "revisoes", "[id]", "carimbar", "route.ts"),
  "utf-8",
);

describe("a régua da janela — §1.5", () => {
  // Janela: prevista para 2027-08-14, fim 2027-09-13 (+30d), km 40.000.
  const janela = { km_previsto: 40000, janela_fim: "2027-09-13" };

  it("dentro do prazo e do km passa", () => {
    expect(dentroDaJanela("2027-08-20", 39500, janela)).toBe(true);
  });

  it("a tolerância vale para a régua que venceu", () => {
    // Venceu o calendário: passou de janela_fim (que já inclui os 30 dias).
    expect(dentroDaJanela("2027-09-14", 39000, janela)).toBe(false);
    // Venceu o odômetro: km além do previsto + 1.000.
    expect(dentroDaJanela("2027-08-20", 41001, janela)).toBe(false);
    // No limite exato das tolerâncias, passa.
    expect(dentroDaJanela("2027-09-13", 41000, janela)).toBe(true);
    expect(TOLERANCIA_KM).toBe(1000);
  });

  it("antecipar nunca penaliza", () => {
    // Seis meses antes, com metade do km: cumpre a janela.
    expect(dentroDaJanela("2027-02-14", 35000, janela)).toBe(true);
  });

  it("sem km previsto, só o calendário decide", () => {
    expect(dentroDaJanela("2027-08-20", 99999, { km_previsto: null, janela_fim: "2027-09-13" })).toBe(true);
  });

  it("a mesma régua está na função SQL", () => {
    // Se as duas camadas divergirem, a tela prevê um resultado e o banco
    // grava outro.
    expect(migracao).toContain("m.data_servico <= janela.janela_fim");
    expect(migracao).toContain("m.km_registrado <= janela.km_previsto + 1000");
  });
});

describe("o registro e o carimbo", () => {
  it("registrar exige veículo, data e km — etiqueta só para carimbar", () => {
    const semNada = validarRevisao({});
    for (const campo of ["veiculo_vendido_id", "data_servico", "km_registrado"]) {
      expect(semNada.some((p) => p.campo === campo), `${campo} passou vazio`).toBe(true);
    }
    // Registro pendente sem etiqueta é estado válido — é a fila.
    expect(
      revisaoPodeSerRegistrada({
        veiculo_vendido_id: "x",
        data_servico: "2027-08-20",
        km_registrado: 40000,
      }),
    ).toBe(true);
    // Carimbar sem etiqueta, não.
    expect(
      validarRevisao({
        veiculo_vendido_id: "x",
        data_servico: "2027-08-20",
        km_registrado: 40000,
        confirmar: true,
      }).some((p) => p.campo === "url_etiqueta_atual"),
    ).toBe(true);
  });

  it("no banco: carimbo exige etiqueta, recusa exige motivo, e não há segundo carimbo", () => {
    expect(migracao).toContain("CARIMBO_SEM_ETIQUETA");
    expect(migracao).toContain("RECUSA_SEM_MOTIVO");
    expect(migracao).toContain("REVISAO_JA_CARIMBADA");
    // A recusa fica no rastro, não some.
    expect(migracao).toContain("RECUSADA em ");
  });

  it("o carimbo casa com a janela e o KM verificado vira leitura de odômetro", () => {
    expect(migracao).toContain("set manutencao_id = m.id");
    expect(migracao).toContain("insert into public.leituras_odometro");
    expect(migracao).toContain("'revisao'");
    // Revisão além do plano conta como fora, nunca como não-medida.
    expect(migracao).toContain("v_dentro := false;");
  });

  it("a equipe registra como loja ou parceiro — nunca em nome do cliente", () => {
    expect(rotaFila).toContain(`dados.origem_registro === "parceiro" ? "parceiro" : "loja"`);
  });

  it("as rotas exigem o perfil da matriz, e o carimbo deixa rastro de auditoria", () => {
    for (const rota of [rotaFila, rotaCarimbo]) {
      expect(rota).toContain('podeFazer(normalizarPerfil(profile?.role), "Confirmar revisão da caderneta")');
      expect(rota).toContain("ehStaff(profile?.role)");
    }
    expect(rotaCarimbo).toContain("registrarAcaoSensivel");
    expect(rotaCarimbo).toContain("Carimbo RECUSADO");
  });
});

describe("a série do §1.4", () => {
  it("nunca sobrescreve dia já gravado", () => {
    // "Série histórica preservada, não sobrescrita" — o plano do Pacote 4.
    expect(migracao).toContain("on conflict (dia) do nothing");
  });

  it("dia de denominador zero grava pct NULL, não zero", () => {
    expect(migracao).toContain("case when v_devidas > 0 then");
  });

  it("dia preenchido depois do fato sai marcado como retroativo", () => {
    expect(migracao).toContain("add column if not exists retroativa");
    expect(migracao).toContain("d < current_date");
  });

  it("só conta como em dia a janela cumprida por revisão carimbada dentro dela", () => {
    expect(migracao).toContain("m.confirmada_em is not null and m.dentro_da_janela");
  });
});

describe("a autoconferência da migração", () => {
  it("cobre os cenários que definem o programa", () => {
    for (const cenario of [
      "carimbou sem a foto da etiqueta",
      "recusou sem motivo",
      "revisão no prazo saiu como fora da janela",
      "o carimbo não casou com a janela do plano",
      "o KM da etiqueta não virou leitura verificada",
      "a mesma revisão foi carimbada duas vezes",
      "quem não é staff carimbou",
    ]) {
      expect(migracao, `cenário ausente: ${cenario}`).toContain(cenario);
    }
  });

  it("não toca na série de um banco que já tenha dado real", () => {
    // O trecho da série só roda com o banco vazio — senão o veículo sintético
    // entraria na conta e a limpeza apagaria dias de verdade.
    expect(migracao).toContain("Trecho da série PULADO");
  });
});
