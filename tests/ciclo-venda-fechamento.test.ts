import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validarFechamentoDeVenda,
  vendaPodeSerFechada,
  planoDeRevisoes,
  documentoTemTamanhoValido,
  telefoneEhE164,
  CAMPOS_OBRIGATORIOS_DA_VENDA,
  CAMPOS_OBRIGATORIOS_DO_FINANCIAMENTO,
  INTERVALO_KM,
  INTERVALO_MESES,
  TOLERANCIA_DIAS,
  REVISOES_NO_CONTRATO,
  type DadosDaVenda,
} from "../src/lib/ciclo/vendaFechamento";

/**
 * Pacote 2 — captura na venda.
 *
 * Aceite do pacote: "é impossível marcar uma venda como concluída com campo
 * obrigatório vazio. Confirme por teste, não por inspeção visual."
 *
 * A prova em banco vive na autoconferência da migração
 * `20260814120000_fechar_venda_ciclo.sql`, que roda quando ela é aplicada.
 * Aqui está o outro lado: a régua do formulário e da rota, e a garantia de que
 * as três camadas não divergem.
 */

const raiz = join(__dirname, "..");
const migracao = readFileSync(
  join(raiz, "supabase", "migrations", "20260814120000_fechar_venda_ciclo.sql"),
  "utf-8",
);
const rota = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "vendas", "route.ts"),
  "utf-8",
);

/** Uma venda que fecha — a base dos casos negativos. */
const vendaCompleta = (): DadosDaVenda => ({
  cpf_cnpj: "000.000.001-91",
  nome: "Cliente de Teste",
  telefone_e164: "+554199990000",
  email: "cliente@exemplo.invalido",
  chassi: "9BWZZZ377VT004251",
  placa: "ABC1D23",
  marca: "Chevrolet",
  modelo: "Onix",
  ano_fabricacao: 2022,
  ano_modelo: 2023,
  data_venda: "2026-08-14",
  km_na_venda: 32000,
  valor_venda: 78900,
  consentimento_lgpd: true,
});

describe("a venda não fecha sem os campos do §3.1", () => {
  it("a venda completa fecha", () => {
    expect(validarFechamentoDeVenda(vendaCompleta())).toEqual([]);
    expect(vendaPodeSerFechada(vendaCompleta())).toBe(true);
  });

  it("faltar QUALQUER obrigatório impede o fechamento", () => {
    for (const campo of CAMPOS_OBRIGATORIOS_DA_VENDA) {
      const venda = vendaCompleta();
      // Consentimento não é campo de texto: o vazio dele é `false`.
      (venda as Record<string, unknown>)[campo] = campo === "consentimento_lgpd" ? false : "";
      const problemas = validarFechamentoDeVenda(venda);
      expect(problemas.length, `venda fechou sem ${campo}`).toBeGreaterThan(0);
      expect(problemas.some((p) => p.campo === campo), `${campo} não foi apontado`).toBe(true);
    }
  });

  it("devolve todos os problemas de uma vez, não o primeiro", () => {
    // Quem está com o cliente na frente precisa saber o que falta inteiro.
    const problemas = validarFechamentoDeVenda({});
    expect(problemas.length).toBeGreaterThanOrEqual(CAMPOS_OBRIGATORIOS_DA_VENDA.length);
  });

  it("consentimento ausente vale como recusado", () => {
    const venda = vendaCompleta();
    delete (venda as Record<string, unknown>).consentimento_lgpd;
    expect(vendaPodeSerFechada(venda)).toBe(false);
  });

  it("e-mail entrou na lista porque é a porta da caderneta", () => {
    // v1.1 §3.1 — não estava no manual 1.0.
    expect(CAMPOS_OBRIGATORIOS_DA_VENDA).toContain("email");
    const venda = { ...vendaCompleta(), email: "nao-e-email" };
    expect(validarFechamentoDeVenda(venda).some((p) => p.campo === "email")).toBe(true);
  });
});

