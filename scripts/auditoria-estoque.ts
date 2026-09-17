/**
 * `npm run auditoria:estoque` — as checagens de cadastro, num comando.
 *
 * ---------------------------------------------------------------------------
 * Por que existe
 * ---------------------------------------------------------------------------
 * O §5.5 do handoff de 27/08 pede exatamente isto, e a razão está no §5.3: o
 * checklist de publicação valida **presença**, não correção. Os dez veículos
 * com carroceria errada tinham o campo preenchido — preenchido com o valor
 * errado, mas preenchido. Nenhuma tela acusava.
 *
 * As checagens abaixo são as que fiz à mão durante a auditoria, e é
 * justamente por terem sido feitas à mão que precisam virar comando: auditoria
 * que depende de alguém lembrar não acontece duas vezes.
 *
 * Sai com código ≠ 0 quando há achado, para caber em CI sem mudar nada:
 * `0` limpo, `1` achados, `2` não rodou.
 *
 * ---------------------------------------------------------------------------
 * Por que ele se recusa a rodar (2026-09-02)
 * ---------------------------------------------------------------------------
 * Este comando não carregava `.env.local`. Sem credencial, `getEstoque()` cai
 * no `MOCK_ESTOQUE` — cinco carros fictícios de demonstração — e o relatório
 * saía formatado, completo e plausível: slug, nome do veículo, contagem de
 * fotos, seções numeradas. Nada nele dizia que o pátio era inventado.
 *
 * Em 01/09 isso virou conclusão apresentada ao dono e escrita num commit:
 * "cinco carros de ticket alto fora da vitrine". O pátio real tinha quatro
 * bloqueados, todos de entrada — Kombi, Parati, Sandero, Voyage.
 *
 * O defeito não é errar; é errar com a APARÊNCIA de acerto. Um relatório que
 * quebra ninguém cita. Um que sai bonito vira decisão. Daí a regra deste
 * arquivo: **na dúvida sobre a procedência do dado, não rodar.**
 */

import { bloqueiosDePublicacao, divergenciaDeCarroceria } from "../src/lib/coerenciaDoCadastro";
import { slugDeModelo } from "../src/lib/veiculoUrl";
import type { Veiculo } from "../src/types";
/* ⚠️ `../src/lib/supabase` NÃO é importado aqui, e a omissão é deliberada:
   ele entra por `await import()` lá no `main()`. O porquê está em
   `carregarEnvLocal`. Devolver este import ao topo quebra o comando em
   silêncio — há teste guardando (`tests/auditoria-recusa-mock.test.ts`). */

/** Acima disto, `Hatch` deixou de descrever o pátio e virou lixeira do feed. */
const TETO_DE_HATCH = 0.4;

const nome = (v: Veiculo) => `${v.marca} ${v.modelo} ${v.versao}`.replace(/\s+/g, " ").trim();

function titulo(texto: string) {
  console.log(`\n${texto}\n${"─".repeat(texto.length)}`);
}

/** Recusa explícita: sai com `2`, que é "não rodou" — distinto de `1`, "achou". */
function recusar(motivo: string): never {
  console.error(`\n✗ auditoria NÃO executada\n\n${motivo}\n`);
  process.exit(2);
}

/**
 * Carrega `.env.local` no processo.
 *
 * `process.loadEnvFile` é nativo do Node (≥ 20.12) — nenhuma dependência nova;
 * `dotenv` não está no `package.json` e continua fora.
 *
 * **A ordem é o que faz isso funcionar.** `src/lib/supabase.ts` lê
 * `process.env` numa `const` de topo de módulo, e import estático é avaliado
 * ANTES de qualquer statement do arquivo que importa. Chamada daqui, esta
 * função rodaria tarde demais se o módulo estivesse no topo: a URL do Supabase
 * já teria congelado em `""`. Por isso ele entra por `await import()`, depois
 * desta linha.
 *
 * Dois comportamentos medidos contra o Node desta máquina, não presumidos:
 * variável já presente no ambiente NÃO é sobrescrita pelo arquivo — nem quando
 * é string vazia — de modo que quem exportou à mão ganha de um `.env.local`
 * velho; e arquivo ausente lança `ENOENT`.
 *
 * O caminho sai do arquivo do script, não do `cwd`: rodando de qualquer pasta
 * lê o `.env.local` da árvore certa, e num worktree lê o do worktree.
 */
