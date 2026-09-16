import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CAMPO_DO_ESTADO,
  ESTADOS_DO_CADASTRO,
  acoesDoEstado,
  ehEstadoDoCadastro,
  normalizarEstadoCadastro,
  recusasParaPublicar,
  textoDaRecusaDePublicacao,
} from "../src/lib/estadoDoCadastro";
import {
  CAMPOS_NOSSOS,
  aplicarNosVeiculos,
  camposGravaveis,
  extrairCamposNossos,
} from "../src/lib/estoqueEscrita";
import {
  ACAO_DO_CAMPO_DE_VEICULO,
  PERFIS,
  campoNegadoAoPerfil,
  podeFazer,
} from "../src/lib/permissoes";
import { MINIMO_DE_FOTOS } from "../src/lib/coerenciaDoCadastro";
import {
  CAMPOS_QUE_A_ROTA_NUNCA_ESCREVE,
  montarLinhaDoCadastro,
  normalizarCadastro,
} from "../src/lib/cadastroDeVeiculo";

/**
 * Rascunho → publicado: a virada de dono do dado (F0-q, 2026-08-30).
 *
 * Decisão do dono: *"para o sync cron, deixa apenas a opção de importação com
 * acionamento manual, sem override, criamos rascunhos dos carros para serem
 * finalizados antes de serem publicados"*. O RevendaMais importa; quem decide o
 * que está no ar é a loja.
 *
 * ---------------------------------------------------------------------------
 * As cinco travas
 * ---------------------------------------------------------------------------
 * 1. Carro novo nasce rascunho — importado OU cadastrado no painel.
 * 2. Rascunho não aparece no site.
 * 3. Publicar exige a linha "Publicar ou despublicar veículo" da A17.
 * 4. Publicar um carro bloqueado por foto é impedido, com o motivo escrito.
 * 5. Arquivado não volta sozinho.
 *
 * Cada uma tem um jeito diferente de quebrar em silêncio, e é por isso que elas
 * são testadas em camadas diferentes: a 1 e a 2 vivem no banco e no filtro do
 * site (aqui checados pelo texto que os implementa, porque não há banco na
 * suíte); a 3 e a 4 são código nosso e rodam de verdade.
 */

const RAIZ = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf-8");

/** Comentário pode citar o campo pelo nome; o código, não. */
const semComentarios = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*(--|\/\/).*$/gm, "");

const migracao = ler(
  "supabase",
  "migrations",
  "20260830120000_f0q_estado_do_cadastro_e_fim_do_override.sql",
);
const supabaseLib = ler("src", "lib", "supabase.ts");
const tabelaA6 = ler("src", "components", "admin", "TabelaDeEstoque.tsx");
const paginaA6 = ler("src", "app", "admin", "estoque", "page.tsx");
const editorA15 = ler("src", "components", "admin", "EditorDeVeiculo.tsx");

const comFotos = (n: number) => Array.from({ length: n }, (_, i) => `https://s3/foto-${i}.jpg`);

const AUTOR = { id: "u-1", nome: "Quem publicou" };

/**
 * Um Supabase de mentira, com o mínimo que `aplicarNosVeiculos` usa.
 *
 * Existe para que a trava 4 seja EXECUTADA e não apenas lida no arquivo. A
 * revisão do cadastro nativo já mostrou o preço de testar gate por texto:
 * desarmar a função passava por todos os testes.
 */
function bancoFalso(
  linhas: Array<Record<string, unknown>>,
  opts: { erroNaLeitura?: { message: string } } = {},
) {
  const gravou: Array<{ patch: Record<string, unknown>; ids: unknown[] }> = [];
  const historico: Array<Record<string, unknown>> = [];

  const supabase = {
    from(tabela: string) {
      if (tabela === "historico_veiculo") {
        return {
          insert: async (linhasNovas: Array<Record<string, unknown>>) => {
            historico.push(...linhasNovas);
            return { error: null };
          },
        };
      }
      return {
        select: (_colunas: string) => ({
          in: async (_coluna: string, ids: Array<string | number>) =>
            opts.erroNaLeitura
              ? { data: null, error: opts.erroNaLeitura }
              : {
                  data: linhas.filter((l) => ids.map(String).includes(String(l.id))),
                  error: null,
                },
        }),
        update: (patch: Record<string, unknown>) => ({
          in: async (_coluna: string, ids: Array<string | number>) => {
            gravou.push({ patch, ids });
            return { error: null };
          },
        }),
      };
    },
  };

  return { supabase, gravou, historico };
}

// ---------------------------------------------------------------------------
// 0. O vocabulário do código é o do banco
// ---------------------------------------------------------------------------

