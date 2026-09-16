import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ler, lerCodigo } from "./fonte";
import {
  CARENCIA_VENDIDO_DIAS,
  decidirNoFeed,
  decidirPublicacao,
  resolverDatasDeVenda,
} from "../src/lib/publicacao";
import { MARGEM_FORA_DO_FEED_MS } from "../src/lib/estoqueTabela";
import {
  filtroDoSeletorDeVenda,
  vendidosAguardandoRegistro,
} from "../src/lib/ciclo/vendidosSemRegistro";

/**
 * A disponibilidade espelha o RevendaMais — decisão do dono em 2026-09-16.
 *
 * O defeito: Voyage 8393824, Celta 8416946 e Peugeot 2008 8417265 saíram do
 * feed em 08/09 e ficaram oito dias anunciados como à venda, com ficha 200,
 * preço, /estoque, sitemap e catálogo de anúncios. Desde a F0-q (30/08) nada no
 * banco reage a quem sai do feed.
 *
 * O conserto tem quatro pontas que moram em lugares diferentes e ninguém revisa
 * juntas — é isso que este arquivo amarra:
 *
 *   1. a migração dos três (`20260916210000`), que marca com a DATA certa;
 *   2. a função que o n8n chama no fim do ciclo (`20260916220000`);
 *   3. a régua do site (`lib/publicacao.ts`), que lê a data do histórico por
 *      um contrato de STRING ("true") que nenhum compilador confere;
 *   4. o seletor da A19, que deixaria de achar o carro que está sendo fechado.
 */

const DIR_MIGRACOES = join(__dirname, "..", "supabase", "migrations");

/** O SQL sem as linhas de comentário — a prosa cita o que o código não faz. */
function sqlExecutavel(arquivo: string): string {
  return readFileSync(join(DIR_MIGRACOES, arquivo), "utf8")
    .split(/\r?\n/)
    .filter((linha) => !linha.trimStart().startsWith("--"))
    .join("\n");
}

/** Recorte entre dois marcadores — falha alto se algum não existir. */
function fatia(texto: string, de: string, ate: string): string {
  const i = texto.indexOf(de);
  expect(i, `marcador ausente: ${de}`).toBeGreaterThanOrEqual(0);
  const f = texto.indexOf(ate, i + de.length);
  expect(f, `marcador ausente: ${ate}`).toBeGreaterThan(i);
  return texto.slice(i, f + ate.length);
}

const OS_TRES = sqlExecutavel("20260916210000_os_tres_vendidos_de_08_09.sql");
const ESPELHO = sqlExecutavel("20260916220000_disponibilidade_espelha_o_revendamais.sql");
const FUNCAO = fatia(
  ESPELHO,
  "create or replace function public.reconciliar_disponibilidade_do_feed(",
  "$funcao$;",
);
const ACEITE = fatia(ESPELHO, "do $aceite$", "end $aceite$;");

/** O valor de uma constante `nome constant tipo := valor;` do plpgsql. */
function constante(sql: string, nome: string): string {
  const m = new RegExp(`\\b${nome}\\s+constant\\s+[\\w\\[\\]]+\\s*:=\\s*([^;]+);`).exec(sql);
  expect(m, `constante ${nome} não encontrada`).not.toBeNull();
  return m![1].trim();
}

// ---------------------------------------------------------------------------
// 1. Os três de 08/09
// ---------------------------------------------------------------------------