function carregarEnvLocal(): void {
  try {
    process.loadEnvFile(new URL("../.env.local", import.meta.url));
  } catch {
    // Arquivo ausente não é erro AQUI. Worktree recém-criado e CI não têm um, e
    // as variáveis podem vir do ambiente — seguir é o caminho normal. Quem sabe
    // dizer o que fazer, se elas também não vierem, é `exigirCredencial`.
  }
}

/** Trava 1: sem credencial, `getEstoque()` devolveria os carros fictícios. */
function exigirCredencial(): void {
  const faltando = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter(
    (nome) => !(process.env[nome] ?? "").trim(),
  );
  if (faltando.length === 0) return;

  recusar(
    "Sem credenciais do Supabase — o relatório rodaria sobre o MOCK_ESTOQUE, os\n" +
      "cinco carros fictícios de `src/lib/supabase.ts`, e sairia formatado e\n" +
      "plausível como se descrevesse o pátio.\n\n" +
      `  Faltando: ${faltando.join(", ")}\n\n` +
      "Procurei em `.env.local` na raiz do repositório e no ambiente. Preencha o\n" +
      "arquivo ou exporte as variáveis — o que estiver exportado tem precedência.",
  );
}

/**
 * Trava 2: a lista chegou, mas não é o pátio.
 *
 * Existe SEPARADA da trava 1 porque são quatro caminhos até a contingência e só
 * um deles é falta de credencial: erro de query, query certa com zero linhas,
 * exceção de conexão e cliente não configurado. Chave inválida, RLS fechada ou
 * rede fora passam pela trava 1 intactas — e sem esta aqui o relatório voltaria
 * a estampar o Porsche.
 *
 * Vazio ganha mensagem própria porque é outro defeito: hoje o script imprimiria
 * `0 veículos` e `✓ nada a revisar` com código 0 — sinal verde sobre nada. É
 * também o que uma RLS fechada devolve, já que RLS não retorna erro, retorna
 * lista vazia.
 */
function exigirEstoqueReal(estoque: Veiculo[], ehContingencia: boolean): void {
  if (ehContingencia) {
    recusar(
      "O estoque devolvido é o MOCK_ESTOQUE — carros fictícios de demonstração.\n\n" +
        "As credenciais existem, então o problema é a consulta: chave inválida, RLS\n" +
        "fechada, tabela vazia ou rede fora. `getEstoque()` não lança em nenhum desses\n" +
        "casos — devolve a contingência, e o relatório sairia plausível.\n\n" +
        "O motivo real está logo acima, nas linhas com prefixo `[Supabase]`.",
    );
  }

  if (estoque.length === 0) {
    recusar(
      "O Supabase respondeu, mas o estoque veio VAZIO — zero veículos.\n\n" +
        "Auditar zero veículo sairia `✓ nada a revisar` com código 0: sinal verde\n" +
        "sobre nada. Confira se o pátio existe mesmo antes de acreditar no silêncio.",
    );
  }
}