describe("as validações de formato", () => {
  it("aceita CPF e CNPJ pelo tamanho, com ou sem pontuação", () => {
    expect(documentoTemTamanhoValido("000.000.001-91")).toBe(true);
    expect(documentoTemTamanhoValido("00000000000191")).toBe(true);
    expect(documentoTemTamanhoValido("123")).toBe(false);
  });

  it("exige telefone em E.164", () => {
    expect(telefoneEhE164("+554199990000")).toBe(true);
    expect(telefoneEhE164("41999990000")).toBe(false);
    expect(telefoneEhE164("+55 41 99999-0000")).toBe(false);
  });

  it("recusa KM negativo e valor de venda zerado", () => {
    expect(validarFechamentoDeVenda({ ...vendaCompleta(), km_na_venda: -1 })
      .some((p) => p.campo === "km_na_venda")).toBe(true);
    expect(validarFechamentoDeVenda({ ...vendaCompleta(), valor_venda: 0 })
      .some((p) => p.campo === "valor_venda")).toBe(true);
  });

  it("recusa ano de modelo anterior ao de fabricação", () => {
    const venda = { ...vendaCompleta(), ano_fabricacao: 2023, ano_modelo: 2022 };
    expect(validarFechamentoDeVenda(venda).some((p) => p.campo === "ano_modelo")).toBe(true);
  });
});

describe("o financiamento: nenhum ou todos", () => {
  it("venda sem financiamento fecha", () => {
    expect(vendaPodeSerFechada({ ...vendaCompleta(), financiamento: null })).toBe(true);
  });

  it("financiamento iniciado exige todos os campos", () => {
    for (const campo of CAMPOS_OBRIGATORIOS_DO_FINANCIAMENTO) {
      const fin: Record<string, unknown> = {
        instituicao: "Banco",
        valor_financiado: 30000,
        taxa_mensal: 0.0175,
        prazo_meses: 48,
        valor_parcela: 900,
        data_primeira_parcela: "2026-09-14",
      };
      fin[campo] = "";
      const problemas = validarFechamentoDeVenda({ ...vendaCompleta(), financiamento: fin });
      expect(problemas.some((p) => p.campo === campo), `${campo} passou vazio`).toBe(true);
    }
  });

  it("taxa mensal é decimal, não percentual", () => {
    // 1,75 seria 175% ao mês. É o erro de digitação mais provável, e ele
    // envenenaria todo cálculo de saldo devedor do §5.1.
    const comTaxaErrada = {
      ...vendaCompleta(),
      financiamento: {
        instituicao: "Banco", valor_financiado: 30000, taxa_mensal: 1.75,
        prazo_meses: 48, valor_parcela: 900, data_primeira_parcela: "2026-09-14",
      },
    };
    expect(validarFechamentoDeVenda(comTaxaErrada).some((p) => p.campo === "taxa_mensal")).toBe(true);
  });
});

describe("o plano de revisões (§1.5)", () => {
  const plano = planoDeRevisoes("2026-08-14", 32000);

  it("gera as três revisões do contrato de 36 meses", () => {
    expect(plano).toHaveLength(REVISOES_NO_CONTRATO);
    expect(REVISOES_NO_CONTRATO).toBe(3);
  });

  it("o KM previsto sobe de 10.000 em 10.000 a partir do KM de saída", () => {
    // O marco zero é a entrega, não a fabricação: a 1ª revisão é o KM de
    // saída + 10.000, e é ela que não tem etiqueta anterior para conferir.
    expect(plano[0].km_previsto).toBe(32000 + INTERVALO_KM);
    expect(plano[1].km_previsto).toBe(32000 + 2 * INTERVALO_KM);
    expect(plano[2].km_previsto).toBe(32000 + 3 * INTERVALO_KM);
  });

  it("a janela abre 30 dias antes e fecha 30 dias depois do previsto", () => {
    // 2026-08-14 + 12 meses = 2027-08-14; ±30 dias.
    expect(plano[0].janela_inicio).toBe("2027-07-15");
    expect(plano[0].janela_fim).toBe("2027-09-13");
    expect(INTERVALO_MESES).toBe(12);
    expect(TOLERANCIA_DIAS).toBe(30);
  });

  it("as janelas não se sobrepõem", () => {
    for (let i = 1; i < plano.length; i++) {
      expect(plano[i].janela_inicio > plano[i - 1].janela_fim).toBe(true);
    }
  });
});

