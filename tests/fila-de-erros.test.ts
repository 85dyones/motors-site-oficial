import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lerCodigo } from "./fonte";
import {
  CAMPOS_DA_LISTA,
  CAMPOS_DO_DETALHE,
  JANELA_PADRAO,
  PERFIS_QUE_TRIAM_ERROS,
  POR_PAGINA_NO_DETALHE,
  SELECT_DA_LISTA,
  SELECT_DO_DETALHE,
  agruparErros,
  cargaDeResolucao,
  coletaDeErrosLigada,
  ehHashDeAgrupamento,
  explicarVazio,
  filtrosDaBusca,
  podeTriarErros,
  type FiltrosDaFila,
  type OcorrenciaDaLista,
  type OcorrenciaDoDetalhe,
} from "../src/lib/filaDeErros";
import { lerFilaDeErros, resolverGrupoDeErros } from "../src/lib/filaDeErros-servidor";

/**
 * A fila de triagem de erro do site — `/admin/erros`.
 *
 * ---------------------------------------------------------------------------
 * O que cada trava aqui está segurando
 * ---------------------------------------------------------------------------
 * 1. **O agrupamento.** A tela não lista ocorrência, lista DEFEITO. Somar
 *    errado ou ordenar errado não quebra nada — só faz a fila mentir sobre o
 *    que é urgente, que é pior.
 * 2. **A projeção sem `stack`.** É uma decisão de CUSTO, e custo não grita:
 *    acrescentar a coluna na lista passaria despercebido até a fatura. Por isso
 *    ela é provada pelo que a consulta manda ao PostgREST, não pela fonte.
 * 3. **A escrita de duas colunas.** O grant da tabela é
 *    `update (resolvido_em, resolvido_por)`. Mandar `mensagem` junto derrubaria
 *    o lote inteiro com 42501 — e a razão de o grant ser assim é que a tela que
 *    exibe a prova do defeito não pode reescrevê-la.
 * 4. **A chave de serviço fora daqui.** A RLS é a régua; usar
 *    `createAdminSupabaseClient` numa tela de leitura a desligaria em silêncio.
 * 5. **O vazio honesto.** "Nenhum erro" e "a coleta está desligada" são coisas
 *    diferentes. Confundi-las é como o motor do Ciclo passou semanas em 401 sem
 *    ninguém perceber.
 */

/* ────────────────────────────────────────────────────────────────────────
   Dublê do PostgREST — encadeia como o de verdade e GRAVA o que recebeu
   ──────────────────────────────────────────────────────────────────────── */