async function main() {
  carregarEnvLocal();
  exigirCredencial();

  /* Só agora, e nunca no topo: o módulo lê `process.env` na avaliação dele.
     Ver `carregarEnvLocal`. */
  const { getEstoque, getVeiculoPdpUrl, ehEstoqueDeContingencia } = await import("../src/lib/supabase");

  // `incluirNaoPublicaveis` porque a auditoria precisa ver o que o site esconde
  // — é metade do relatório.
  const estoque = await getEstoque({ incluirForaDoFeed: true, incluirNaoPublicaveis: true });
  exigirEstoqueReal(estoque, ehEstoqueDeContingencia(estoque));
  let achados = 0;

  console.log(`Auditoria de estoque — ${estoque.length} veículos`);

  /* Largura da coluna de id medida do dado, não cravada: em produção são sete
     dígitos, mas o estoque de contingência usa slug e a tabela desalinhava. */
  const larguraId = Math.max(9, ...estoque.map((v) => String(v.id).length)) + 1;
  const id = (v: Veiculo) => String(v.id).padEnd(larguraId);

  // ── 1 · contagem por carroceria ───────────────────────────────────────────
  titulo("1 · Carrocerias");
  const porTipo = new Map<string, number>();
  for (const v of estoque) {
    const t = (v.tipo ?? "").trim() || "— sem carroceria —";
    porTipo.set(t, (porTipo.get(t) ?? 0) + 1);
  }
  for (const [t, n] of [...porTipo].sort((a, b) => b[1] - a[1])) {
    const fatia = n / estoque.length;
    const alerta = t.toLowerCase() === "hatch" && fatia > TETO_DE_HATCH ? "  ← acima do teto" : "";
    console.log(`  ${t.padEnd(20)} ${String(n).padStart(3)}  ${(fatia * 100).toFixed(0).padStart(3)}%${alerta}`);
  }
  const hatch = porTipo.get("Hatch") ?? 0;
  if (hatch / estoque.length > TETO_DE_HATCH) {
    achados++;
    console.log(
      `\n  ⚠ Hatch em ${((hatch / estoque.length) * 100).toFixed(0)}% do estoque.\n` +
        "    O feed do RevendaMais usa Hatch como valor de descarte; nosso código\n" +
        "    nunca inventa carroceria. Acima do teto, é sinal de que o dado veio\n" +
        "    assim e ninguém revisou.",
    );
  }

  // ── 2 · nome × carroceria ─────────────────────────────────────────────────
  titulo("2 · Nome contradiz a carroceria");
  const divergentes = estoque
    .map((v) => ({ v, d: divergenciaDeCarroceria(v) }))
    .filter((x) => x.d);
  if (divergentes.length === 0) {
    console.log("  nenhum");
  } else {
    achados += divergentes.length;
    for (const { v, d } of divergentes) {
      console.log(`  ${id(v)}${nome(v).slice(0, 44).padEnd(46)} ${d!.atual} → ${d!.aceitaveis.join(" ou ")}`);
    }
  }

  // ── 3 · URL e agrupamento ─────────────────────────────────────────────────
  titulo("3 · URLs e hubs de modelo");
  const repetidos = estoque.filter((v) => {
    const partes = getVeiculoPdpUrl(v).split("/").filter(Boolean);
    return new Set(partes.slice(1, 4)).size < 3;
  });
  const porHub = new Map<string, number>();
  for (const v of estoque) {
    const chave = `${v.marca.toLowerCase()}/${slugDeModelo(v.marca, v.modelo, v.versao)}`;
    porHub.set(chave, (porHub.get(chave) ?? 0) + 1);
  }
  const suspeitos = [...porHub.keys()].filter((k) => {
    const modelo = k.split("/")[1];
    return [...porHub.keys()].some((outro) => outro !== k && outro.split("/")[1] !== modelo && modelo.startsWith(`${outro.split("/")[1]}-`));
  });
  if (repetidos.length === 0 && suspeitos.length === 0) {
    console.log("  nenhum segmento repetido, nenhum hub duplicando outro");
  } else {
    achados += repetidos.length + suspeitos.length;
    for (const v of repetidos) console.log(`  ${id(v)}segmento repetido: ${getVeiculoPdpUrl(v)}`);
    for (const k of suspeitos) console.log(`  hub "${k}" parece duplicar um mais curto — ver modelo_override`);
  }

  // ── 4 · fora da vitrine ───────────────────────────────────────────────────
  titulo("4 · Fora da vitrine agora");
  const bloqueados = estoque
    .map((v) => ({ v, b: bloqueiosDePublicacao(v) }))
    .filter((x) => x.b.length > 0);
  if (bloqueados.length === 0) {
    console.log("  nenhum — todo o pátio está publicável");
  } else {
    achados += bloqueados.length;
    for (const { v, b } of bloqueados) {
      console.log(`  ${id(v)}${nome(v).slice(0, 44).padEnd(46)} ${b.map((m) => m.texto).join(" · ")}`);
    }
  }

  // A seção de "sem laudo cautelar" saiu em 29/08. Ela listava 33 dos 34
  // publicados como pendência, e a premissa estava errada: 100% do pátio é
  // periciado, e `laudo_pericia` guarda APONTAMENTOS. Vazio é o melhor caso.
  // Um relatório que acusa 97% do estoque todo dia é um relatório que ninguém
  // lê. Ver `bloqueiosDePublicacao`.

  console.log(`\n${achados === 0 ? "✓ nada a revisar" : `${achados} achado(s) — revisar em /admin/estoque`}\n`);
  process.exit(achados === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("auditoria falhou:", e instanceof Error ? e.message : e);
  process.exit(2);
});