describe("as três camadas não podem divergir", () => {
  it("o banco valida os mesmos campos que a lib", () => {
    // Se um campo entrar na lista do TypeScript e não na função SQL, a rota
    // recusaria e o PostgREST aceitaria — e o caminho de fora do formulário
    // gravaria venda incompleta.
    for (const campo of CAMPOS_OBRIGATORIOS_DA_VENDA) {
      expect(migracao, `${campo} não é validado na função SQL`).toContain(
        `array_append(faltando, '${campo}')`,
      );
    }
    for (const campo of CAMPOS_OBRIGATORIOS_DO_FINANCIAMENTO) {
      expect(migracao, `${campo} do financiamento não é validado na função SQL`).toContain(
        `array_append(faltando, '${campo}')`,
      );
    }
  });

  it("o banco gera o mesmo plano que a lib", () => {
    expect(migracao).toContain(`v_km + (n * ${INTERVALO_KM})`);
    expect(migracao).toContain(`(n * interval '${INTERVALO_MESES} months') - interval '${TOLERANCIA_DIAS} days'`);
    expect(migracao).toContain(`generate_series(1, ${REVISOES_NO_CONTRATO})`);
  });

  it("a rota traduz a recusa do banco de volta para a tela", () => {
    expect(rota).toContain("VENDA_INCOMPLETA");
    expect(rota).toContain("CHASSI_JA_REGISTRADO");
    expect(rota).toContain("fechar_venda_ciclo");
  });

  it("a rota exige staff e o perfil da matriz", () => {
    expect(rota).toContain("if (!ehStaff(profile?.role))");
    expect(rota).toContain('podeFazer(perfil, "Fechar venda do Ciclo")');
  });
});

describe("as regras invioláveis, no fechamento", () => {
  it("a venda escreve em transação — nunca seis inserts soltos", () => {
    // Venda pela metade é o que o §0 do manual proíbe.
    expect(rota).toContain('supabase.rpc("fechar_venda_ciclo"');
    expect(rota).not.toMatch(/\.from\("veiculos_vendidos"\)[\s\S]{0,40}\.insert/);
    expect(rota).not.toMatch(/\.from\("clientes"\)[\s\S]{0,40}\.insert/);
  });

  it("o contrato nasce sem recompra — regra 5", () => {
    const insercao = migracao.slice(
      migracao.indexOf("insert into public.contratos_ciclo"),
      migracao.indexOf("return jsonb_build_object"),
    );
    expect(insercao).not.toContain("recompra_habilitada");
    expect(insercao).not.toContain("recompra_valor");
    expect(migracao).toContain("gatilho do §1.4 não abriu");
  });

  it("o KM de saída vira a primeira notação de odômetro", () => {
    expect(migracao).toContain("insert into public.leituras_odometro");
    expect(migracao).toContain("'venda'");
  });

  it("a resposta só afirma o vínculo da Garagem que gravou", () => {
    // Achado #7: o update do auth_user_id e o RPC de vínculo rodavam com o
    // `error` descartado — a resposta dizia "conta_criada" mesmo quando o
    // vínculo não escreveu, e o cliente descobria a Garagem vazia semanas
    // depois, sem rastro na auditoria.
    expect(rota).toContain("erroVinculo");
    expect(rota).toContain("conta_criada_sem_vinculo");
    expect(rota).toContain("erroRpc");
    // Erro do RPC não pode virar "sem_vinculo": resposta desconhecida é
    // falha, não ausência de conta.
    expect(rota).toMatch(/erroRpc\)\s*\{[\s\S]*?garagem = "falhou"/);
  });
});

describe("a autoconferência do aceite, na migração", () => {
  it("tenta fechar vendas incompletas e exige que todas falhem", () => {
    for (const cenario of [
      "venda sem consentimento LGPD foi aceita",
      "venda sem e-mail foi aceita",
      "financiamento sem taxa_mensal foi aceito",
      "o mesmo chassi foi vendido duas vezes",
      "quem não é staff fechou uma venda",
    ]) {
      expect(migracao, `cenário ausente: ${cenario}`).toContain(cenario);
    }
  });

  it("confere o grafo inteiro da venda que fecha", () => {
    expect(migracao).toContain("plano de revisões saiu com % linhas, esperava 3");
    expect(migracao).toContain("KM de saída não virou leitura de odômetro");
    expect(migracao).toContain("a janela da 1ª revisão não bate com o §1.5");
    expect(migracao).toContain("contrato do Ciclo nasceu com recompra");
  });

  it("limpa o que criou", () => {
    for (const t of ["contratos_financiamento", "contratos_ciclo", "plano_revisoes",
                     "leituras_odometro", "veiculos_vendidos", "clientes"]) {
      expect(migracao, `autoconferência não apaga ${t}`).toMatch(
        new RegExp(`delete from public\\.${t}\\s`),
      );
    }
  });
});