describe("o vocabulário do estado bate com o CHECK do banco", () => {
  it("os três valores são os do SQL, e nada além", () => {
    // Um quarto valor em código que o CHECK recusa vira 500 na cara do
    // operador; um valor a menos esconde estado que existe no banco.
    const check = migracao.match(/estado_cadastro in \(([^)]+)\)/);
    expect(check, "o CHECK sumiu da migração").toBeTruthy();
    const doBanco = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(doBanco).toEqual([...ESTADOS_DO_CADASTRO].sort());
  });

  it("o piso é rascunho — nunca publicado por falta de dado", () => {
    expect(normalizarEstadoCadastro(undefined)).toBe("rascunho");
    expect(normalizarEstadoCadastro(null)).toBe("rascunho");
    expect(normalizarEstadoCadastro("")).toBe("rascunho");
    expect(normalizarEstadoCadastro("no_ar")).toBe("rascunho");
    expect(normalizarEstadoCadastro("publicado")).toBe("publicado");
    expect(ehEstadoDoCadastro("arquivado")).toBe(true);
    expect(ehEstadoDoCadastro("no_ar")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 1. Carro novo nasce rascunho
// ---------------------------------------------------------------------------

describe("trava 1 · todo carro novo nasce rascunho", () => {
  it("o default da coluna é rascunho", () => {
    expect(semComentarios(migracao)).toMatch(
      /add column if not exists estado_cadastro text not null default 'rascunho'/,
    );
  });

  it("o trigger de INSERT força rascunho, venha de onde vier", () => {
    // A linha que faz a importação NÃO poder publicar sozinha. Sem ela, bastaria
    // o payload do n8n trazer `estado_cadastro` para o robô voltar a mandar no
    // que está no ar — o oposto exato da decisão de 30/08.
    const marcarOrigem = migracao.slice(migracao.indexOf("estoque_motors_marcar_origem"));
    expect(semComentarios(marcarOrigem)).toMatch(/new\.estado_cadastro := 'rascunho';/);
    // Fora de qualquer `if`: vale para o id do feed e para o do painel.
    expect(marcarOrigem).toMatch(/end if;[\s\S]*new\.estado_cadastro := 'rascunho';/);
  });

  it("a rota de cadastro nunca manda o estado ao banco", () => {
    // Cinto e suspensório: o trigger já sobrescreveria. Esta lista é o que
    // impede que um grupo novo de campos do formulário reabra a porta.
    expect(CAMPOS_QUE_A_ROTA_NUNCA_ESCREVE).toContain(CAMPO_DO_ESTADO);

    const injetado = montarLinhaDoCadastro(
      { marca: "Fiat", modelo: "Argo" },
      { estado_cadastro: "publicado" },
    );
    expect(injetado).not.toHaveProperty(CAMPO_DO_ESTADO);

    const doFormulario = normalizarCadastro({
      marca: "VW",
      modelo: "Nivus",
      ano: 2023,
      preco: 118900,
      quilometragem: 38400,
      estado_cadastro: "publicado",
    });
    expect(doFormulario).not.toHaveProperty(CAMPO_DO_ESTADO);
  });

  it("a tela de cadastro não promete vitrine automática", () => {
    // A frase antiga — "o veículo entra na vitrine no próximo carregamento da
    // página" — virou mentira em 30/08: falta o ato de publicar. Quem cadastrou
    // sairia esperando um carro no ar que nunca apareceria.
    const cadastro = ler("src", "components", "admin", "CadastroDeVeiculo.tsx");
    expect(cadastro).not.toContain("entra na vitrine no próximo carregamento");
    expect(cadastro).toContain("Nasce como rascunho");
  });
});

// ---------------------------------------------------------------------------
// 2. Rascunho não aparece no site
// ---------------------------------------------------------------------------

describe("trava 2 · rascunho e arquivado não aparecem no site", () => {
  it("`getEstoque` serve só o publicado", () => {
    // O filtro que substituiu a janela de `last_seen_at`. Some esta linha e o
    // rascunho vai ao ar sem ninguém ter publicado nada.
    expect(semComentarios(supabaseLib)).toMatch(
      /data\.filter\(\(l: any\) => l\.estado_cadastro === "publicado"\)/,
    );
  });

  it("a ficha de um não publicado responde `saiu do estoque`", () => {
    // `getSinaisDeEstoque` continua resolvendo a PDP — o link antigo não bate em
    // 404 —, mas diz que o carro não está disponível. A régua é a coluna, não a
    // ausência no último ciclo do robô.
    expect(semComentarios(supabaseLib)).toMatch(
      /foraDoFeed: propriaLinha\.estado_cadastro !== "publicado"/,
    );
  });

  it("o backfill preservou exatamente o que estava no ar", () => {
    // 38 ativos + 24 vendidos publicados, 42 arquivados: a migração conferiu os
    // três números no próprio aceite. O teste guarda os números para que uma
    // reescrita do arquivo não os troque em silêncio.
    expect(migracao).toMatch(/n <> 38/);
    expect(migracao).toMatch(/n <> 24/);
    expect(migracao).toMatch(/n <> 42/);
  });
});

// ---------------------------------------------------------------------------
// 3. Publicar exige a linha da matriz
// ---------------------------------------------------------------------------

describe("trava 3 · publicar é da linha `Publicar ou despublicar veículo`", () => {
  it("o campo está mapeado na matriz A17", () => {
    expect(ACAO_DO_CAMPO_DE_VEICULO[CAMPO_DO_ESTADO]).toBe("Publicar ou despublicar veículo");
  });

  it("Admin e Comercial fazem; os outros três não", () => {
    for (const perfil of ["admin", "comercial"] as const) {
      expect(campoNegadoAoPerfil(perfil, [CAMPO_DO_ESTADO]), perfil).toBeNull();
    }
    // Marketing está em `revisao` e, sem a tela A16, revisão é negação — errar
    // para baixo, como o cabeçalho de `permissoes.ts` manda.
    expect(podeFazer("marketing", "Publicar ou despublicar veículo")).toBe("revisao");
    for (const perfil of ["marketing", "gestor", "financeiro"] as const) {
      expect(campoNegadoAoPerfil(perfil, [CAMPO_DO_ESTADO])?.campo, perfil).toBe(CAMPO_DO_ESTADO);
    }
    // Sem papel de painel nenhum: nega. Lista vazia não é "sem restrição".
    expect(campoNegadoAoPerfil([], [CAMPO_DO_ESTADO])?.campo).toBe(CAMPO_DO_ESTADO);
  });

  it("todo perfil que publica é o mesmo que cadastra veículo", () => {
    // As duas telas resolvem o gate pela MESMA linha. Se um dia a A17 as
    // separar, este teste cai e obriga a decidir de propósito.
    for (const p of PERFIS) {
      const publica = campoNegadoAoPerfil(p, [CAMPO_DO_ESTADO]) === null;
      expect(publica, p).toBe(podeFazer(p, "Publicar ou despublicar veículo") === "faz");
    }
  });

  it("o estado é campo NOSSO — vale para o carro do feed também", () => {
    // O ponto que faz a entrega servir para alguma coisa: 62 dos 104 veículos
    // vieram do RevendaMais. Se o campo caísse na lista que só o veículo NATIVO
    // grava (`camposGravaveis("painel")`), nenhum deles poderia ser publicado
    // nem arquivado pelo painel.
    expect(CAMPOS_NOSSOS).toContain(CAMPO_DO_ESTADO);
    expect(camposGravaveis("sync")).toContain(CAMPO_DO_ESTADO);
    expect(camposGravaveis(null)).toContain(CAMPO_DO_ESTADO);
    expect(camposGravaveis("painel")).toContain(CAMPO_DO_ESTADO);
    expect(extrairCamposNossos({ [CAMPO_DO_ESTADO]: "publicado" })).toEqual({
      [CAMPO_DO_ESTADO]: "publicado",
    });
  });

  it("as duas rotas de escrita passam o campo pela matriz", () => {
    // O gate é por CAMPO, não por rota: `campoNegadoAoPerfil(perfil,
    // Object.keys(atualizacao))` é o que barra o Marketing de publicar em lote.
    for (const rota of [
      ["src", "app", "api", "estoque", "[id]", "route.ts"],
      ["src", "app", "api", "estoque", "lote", "route.ts"],
    ]) {
      expect(semComentarios(ler(...rota)), rota.join("/")).toContain(
        "campoNegadoAoPerfil(perfil, Object.keys(atualizacao))",
      );
    }
  });

  it("os botões SOMEM para quem não publica — não ficam cinza", () => {
    // "Tudo que for negado some da interface do usuário, não fica cinza" — A17.
    expect(paginaA6).toContain(
      'podeFazer(perfisDe(profile), "Publicar ou despublicar veículo") === "faz"',
    );
    expect(tabelaA6).toContain("podePublicar: boolean");
    expect(tabelaA6).toContain("{podePublicar && (");
    expect(semComentarios(editorA15)).toContain("podeDecidirPublicacao &&");
    expect(semComentarios(editorA15)).toContain("podeGravar(CAMPO_DO_ESTADO)");
  });
});

// ---------------------------------------------------------------------------
// 4. Publicar bloqueado por foto é impedido — e o motivo vai escrito
// ---------------------------------------------------------------------------

describe("trava 4 · a régua de fotos impede a publicação", () => {
  const pronto = {
    id: 4821,
    laudo_pericia: "aprovado",
    whatsapp_images: comFotos(MINIMO_DE_FOTOS),
    origem: "sync",
  };
  const semFotos = { id: 4830, laudo_pericia: null, whatsapp_images: comFotos(2), origem: "sync" };

  it("publica quem tem o material", async () => {
    const { supabase, gravou } = bancoFalso([pronto]);
    const r = await aplicarNosVeiculos(supabase, [4821], { estado_cadastro: "publicado" }, AUTOR);
    expect(r.erro).toBeUndefined();
    expect(gravou).toHaveLength(1);
    expect(gravou[0].patch).toEqual({ estado_cadastro: "publicado" });
  });

  it("recusa quem não tem, com o código e o motivo na mensagem", async () => {
    const { supabase, gravou } = bancoFalso([semFotos]);
    const r = await aplicarNosVeiculos(supabase, [4830], { estado_cadastro: "publicado" }, AUTOR);
    expect(r.status).toBe(422);
    expect(r.erro).toContain("4830");
    expect(r.erro).toMatch(new RegExp(`2 de ${MINIMO_DE_FOTOS} fotos`));
    // Nada gravado: a recusa é antes do UPDATE, não um rollback de mentira.
    expect(gravou).toHaveLength(0);
    expect(r.recusas?.map((x) => x.id)).toEqual(["4830"]);
  });

  it("o lote é atômico — um bloqueado segura os outros", async () => {
    // Publicar 1 de 2 em silêncio deixaria um carro parado sem ninguém saber.
    // A tela oferece "publicar só os prontos" como ato explícito.
    const { supabase, gravou } = bancoFalso([pronto, semFotos]);
    const r = await aplicarNosVeiculos(
      supabase,
      [4821, 4830],
      { estado_cadastro: "publicado" },
      AUTOR,
    );
    expect(r.status).toBe(422);
    expect(gravou).toHaveLength(0);
    expect(r.recusas).toHaveLength(1);
  });

  it("arquivar NÃO é barrado pela falta de foto", async () => {
    // Tirar do ar um carro incompleto é exatamente o que se quer poder fazer.
    const { supabase, gravou } = bancoFalso([semFotos]);
    const r = await aplicarNosVeiculos(supabase, [4830], { estado_cadastro: "arquivado" }, AUTOR);
    expect(r.erro).toBeUndefined();
    expect(gravou[0].patch).toEqual({ estado_cadastro: "arquivado" });
  });

  it("as fotos que chegam na MESMA chamada contam", async () => {
    // Quem sobe a oitava foto e publica no mesmo PATCH não pode ser recusado por
    // um estado que a própria chamada estava resolvendo.
    const { supabase, gravou } = bancoFalso([{ ...semFotos, whatsapp_images: [] }]);
    const r = await aplicarNosVeiculos(
      supabase,
      [4830],
      { estado_cadastro: "publicado", whatsapp_images: comFotos(MINIMO_DE_FOTOS) },
      AUTOR,
    );
    expect(r.erro).toBeUndefined();
    expect(gravou).toHaveLength(1);
  });

  it("sem laudo continua publicável — pendência não é bloqueio", async () => {
    // 38 das 39 fichas de 27/08 estão sem laudo. Se a falta barrasse, o botão
    // Publicar não funcionaria para praticamente ninguém.
    const { supabase } = bancoFalso([{ ...pronto, laudo_pericia: "" }]);
    const r = await aplicarNosVeiculos(supabase, [4821], { estado_cadastro: "publicado" }, AUTOR);
    expect(r.erro).toBeUndefined();
  });

  it("leitura que falhou não publica ninguém às cegas", async () => {
    const { supabase, gravou } = bancoFalso([pronto], {
      erroNaLeitura: { message: "conexão perdida" },
    });
    const r = await aplicarNosVeiculos(supabase, [4821], { estado_cadastro: "publicado" }, AUTOR);
    expect(r.status).toBe(500);
    expect(r.erro).toContain("Nada foi publicado");
    expect(gravou).toHaveLength(0);
  });

  it("estado fora do vocabulário volta 400, não 500 do Postgres", async () => {
    const { supabase, gravou } = bancoFalso([pronto]);
    const r = await aplicarNosVeiculos(supabase, [4821], { estado_cadastro: "no_ar" }, AUTOR);
    expect(r.status).toBe(400);
    expect(r.erro).toContain("no_ar");
    expect(gravou).toHaveLength(0);
  });

  it("a mudança de estado entra no histórico, com autor", async () => {
    // "Quem tirou o carro do ar?" tem de ter resposta — é a mesma trilha do
    // preço, e a linha da matriz é de alçada.
    const { supabase, historico } = bancoFalso([
      { ...pronto, estado_cadastro: "rascunho" },
    ]);
    await aplicarNosVeiculos(supabase, [4821], { estado_cadastro: "publicado" }, AUTOR);
    expect(historico).toHaveLength(1);
    expect(historico[0]).toMatchObject({
      campo: "estado_cadastro",
      valor_anterior: "rascunho",
      valor_novo: "publicado",
      autor_nome: "Quem publicou",
    });
  });

  it("a régua não é reescrita — `recusasParaPublicar` só consulta", () => {
    expect(recusasParaPublicar([{ id: 1, whatsapp_images: comFotos(MINIMO_DE_FOTOS) }])).toEqual([]);
    const recusa = recusasParaPublicar([{ id: 1, whatsapp_images: [] }]);
    expect(recusa[0].motivos.every((m) => m.bloqueia)).toBe(true);
    // O texto vem de `bloqueiosDePublicacao`, com a frase por origem.
    expect(
      recusasParaPublicar([{ id: 1, whatsapp_images: [], origem: "painel" }])[0].motivos[0].texto,
    ).toContain("suba as fotos pelo painel");
  });

  it("a mensagem nomeia os primeiros e conta o resto", () => {
    const muitas = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, whatsapp_images: [] }));
    const texto = textoDaRecusaDePublicacao(recusasParaPublicar(muitas));
    expect(texto).toContain("7 veículos");
    expect(texto).toContain("e mais 3");
    expect(textoDaRecusaDePublicacao(recusasParaPublicar([{ id: 9, whatsapp_images: [] }]))).toContain(
      "1 veículo",
    );
  });

  it("a tela avisa antes de gastar a ida ao servidor", () => {
    // Conveniência, não gate: se este `if` sumir, o pior que acontece é a mesma
    // recusa vir do servidor. O gate de verdade está em `aplicarNosVeiculos`.
    const codigo = semComentarios(tabelaA6);
    expect(codigo).toContain("prontoParaPublicar");
    expect(codigo).toContain("ainda não podem ir ao ar");
    // O editor A15 trava o botão e diz o que falta.
    expect(semComentarios(editorA15)).toMatch(/travado\s*=\s*acao === "publicar" && bloqueios\.length > 0/);
  });
});

// ---------------------------------------------------------------------------
// 5. Arquivado não volta sozinho
// ---------------------------------------------------------------------------

describe("trava 5 · arquivado não volta sozinho", () => {
  it("do arquivado só se oferece publicar — e é um ato de gente", () => {
    expect(acoesDoEstado("arquivado")).toEqual(["publicar"]);
    expect(acoesDoEstado("publicado")).toEqual(["arquivar"]);
    expect(acoesDoEstado("rascunho")).toEqual(["publicar", "arquivar"]);
  });

  it("mexer em `vendido` não mexe no estado do cadastro", async () => {
    // O caminho automático mais plausível: devolver um carro a disponível e ele
    // reaparecer no site. O patch só carrega o que foi pedido.
    const { supabase, gravou } = bancoFalso([
      { id: 4907, estado_cadastro: "arquivado", vendido: true, whatsapp_images: comFotos(12) },
    ]);
    await aplicarNosVeiculos(supabase, [4907], { vendido: false }, AUTOR);
    expect(gravou[0].patch).toEqual({ vendido: false });
    expect(gravou[0].patch).not.toHaveProperty("estado_cadastro");
  });

  it("o sync não desarquiva nada — ele não sobrescreve mais coluna nenhuma", () => {
    // A trava total da F0-q: reconhecida a escrita do robô, o trigger devolve a
    // linha ANTIGA inteira. Sem isso, a próxima importação devolveria ao ar
    // exatamente os 42 carros que a loja arquivou.
    const trava = migracao.slice(migracao.indexOf("estoque_motors_trava_do_sync"));
    expect(semComentarios(trava)).toMatch(
      /if current_user = 'service_role'[\s\S]*?then\s*return old;/,
    );
  });

  it("reexecutar o backfill não reescreve decisão da loja", () => {
    // A condição `where estado_cadastro = 'rascunho'` é o que torna a migração
    // reexecutável sem desfazer o que alguém publicou ou arquivou depois.
    expect(semComentarios(migracao)).toMatch(/where e\.estado_cadastro = 'rascunho'/);
  });
});
