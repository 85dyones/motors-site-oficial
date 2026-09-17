/**
 * Publica as 8 peças da Onda 1 (`conteudo-seo/guias-onda-1.json`) na tabela
 * `public.guias` — e, antes disso, confere se elas podem ir ao ar.
 *
 *   node conteudo-seo/aplicar-guias.mjs              # confere + ENSAIO com ROLLBACK
 *   node conteudo-seo/aplicar-guias.mjs --gravar     # upsert por slug, com backup antes
 *   node conteudo-seo/aplicar-guias.mjs --reverter   # devolve os slugs para rascunho
 *
 *   --env=<caminho>    outro `.env.local` (o padrão é o da raiz do repositório)
 *   --json=<caminho>   outro lote (o padrão é `conteudo-seo/guias-onda-1.json`)
 *   --autor=<uuid>     grava `atualizado_por`; sem a flag, a coluna não é tocada
 *
 * ---------------------------------------------------------------------------
 * Por que `.mjs` e sem dependência no modo conferência
 * ---------------------------------------------------------------------------
 * O irmão mais velho (`aplicar-rascunhos.js`) é CommonJS e paga três
 * `@typescript-eslint/no-require-imports` na catraca de lint — a contagem está
 * em `eslint-suppressions.json`. Arquivo novo não pode trazer erro novo, então
 * aqui é ESM.
 *
 * E o `pg` entra por `import()` dentro da função, não no topo: a conferência
 * precisa rodar em worktree sem `npm ci` (a RAM desta máquina não comporta
 * instalar por worktree). Sem banco, o script confere o JSON e sai.
 *
 * ---------------------------------------------------------------------------
 * A régua é a da rota do painel, copiada — e o teste guarda a cópia
 * ---------------------------------------------------------------------------
 * As funções abaixo são o port de `src/lib/guiaValidacao.ts` (o que a rota
 * `app/api/guias/route.ts` aplica antes de gravar) somado aos CHECKs da
 * migração `20260906160000_guias_no_banco.sql` e à `REGUA_DO_GUIA` de
 * `src/lib/guias.ts`. Copiar é o preço de o script rodar sem TypeScript;
 * `tests/guias-onda-1-lote.test.ts` importa as DUAS pontas e compara, para a
 * cópia não envelhecer sozinha.
 *
 * A diferença de intenção: a rota NORMALIZA em silêncio (corta em 2000, joga
 * fora seção sem parágrafo). Aqui, normalizar é reprovar — texto que só entra
 * cortado não é o texto que o dono aprovou.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");

const args = process.argv.slice(2);
const GRAVAR = args.includes("--gravar");
const REVERTER = args.includes("--reverter");
const valorDe = (nome) => {
  const achado = args.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : "";
};

const CAMINHO_JSON = valorDe("json")
  ? resolve(valorDe("json"))
  : join(AQUI, "guias-onda-1.json");
const CAMINHO_ENV = valorDe("env") ? resolve(valorDe("env")) : join(RAIZ, ".env.local");
const AUTOR = valorDe("autor") || null;

/**
 * O guia que já está no banco e NÃO é da Onda 1.
 *
 * Ele está em rascunho e é do dono decidir o que fazer com ele — o tema
 * encosta no pilar 01. Um lote que o citasse por engano o sobrescreveria, e o
 * upsert não pergunta. Por isso a régua reprova antes de abrir conexão.
 */
const SLUG_INTOCAVEL = "o-que-a-pericia-cautelar-nao-verifica";

// ---------------------------------------------------------------------------
// Port de `src/lib/guiaValidacao.ts`
// ---------------------------------------------------------------------------

const LIMITES = {
  titulo: 200,
  tituloSeo: 200,
  descricao: 400,
  secaoTitulo: 140,
  paragrafo: 2000,
  pergunta: 300,
  resposta: 2000,
  rotulo: 80,
  href: 200,
  apoio: 300,
  sobre: 120,
};

function texto(bruto, limite) {
  return typeof bruto === "string" ? bruto.trim().slice(0, limite) : "";
}

function normalizarSlug(bruto) {
  return String(bruto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 90)
    .replace(/^-+|-+$/g, "");
}

