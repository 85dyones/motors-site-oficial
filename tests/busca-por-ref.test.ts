import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { normalizarRef } from "../src/lib/leadsKanban";
import { refCurta } from "../src/lib/telemetry";

/**
 * O "(Ref: 0DCB1CDC)" passa a ter onde ser procurado.
 *
 * Desde 2026-08-19 toda mensagem pré-preenchida de WhatsApp termina com esse
 * código, e o comentário de `refCurta` diz para que ele existe: casar a
 * mensagem que chegou no WhatsApp da loja com o lead do painel, quando o
 * cliente mandou de outro número. Só que `/api/leads` nunca gravou o `ag_uid`
 * — o código era impresso e morria ali.
 *
 * O que estes testes seguram é o par: **o mesmo predicado decide se o cliente
 * VÊ a referência e se a linha NASCE com ela.** Se as duas pontas divergirem,
 * volta a existir código impresso sem lead correspondente — o defeito
 * original, de novo, e igualmente silencioso.
 */

const raiz = join(__dirname, "..");
const rotaPublica = readFileSync(join(raiz, "src", "app", "api", "leads", "route.ts"), "utf-8");
const rotaGestao = readFileSync(
  join(raiz, "src", "app", "api", "leads", "gerenciar", "route.ts"),
  "utf-8",
);
const kanban = readFileSync(
  join(raiz, "src", "components", "admin", "LeadsKanban.tsx"),
  "utf-8",
);

/**
 * O componente sem comentários. Necessário pelo mesmo motivo de
 * `leads-kanban.test.ts`: os comentários deste arquivo citam o código que
 * explicam, e uma asserção contra o texto cru passaria mesmo com o JSX
 * apagado.
 */
const kanbanCodigo = kanban
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/^\s*\/\/.*$/, ""))
  .join("\n");

const migracoes = readdirSync(join(raiz, "supabase", "migrations"));
const arquivoMigracao = migracoes.find((m) => m.includes("ag_uid_no_lead"));
const sql = arquivoMigracao
  ? readFileSync(join(raiz, "supabase", "migrations", arquivoMigracao), "utf-8")
  : "";

/** O SQL sem comentários — os arquivos deste projeto explicam o que NÃO fazem. */
const sqlExecutavel = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const UUID = "0dcb1cdc-fb39-4a39-99c9-923f025619f4";

describe("normalizarRef", () => {
  it("aceita o código como o cliente o lê", () => {
    expect(normalizarRef("0DCB1CDC")).toBe("0DCB1CDC");
  });

  it("aceita em minúsculas — ninguém digita em caixa alta", () => {
    expect(normalizarRef("0dcb1cdc")).toBe("0DCB1CDC");
  });

  it("aceita o UUID inteiro, colado da nota do atendimento", () => {
    expect(normalizarRef(UUID)).toBe("0DCB1CDC");
  });

  it("aceita a mensagem copiada com parênteses e rótulo", () => {
    expect(normalizarRef("(Ref: 0DCB1CDC)")).toBe("0DCB1CDC");
  });

  it("aceita o rótulo colado sem espaço — o 'e' de Ref é hex e seria engolido", () => {
    // Se o filtro de hex rodasse antes de tirar o rótulo, isto viraria
    // "E0DCB1CD" e a busca não acharia nada, sem dizer por quê.
    expect(normalizarRef("Ref:0DCB1CDC")).toBe("0DCB1CDC");
  });

  it("recusa entrada incompleta em vez de procurar por prefixo curto", () => {
    // Devolver "" faz quem chama dizer quantos caracteres faltam. Procurar
    // por "0DCB" devolveria leads sem relação e pareceria resposta.
    expect(normalizarRef("0DCB")).toBe("");
    expect(normalizarRef("")).toBe("");
    expect(normalizarRef("zzzzzzzz")).toBe("");
  });
});

describe("o que a escrita garante, e o que a leitura não precisa garantir", () => {
  it("o que o cliente lê é o que a busca procura", () => {
    // `refCurta` monta o que vai na mensagem; `normalizarRef` interpreta o que
    // o atendente digita de volta. O ciclo tem que fechar.
    expect(normalizarRef(refCurta(UUID))).toBe(refCurta(UUID));
  });

  it("o placeholder de erro nunca vira referência gravada", () => {
    // É esta a garantia que importa, e ela mora no lado da ESCRITA: quando
    // não há rastreio, `refCurta` devolve "" — a mensagem sai sem "(Ref: …)" e
    // a rota grava `ag_uid` nulo. Nenhuma linha nasce com o placeholder.
    expect(refCurta("ag_ref_nao_localizado")).toBe("");
  });

  it("normalizarRef é normalizador, não validador — e é de propósito", () => {
    // Ele extrai hex de qualquer coisa: o placeholder vira "AEFACAAD", que é
    // uma referência de aparência perfeitamente válida. Isso não é defeito,
    // porque exigir cara de UUID quebraria o caso principal — o atendente
    // digita os 8 caracteres soltos, sem hífen, e é justamente isso que a
    // busca precisa aceitar.
    //
    // O que segura a ponta é a escrita: como nada garbage é gravado, buscar
    // por garbage devolve zero e a tela diz que não achou. Errar aqui custa
    // uma busca vazia; errar na escrita custaria o rastreamento inteiro.
    expect(normalizarRef("ag_ref_nao_localizado")).toBe("AEFACAAD");
  });
});

