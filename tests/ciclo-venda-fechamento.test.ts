import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  validarFechamentoDeVenda,
  vendaPodeSerFechada,
  projetarRevisoes,
  documentoTemTamanhoValido,
  telefoneEhE164,
  CAMPOS_OBRIGATORIOS_DA_VENDA,
  CAMPOS_OBRIGATORIOS_DO_FINANCIAMENTO,
  INTERVALO_KM,
  INTERVALO_MESES,
  TOLERANCIA_DIAS,
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

/**
 * A migração VIVA de uma função, não o arquivo que tem o nome dela.
 *
 * `fechar_venda_ciclo` já foi redefinida por `create or replace` em migrações
 * cujo nome não a menciona. Este teste abria a de 2026-08-14 por nome e passou
 * três dias verde validando código morto — exatamente o que ele existe para
 * impedir. Quem procura pela definição não erra de novo.
 */
function migracaoViva(funcao: string): string {
  const dir = join(raiz, "supabase", "migrations");
  const encontradas = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf-8"))
    .filter((texto) => texto.includes(`create or replace function public.${funcao}(`));
  if (encontradas.length === 0) {
    throw new Error(`nenhuma migração define ${funcao}`);
  }
  return encontradas[encontradas.length - 1];
}

const migracao = migracaoViva("fechar_venda_ciclo");
const gerador = migracaoViva("abrir_proxima_janela");

/**
 * A migração da FUNDAÇÃO do fechamento de venda — lida por nome, de propósito.
 *
 * O bloco abaixo não fala da função viva: fala de uma migração específica que
 * provou a si mesma no dia em que foi aplicada. Esse texto é histórico e não
 * muda mais. Trocar esta leitura por `migracaoViva` faria o bloco perseguir o
 * `create or replace` mais recente e cobrar dele uma autoconferência que ele
 * não tem — foi exatamente o que aconteceu quando tentamos.
 *
 * A regra que separa as duas: se a asserção é sobre o que o banco FAZ hoje,
 * use `migracaoViva`. Se é sobre o que uma migração PROVOU quando rodou, leia
 * o arquivo dela pelo nome.
 */
const migracaoDaFundacao = readFileSync(
  join(raiz, "supabase", "migrations", "20260814120000_fechar_venda_ciclo.sql"),
  "utf-8",
);
const rota = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "vendas", "route.ts"),
  "utf-8",
);
const formulario = readFileSync(
  join(raiz, "src", "components", "admin", "FechamentoDeVenda.tsx"),
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
  const plano = projetarRevisoes("2026-08-14", 32000);

  it("projeta uma janela por padrão — o banco materializa uma de cada vez", () => {
    expect(plano).toHaveLength(1);
  });

  it("o KM previsto sobe de 10.000 em 10.000 a partir do marco", () => {
    // O marco é a entrega na primeira, e a última revisão confirmada depois.
    const tres = projetarRevisoes("2026-08-14", 32000, 3);
    expect(tres[0].km_previsto).toBe(32000 + INTERVALO_KM);
    expect(tres[1].km_previsto).toBe(32000 + 2 * INTERVALO_KM);
    expect(tres[2].km_previsto).toBe(32000 + 3 * INTERVALO_KM);
  });

  it("a janela abre 30 dias antes e fecha 30 dias depois do previsto", () => {
    // 2026-08-14 + 12 meses = 2027-08-14; ±30 dias.
    expect(plano[0].janela_inicio).toBe("2027-07-15");
    expect(plano[0].janela_fim).toBe("2027-09-13");
    expect(INTERVALO_MESES).toBe(12);
    expect(TOLERANCIA_DIAS).toBe(30);
  });

  it("as janelas projetadas não se sobrepõem", () => {
    const tres = projetarRevisoes("2026-08-14", 32000, 3);
    for (let i = 1; i < tres.length; i++) {
      expect(tres[i].janela_inicio > tres[i - 1].janela_fim).toBe(true);
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

  it("o banco gera o plano pelo gerador, não por série fixa", () => {
    expect(migracao).toContain("perform public.abrir_proxima_janela(v_veiculo)");
    // Ancorado na cláusula `from ... as n`, não em "generate_series(1, 3)"
    // sozinho: o cabeçalho desta migração narra o bug histórico e cita esse
    // literal entre crases. "from generate_series(1, 3) as n" é a forma
    // sintática exata do bloco removido, e não aparece em comentário nenhum.
    expect(migracao).not.toContain("from generate_series(1, 3) as n");
  });

  it("o gerador do banco usa a mesma régua do §1.5 que a lib", () => {
    expect(gerador).toContain(`v_km + ${INTERVALO_KM}`);
    expect(gerador).toContain(`interval '${INTERVALO_MESES} months'`);
    expect(gerador).toContain(`interval '${TOLERANCIA_DIAS} days'`);
  });

  it("o plano não seca: nada no banco limita o número de revisões", () => {
    expect(gerador).toContain("coalesce(max(numero_revisao), 0) + 1");
  });

  it("a rota traduz a recusa do banco de volta para a tela", () => {
    expect(rota).toContain("VENDA_INCOMPLETA");
    expect(rota).toContain("CHASSI_JA_REGISTRADO");
    expect(rota).toContain("fechar_venda_ciclo");
  });

  it("a rota exige staff e o perfil da matriz", () => {
    expect(rota).toContain("if (!ehStaff(profile))");
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

  it("nenhum consentimento nasce marcado", () => {
    // Achado #13: whatsapp e e-mail vinham pré-marcados. Sob a LGPD,
    // consentimento é manifestação afirmativa — caixa pré-marcada prova que
    // o vendedor não desmarcou, não que o cliente disse sim. E desmarcado
    // não penaliza (regra 2): o motor suprime por sem_canal_consentido.
    expect(formulario).toContain(
      "consentimento_canais: { whatsapp: false, email: false, sms: false }",
    );
    expect(formulario).toContain("consentimento_lgpd: false");
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
      expect(migracaoDaFundacao, `cenário ausente: ${cenario}`).toContain(cenario);
    }
  });

  it("confere o grafo inteiro da venda que fecha", () => {
    // "esperava 3" é o comportamento antigo, provado à época em que esta
    // migração (2026-08-14) rodou: três revisões por calendário, fixas. A
    // régua vitalícia de hoje — uma janela por vez, sem secar — é provada
    // pelas autoconferências D2 de `20260820120000_plano_de_revisoes_vitalicio.sql`,
    // não aqui.
    expect(migracaoDaFundacao).toContain("plano de revisões saiu com % linhas, esperava 3");
    expect(migracaoDaFundacao).toContain("KM de saída não virou leitura de odômetro");
    expect(migracaoDaFundacao).toContain("a janela da 1ª revisão não bate com o §1.5");
    expect(migracaoDaFundacao).toContain("contrato do Ciclo nasceu com recompra");
  });

  it("limpa o que criou", () => {
    for (const t of ["contratos_financiamento", "contratos_ciclo", "plano_revisoes",
                     "leituras_odometro", "veiculos_vendidos", "clientes"]) {
      expect(migracaoDaFundacao, `autoconferência não apaga ${t}`).toMatch(
        new RegExp(`delete from public\\.${t}\\s`),
      );
    }
  });
});