function ehCaminhoInterno(href) {
  if (!href.startsWith("/")) return false;
  if (/^[/\\]/.test(href.slice(1))) return false;
  if (/[\t\n\r]/.test(href)) return false;
  return true;
}

function normalizarCorpo(bruto) {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((secao) => ({
      titulo: texto(secao?.titulo, LIMITES.secaoTitulo),
      paragrafos: Array.isArray(secao?.paragrafos)
        ? secao.paragrafos.map((p) => texto(p, LIMITES.paragrafo)).filter(Boolean)
        : [],
    }))
    .filter((s) => s.titulo && s.paragrafos.length > 0);
}

function normalizarFaq(bruto) {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((item) => ({
      pergunta: texto(item?.pergunta, LIMITES.pergunta),
      resposta: texto(item?.resposta, LIMITES.resposta),
    }))
    .filter((p) => p.pergunta && p.resposta);
}

function normalizarSaida(bruto) {
  const dado = bruto ?? {};
  const href = texto(dado.href, LIMITES.href);
  if (!ehCaminhoInterno(href)) return null;
  return {
    rotulo: texto(dado.rotulo, LIMITES.rotulo) || "Ver o estoque",
    href,
    apoio: texto(dado.apoio, LIMITES.apoio),
  };
}

function normalizarSobre(bruto) {
  return Array.isArray(bruto) ? bruto.map((s) => texto(s, LIMITES.sobre)).filter(Boolean) : [];
}

function problemasParaPublicar(guia) {
  const problemas = [];
  if (!guia.titulo) problemas.push("O guia precisa de título.");
  if (!guia.descricao) problemas.push("O guia precisa de descrição — ela vira o resumo na busca.");
  if (guia.corpo.length === 0) problemas.push("O guia precisa de pelo menos uma seção com texto.");
  if (!guia.saida) {
    problemas.push("O guia precisa de uma saída comercial: um caminho interno começando com /.");
  }
  return problemas;
}

// ---------------------------------------------------------------------------
// Port de `src/lib/linksNoTexto.ts` — os únicos links que o corpo tem
// ---------------------------------------------------------------------------
//
// O renderizador (`app/guias/[slug]/page.tsx`) serve parágrafo como TEXTO
// PURO: markdown não vira nada, e `[texto](/destino)` apareceria com os
// colchetes na tela. Link no corpo só existe por estes quatro termos, uma vez
// por DESTINO por página. Por isso a conferência imprime onde eles vão cair:
// é a única linkagem interna que as peças conseguem ter hoje.
//
// Em 17/09/2026 esta lista deixou de ser cópia. Ela era de quatro entradas,
// escrita quando `linksNoTexto.ts` tinha quatro; a linkagem entre guias levou
// o arquivo a dezesseis, e o relatório aqui continuava mostrando quatro. Agora
// o arquivo do site é lido como TEXTO — sem TypeScript no caminho, e sem uma
// segunda lista para envelhecer sozinha.
const FONTE_DOS_TERMOS = join(RAIZ, "src/lib/linksNoTexto.ts");

function termosComDestino() {
  const fonte = readFileSync(FONTE_DOS_TERMOS, "utf8");
  const achados = [
    ...fonte.matchAll(/\{\s*termo:\s*"((?:[^"\\]|\\.)+)",\s*href:\s*"([^"]+)"\s*\}/g),
  ].map((m) => ({ termo: m[1].replace(/\\(.)/g, "$1"), href: m[2] }));
  if (achados.length < 4) {
    throw new Error(`linksNoTexto.ts devolveu ${achados.length} termos — o formato mudou.`);
  }
  return achados;
}

/** Os guias que já são destino de link, com o título exato que o site usa. */
function titulosJaNoSite() {
  return new Set(termosComDestino().filter((t) => t.href.startsWith("/guias/")).map((t) => t.termo));
}