describe("a migração", () => {
  it("existe", () => {
    expect(arquivoMigracao, "migração do ag_uid não encontrada").toBeTruthy();
  });

  it("cria a coluna de rastreio", () => {
    expect(sqlExecutavel).toMatch(/add column if not exists\s+ag_uid\s+text/i);
  });

  it("a referência curta é GERADA, não escrita", () => {
    // O ponto da coluna gerada é não poder divergir do `ag_uid`. Uma coluna
    // comum preenchida pela aplicação traria de volta a possibilidade de duas
    // verdades sobre o mesmo lead.
    expect(sqlExecutavel).toMatch(
      /ref_curta[\s\S]*generated always as \(upper\(left\(ag_uid, ?8\)\)\) stored/i,
    );
  });

  it("indexa a busca — sem índice o defeito só aparece quando a fila cresce", () => {
    expect(sqlExecutavel).toMatch(/create index if not exists leads_ref_curta_idx/i);
  });

  it("carrega autoconferência, como as demais migrações do projeto", () => {
    expect(sqlExecutavel).toMatch(/raise exception/i);
    expect(sql).toMatch(/Aceite verificado/);
  });

  it("é aditiva: não apaga nem reescreve coluna existente", () => {
    expect(sqlExecutavel).not.toMatch(/drop\s+(table|column)/i);
  });
});

describe("/api/leads grava o rastreio", () => {
  it("guarda o `ag_uid` no insert do lead", () => {
    expect(rotaPublica).toMatch(/ag_uid:\s*refCurta\(resolvedAgUid\)\s*\?\s*resolvedAgUid\s*:\s*null/);
  });

  it("não escreve `ref_curta` — quem calcula é o banco", () => {
    // Escrever a coluna gerada faz o PostgREST recusar o insert inteiro. Como
    // esta gravação é não-bloqueante de propósito, a recusa viraria um
    // `console.warn` e o lead sumiria de novo, exatamente como em 2026-08-11.
    expect(rotaPublica).not.toMatch(/ref_curta:/);
  });
});

describe("/api/leads/gerenciar busca por referência", () => {
  it("filtra pela coluna indexada, não por `ilike`", () => {
    expect(rotaGestao).toMatch(/\.eq\("ref_curta", ref\)/);
    expect(rotaGestao).not.toMatch(/ilike\(\s*"ag_uid"/);
  });

  it("recusa quem não pode ver lead — a busca devolve nome e telefone", () => {
    // Marketing recebe agregado na listagem; aqui um agregado de uma linha
    // não agregaria nada e ainda confirmaria que o lead existe.
    const trecho = rotaGestao.slice(rotaGestao.indexOf("refBruta"));
    expect(trecho).toMatch(/if \(!podeVer\)[\s\S]{0,220}status: 403/);
  });

  it("responde 400 na referência incompleta, em vez de listar meio mundo", () => {
    expect(rotaGestao).toMatch(/if \(!ref\)[\s\S]{0,200}status: 400/);
  });

  it("trata coluna ausente como migração pendente", () => {
    // A tela já sabe mostrar "aplique a migração". Sem isto, quem buscar antes
    // do `db push` recebe um 500 com mensagem do Postgres.
    const trecho = rotaGestao.slice(rotaGestao.indexOf("refBruta"));
    expect(trecho).toMatch(/ehTabelaOuColunaAusente\(erroBusca\)[\s\S]{0,160}migracaoPendente: true/);
  });
});

describe("o kanban", () => {
  it("mantém o campo de busca fora do bloco que some quando não há lead", () => {
    // Se o campo morasse dentro do ramo de `leads.length === 0`, uma busca sem
    // resultado apagaria o próprio campo — e não haveria como desfazê-la sem
    // recarregar a página.
    const campo = kanbanCodigo.indexOf('id="busca-ref"');
    const ramoVazio = kanbanCodigo.indexOf("leads.length === 0");
    expect(campo).toBeGreaterThan(-1);
    expect(campo).toBeLessThan(ramoVazio);
  });

  it("oferece o caminho de volta para a fila", () => {
    expect(kanbanCodigo).toMatch(/limparBusca/);
  });

  it("avisa quando o prefixo casa com mais de um lead", () => {
    expect(kanbanCodigo).toMatch(/busca\.total > 1/);
  });

  it("não diz 'nenhum lead ainda' quando foi a busca que não achou", () => {
    // A frase é verdadeira para a fila vazia e mentirosa para a busca vazia.
    const ramo = kanbanCodigo.slice(kanbanCodigo.indexOf("leads.length === 0"));
    expect(ramo.slice(0, 400)).toMatch(/busca \?/);
  });

  it("mostra a referência no card e o rastreio inteiro no title", () => {
    expect(kanbanCodigo).toMatch(/REF \{l\.ref_curta\}/);
    expect(kanbanCodigo).toMatch(/title=\{l\.ag_uid \?\? undefined\}/);
  });
});