describe("os três vendidos de 08/09", () => {
  it("marca exatamente os três, com a data de 08/09 às 18:00 de Brasília", () => {
    expect(constante(OS_TRES, "ids")).toBe("array[8393824, 8416946, 8417265]");
    expect(constante(OS_TRES, "data_da_venda")).toBe("'2026-09-08 18:00:00-03'");
  });

  it("escreve a coluna E o histórico — a coluna sozinha deixa a carência sem data", () => {
    // Reaplicar não pode marcar de novo nem duplicar histórico.
    expect(OS_TRES).toMatch(
      /update public\.estoque_motors\s+set vendido = true\s+where id = any \(ids\)\s+and coalesce\(vendido, false\) = false\s+returning id/,
    );
    // O histórico nasce SÓ para quem foi marcado agora, com a data da venda no
    // lugar do "agora" — e com o "true" que `resolverDatasDeVenda` compara.
    expect(OS_TRES).toMatch(
      /insert into public\.historico_veiculo\s*\(veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em\)\s*select x, 'vendido', 'false', 'true', null, autor, data_da_venda\s+from unnest\(marcados\) as x;/,
    );
  });

  it("não inventa venda do Ciclo, não arquiva e não se assina como sync", () => {
    // `veiculos_vendidos` é a venda com cliente e contrato. Criar a linha aqui
    // duplicaria a venda que o vendedor ainda pode registrar na A19.
    expect(OS_TRES).not.toMatch(/(insert\s+into|update|delete\s+from)\s+public\.veiculos_vendidos/i);
    // Arquivar tiraria a ficha do ar e mataria a carência de 90 dias.
    expect(OS_TRES).not.toMatch(/set\s+[^;]*estado_cadastro\s*=/i);
    // `last_seen_at` é a assinatura do sync — escrevê-lo faria a trava
    // descartar a escrita inteira.
    expect(OS_TRES).not.toMatch(/last_seen_at\s*=/i);
    // Venda confirmada pelo dono não pode ser desfeita pela volta ao feed, que
    // só desfaz o que tem a assinatura do próprio sync.
    expect(constante(OS_TRES, "autor")).not.toBe(constante(FUNCAO, "c_autor"));
  });

  it("prova pelo efeito e aborta se não gravou", () => {
    expect(OS_TRES).toMatch(/where id = any \(ids\) and vendido is true/);
    expect(OS_TRES).toContain("raise exception 'ACEITE FALHOU");
  });

  describe("o que a data faz no site — as promessas do cabeçalho, conferidas contra a régua", () => {
    // Como o PostgREST devolve o `registrado_em` gravado pela migração.
    const historico = [
      { veiculo_id: 8393824, valor_novo: "true", registrado_em: "2026-09-08T21:00:00+00:00" },
    ];
    const dataVenda = resolverDatasDeVenda([], historico)["8393824"];
    const sinais = { vendido: true, foraDoFeed: false, dataVenda };

    it("o site lê a data do histórico", () => {
      expect(dataVenda).toBe("2026-09-08T21:00:00+00:00");
    });

    it("hoje: selo VENDIDO e ficha indexável", () => {
      const r = decidirPublicacao(sinais, new Date("2026-09-16T22:00:00Z"));
      expect(r.rotulo).toBe("VENDIDO");
      expect(r.indisponivel).toBe(true);
      expect(r.noindex).toBe(false);
      expect(r.arquivar).toBe(false);
    });

    it("indexável até 08/12 às 18:00, e só então noindex + arquivamento", () => {
      expect(CARENCIA_VENDIDO_DIAS).toBe(90);
      expect(decidirPublicacao(sinais, new Date("2026-12-08T20:59:59Z")).noindex).toBe(false);
      const vencida = decidirPublicacao(sinais, new Date("2026-12-08T21:00:00Z"));
      expect(vencida.noindex).toBe(true);
      expect(vencida.arquivar).toBe(true);
    });

    it("catálogo: a janela de 7 dias fechou em 16/09 às 18:00 — o ponto que é decisão do dono", () => {
      expect(decidirNoFeed(sinais, new Date("2026-09-16T20:59:59Z"))).toEqual({
        publica: true,
        disponibilidade: "out_of_stock",
      });
      expect(decidirNoFeed(sinais, new Date("2026-09-16T21:00:00Z"))).toEqual({
        publica: false,
        disponibilidade: "out_of_stock",
      });
    });
  });
});

// ---------------------------------------------------------------------------
// 2. A função que o n8n chama
// ---------------------------------------------------------------------------

