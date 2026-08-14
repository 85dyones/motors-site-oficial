import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pacote 1 — fundação de dados do Motors Ciclo.
 *
 * O aceite do pacote ("um cliente lê exclusivamente os próprios registros")
 * é provado pela autoconferência DENTRO da migração, que roda contra o banco
 * real no momento em que ela é aplicada e falha a migração inteira se o
 * isolamento não valer.
 *
 * Estes testes guardam outra coisa: que as decisões escritas ali não sejam
 * desfeitas por descuido numa edição futura. São afirmações sobre o texto da
 * migração — a mesma abordagem de `tests/migracoes.test.ts`, e pela mesma
 * razão: não há instância de teste do Supabase neste projeto (AUDITORIA §5.7).
 */

const raiz = join(__dirname, "..");
const migracao = readFileSync(
  join(raiz, "supabase", "migrations", "20260813150000_ciclo_fundacao_de_dados.sql"),
  "utf-8",
);

/** As 13 tabelas do §2.1 do manual v1.1. */
const TABELAS = [
  "clientes",
  "parceiros_ciclo",
  "veiculos_vendidos",
  "contratos_financiamento",
  "apolices_seguro",
  "contratos_ciclo",
  "manutencoes",
  "plano_revisoes",
  "leituras_odometro",
  "conformidade_diaria",
  "telemetria_resumo",
  "indice_ciclo",
  "eventos_ciclo",
];

describe("as tabelas do §2.1", () => {
  it("cria as treze", () => {
    for (const t of TABELAS) {
      expect(migracao, `tabela ${t} não é criada`).toContain(
        `create table if not exists public.${t}`,
      );
    }
  });

  it("liga RLS em todas — sem exceção", () => {
    for (const t of TABELAS) {
      expect(
        migracao,
        `RLS não habilitada em ${t}`,
      ).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
    }
  });

  it("usa parceiros_ciclo, não parceiros", () => {
    // `parceiros` já existe em produção e é do financeiro (fornecedores e
    // clientes da loja). Decisão do dono em 2026-08-03, AUDITORIA §5.2.
    expect(migracao).toContain("create table if not exists public.parceiros_ciclo");
    expect(migracao).not.toMatch(/create table if not exists public\.parceiros\b(?!_ciclo)/);
    expect(migracao).toContain("references public.parceiros_ciclo(id)");
  });

  it("estoque_id é referência fraca: integer e sem FK", () => {
    // O manual declara `uuid references estoque_motors(id)`; a coluna real é
    // integer, e a linha do estoque some quando o veículo sai do feed —
    // uma FK apagaria ou travaria o registro da venda (AUDITORIA §3.3).
    expect(migracao).toMatch(/estoque_id\s+integer/);
    expect(migracao).not.toContain("references public.estoque_motors");
  });
});

describe("a verificação — o que separa lançar de valer", () => {
  it("manutencoes tem os campos da etiqueta e a origem restrita", () => {
    for (const campo of [
      "origem_registro",
      "confirmada_em",
      "confirmada_por",
      "url_etiqueta_anterior",
      "url_etiqueta_atual",
    ]) {
      expect(migracao, `campo ${campo} fora de manutencoes`).toContain(campo);
    }
    expect(migracao).toContain("check (origem_registro in ('loja', 'parceiro', 'cliente'))");
  });

  it("o cliente não pode gravar revisão já carimbada nem em nome da loja", () => {
    const policy = migracao.slice(
      migracao.indexOf("create policy manutencoes_cliente_registra"),
      migracao.indexOf("-- Sem UPDATE e sem DELETE para o cliente"),
    );
    expect(policy).toContain("origem_registro = 'cliente'");
    expect(policy).toContain("confirmada_em is null");
    expect(policy).toContain("confirmada_por is null");
    // Quem decide se a revisão caiu na janela é a loja, não quem registra.
    expect(policy).toContain("dentro_da_janela is null");
    expect(policy).toContain("public.e_veiculo_do_cliente(veiculo_vendido_id)");
  });

  it("a caderneta é append-only do lado do cliente", () => {
    // Registro enviado não se reescreve: correção é registro novo.
    expect(migracao).not.toMatch(/create policy manutencoes_cliente\w* on public\.manutencoes\s+for (update|delete)/);
    expect(migracao).not.toMatch(/create policy leituras_odometro_cliente\w* on public\.leituras_odometro\s+for (update|delete)/);
  });
});

