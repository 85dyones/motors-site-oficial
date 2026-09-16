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
 * Sai com código ≠ 0 quando há achado, para caber em CI sem mudar nada.
 */

import { getEstoque, getVeiculoPdpUrl } from "../src/lib/supabase";
import { bloqueiosDePublicacao, divergenciaDeCarroceria } from "../src/lib/coerenciaDoCadastro";
import { slugDeModelo } from "../src/lib/veiculoUrl";
import type { Veiculo } from "../src/types";

/** Acima disto, `Hatch` deixou de descrever o pátio e virou lixeira do feed. */
const TETO_DE_HATCH = 0.4;

const nome = (v: Veiculo) => `${v.marca} ${v.modelo} ${v.versao}`.replace(/\s+/g, " ").trim();

function titulo(texto: string) {
  console.log(`\n${texto}\n${"─".repeat(texto.length)}`);
}

async function main() {
  // `incluirNaoPublicaveis` porque a auditoria precisa ver o que o site esconde
  // — é metade do relatório.
  const estoque = await getEstoque({ incluirForaDoFeed: true, incluirNaoPublicaveis: true });
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