describe("a reconciliação com o feed", () => {
  it("só a chave de serviço executa, e ela roda como dona do banco", () => {
    expect(FUNCAO).toMatch(
      /reconciliar_disponibilidade_do_feed\(\s*p_ids\s+bigint\[\],\s*p_gravar\s+boolean\s+default\s+false\s*\)/,
    );
    // SECURITY DEFINER é o que faz a trava não confundir a função com o sync —
    // e é também o que a torna perigosa nas mãos erradas.
    expect(FUNCAO).toMatch(/security definer\s+set search_path = public/);
    expect(ESPELHO).toMatch(
      /revoke all on function public\.reconciliar_disponibilidade_do_feed\(bigint\[\], boolean\) from public, anon, authenticated;/,
    );
    expect(ESPELHO).toMatch(
      /grant execute on function public\.reconciliar_disponibilidade_do_feed\(bigint\[\], boolean\) to service_role;/,
    );
  });

  it("nasce em ensaio: nenhuma escrita antes de `if p_gravar`", () => {
    const antesDaPrimeiraEscrita = FUNCAO.slice(0, FUNCAO.indexOf("if p_gravar and"));
    expect(antesDaPrimeiraEscrita.length).toBeGreaterThan(0);
    expect(antesDaPrimeiraEscrita).not.toMatch(/\b(update|insert into|delete from)\s+public\./i);
    // As duas escritas moram dentro dos dois `if p_gravar`.
    expect(FUNCAO.match(/if p_gravar and cardinality\(v_(sairam|voltaram)\) > 0 then/g)).toHaveLength(2);
    expect(FUNCAO.match(/update public\.estoque_motors/g)).toHaveLength(2);
  });

  it("coleta quebrada barra ANTES de qualquer escrita", () => {
    const primeiraEscrita = FUNCAO.indexOf("update public.estoque_motors");
    expect(FUNCAO.indexOf("FEED_VAZIO")).toBeGreaterThan(-1);
    expect(FUNCAO.indexOf("FEED_VAZIO")).toBeLessThan(primeiraEscrita);
    expect(FUNCAO.indexOf("FEED_SUSPEITO")).toBeGreaterThan(-1);
    expect(FUNCAO.indexOf("FEED_SUSPEITO")).toBeLessThan(primeiraEscrita);
  });

  it("SAIU: só carro do feed, publicado, à venda, fora da lista e fora há a margem inteira", () => {
    const sairam = fatia(FUNCAO, "into v_sairam", ";");
    expect(sairam).toContain("e.origem = 'sync'");
    expect(sairam).toContain("e.estado_cadastro = 'publicado'");
    expect(sairam).toContain("coalesce(e.vendido, false) = false");
    expect(sairam).toContain("e.id <> all (v_ids)");
    expect(sairam).toContain("e.last_seen_at is not null");
    expect(sairam).toContain("e.last_seen_at <= now() - c_margem");
  });

  it("VOLTOU: desfaz só o que o próprio sync marcou — venda de gente fica", () => {
    const voltaram = fatia(FUNCAO, "into v_voltaram", "c_autor;");
    expect(voltaram).toContain("e.id = any (v_ids)");
    expect(voltaram).toContain("order by h.registrado_em desc");
    expect(voltaram).toContain("ultima.valor_novo = 'true'");
    expect(voltaram).toContain("ultima.autor_id is null");
    expect(voltaram).toContain("ultima.autor_nome = c_autor");
  });

  it("escreve o histórico no formato que o site lê, com a assinatura que a volta reconhece", () => {
    // "false" -> "true" na saída, "true" -> "false" na volta: o mesmo contrato
    // de string que `estoqueEscrita.ts` cumpre com `String(novo)`.
    expect(FUNCAO).toContain("select x, 'vendido', 'false', 'true', null, c_autor, clock_timestamp()");
    expect(FUNCAO).toContain("select x, 'vendido', 'true', 'false', null, c_autor, clock_timestamp()");
    // O aceite confere a MESMA assinatura que a função grava.
    expect(constante(ACEITE, "c_autor")).toBe(constante(FUNCAO, "c_autor"));

    // E o site, lendo essas linhas, faz o que se espera: data na saída, nenhuma
    // data depois da volta.
    const saida = { veiculo_id: 1, valor_novo: "true", registrado_em: "2026-09-17T21:00:05+00:00" };
    const volta = { veiculo_id: 1, valor_novo: "false", registrado_em: "2026-09-18T03:00:05+00:00" };
    expect(resolverDatasDeVenda([], [saida])).toEqual({ "1": saida.registrado_em });
    expect(resolverDatasDeVenda([], [saida, volta])).toEqual({});
  });

  it("nunca registra venda do Ciclo, nunca arquiva e nunca se assina como sync", () => {
    expect(FUNCAO).not.toMatch(/(insert\s+into|update|delete\s+from)\s+public\.veiculos_vendidos/i);
    expect(FUNCAO).not.toMatch(/set\s+[^;]*estado_cadastro\s*=/i);
    expect(FUNCAO).not.toMatch(/set\s+[^;]*last_seen_at\s*=/i);
  });

  it("a margem é a MESMA do aviso 'fora do feed' do painel — uma régua só", () => {
    // Com as duas iguais, o carro vira VENDIDO no ciclo em que o painel
    // começaria a avisar. Encurtar é decisão do dono, e se faz nos dois lugares.
    const margem = /^interval '(\d+) hours'$/.exec(constante(FUNCAO, "c_margem"));
    expect(margem, "c_margem fora do formato `interval 'N hours'`").not.toBeNull();
    expect(Number(margem![1]) * 60 * 60 * 1000).toBe(MARGEM_FORA_DO_FEED_MS);
  });

  it("o piso é o MESMO do filtro de ciclo suspeito da vitrine", () => {
    const supabaseLib = lerCodigo("src/lib/supabase.ts");
    const fracao = /const FRACAO_MINIMA_DO_CICLO = ([\d.]+);/.exec(supabaseLib);
    expect(fracao).not.toBeNull();
    expect(Number(constante(FUNCAO, "c_piso"))).toBe(Number(fracao![1]));
  });

  it("o aceite chama como o n8n chama e desfaz a sonda", () => {
    expect(ACEITE).toContain("set local role service_role;");
    expect(ACEITE).toContain("raise exception 'DESFAZ_A_SONDA';");
    expect(ACEITE).toContain("raise exception 'ACEITE FALHOU");
  });
});