describe("a RLS por cliente", () => {
  it("toda tabela tem policy de staff", () => {
    // Criadas em laço; o teste confere a forma do laço e a régua.
    expect(migracao).toContain("using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()))");
    for (const t of TABELAS) {
      expect(migracao, `${t} fora do laço de policies de staff`).toContain(`'${t}'`);
    }
  });

  it("o cliente lê pela cadeia cliente → veículo, e falha fechado sem sessão", () => {
    expect(migracao).toContain("create or replace function public.cliente_atual()");
    expect(migracao).toContain("select id from public.clientes where auth_user_id = auth.uid()");
    expect(migracao).toContain("create or replace function public.e_veiculo_do_cliente(vv_id uuid)");
    // security definer: a policy consulta a tabela sem disparar a RLS dela.
    expect(migracao).toMatch(/cliente_atual\(\) returns uuid\s+language sql stable security definer/);
  });

  it("o agregado da base e o log interno NÃO são do cliente", () => {
    // conformidade_diaria é a série da base inteira; eventos_ciclo tem
    // desfecho e valor gerado. Nenhum dos dois é dado pessoal dele.
    expect(migracao).not.toContain("conformidade_diaria_cliente_le");
    expect(migracao).not.toContain("eventos_ciclo_cliente_le");
  });

  it("anon perde os privilégios que o Supabase concede por padrão", () => {
    // Tabela nova em public nasce com GRANT ALL para anon e authenticated
    // (verificado contra produção em 2026-08-13). RLS sozinha barraria, mas
    // uma policy futura sem `TO` reabriria a porta.
    expect(migracao).toContain("revoke all on public.%I from anon, authenticated");
    expect(migracao).toContain("grant select, insert, update, delete on public.%I to authenticated");
  });
});

describe("a view de estado", () => {
  it("a materializada não é legível com sessão — matview ignora RLS", () => {
    expect(migracao).toContain("create materialized view public.vw_ciclo_estado");
    expect(migracao).toContain("revoke all on public.vw_ciclo_estado from anon, authenticated");
    expect(migracao).toContain("grant select on public.vw_ciclo_estado to service_role");
  });

  it("o painel lê por uma view que exige staff", () => {
    expect(migracao).toContain("create view public.vw_ciclo_estado_painel");
    expect(migracao).toContain("where public.is_staff(auth.uid())");
    // `security_invoker` NÃO pode estar aqui: a view precisa rodar com os
    // privilégios do dono para enxergar a matview; o corte é o WHERE.
    expect(migracao).not.toMatch(/vw_ciclo_estado_painel[\s\S]{0,200}security_invoker/);
  });

  it("tem índice único, sem o qual o refresh concorrente não roda", () => {
    expect(migracao).toContain("create unique index if not exists idx_vce_veiculo");
  });

  it("só revisão confirmada move o KM conhecido", () => {
    const lateral = migracao.slice(
      migracao.indexOf("select max(km_registrado) as km_ultimo"),
      migracao.indexOf(") m on true"),
    );
    expect(lateral).toContain("confirmada_em is not null");
  });
});

describe("as regras invioláveis, no schema", () => {
  it("campos de recompra existem e nascem desligados", () => {
    // Regra 5: existem porque o manual os especifica, não porque haja código
    // que os escreva. Nenhum default liga a recompra.
    expect(migracao).toContain("recompra_habilitada boolean default false");
    expect(migracao).not.toMatch(/recompra_habilitada\s+boolean\s+default\s+true/);
  });

  it("score_conducao não tem default zero", () => {
    // Regra 2: sem telemetria grava NULL, nunca 0 — zerar penalizaria o
    // cliente pela ausência de uma fonte que não é dele (§5.6).
    expect(migracao).toMatch(/score_conducao\s+numeric\(5,2\),/);
    expect(migracao).not.toMatch(/score_conducao\s+numeric\(5,2\)\s+default\s+0/);
  });

  it("telemetria guarda agregado mensal, nunca traçado bruto", () => {
    // Regra 1. A tabela existe e fica vazia enquanto não houver provedor.
    expect(migracao).toContain("competencia         date not null");
    expect(migracao).not.toMatch(/latitude|longitude|coordenada|geojson|point\(/i);
  });
});

describe("a autoconferência do aceite", () => {
  it("assume a sessão de um cliente e tenta a leitura cruzada", () => {
    expect(migracao).toContain("set local role authenticated");
    expect(migracao).toContain("ACEITE FALHOU: cliente A leu o veículo do cliente B");
    expect(migracao).toContain("ACEITE FALHOU: cliente conseguiu gravar revisão já carimbada");
    expect(migracao).toContain("ACEITE FALHOU: cliente A registrou revisão no veículo de B");
  });

  it("limpa o que criou", () => {
    for (const t of ["manutencoes", "leituras_odometro", "veiculos_vendidos", "clientes"]) {
      expect(migracao, `autoconferência não apaga ${t}`).toMatch(
        new RegExp(`delete from public\\.${t}\\s`),
      );
    }
  });
});