interface Passo {
  metodo: string;
  args: unknown[];
}
interface ConsultaGravada {
  tabela: string;
  passos: Passo[];
}
interface RespostaFalsa {
  data?: unknown[] | null;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

/**
 * O dublê responde a `select`, `eq`, `is`, `not`, `order`, `range` e `update`
 * devolvendo a si mesmo, e é `await`-ável — que é exatamente a forma do
 * builder do `postgrest-js`.
 *
 * Cada `from()` consome a próxima resposta da fila: `lerFilaDeErros` faz DUAS
 * consultas quando a primeira volta vazia (a segunda é a contagem sem recorte),
 * e um dublê de resposta única esconderia a segunda.
 */
function clienteFalso(respostas: RespostaFalsa[]) {
  const consultas: ConsultaGravada[] = [];
  let indice = 0;

  const construir = (registro: ConsultaGravada, resposta: RespostaFalsa) => {
    const builder: Record<string, unknown> = {
      then(aoResolver: (v: unknown) => unknown, aoFalhar?: (e: unknown) => unknown) {
        return Promise.resolve({
          data: resposta.data ?? null,
          error: resposta.error ?? null,
          count: resposta.count ?? null,
        }).then(aoResolver, aoFalhar);
      },
    };
    for (const metodo of ["select", "eq", "is", "not", "order", "range", "update", "limit"]) {
      builder[metodo] = (...args: unknown[]) => {
        registro.passos.push({ metodo, args });
        return builder;
      };
    }
    return builder;
  };

  const cliente = {
    from(tabela: string) {
      const registro: ConsultaGravada = { tabela, passos: [] };
      consultas.push(registro);
      const resposta = respostas[Math.min(indice, respostas.length - 1)] ?? {};
      indice += 1;
      return construir(registro, resposta);
    },
  };

  return { cliente: cliente as never, consultas };
}

const acharPasso = (c: ConsultaGravada, metodo: string) =>
  c.passos.filter((p) => p.metodo === metodo);

/* ────────────────────────────────────────────────────────────────────────
   Fixtures
   ──────────────────────────────────────────────────────────────────────── */

const HASH_A = "0badc0de";
const HASH_B = "deadbeef12";

function ocorrencia(parcial: Partial<OcorrenciaDaLista> = {}): OcorrenciaDaLista {
  return {
    id: Math.random().toString(16).slice(2),
    criado_em: "2026-09-10T12:00:00+00:00",
    origem: "servidor",
    natureza: "quebra",
    assunto: "servidor:render",
    mensagem: "Cannot read properties of undefined",
    rota: "/carros/[categoria]/[marca]",
    ambiente: "production",
    digest: null,
    hash_agrupamento: HASH_A,
    suprimidas: 0,
    resolvido_em: null,
    ...parcial,
  };
}

/* ────────────────────────────────────────────────────────────────────────
   1. O agrupamento
   ──────────────────────────────────────────────────────────────────────── */

describe("agruparErros junta por hash_agrupamento", () => {
  it("soma as ocorrências e as suprimidas do grupo", () => {
    const grupos = agruparErros([
      ocorrencia({ criado_em: "2026-09-10T10:00:00+00:00", suprimidas: 4 }),
      ocorrencia({ criado_em: "2026-09-10T11:00:00+00:00", suprimidas: 0 }),
      ocorrencia({ criado_em: "2026-09-10T12:00:00+00:00", suprimidas: 7 }),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].ocorrencias).toBe(3);
    expect(grupos[0].suprimidas).toBe(11);
    // `vezes` é o que de fato aconteceu: as linhas MAIS o que a carência de
    // 10 s engoliu. Mostrar só as linhas subestimaria o defeito por um fator
    // que ninguém vê.
    expect(grupos[0].vezes).toBe(14);
  });

  it("guarda a primeira e a última ocorrência, mesmo fora de ordem", () => {
    const grupos = agruparErros([
      ocorrencia({ criado_em: "2026-09-10T11:00:00+00:00" }),
      ocorrencia({ criado_em: "2026-09-08T09:00:00+00:00" }),
      ocorrencia({ criado_em: "2026-09-10T18:30:00+00:00" }),
    ]);

    expect(grupos[0].primeira).toBe("2026-09-08T09:00:00+00:00");
    expect(grupos[0].ultima).toBe("2026-09-10T18:30:00+00:00");
  });

  it("a amostra de texto vem da ocorrência MAIS RECENTE", () => {
    // Se a amostra viesse da primeira linha lida, uma janela fora de ordem
    // descreveria o grupo pelo erro mais velho — e a rota mostrada seria a de
    // ontem, não a que está quebrando agora.
    const grupos = agruparErros([
      ocorrencia({
        criado_em: "2026-09-01T08:00:00+00:00",
        mensagem: "versão antiga da mensagem",
        rota: "/rota-velha",
      }),
      ocorrencia({
        criado_em: "2026-09-10T08:00:00+00:00",
        mensagem: "versão nova da mensagem",
        rota: "/rota-nova",
      }),
    ]);

    expect(grupos[0].mensagem).toBe("versão nova da mensagem");
    expect(grupos[0].rota).toBe("/rota-nova");
  });

  it("ordena por última ocorrência, com os ABERTOS na frente", () => {
    const grupos = agruparErros([
      // Aberto, porém mais velho.
      ocorrencia({
        hash_agrupamento: HASH_A,
        criado_em: "2026-09-01T08:00:00+00:00",
        resolvido_em: null,
      }),
      // Resolvido, porém recentíssimo.
      ocorrencia({
        hash_agrupamento: HASH_B,
        criado_em: "2026-09-10T23:00:00+00:00",
        resolvido_em: "2026-09-10T23:30:00+00:00",
      }),
    ]);

    expect(grupos.map((g) => g.hash)).toEqual([HASH_A, HASH_B]);
    expect(grupos[0].resolvido).toBe(false);
    expect(grupos[1].resolvido).toBe(true);
  });

  it("entre abertos, o mais recente vem primeiro", () => {
    const grupos = agruparErros([
      ocorrencia({ hash_agrupamento: HASH_A, criado_em: "2026-09-01T08:00:00+00:00" }),
      ocorrencia({ hash_agrupamento: HASH_B, criado_em: "2026-09-10T08:00:00+00:00" }),
    ]);
    expect(grupos.map((g) => g.hash)).toEqual([HASH_B, HASH_A]);
  });

  it("um grupo com uma ocorrência aberta e várias resolvidas continua ABERTO", () => {
    // É o caso que dá sentido à tela: alguém resolveu, o defeito voltou, e a
    // linha nova nasce com `resolvido_em` nulo. Tratar o grupo como resolvido
    // aqui esconderia justamente a reincidência.
    const grupos = agruparErros([
      ocorrencia({ criado_em: "2026-09-09T08:00:00+00:00", resolvido_em: "2026-09-09T09:00:00+00:00" }),
      ocorrencia({ criado_em: "2026-09-09T08:10:00+00:00", resolvido_em: "2026-09-09T09:00:00+00:00" }),
      ocorrencia({ criado_em: "2026-09-11T08:00:00+00:00", resolvido_em: null }),
    ]);

    expect(grupos[0].abertas).toBe(1);
    expect(grupos[0].resolvidas).toBe(2);
    expect(grupos[0].resolvido).toBe(false);
  });

  it("coleta os digests distintos — é o que separa defeito de defeito", () => {
    // A ressalva conhecida: o dedupe do navegador colapsa TODO erro de servidor
    // visto pelo navegador numa chave só (a mensagem do React em produção é
    // fixa). Sem esta lista, a tela não teria como avisar que o grupo é uma
    // mistura.
    const grupos = agruparErros([
      ocorrencia({ assunto: "navegador:boundary", digest: "aaa111" }),
      ocorrencia({ assunto: "navegador:boundary", digest: "bbb222" }),
      ocorrencia({ assunto: "navegador:boundary", digest: "aaa111" }),
      ocorrencia({ assunto: "navegador:boundary", digest: null }),
    ]);

    expect(grupos[0].digests).toEqual(["aaa111", "bbb222"]);
  });

  it("registra as naturezas — `ambos` é o que já foi ao WhatsApp", () => {
    const grupos = agruparErros([
      ocorrencia({ natureza: "quebra" }),
      ocorrencia({ natureza: "ambos" }),
    ]);
    expect(grupos[0].naturezas).toEqual(["quebra", "ambos"]);
  });

  it("lista vazia não vira grupo fantasma", () => {
    expect(agruparErros([])).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────
   2. A projeção — o `stack` não sobe na lista
   ──────────────────────────────────────────────────────────────────────── */

describe("a lista não carrega o stack", () => {
  it("a projeção da lista não tem a coluna", () => {
    expect(CAMPOS_DA_LISTA).not.toContain("stack");
    expect(SELECT_DA_LISTA.split(",")).not.toContain("stack");
  });

  it("o detalhe TEM, senão não há o que ler para corrigir", () => {
    expect(CAMPOS_DO_DETALHE).toContain("stack");
    expect(SELECT_DO_DETALHE.split(",")).toContain("stack");
  });

  it("a consulta que vai ao PostgREST também não pede stack", async () => {
    // A prova pelo EFEITO, e não pela fonte: o que interessa é a string que
    // chega ao servidor. Uma refatoração que montasse o select em outro lugar
    // continuaria coberta.
    const { cliente, consultas } = clienteFalso([{ data: [ocorrencia()], count: 1 }]);
    await lerFilaDeErros(cliente, {
      origem: "",
      ambiente: "",
      estado: "todos",
      janela: JANELA_PADRAO,
    });

    const select = acharPasso(consultas[0], "select")[0];
    expect(consultas[0].tabela).toBe("erros");
    expect(String(select.args[0])).not.toMatch(/stack/);
    expect(String(select.args[0])).toMatch(/mensagem/);
  });

  it("lê uma janela limitada e conta o resto — lista cortada sem aviso mente", async () => {
    const { cliente, consultas } = clienteFalso([{ data: [ocorrencia()], count: 4210 }]);
    const r = await lerFilaDeErros(cliente, {
      origem: "",
      ambiente: "",
      estado: "todos",
      janela: 200,
    });

    expect(acharPasso(consultas[0], "range")[0].args).toEqual([0, 199]);
    expect(acharPasso(consultas[0], "order")[0].args[0]).toBe("criado_em");
    expect(acharPasso(consultas[0], "select")[0].args[1]).toMatchObject({ count: "exact" });
    expect(r.ok && r.totalNoRecorte).toBe(4210);
    expect(r.ok && r.lidas).toBe(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────
   3. Os filtros chegam ao banco
   ──────────────────────────────────────────────────────────────────────── */

describe("o recorte vira filtro de consulta", () => {
  it("abertos = `resolvido_em is null`, e não um filtro do lado de cá", async () => {
    // Filtrar em memória sobre a janela leria 200 linhas para mostrar 3 — e o
    // índice parcial `where resolvido_em is null` existe exatamente para isto.
    const { cliente, consultas } = clienteFalso([{ data: [], count: 0 }, { count: 12 }]);
    await lerFilaDeErros(cliente, {
      origem: "navegador",
      ambiente: "preview",
      estado: "abertos",
      janela: JANELA_PADRAO,
      digest: "abc12345",
    });

    const eqs = acharPasso(consultas[0], "eq").map((p) => p.args);
    expect(eqs).toContainEqual(["origem", "navegador"]);
    expect(eqs).toContainEqual(["ambiente", "preview"]);
    expect(eqs).toContainEqual(["digest", "abc12345"]);
    expect(acharPasso(consultas[0], "is")[0].args).toEqual(["resolvido_em", null]);
  });

  it('"todos" não manda filtro de resolvido', async () => {
    const { cliente, consultas } = clienteFalso([{ data: [ocorrencia()], count: 1 }]);
    await lerFilaDeErros(cliente, {
      origem: "",
      ambiente: "",
      estado: "todos",
      janela: JANELA_PADRAO,
    });
    expect(acharPasso(consultas[0], "is")).toHaveLength(0);
    expect(acharPasso(consultas[0], "eq")).toHaveLength(0);
  });

  it("só pergunta o total sem recorte quando não há o que mostrar", async () => {
    // A segunda consulta existe para escolher o TEXTO do vazio. Fazê-la sempre
    // seria uma ida ao banco por abertura de tela, para nada.
    const comGrupo = clienteFalso([{ data: [ocorrencia()], count: 1 }]);
    await lerFilaDeErros(comGrupo.cliente, {
      origem: "",
      ambiente: "",
      estado: "todos",
      janela: JANELA_PADRAO,
    });
    expect(comGrupo.consultas).toHaveLength(1);

    const semGrupo = clienteFalso([{ data: [], count: 0 }, { count: 7 }]);
    const r = await lerFilaDeErros(semGrupo.cliente, {
      origem: "",
      ambiente: "production",
      estado: "abertos",
      janela: JANELA_PADRAO,
    });
    expect(semGrupo.consultas).toHaveLength(2);
    // A contagem não traz linha: `head: true` responde só o `Content-Range`.
    expect(acharPasso(semGrupo.consultas[1], "select")[0].args[1]).toMatchObject({
      head: true,
      count: "exact",
    });
    expect(r.ok && r.totalSemRecorte).toBe(7);
  });

  it("tabela ausente vira instrução, não mensagem crua do PostgREST", async () => {
    const { cliente } = clienteFalso([
      { error: { message: 'Could not find the table "public.erros"', code: "PGRST205" } },
    ]);
    const r = await lerFilaDeErros(cliente, {
      origem: "",
      ambiente: "",
      estado: "todos",
      janela: JANELA_PADRAO,
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/migração/i);
    expect(!r.ok && r.motivo).toMatch(/erros_do_site/);
  });
});

/* ────────────────────────────────────────────────────────────────────────
   4. A escrita — duas colunas, e só
   ──────────────────────────────────────────────────────────────────────── */

describe("resolver grava apenas resolvido_em e resolvido_por", () => {
  const UID = "11111111-2222-3333-4444-555555555555";

  it("a carga tem exatamente as duas colunas do grant", () => {
    const marcar = cargaDeResolucao(true, UID, new Date("2026-09-11T12:00:00Z"));
    expect(Object.keys(marcar).sort()).toEqual(["resolvido_em", "resolvido_por"]);
    expect(marcar.resolvido_em).toBe("2026-09-11T12:00:00.000Z");
    expect(marcar.resolvido_por).toBe(UID);

    const reabrir = cargaDeResolucao(false, UID);
    expect(Object.keys(reabrir).sort()).toEqual(["resolvido_em", "resolvido_por"]);
    expect(reabrir.resolvido_em).toBeNull();
    expect(reabrir.resolvido_por).toBeNull();
  });

  it("o UPDATE que chega ao banco não encosta em mais nenhuma coluna", async () => {
    // `mensagem`, `stack` e `assunto` são a PROVA do defeito. O grant por
    // coluna recusaria o lote inteiro; esta trava evita descobrir isso em
    // produção, num 42501 durante a triagem.
    const { cliente, consultas } = clienteFalso([{ count: 3 }]);
    const r = await resolverGrupoDeErros(cliente, { hash: HASH_A, resolver: true, uid: UID });

    const update = acharPasso(consultas[0], "update")[0];
    const carga = update.args[0] as Record<string, unknown>;
    expect(Object.keys(carga).sort()).toEqual(["resolvido_em", "resolvido_por"]);
    expect(carga.resolvido_por).toBe(UID);
    expect(update.args[1]).toMatchObject({ count: "exact" });
    expect(r).toEqual({ ok: true, linhas: 3 });
  });

  it("resolve o GRUPO inteiro, e só o que ainda está aberto", async () => {
    const { cliente, consultas } = clienteFalso([{ count: 5 }]);
    await resolverGrupoDeErros(cliente, { hash: HASH_A, resolver: true, uid: UID });

    expect(acharPasso(consultas[0], "eq")[0].args).toEqual(["hash_agrupamento", HASH_A]);
    // Sem este `is`, reaplicar "resolver" reescreveria a hora e o autor de quem
    // fechou antes — apagando quem triou de verdade.
    expect(acharPasso(consultas[0], "is")[0].args).toEqual(["resolvido_em", null]);
  });

  it("reabrir mexe só no que estava resolvido", async () => {
    const { cliente, consultas } = clienteFalso([{ count: 2 }]);
    await resolverGrupoDeErros(cliente, { hash: HASH_A, resolver: false, uid: UID });

    expect(acharPasso(consultas[0], "not")[0].args).toEqual(["resolvido_em", "is", null]);
    expect(acharPasso(consultas[0], "is")).toHaveLength(0);
  });

  it("hash fora da forma do CHECK nem chega ao banco", async () => {
    const { cliente, consultas } = clienteFalso([{ count: 99 }]);
    const r = await resolverGrupoDeErros(cliente, {
      hash: "'; drop table erros; --",
      resolver: true,
      uid: UID,
    });
    expect(r.ok).toBe(false);
    expect(consultas).toHaveLength(0);
  });

  it("zero linha alterada é devolvido como zero — a RLS recusa CALADA", async () => {
    // RLS que bloqueia não levanta erro: devolve 200, `error` nulo e nenhuma
    // linha. Sem o `count`, a tela diria "resolvido" sobre um banco intocado.
    const { cliente } = clienteFalso([{ count: 0 }]);
    const r = await resolverGrupoDeErros(cliente, { hash: HASH_A, resolver: true, uid: UID });
    expect(r).toEqual({ ok: true, linhas: 0 });
  });
});

describe("ehHashDeAgrupamento repete a forma do CHECK do banco", () => {
  it("aceita hex de 8 a 64", () => {
    expect(ehHashDeAgrupamento("0badc0de")).toBe(true);
    expect(ehHashDeAgrupamento("a".repeat(64))).toBe(true);
  });
  it("recusa o que o banco recusaria", () => {
    expect(ehHashDeAgrupamento("NAOHEX00")).toBe(false);
    expect(ehHashDeAgrupamento("abc")).toBe(false);
    expect(ehHashDeAgrupamento("a".repeat(65))).toBe(false);
    expect(ehHashDeAgrupamento("undefined")).toBe(false);
    expect(ehHashDeAgrupamento(null)).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────
   5. O recorte que vem da URL
   ──────────────────────────────────────────────────────────────────────── */

describe("filtrosDaBusca", () => {
  it("abre em abertos + produção, que é a pergunta de quem chega", () => {
    const f = filtrosDaBusca({});
    expect(f.estado).toBe("abertos");
    expect(f.ambiente).toBe("production");
    expect(f.origem).toBe("");
    expect(f.janela).toBe(JANELA_PADRAO);
  });

  it("vocabulário fechado: o que não é da lista não vira filtro", () => {
    const f = filtrosDaBusca({ origem: "n8n", janela: "999999", digest: "zzz" });
    expect(f.origem).toBe("");
    expect(f.janela).toBe(JANELA_PADRAO);
    expect(f.digest).toBeUndefined();
  });

  it('"todos" no ambiente é o jeito de dizer sem recorte', () => {
    expect(filtrosDaBusca({ ambiente: "todos" }).ambiente).toBe("");
    expect(filtrosDaBusca({ estado: "todos" }).estado).toBe("todos");
  });
});

/* ────────────────────────────────────────────────────────────────────────
   6. O vazio honesto
   ──────────────────────────────────────────────────────────────────────── */

describe("explicarVazio distingue silêncio de ausência", () => {
  it("coleta desligada é dito com todas as letras, e não como 'nenhum erro'", () => {
    const v = explicarVazio({ coletaLigada: false, comRecorte: true, totalSemRecorte: 0 });
    expect(v.titulo).toMatch(/desligada/i);
    expect(v.titulo).not.toMatch(/nenhum erro/i);
    expect(v.detalhe).toMatch(/OBSERVABILIDADE/);
    expect(v.alerta).toBe(true);
  });

  it("vazio por causa do filtro diz quantos existem fora dele", () => {
    const v = explicarVazio({ coletaLigada: true, comRecorte: true, totalSemRecorte: 12 });
    expect(v.titulo).toMatch(/recorte/i);
    expect(v.detalhe).toMatch(/12/);
  });

  it("tabela realmente vazia QUALIFICA a afirmação", () => {
    // Esta é a linha que o enunciado exige: afirmar "nenhum erro" sem ressalva
    // seria dizer que o site está inteiro quando o que se sabe é que a tabela
    // está vazia. As duas causas possíveis ficam escritas.
    const v = explicarVazio({ coletaLigada: true, comRecorte: false, totalSemRecorte: 0 });
    expect(v.titulo).toMatch(/nenhum erro/i);
    expect(v.detalhe).toMatch(/gravador/i);
    expect(v.detalhe).toMatch(/90 dias|retenção/i);
  });
});

describe("coletaDeErrosLigada lê o mesmo interruptor do gravador", () => {
  it("só o literal 1 liga", () => {
    const antes = process.env.OBSERVABILIDADE;
    try {
      process.env.OBSERVABILIDADE = "1";
      expect(coletaDeErrosLigada()).toBe(true);
      process.env.OBSERVABILIDADE = "true";
      expect(coletaDeErrosLigada()).toBe(false);
      delete process.env.OBSERVABILIDADE;
      expect(coletaDeErrosLigada()).toBe(false);
    } finally {
      if (antes === undefined) delete process.env.OBSERVABILIDADE;
      else process.env.OBSERVABILIDADE = antes;
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────
   7. A régua de quem vê — uma só, para o trilho e para a página
   ──────────────────────────────────────────────────────────────────────── */

describe("quem tria", () => {
  it("Admin tria; os outros papéis de painel, não", () => {
    expect(podeTriarErros({ papeis: ["admin"] })).toBe(true);
    expect(podeTriarErros({ papeis: ["comercial", "marketing"] })).toBe(false);
    expect(podeTriarErros({ papeis: ["gestor"] })).toBe(false);
    expect(podeTriarErros({ papeis: ["financeiro"] })).toBe(false);
  });

  it("multi-papel soma: quem também é admin entra", () => {
    expect(podeTriarErros({ papeis: ["comercial", "admin"] })).toBe(true);
  });

  it("cliente e investidor não são equipe", () => {
    expect(podeTriarErros({ papeis: ["cliente"] })).toBe(false);
    expect(podeTriarErros({ papeis: ["investidor"] })).toBe(false);
    expect(podeTriarErros(null)).toBe(false);
  });

  it("o trilho e a porta leem a MESMA constante", () => {
    // Duas cópias da lista divergiriam no primeiro ajuste — e o sintoma seria o
    // pior: item no menu levando a um redirecionamento, ou tela alcançável sem
    // item nenhum.
    const trilho = lerCodigo("src/components/admin/SidebarNav.tsx");
    expect(trilho).toContain("PERFIS_QUE_TRIAM_ERROS");
    expect(trilho).toContain('href: "/admin/erros"');
    // A lista não está escrita à mão em lugar nenhum do trilho.
    expect(trilho).not.toMatch(/name: "Erros do site",\s*href: "\/admin\/erros",\s*roles: \["admin"\]/);

    const porta = lerCodigo("src/lib/filaDeErros-servidor.ts");
    expect(porta).toContain("podeTriarErros");
    expect(PERFIS_QUE_TRIAM_ERROS).toEqual(["admin"]);
  });
});

/* ────────────────────────────────────────────────────────────────────────
   8. A chave de serviço não entra nesta tela
   ──────────────────────────────────────────────────────────────────────── */

const ARQUIVOS_DA_TELA = [
  "src/lib/filaDeErros.ts",
  "src/lib/filaDeErros-servidor.ts",
  "src/components/admin/FilaDeErros.tsx",
  "src/components/admin/DetalheDoGrupoDeErros.tsx",
  "src/components/admin/FiltrosDaFilaDeErros.tsx",
  "src/components/admin/BotaoDeResolverErro.tsx",
  "src/app/admin/erros/page.tsx",
  "src/app/admin/erros/[hash]/page.tsx",
  "src/app/admin/erros/loading.tsx",
  "src/app/api/erros/[hash]/resolver/route.ts",
];

describe("a RLS é a régua", () => {
  it("nenhum arquivo da tela toca na chave de serviço", () => {
    for (const arquivo of ARQUIVOS_DA_TELA) {
      // `lerCodigo` descarta comentário: a NOTA que explica por que a chave de
      // serviço ficou de fora cita o nome dela, e sem o descarte a explicação
      // seria acusada de ser a infração.
      const codigo = lerCodigo(arquivo);
      expect(codigo, `${arquivo} usa a chave de serviço`).not.toContain(
        "createAdminSupabaseClient",
      );
      expect(codigo, `${arquivo} lê a chave de serviço`).not.toContain(
        "SUPABASE_SERVICE_ROLE_KEY",
      );
    }
  });

  it("a leitura usa o cliente de sessão", () => {
    expect(lerCodigo("src/lib/filaDeErros-servidor.ts")).toContain(
      "createServerSupabaseClient",
    );
  });

  it("o módulo puro não arrasta o servidor para o navegador", () => {
    // `SidebarNav` é client component e importa `PERFIS_QUE_TRIAM_ERROS`. Se a
    // constante voltasse a morar ao lado de `createServerSupabaseClient`, o
    // import levaria `next/headers` para o pacote do navegador.
    const puro = lerCodigo("src/lib/filaDeErros.ts");
    expect(puro).not.toContain("supabase-server");
    expect(puro).not.toContain("next/headers");
  });
});

/* ────────────────────────────────────────────────────────────────────────
   9. A tela renderizada — a fiação entre o cálculo e o que se lê
   ──────────────────────────────────────────────────────────────────────── */

const REDIRECIONADO: string[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/erros",
  // `redirect` do Next interrompe o render lançando. O dublê lança também: sem
  // isso, o código depois do `redirect` continuaria rodando no teste e não em
  // produção — e a prova sairia do lugar errado.
  redirect: (destino: string) => {
    REDIRECIONADO.push(destino);
    throw new Error(`REDIRECT:${destino}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const FILTROS: FiltrosDaFila = {
  origem: "",
  ambiente: "production",
  estado: "abertos",
  janela: JANELA_PADRAO,
};

/**
 * Só o TEXTO da página, sem as tags.
 *
 * Não é preciosismo. `expect(html).toContain("11")` passa verde com o número
 * errado na tela, porque `text-[11px]` está no `class` de meia dúzia de
 * elementos — medido: a mutação que trocava a soma do grupo pela contagem de
 * linhas passou despercebida por causa disso. Asserção sobre número renderizado
 * tem de olhar o texto, nunca a marcação.
 */
function soTexto(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ");
}

async function renderizarFila(args: {
  grupos: ReturnType<typeof agruparErros>;
  coletaLigada: boolean;
  totalSemRecorte?: number | null;
  totalNoRecorte?: number | null;
}) {
  const { default: FilaDeErros } = await import("../src/components/admin/FilaDeErros");
  return renderToStaticMarkup(
    createElement(FilaDeErros, {
      filtros: FILTROS,
      coletaLigada: args.coletaLigada,
      resultado: {
        ok: true,
        grupos: args.grupos,
        lidas: args.grupos.reduce((s, g) => s + g.ocorrencias, 0),
        totalNoRecorte: args.totalNoRecorte ?? 0,
        totalSemRecorte: args.totalSemRecorte ?? null,
        ambientesVistos: ["production"],
      },
    }),
  );
}

describe("a fila desenhada", () => {
  it("com a coleta desligada, a tela diz isso — e não 'nenhum erro'", async () => {
    const texto = soTexto(
      await renderizarFila({ grupos: [], coletaLigada: false, totalSemRecorte: 0 }),
    );
    expect(texto).toMatch(/coleta está desligada/i);
    expect(texto).toMatch(/OBSERVABILIDADE/);
    expect(texto).toMatch(/DESLIGADA/);
    // Nem uma variante: com a coleta desligada, a tela não tem como afirmar
    // nada sobre a saúde do site.
    expect(texto).not.toMatch(/nenhum erro/i);
  });

  it("com a coleta ligada e a tabela vazia, a afirmação vem qualificada", async () => {
    const texto = soTexto(
      await renderizarFila({ grupos: [], coletaLigada: true, totalSemRecorte: 0 }),
    );
    expect(texto).toMatch(/Nenhum erro registrado/i);
    expect(texto).toMatch(/gravador não está chegando ao banco/i);
  });

  it("o número da linha é a SOMA do grupo, não a contagem de linhas", async () => {
    // A fiação entre `agruparErros` e o que se lê. Mutar a soma no lib tem de
    // aparecer aqui, senão a trava do cálculo protege um número que a tela não
    // mostra.
    const grupos = agruparErros([
      ocorrencia({ suprimidas: 9, criado_em: "2026-09-10T10:00:00+00:00" }),
      ocorrencia({ suprimidas: 0, criado_em: "2026-09-10T11:00:00+00:00" }),
    ]);
    expect(grupos[0].vezes).toBe(11);

    const texto = soTexto(await renderizarFila({ grupos, coletaLigada: true, totalNoRecorte: 2 }));
    expect(texto).toMatch(/\b11 vezes\b/);
    expect(texto).toMatch(/9 suprimidas/);
    expect(texto).toContain("servidor:render");
    expect(texto).toContain("/carros/[categoria]/[marca]");
  });

  it("avisa quando o grupo tem digests diferentes dentro", async () => {
    const grupos = agruparErros([
      ocorrencia({ assunto: "navegador:boundary", digest: "aaa111", origem: "navegador" }),
      ocorrencia({ assunto: "navegador:boundary", digest: "bbb222", origem: "navegador" }),
    ]);
    const texto = soTexto(await renderizarFila({ grupos, coletaLigada: true, totalNoRecorte: 2 }));
    expect(texto).toMatch(/2 digests/);
  });

  it("o rodapé declara o alcance da leitura", async () => {
    const grupos = agruparErros([ocorrencia()]);
    const texto = soTexto(
      await renderizarFila({ grupos, coletaLigada: true, totalNoRecorte: 900 }),
    );
    expect(texto).toMatch(/Agrupado sobre as/);
    expect(texto).toMatch(/de 900 no recorte/);
    expect(texto).toMatch(/não aparece/);
  });
});

describe("o detalhe desenhado", () => {
  function ocorrenciaDetalhada(
    parcial: Partial<OcorrenciaDoDetalhe> = {},
  ): OcorrenciaDoDetalhe {
    return {
      ...ocorrencia(),
      stack: "Error: quebrou\n    at Vitrine (src/app/estoque/page.tsx:12:7)",
      metodo: "GET",
      url: "https://motorsstore.com.br/estoque",
      navegador: "Mozilla/5.0 (iPhone)",
      release: "9f1c2ab",
      ag_uid: "ag-123",
      resolvido_por: null,
      digest: "2f8c11aa",
      ...parcial,
    };
  }

  async function renderizarDetalhe(ocorrencias: OcorrenciaDoDetalhe[], abertas: number) {
    const { default: Detalhe } = await import(
      "../src/components/admin/DetalheDoGrupoDeErros"
    );
    return renderToStaticMarkup(
      createElement(Detalhe, {
        hash: HASH_A,
        voltarPara: "/admin/erros",
        resultado: {
          ok: true,
          ocorrencias,
          total: ocorrencias.length,
          pagina: 1,
          abertas,
          digestsNaPagina: [
            ...new Set(ocorrencias.map((o) => o.digest).filter(Boolean)),
          ] as string[],
        },
      }),
    );
  }

  it("mostra o stack, o release e o digest — o que se precisa para corrigir", async () => {
    const texto = soTexto(await renderizarDetalhe([ocorrenciaDetalhada()], 1));
    expect(texto).toMatch(/at Vitrine/);
    expect(texto).toMatch(/Release \(SHA do deploy\) 9f1c2ab/);
    expect(texto).toMatch(/Digest 2f8c11aa/);
    expect(texto).toMatch(/Identificador de navegação ag-123/);
    expect(texto).toMatch(/URL https:\/\/motorsstore\.com\.br\/estoque/);
  });

  it("quando há digests diferentes, o detalhe avisa que são defeitos diferentes", async () => {
    const html = await renderizarDetalhe(
      [ocorrenciaDetalhada({ digest: "aaa111" }), ocorrenciaDetalhada({ digest: "bbb222" })],
      2,
    );
    expect(soTexto(html)).toMatch(/defeitos diferentes/i);
    // O recorte é clicável: é assim que se separa um defeito do outro.
    expect(html).toMatch(/href="\/admin\/erros\/0badc0de\?digest=aaa111"/);
  });

  it("o botão oferece REABRIR quando o grupo inteiro está fechado", async () => {
    // `abertas` vem de contagem do grupo inteiro, não desta página: um grupo
    // com 300 resolvidas e uma aberta lá na página 15 não pode parecer
    // resolvido aqui.
    const fechado = soTexto(
      await renderizarDetalhe(
        [ocorrenciaDetalhada({ resolvido_em: "2026-09-11T10:00:00+00:00" })],
        0,
      ),
    );
    expect(fechado).toMatch(/Reabrir/);
    expect(fechado).not.toMatch(/Marcar resolvido/);

    const aberto = soTexto(await renderizarDetalhe([ocorrenciaDetalhada()], 1));
    expect(aberto).toMatch(/Marcar resolvido/);
    expect(aberto).not.toMatch(/Reabrir/);
  });

  it("campo vazio vira travessão em vez de sumir", async () => {
    // Campo em branco some da página e vira "ninguém pensou em mostrar isso".
    // O travessão diz "não veio", que é informação.
    const texto = soTexto(
      await renderizarDetalhe([ocorrenciaDetalhada({ release: null, ag_uid: null })], 1),
    );
    expect(texto).toMatch(/Release \(SHA do deploy\) —/);
    expect(texto).toMatch(/Identificador de navegação —/);
  });
});

describe("as constantes de paginação são as que a tela usa", () => {
  it("o detalhe pagina de 20 em 20 — cada linha pode ter 8 KB de stack", () => {
    expect(POR_PAGINA_NO_DETALHE).toBe(20);
    expect(JANELA_PADRAO).toBe(200);
  });
});

/* ────────────────────────────────────────────────────────────────────────
   10. A página — a porta e o cliente de sessão, provados pelo efeito
   ──────────────────────────────────────────────────────────────────────── */

/**
 * O estado do dublê de sessão. `PAPEIS = null` é "ninguém logado".
 *
 * Este bloco existe porque as duas garantias mais caras da tela não aparecem em
 * função pura: que quem não tria é mandado embora ANTES de qualquer leitura, e
 * que a consulta sai pelo cliente de SESSÃO — o que a RLS exige. Trava de fonte
 * veria o nome `createServerSupabaseClient` no arquivo; isto vê a consulta.
 */
let PAPEIS_DA_SESSAO: string[] | null = ["admin"];
const CONSULTAS_DA_SESSAO: ConsultaGravada[] = [];

vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: PAPEIS_DA_SESSAO === null ? null : { id: "u-1", email: "d@m.br" } },
      }),
    },
    from(tabela: string) {
      const registro: ConsultaGravada = { tabela, passos: [] };
      CONSULTAS_DA_SESSAO.push(registro);
      const builder: Record<string, unknown> = {
        then(aoResolver: (v: unknown) => unknown) {
          return Promise.resolve({ data: [], error: null, count: 0 }).then(aoResolver);
        },
        single: async () => ({
          data: { role: PAPEIS_DA_SESSAO?.[0] ?? null, papeis: PAPEIS_DA_SESSAO },
          error: null,
        }),
      };
      for (const metodo of ["select", "eq", "is", "not", "order", "range", "update", "limit"]) {
        builder[metodo] = (...args: unknown[]) => {
          registro.passos.push({ metodo, args });
          return builder;
        };
      }
      return builder;
    },
  }),
}));

describe("a página /admin/erros", () => {
  async function abrir() {
    CONSULTAS_DA_SESSAO.length = 0;
    REDIRECIONADO.length = 0;
    const { default: Pagina } = await import("../src/app/admin/erros/page");
    return Pagina({ searchParams: Promise.resolve({}) });
  }

  it("sem sessão, manda para o login e não lê nada", async () => {
    PAPEIS_DA_SESSAO = null;
    await expect(abrir()).rejects.toThrow(/REDIRECT/);
    expect(REDIRECIONADO).toEqual(["/login"]);
    expect(CONSULTAS_DA_SESSAO.filter((c) => c.tabela === "erros")).toHaveLength(0);
  });

  it("staff que não tria volta ao painel — o trilho e a página concordam", async () => {
    PAPEIS_DA_SESSAO = ["comercial"];
    await expect(abrir()).rejects.toThrow(/REDIRECT/);
    expect(REDIRECIONADO).toEqual(["/admin"]);
    expect(CONSULTAS_DA_SESSAO.filter((c) => c.tabela === "erros")).toHaveLength(0);
  });

  it("para quem tria, a consulta sai pelo cliente de SESSÃO e sem stack", async () => {
    PAPEIS_DA_SESSAO = ["admin"];
    const elemento = await abrir();
    const html = renderToStaticMarkup(elemento);

    const daTabela = CONSULTAS_DA_SESSAO.filter((c) => c.tabela === "erros");
    expect(daTabela.length).toBeGreaterThan(0);
    expect(String(acharPasso(daTabela[0], "select")[0].args[0])).not.toMatch(/stack/);
    expect(soTexto(html)).toMatch(/Erros do site/);
  });
});