function linksDaPagina(guia) {
  // O caminho da própria peça sai da lista: `criarLinkador` faz isso no site,
  // e sem o filtro o relatório inventaria um link que a página não tem.
  const propria = `/guias/${guia.slug}`;
  const termos = termosComDestino().filter((t) => t.href !== propria);
  const blocos = [
    ...guia.corpo.flatMap((s) => s.paragrafos.map((p) => ({ onde: s.titulo, texto: p }))),
    ...guia.faq.map((f) => ({ onde: `FAQ · ${f.pergunta}`, texto: f.resposta })),
  ];
  const achados = [];
  const jaLinkados = new Set();
  for (const bloco of blocos) {
    const candidatos = [...termos]
      .filter((d) => !jaLinkados.has(d.href))
      .sort((a, b) => b.termo.length - a.termo.length);
    const destinosDaChamada = new Set();
    for (const destino of candidatos) {
      if (destinosDaChamada.has(destino.href)) continue;
      const padrao = new RegExp(`\\b${destino.termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      const achado = padrao.exec(bloco.texto);
      if (!achado) continue;
      achados.push({ termo: achado[0], href: destino.href, onde: bloco.onde });
      destinosDaChamada.add(destino.href);
      jaLinkados.add(destino.href);
    }
  }
  return achados;
}

// ---------------------------------------------------------------------------
// A régua
// ---------------------------------------------------------------------------

/**
 * A promessa do laudo — decisão do dono em 16/09/2026, um caminho só no site.
 *
 * As duas primeiras são as MESMAS varreduras de
 * `tests/coerencia-da-pericia.test.ts`, com uma diferença: lá a primeira
 * absolve o trecho que tenha "aprovad" por perto ("assim que a perícia é
 * aprovada" descrevia o comportamento da ficha). Aqui não existe absolvição —
 * desde 16/09 o laudo fica com o vendedor, aprovado ou não, e "assim que
 * aprovado" é justamente a frase que não pode voltar.
 */
const PADROES_DO_LAUDO = [
  {
    nome: "laudo prometido na ficha",
    padrao: /laudo[^.]{0,90}?(?:na ficha|ficha do|ficha de|de cada)[^.]{0,60}/gi,
  },
  {
    // O padrão é o de `coerencia-da-pericia` DEPOIS do conserto de 17/09
    // (#119): "O laudo fica na ficha do carro assim que a perícia é aprovada"
    // escapava das duas formas antigas — "laudo fica na ficha" não é "laudo na
    // ficha", e "assim que A PERÍCIA é aprovada" tem palavra no meio.
    nome: "publicação automática",
    padrao:
      /assim que (?:for |é )?aprovad|assim que a per[ií]cia (?:for|é) aprovad|laudo (?:publicado|na ficha)|laudo fica (?:aberto )?na ficha|publicado na ficha/gi,
  },
  {
    nome: "resultado publicado",
    padrao: /\b(?:resultado|laudo)\b[^.]{0,40}\bpublicad|\bpublicamos\b[^.]{0,40}\b(?:resultado|laudo|perícia)\b/gi,
  },
  {
    nome: "entregue sem pedir",
    padrao: /n[ãa]o precisa (?:nem )?pedir|sem precisar pedir|aberto no an[úu]ncio/gi,
  },
];

/** Sobras de markdown que o renderizador mostraria cruas na tela. */
const PADROES_DE_MARKDOWN = [
  { nome: "negrito ou itálico", padrao: /\*\*|\*[^\s*][^*]*\*|__/g },
  { nome: "link de markdown", padrao: /\]\(/g },
  { nome: "cabeçalho de markdown", padrao: /(^|\n)#{1,6}\s/g },
  { nome: "linha de tabela", padrao: /\|/g },
  { nome: "item de lista", padrao: /(^|\n)\s*[-*+]\s/g },
  { nome: "citação", padrao: /(^|\n)\s*>/g },
  { nome: "URL crua", padrao: /https?:\/\//g },
  { nome: "caminho de guia no texto", padrao: /\/guias\//g },
];

const SAIDAS_COMERCIAIS = ["/estoque", "/avaliacao", "/financiamento", "/garantia"];

function blocosDeTexto(guia) {
  return [
    { onde: "titulo", texto: guia.titulo ?? "" },
    // `titulo_seo` é o `<title>` da aba, e nele a barra vertical é o separador
    // da marca ("… | Motors Store"), não sobra de tabela de markdown.
    { onde: "titulo_seo", texto: guia.titulo_seo ?? "", seo: true },
    { onde: "descricao", texto: guia.descricao ?? "" },
    ...(guia.corpo ?? []).flatMap((s, i) => [
      { onde: `corpo[${i}].titulo`, texto: s?.titulo ?? "" },
      ...(s?.paragrafos ?? []).map((p, j) => ({ onde: `corpo[${i}].paragrafos[${j}]`, texto: p })),
    ]),
    ...(guia.faq ?? []).flatMap((f, i) => [
      { onde: `faq[${i}].pergunta`, texto: f?.pergunta ?? "" },
      { onde: `faq[${i}].resposta`, texto: f?.resposta ?? "" },
    ]),
    { onde: "saida.rotulo", texto: guia.saida?.rotulo ?? "" },
    { onde: "saida.apoio", texto: guia.saida?.apoio ?? "" },
  ];
}

export function conferir(lote) {
  const erros = [];
  const avisos = [];
  const guias = lote?.guias;

  if (!Array.isArray(guias) || guias.length === 0) {
    erros.push("O arquivo não tem a lista `guias`.");
    return { erros, avisos, guias: [] };
  }

  // Título citado vale se está neste lote ou se já é destino de link no site:
  // onda que se apoia na anterior cita a peça publicada, e isso é o certo.
  const titulos = new Set([...guias.map((g) => g.titulo), ...titulosJaNoSite()]);
  const slugsVistos = new Set();

  for (const guia of guias) {
    const id = guia.slug || "(sem slug)";
    const erro = (m) => erros.push(`${id}: ${m}`);
    const aviso = (m) => avisos.push(`${id}: ${m}`);

    // --- slug -------------------------------------------------------------
    if (typeof guia.slug !== "string" || normalizarSlug(guia.slug) !== guia.slug) {
      erro("o slug não sobrevive a `normalizarSlug` — a rota e o CHECK do banco o recusam.");
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(guia.slug ?? "") || (guia.slug ?? "").length > 90) {
      erro("o slug não passa no CHECK `guias_slug_formato`.");
    }
    if (slugsVistos.has(guia.slug)) erro("slug repetido dentro do lote.");
    slugsVistos.add(guia.slug);
    if (guia.slug === SLUG_INTOCAVEL) {
      erro("este slug é o guia que já está no banco e está fora da Onda 1 — o lote não o toca.");
    }

    // --- o que a rota do painel faria --------------------------------------
    const normalizado = {
      titulo: texto(guia.titulo, LIMITES.titulo),
      tituloSeo: texto(guia.titulo_seo, LIMITES.tituloSeo),
      descricao: texto(guia.descricao, LIMITES.descricao),
      corpo: normalizarCorpo(guia.corpo),
      faq: normalizarFaq(guia.faq),
      saida: normalizarSaida(guia.saida),
      sobre: normalizarSobre(guia.sobre),
    };

    const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (normalizado.titulo !== guia.titulo) erro("o título seria cortado ou aparado pela rota.");
    if (normalizado.tituloSeo !== guia.titulo_seo) erro("o titulo_seo seria cortado pela rota.");
    if (normalizado.descricao !== guia.descricao) erro("a descrição seria cortada pela rota.");
    if (!igual(normalizado.corpo, guia.corpo)) {
      erro("o corpo não sobrevive inteiro a `normalizarCorpo` (parágrafo longo, seção sem texto ou campo fora de forma).");
    }
    if (!igual(normalizado.faq, guia.faq)) {
      erro("o FAQ não sobrevive inteiro a `normalizarFaq`.");
    }
    if (!igual(normalizado.saida, guia.saida)) {
      erro("a saída não sobrevive inteira a `normalizarSaida` (href externo, rótulo ou apoio longo).");
    }
    if (!igual(normalizado.sobre, guia.sobre)) erro("o `sobre` seria cortado pela rota.");

    for (const problema of problemasParaPublicar(normalizado)) erro(problema);

    // --- o que a coluna e o gatilho exigem ---------------------------------
    if (guia.estado !== "publicado") {
      aviso(`estado é "${guia.estado}" — este lote foi montado para publicar.`);
    }
    if (!["rascunho", "publicado"].includes(guia.estado)) {
      erro("estado fora do CHECK `guias_estado_valido`.");
    }
    if ("publicado_em" in guia || "atualizado_por" in guia) {
      erro("`publicado_em` e `atualizado_por` são de quem grava — não entram no lote.");
    }

    // --- o que o renderizador exige ----------------------------------------
    // `secao.titulo` e `item.pergunta` são as CHAVES de React da página
    // (`app/guias/[slug]/page.tsx`). Repetidas, o React descarta um dos
    // blocos sem avisar — o guia perde texto em silêncio.
    const titulosDeSecao = (guia.corpo ?? []).map((s) => s?.titulo);
    if (new Set(titulosDeSecao).size !== titulosDeSecao.length) {
      erro("duas seções com o mesmo título — é a chave de React da página.");
    }
    const perguntas = (guia.faq ?? []).map((f) => f?.pergunta);
    if (new Set(perguntas).size !== perguntas.length) {
      erro("duas perguntas iguais no FAQ — é a chave de React da página.");
    }
    if (perguntas.length < 3) aviso("menos de três perguntas no FAQ (a anatomia do guia pede 3 a 4).");

    // --- markdown que sobrou ------------------------------------------------
    for (const bloco of blocosDeTexto(guia)) {
      for (const { nome, padrao } of PADROES_DE_MARKDOWN) {
        if (bloco.seo && nome === "linha de tabela") continue;
        padrao.lastIndex = 0;
        const achado = padrao.exec(bloco.texto);
        if (achado) {
          erro(`${bloco.onde}: sobrou ${nome} ("${achado[0].trim()}") — o parágrafo é texto puro na tela.`);
        }
      }
    }

    // --- a promessa do laudo -------------------------------------------------
    for (const bloco of blocosDeTexto(guia)) {
      for (const { nome, padrao } of PADROES_DO_LAUDO) {
        padrao.lastIndex = 0;
        const achados = bloco.texto.match(padrao);
        if (achados) {
          for (const trecho of achados) {
            erro(`${bloco.onde}: ${nome} — "${trecho.trim().slice(0, 110)}"`);
          }
        }
      }
    }

    // --- régua do guia, item 3: uma saída comercial --------------------------
    const href = guia.saida?.href ?? "";
    if (!SAIDAS_COMERCIAIS.some((d) => href === d || href.startsWith(`${d}/`))) {
      aviso(`a saída aponta para ${href}, fora das saídas comerciais do plano.`);
    }

    // --- régua do guia, item 4: ranking de motivo de reprovação --------------
    // Aviso, e não erro, de propósito: a peça 08 é o levantamento próprio, com
    // amostra, período e critério de contagem declarados (T6) — é a exceção
    // que a régua não previa quando foi escrita, e quem decide é o dono. As
    // outras citações são ponteiro para ela, não ranking.
    for (const bloco of blocosDeTexto(guia)) {
      if (/\b(?:motivos?|reprova\w*)\b[^.]{0,80}\bmais (?:frequente|comum)/i.test(bloco.texto)) {
        avisos.push(
          `${id}: ${bloco.onde}: fala em motivo "mais frequente" de reprovação — RÉGUA 4. Confira se é o levantamento próprio ou ponteiro para ele.`,
        );
      }
    }

    // --- T2 do guia normativo, nas peças de lado de compra -------------------
    if (href === "/avaliacao") {
      for (const bloco of blocosDeTexto(guia)) {
        if (/abaixo da fipe|desconto/i.test(bloco.texto)) {
          erro(`${bloco.onde}: T2 — "abaixo da FIPE"/"desconto" em peça que aponta para /avaliacao.`);
        }
      }
    }

    // --- medidas de SEO da casa ----------------------------------------------
    if ((guia.descricao ?? "").length > 155) {
      aviso(`descrição com ${guia.descricao.length} caracteres — a régua de meta description da casa é 155.`);
    }
    if ((guia.titulo ?? "").length > 60) {
      aviso(`H1 com ${guia.titulo.length} caracteres — a anatomia do guia pede até 60.`);
    }
    if ((guia.titulo_seo ?? "").length > 65) {
      aviso(`titulo_seo com ${guia.titulo_seo.length} caracteres — o SERP corta perto de 60.`);
    }

    // --- os ponteiros entre as peças ----------------------------------------
    // Os links do markdown viraram texto (o renderizador não faz link no
    // corpo), e o texto nomeia o guia de destino entre aspas. Nome errado é
    // ponteiro quebrado que nenhum relatório de links pegaria.
    for (const bloco of blocosDeTexto(guia)) {
      const citacoes = bloco.texto.matchAll(/(?:guia|levantamento)\s+"([^"]{10,140})"/g);
      for (const citacao of citacoes) {
        // Vale o título exato, e vale o título cujo COMEÇO é um termo
        // registrado: "Vício oculto em carro usado: o que é e o que não é" é
        // citado inteiro, e o termo que vira link é "Vício oculto em carro
        // usado" — cortado porque o \b de JS não casa depois de "é". O
        // ponteiro está certo nos dois casos; o que não pode é apontar para
        // peça que não existe.
        const conhecido =
          titulos.has(citacao[1]) ||
          [...titulos].some((t) => t.length >= 16 && citacao[1].startsWith(t));
        if (!conhecido) {
          erro(`${bloco.onde}: cita o guia "${citacao[1]}", que não é o título de nenhuma peça do lote.`);
        }
      }
    }
  }

  return { erros, avisos, guias };
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

function lerEnv(caminho) {
  try {
    return Object.fromEntries(
      readFileSync(caminho, "utf8")
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

async function abrirConexao(url) {
  const { default: pg } = await import("pg");
  const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await cliente.connect();
  return cliente;
}

const SQL_UPSERT = `
insert into public.guias (slug, titulo, titulo_seo, descricao, corpo, faq, saida, sobre, estado, atualizado_por)
values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::text[], $9, $10::uuid)
on conflict (slug) do update set
  titulo = excluded.titulo,
  titulo_seo = excluded.titulo_seo,
  descricao = excluded.descricao,
  corpo = excluded.corpo,
  faq = excluded.faq,
  saida = excluded.saida,
  sobre = excluded.sobre,
  estado = excluded.estado,
  atualizado_por = coalesce(excluded.atualizado_por, guias.atualizado_por)
`;

function parametros(guia) {
  return [
    guia.slug,
    guia.titulo,
    guia.titulo_seo ?? null,
    guia.descricao,
    JSON.stringify(guia.corpo),
    JSON.stringify(guia.faq),
    JSON.stringify(guia.saida),
    guia.sobre ?? [],
    guia.estado,
    AUTOR,
  ];
}

/** O estado do guia que não é da Onda 1, para comparar antes e depois. */
async function estadoDoIntocavel(cliente) {
  const { rows } = await cliente.query(`select estado from public.guias where slug = $1`, [
    SLUG_INTOCAVEL,
  ]);
  return rows.length > 0 ? rows[0].estado : null;
}

/**
 * As conferências que só o banco responde — as mesmas no ensaio e na gravação.
 *
 * A que mais importa é a leitura como `anon`: é a única coisa entre um
 * rascunho e a internet, e é o que a migração persegue no aceite dela.
 */
async function conferirNoBanco(cliente, slugs, estadoAntesDoIntocavel) {
  const problemas = [];

  const { rows: gravados } = await cliente.query(
    `select slug, estado, publicado_em is not null as tem_data,
            jsonb_array_length(corpo) as secoes, jsonb_array_length(faq) as perguntas,
            saida ->> 'href' as href
       from public.guias where slug = any($1::text[]) order by slug`,
    [slugs],
  );
  if (gravados.length !== slugs.length) {
    problemas.push(`o banco devolveu ${gravados.length} linha(s) para ${slugs.length} slug(s).`);
  }
  for (const linha of gravados) {
    if (linha.estado !== "publicado") problemas.push(`${linha.slug}: estado ${linha.estado}.`);
    if (!linha.tem_data) problemas.push(`${linha.slug}: sem publicado_em — o gatilho não carimbou.`);
    if (!linha.href) problemas.push(`${linha.slug}: sem saída comercial.`);
  }

  await cliente.query("set local role anon");
  const { rows: comoAnon } = await cliente.query(
    `select count(*)::int as vistos from public.guias where slug = any($1::text[])`,
    [slugs],
  );
  await cliente.query("reset role");
  if (comoAnon[0].vistos !== slugs.length) {
    problemas.push(`o visitante anônimo enxerga ${comoAnon[0].vistos} de ${slugs.length} — a RLS não entregaria as peças.`);
  }

  // Compara com o estado do começo da transação, e não com "rascunho": o dono
  // pode publicar aquele guia um dia, e uma asserção presa em "rascunho"
  // transformaria a decisão dele em falha da gravação deste lote.
  const intocado = await estadoDoIntocavel(cliente);
  if (intocado !== estadoAntesDoIntocavel) {
    problemas.push(
      `${SLUG_INTOCAVEL} mudou de "${estadoAntesDoIntocavel}" para "${intocado}" — o lote não toca nele.`,
    );
  }

  return { problemas, gravados };
}

async function ensaiar(url, guias) {
  const slugs = guias.map((g) => g.slug);
  const cliente = await abrirConexao(url);
  try {
    await cliente.query("begin");

    const { rows: antes } = await cliente.query(
      `select slug, estado from public.guias where slug = any($1::text[])`,
      [slugs],
    );
    console.log(`  já existiam no banco: ${antes.length ? antes.map((r) => r.slug).join(", ") : "nenhum"}`);
    const intocavelAntes = await estadoDoIntocavel(cliente);

    for (const guia of guias) await cliente.query(SQL_UPSERT, parametros(guia));

    const { problemas, gravados } = await conferirNoBanco(cliente, slugs, intocavelAntes);
    console.log(`  upsert de ${gravados.length} linha(s), lidas como anônimo e conferidas`);

    // O ensaio do --reverter: sem isso, a volta só seria testada no dia em que
    // precisasse dar certo.
    await cliente.query(`update public.guias set estado = 'rascunho' where slug = any($1::text[])`, [slugs]);
    await cliente.query("set local role anon");
    const { rows: depoisDaVolta } = await cliente.query(
      `select count(*)::int as vistos from public.guias where slug = any($1::text[])`,
      [slugs],
    );
    await cliente.query("reset role");
    if (depoisDaVolta[0].vistos !== 0) {
      problemas.push(`--reverter deixaria ${depoisDaVolta[0].vistos} peça(s) visíveis ao anônimo.`);
    } else {
      console.log("  --reverter tira as 8 da vista do visitante");
    }

    await cliente.query("rollback");

    const { rows: sobrou } = await cliente.query(
      `select count(*)::int as n from public.guias where slug = any($1::text[])`,
      [slugs],
    );
    if (sobrou[0].n !== antes.length) {
      problemas.push(`depois do ROLLBACK sobraram ${sobrou[0].n} linha(s), e antes eram ${antes.length}.`);
    } else {
      console.log(`  ROLLBACK: o banco voltou ao que era (${antes.length} linha(s) destes slugs)`);
    }

    return problemas;
  } finally {
    await cliente.end();
  }
}

async function gravar(url, guias) {
  const slugs = guias.map((g) => g.slug);
  const cliente = await abrirConexao(url);
  try {
    const { rows: existentes } = await cliente.query(
      `select * from public.guias where slug = any($1::text[])`,
      [slugs],
    );
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const pasta = join(RAIZ, "scratch");
    mkdirSync(pasta, { recursive: true });
    const backup = join(pasta, `guias-backup-${carimbo}.json`);
    writeFileSync(backup, JSON.stringify({ momento: carimbo, linhas: existentes }, null, 2), "utf8");
    console.log(`backup de ${existentes.length} linha(s) existente(s): ${backup}`);

    await cliente.query("begin");
    const intocavelAntes = await estadoDoIntocavel(cliente);
    for (const guia of guias) await cliente.query(SQL_UPSERT, parametros(guia));
    const { problemas } = await conferirNoBanco(cliente, slugs, intocavelAntes);
    if (problemas.length > 0) {
      await cliente.query("rollback");
      return problemas;
    }
    await cliente.query("commit");
    console.log(`gravados: ${slugs.length}`);
    console.log("Regenere o sitemap e confira /guias — a rota revalida sozinha em 1 h.");
    return [];
  } finally {
    await cliente.end();
  }
}

async function reverter(url, guias) {
  const slugs = guias.map((g) => g.slug);
  const cliente = await abrirConexao(url);
  try {
    await cliente.query("begin");
    const { rowCount } = await cliente.query(
      `update public.guias set estado = 'rascunho' where slug = any($1::text[])`,
      [slugs],
    );
    await cliente.query("set local role anon");
    const { rows } = await cliente.query(
      `select count(*)::int as vistos from public.guias where slug = any($1::text[])`,
      [slugs],
    );
    await cliente.query("reset role");
    if (rows[0].vistos !== 0) {
      await cliente.query("rollback");
      return [`o anônimo ainda enxerga ${rows[0].vistos} peça(s) — nada foi revertido.`];
    }
    await cliente.query("commit");
    console.log(`voltaram para rascunho: ${rowCount}`);
    return [];
  } finally {
    await cliente.end();
  }
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

async function principal() {
  const lote = JSON.parse(readFileSync(CAMINHO_JSON, "utf8"));
  const { erros, avisos, guias } = conferir(lote);

  console.log(`lote: ${CAMINHO_JSON}`);
  for (const guia of guias) {
    const paragrafos = (guia.corpo ?? []).reduce((n, s) => n + (s.paragrafos?.length ?? 0), 0);
    const palavras = (guia.corpo ?? [])
      .flatMap((s) => s.paragrafos ?? [])
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
    console.log(
      `  ${guia.slug} · ${(guia.corpo ?? []).length} seções, ${paragrafos} parágrafos, ` +
        `~${palavras} palavras, ${(guia.faq ?? []).length} perguntas → ${guia.saida?.href}`,
    );
    for (const link of linksDaPagina(guia)) {
      console.log(`      link automático: "${link.termo}" → ${link.href} (${link.onde})`);
    }
  }

  for (const aviso of avisos) console.log(`  ⚠ ${aviso}`);
  for (const erro of erros) console.log(`  ✖ ${erro}`);
  console.log(`${guias.length} guias | ${erros.length} erros | ${avisos.length} avisos`);

  if (erros.length > 0) {
    // `--reverter` passa por cima: ele é o freio de mão, e só precisa dos
    // slugs. Exigir lote válido para DESPUBLICAR seria prender a saída de
    // emergência do lado de dentro — o texto no ar é justamente o que a pessoa
    // quer tirar quando descobre que ele está errado.
    if (!REVERTER) {
      console.error("\nCorrija os erros antes de gravar.");
      process.exit(1);
    }
    console.log("\n(o lote tem erros, mas --reverter só precisa dos slugs — seguindo)");
  }

  console.log(
    "\nO que nenhum script confere, e é a régua do guia (`src/lib/guias.ts`):\n" +
      "  · assunto que a loja pratica, não conteúdo genérico de portal;\n" +
      "  · escrito do lado de quem paga a perícia e recusa o carro.",
  );

  const env = lerEnv(CAMINHO_ENV);
  const url = env.SUPABASE_DB_URL || process.env.SUPABASE_DB_URL;

  if (!url) {
    console.log(`\n(sem SUPABASE_DB_URL em ${CAMINHO_ENV} — conferência local apenas)`);
    if (GRAVAR || REVERTER) process.exit(1);
    return;
  }

  if (GRAVAR) {
    const problemas = await gravar(url, guias);
    if (problemas.length > 0) {
      console.error(`\nNADA GRAVADO — ROLLBACK:\n  ${problemas.join("\n  ")}`);
      process.exit(1);
    }
    return;
  }

  if (REVERTER) {
    const problemas = await reverter(url, guias);
    if (problemas.length > 0) {
      console.error(`\nNADA REVERTIDO:\n  ${problemas.join("\n  ")}`);
      process.exit(1);
    }
    return;
  }

  console.log("\nENSAIO no banco (tudo dentro de uma transação que termina em ROLLBACK):");
  const problemas = await ensaiar(url, guias);
  if (problemas.length > 0) {
    console.error(`\nO ensaio reprovou:\n  ${problemas.join("\n  ")}`);
    process.exit(1);
  }
  console.log("\nEnsaio limpo. Para gravar de verdade: --gravar");
}

// O `import()` de um teste não dispara a execução; o `node` na linha de
// comando dispara.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  principal().catch((e) => {
    console.error("ERRO:", e.message);
    process.exit(1);
  });
}
