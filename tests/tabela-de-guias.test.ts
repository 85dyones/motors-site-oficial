import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * A migração que traz os guias para o banco — o que nela não pode mudar.
 *
 * `20260906160000_guias_no_banco.sql` faz duas coisas de naturezas diferentes,
 * e cada uma tem um jeito próprio de apodrecer:
 *
 *  1. **Ela é uma régua de segurança.** A tabela guarda rascunho, e o único
 *     obstáculo entre um texto não revisado e a internet é a cláusula
 *     `using (estado = 'publicado')` da policy de leitura pública. Trocar isso
 *     por `using (true)` não erra, não avisa e não quebra teste nenhum — só
 *     publica. O aceite da própria migração pega isso quando ela roda; este
 *     arquivo pega antes, e sem precisar de banco.
 *  2. **Ela é um transporte de conteúdo.** O seed é o guia que já está no ar,
 *     copiado verbatim de `src/lib/guias.ts` (commit c69dd8c) porque aquele
 *     texto passou por revisão adversarial e DUAS correções de conteúdo. Uma
 *     reescrita distraída desfaz as correções sem deixar rastro: o texto
 *     continua bonito, continua publicando, e volta a afirmar o que a casa não
 *     pode afirmar.
 *
 * Por que ler o SQL em vez de o banco: não há Postgres nesta máquina, e a
 * migração é o artefato versionado — é ela que alguém vai editar. As provas de
 * comportamento (anon não lê rascunho, staff publica, CHECK recusa) vivem no
 * bloco de ACEITE da própria migração, ensaiado com ROLLBACK contra produção.
 *
 * ⚠️ As asserções olham só o SQL EXECUTÁVEL. O cabeçalho do arquivo explica a
 * régua e, ao explicá-la, CITA `using (estado = 'publicado')` e o `grant` em
 * prosa. Sem descartar as linhas de comentário, este teste passaria reagindo ao
 * texto que descreve a regra, e não à regra. É a mesma armadilha que
 * `tests/migracoes.test.ts` documenta.
 */

const ARQUIVO = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260906160000_guias_no_banco.sql",
);

/** O repo guarda LF; o checkout no Windows entrega CRLF. Normalize na leitura. */
const BRUTO = readFileSync(ARQUIVO, "utf8").replace(/\r\n/g, "\n");

const EXECUTAVEL = BRUTO.split("\n")
  .filter((linha) => !linha.trimStart().startsWith("--"))
  .join("\n");