// ---------------------------------------------------------------------------
// 3. A porta que continua fechada
// ---------------------------------------------------------------------------

describe("o upsert do sync continua sem `vendido`", () => {
  // O conserto passa pela função, e só por ela. Aberta no upsert (ou na
  // allowlist da trava), a coluna deixaria o robô DESMARCAR a cada seis horas a
  // venda que a loja marcou e o RevendaMais ainda anuncia — o Honda Fit 8321599,
  // vendido em 14/08, estava no feed de 16/09.

  it("o corpo do upsert do n8n não manda vendido nem estado", () => {
    const workflow = JSON.parse(
      ler("Antigravity - Sincronizador de Estoque (estoque_motors).json"),
    ) as { nodes: Array<{ name: string; parameters: { body?: string } }> };
    const upsert = workflow.nodes.find((n) => /^Upsert Ve.culo/u.test(n.name));
    expect(upsert).toBeDefined();
    expect(String(upsert!.parameters.body)).not.toMatch(/\bvendido\s*:/);
    expect(String(upsert!.parameters.body)).not.toMatch(/\bestado_cadastro\s*:/);
  });

  it("nenhuma migração põe `vendido` na allowlist da trava", () => {
    const trava = sqlExecutavel("20260908160000_opcionais_vem_do_feed.sql");
    expect(trava).toContain("old.opcionais         := new.opcionais;");
    expect(trava).not.toMatch(/old\.vendido\s*:=/);
    expect(ESPELHO).not.toMatch(/old\.vendido\s*:=/);
    expect(ESPELHO).not.toMatch(/create or replace function public\.estoque_motors_trava_do_sync/);
  });
});

// ---------------------------------------------------------------------------
// 4. O seletor da A19
// ---------------------------------------------------------------------------

describe("o seletor da A19 continua achando o carro que está sendo fechado", () => {
  const AGORA = new Date("2026-09-20T12:00:00Z");
  const marcou = (id: number, quando: string, valor = "true") => ({
    veiculo_id: id,
    valor_novo: valor,
    registrado_em: quando,
  });

  it("vendido há pouco e sem venda no Ciclo: entra", () => {
    expect(
      vendidosAguardandoRegistro([marcou(8393824, "2026-09-18T21:00:05+00:00")], [], AGORA),
    ).toEqual([8393824]);
  });

  it("já tem venda registrada no Ciclo: sai — chassi é único lá", () => {
    expect(
      vendidosAguardandoRegistro(
        [marcou(8393824, "2026-09-18T21:00:05+00:00")],
        [{ estoque_id: 8393824 }],
        AGORA,
      ),
    ).toEqual([]);
  });

  it("vendido antigo, sem linha no histórico: não entra", () => {
    expect(vendidosAguardandoRegistro([], [], AGORA)).toEqual([]);
  });

  it("a janela é a carência da ficha — no limite entra, um dia depois sai", () => {
    const limite = new Date(AGORA.getTime() - CARENCIA_VENDIDO_DIAS * 86_400_000).toISOString();
    const passou = new Date(AGORA.getTime() - (CARENCIA_VENDIDO_DIAS + 1) * 86_400_000).toISOString();
    expect(vendidosAguardandoRegistro([marcou(1, limite)], [], AGORA)).toEqual([1]);
    expect(vendidosAguardandoRegistro([marcou(1, passou)], [], AGORA)).toEqual([]);
  });

  it("data no futuro não segura carro na lista", () => {
    expect(vendidosAguardandoRegistro([marcou(1, "2027-09-18T21:00:00+00:00")], [], AGORA)).toEqual([]);
  });

  it("desmarcado depois (voltou à venda): não entra por aqui — já entra como à venda", () => {
    expect(
      vendidosAguardandoRegistro(
        [marcou(1, "2026-09-17T21:00:00+00:00"), marcou(1, "2026-09-18T03:00:00+00:00", "false")],
        [],
        AGORA,
      ),
    ).toEqual([]);
  });

  it("o filtro do PostgREST: à venda, ou os ids aguardando — e só inteiros positivos", () => {
    expect(filtroDoSeletorDeVenda([])).toBe("vendido.is.null,vendido.eq.false");
    expect(filtroDoSeletorDeVenda([8393824, 8416946])).toBe(
      "vendido.is.null,vendido.eq.false,id.in.(8393824,8416946)",
    );
    expect(filtroDoSeletorDeVenda([Number.NaN, -1, 1.5])).toBe("vendido.is.null,vendido.eq.false");
  });

  it("a rota usa a régua, devolve `vendido` e degrada em vez de quebrar", () => {
    const rota = lerCodigo("src/app/api/ciclo/vendas/estoque/route.ts");
    expect(rota).toContain(".or(filtroDoSeletorDeVenda(aguardandoRegistro))");
    expect(rota).toContain("vendidosAguardandoRegistro(");
    expect(rota).toContain('.from("historico_veiculo")');
    expect(rota).toContain('.from("veiculos_vendidos")');
    expect(rota).toMatch(/valor_fipe, vendido\$\{podeVerCusto/);
    // Sem as leituras extras, o seletor volta a ser o de antes.
    expect(rota).toMatch(/semVendidos\s*\?\s*\[\]/);
    // A rota LÊ a venda do Ciclo; quem escreve é `fechar_venda_ciclo`.
    expect(rota).not.toMatch(/\.from\("veiculos_vendidos"\)[\s\S]{0,80}\.(insert|update|upsert|delete)\(/);
    expect(rota).not.toContain('.or("vendido.is.null,vendido.eq.false")');
  });

  it("a lista diz que o carro é vendido", () => {
    const formulario = ler("src/components/admin/FechamentoDeVenda.tsx");
    expect(formulario).toContain("vendido?: boolean | null;");
    expect(formulario).toMatch(/\{v\.vendido && \(/);
  });
});