/** Os literais do seed, extraídos do SQL cru — dólar-quoting delimita cada um. */
const textos = [...BRUTO.matchAll(/\$guia\$([\s\S]*?)\$guia\$/g)].map((m) => m[1]);
const jsons = [...BRUTO.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map((m) => JSON.parse(m[1]));

interface Secao {
  titulo: string;
  paragrafos: string[];
}
interface Pergunta {
  pergunta: string;
  resposta: string;
}

const corpo = jsons[0] as Secao[];
const faq = jsons[1] as Pergunta[];
const saida = jsons[2] as { rotulo: string; href: string; apoio: string };

/** Tudo que o visitante lê, numa string só — para as proibições de conteúdo. */
const TEXTO_VISIVEL = [
  ...corpo.flatMap((s) => [s.titulo, ...s.paragrafos]),
  ...faq.flatMap((p) => [p.pergunta, p.resposta]),
].join("\n");

describe("a tabela de guias — o que a migração promete", () => {
  it("liga a RLS", () => {
    expect(EXECUTAVEL).toMatch(/alter table public\.guias enable row level security/i);
  });

  it("a leitura pública enxerga só o publicado", () => {
    // A asserção mais importante do arquivo. `estado` sai do `select` do site
    // (`lib/guiasDoBanco.ts` nem pede a coluna), então quem separa rascunho de
    // publicado é esta cláusula — e mais nada.
    const policy = EXECUTAVEL.match(
      /create policy guias_leitura_publica[\s\S]*?;/i,
    )?.[0];
    expect(policy, "a policy de leitura pública sumiu").toBeTruthy();
    expect(policy).toMatch(/for select to anon, authenticated/i);
    expect(policy).toMatch(/using \(estado = 'publicado'\)/i);
    expect(policy, "policy de leitura sem filtro publica rascunho").not.toMatch(
      /using \(true\)/i,
    );
  });

  it("o GRANT vem junto da policy — ele é checado ANTES da RLS", () => {
    // A lição de `20260831150000`: policy correta sobre tabela sem privilégio
    // responde `permission denied (42501)`, e o sintoma parece bug de código.
    expect(EXECUTAVEL).toMatch(/grant select on public\.guias to anon, authenticated;/i);
    expect(EXECUTAVEL).toMatch(/grant insert, update, delete on public\.guias to authenticated;/i);
  });

  it("anon lê e não escreve — inclusive contra o default privilege do Supabase", () => {
    // O `pg_default_acl` concede a `anon` privilégio amplo em tabela nova de
    // `public` (F0-l). Sem o revoke, só a RLS separaria a chave pública de um
    // UPDATE no texto do site.
    expect(EXECUTAVEL).toMatch(
      /revoke insert, update, delete, truncate, references, trigger on public\.guias from anon;/i,
    );
    const grantsParaAnon = [...EXECUTAVEL.matchAll(/grant ([^;]*?) on public\.guias to ([^;]*);/gi)]
      .filter((m) => /anon/.test(m[2]))
      .map((m) => m[1]);
    for (const privilegios of grantsParaAnon) {
      expect(privilegios, `anon recebeu escrita: ${privilegios}`).not.toMatch(
        /insert|update|delete|truncate/i,
      );
    }
  });

  it("o estado é fechado em rascunho e publicado, e nasce rascunho", () => {
    expect(EXECUTAVEL).toMatch(
      /constraint guias_estado_valido check \(estado in \('rascunho', 'publicado'\)\)/i,
    );
    // Guia novo não vai ao ar por descuido de quem clicou em salvar.
    expect(EXECUTAVEL).toMatch(/estado text not null default 'rascunho'/i);
  });

  it("publicar exige data, corpo e saída comercial", () => {
    // A régua do guia vira constraint: "nenhum guia termina sem destino" só
    // vale se o banco recusar o guia sem destino. E a rota lê `saida.href` sem
    // condicional — publicado sem saída quebraria o build.
    expect(EXECUTAVEL).toMatch(
      /constraint guias_publicado_tem_data\s*\n?\s*check \(estado <> 'publicado' or publicado_em is not null\)/i,
    );
    expect(EXECUTAVEL).toMatch(
      /constraint guias_publicado_tem_saida\s*\n?\s*check \(estado <> 'publicado' or saida is not null\)/i,
    );
    expect(EXECUTAVEL).toMatch(/constraint guias_publicado_tem_corpo/i);
  });

  it("o aceite continua lá, e ele lê como anon de verdade", () => {
    // Migração deste repo prova a si mesma. Se alguém apagar o bloco para
    // "simplificar", o ensaio passa a não provar nada.
    expect(EXECUTAVEL).toMatch(/set local role anon;/);
    expect(EXECUTAVEL).toMatch(/raise exception 'ACEITE FALHOU/);
  });

  it("registra a si mesma no livro-razão, com a versão do nome do arquivo", () => {
    expect(EXECUTAVEL).toMatch(
      /insert into supabase_migrations\.schema_migrations \(version, name\)\s*\n\s*values \('20260906160000', 'guias_no_banco'\)/,
    );
  });
});

describe("o seed — o guia que já está no ar", () => {
  it("não sobrescreve o que alguém tiver salvo pelo painel", () => {
    expect(EXECUTAVEL).toMatch(/on conflict \(slug\) do nothing;/i);
  });

  it("entra com o slug que a URL publicada já usa", () => {
    // Mudar o slug aqui é mudar `/guias/{slug}` de uma página indexada.
    expect(textos[0]).toBe("o-que-a-pericia-cautelar-nao-verifica");
    expect(textos[0]).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("preserva as datas do texto original, não a data da migração", () => {
    // `dateModified` que salta sem o texto mudar é sinal falso para o Google.
    // Mudar de lugar não é editar.
    const datas = textos.filter((t) => /^\d{4}-\d{2}-\d{2}T/.test(t));
    expect(datas).toEqual(["2026-09-05T09:00:00-03:00", "2026-09-05T09:00:00-03:00"]);
    expect(EXECUTAVEL).toMatch(/::timestamptz/);
  });

  it("chega inteiro: 4 seções, 10 parágrafos, 4 perguntas, 3 assuntos", () => {
    // Contagem é o que pega truncamento — o modo mais silencioso de perder
    // texto numa cópia entre formatos.
    expect(corpo).toHaveLength(4);
    expect(corpo.flatMap((s) => s.paragrafos)).toHaveLength(10);
    expect(faq).toHaveLength(4);
    expect(textos.slice(4, 7)).toEqual([
      "Perícia cautelar veicular",
      "Laudo cautelar",
      "Compra de carro seminovo",
    ]);
  });

  it("tem a forma que o leitor do site espera, sem cair em nenhum fallback", () => {
    // `normalizar()` em `lib/guiasDoBanco.ts` DESCARTA seção sem `paragrafos` e
    // pergunta sem `resposta`, e troca a saída por `/estoque` quando o `href`
    // não começa com barra. Um seed torto não erraria: sumiria da página.
    for (const secao of corpo) {
      expect(typeof secao.titulo).toBe("string");
      expect(Array.isArray(secao.paragrafos)).toBe(true);
      expect(secao.paragrafos.every((p) => typeof p === "string" && p.length > 0)).toBe(true);
    }
    for (const item of faq) {
      expect(typeof item.pergunta).toBe("string");
      expect(typeof item.resposta).toBe("string");
    }
    expect(saida.href).toBe("/garantia");
    expect(saida.href.startsWith("/")).toBe(true);
    expect(saida.rotulo.length).toBeGreaterThan(0);
    expect(saida.apoio.length).toBeGreaterThan(0);
  });

  it("é verbatim: nem uma palavra mudou desde a revisão", () => {
    // Contagem pega truncamento; frase proibida pega o erro conhecido. Nenhum
    // dos dois pega uma palavra trocada no meio de um parágrafo — e é isso que
    // uma "melhoria" bem-intencionada faz.
    //
    // O hash é do conteúdo do seed, não do arquivo: comentário, indentação e
    // formatação do SQL podem mudar. O texto, não. E há um motivo forte para
    // congelá-lo: DEPOIS de aplicada, esta migração é registro histórico —
    // editar o texto aqui não muda uma vírgula no banco, só faz o arquivo
    // mentir sobre o que rodou.
    //
    // Se você mudou o texto de propósito e a migração AINDA NÃO foi aplicada,
    // atualize o hash junto, de olho aberto. Se ela já foi aplicada, o lugar
    // de editar é o painel — `/admin/guias` —, não este arquivo.
    const conteudo = createHash("sha256")
      .update(JSON.stringify({ textos, jsons }))
      .digest("hex");
    expect(conteudo).toBe(
      "d7046ea497e7c6c8164a99755d75c660f4568186981648850cca60d249d2ac08",
    );
  });

  it("não publica ranking de motivo de reprovação — a distribuição real não existe aqui", () => {
    // Primeira correção da revisão. A última FAQ chegou a listar "passagem por
    // leilão, sinistro de médio porte, divergência de numeração" como os
    // motivos mais comuns — que é exatamente a distribuição das reprovações da
    // loja, dado que o repositório não tem. `CLAUDE.md`: não invente número.
    expect(TEXTO_VISIVEL).not.toMatch(/motivos mais comuns/i);
    expect(TEXTO_VISIVEL).not.toMatch(/sinistro de médio porte/i);
    expect(TEXTO_VISIVEL).not.toMatch(/divergência de numeração/i);
    // O que a resposta diz no lugar: o filtro é antes da compra, e os sete não
    // são carros ruins.
    expect(TEXTO_VISIVEL).toMatch(/antes da compra, e não depois/);
  });

  it("mantém os TRÊS instrumentos da metade mecânica", () => {
    // Segunda correção. A primeira versão dizia que a resposta para o estado
    // mecânico "não é um laudo — é garantia", e omitia o crivo técnico de
    // showroom que `/sobre` e `/garantia` publicam. Duas superfícies do mesmo
    // site respondendo diferente é o defeito que `coerencia-da-pericia` fecha.
    expect(TEXTO_VISIVEL).toMatch(/três instrumentos/);
    expect(TEXTO_VISIVEL).toMatch(/120 pontos/);
    expect(TEXTO_VISIVEL).toMatch(/crivo técnico de showroom/);
  });

  it("diz que o laudo fica na ficha assim que a perícia é aprovada", () => {
    // A frase da casa é condicional à aprovação — "o laudo de cada veículo"
    // afirmaria mais do que a loja pode sustentar (item 5 da régua do guia).
    expect(TEXTO_VISIVEL).toMatch(/assim que a perícia é aprovada/);
    expect(TEXTO_VISIVEL).not.toMatch(/laudo de cada veículo/i);
  });
});
