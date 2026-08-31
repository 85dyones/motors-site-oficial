import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CAMPOS_NOSSOS } from "../src/lib/estoqueEscrita";
import { textoUtil } from "../src/lib/supabase";

/**
 * `descricao_seo` — o campo que o código usava sem existir.
 *
 * `src/app/api/feed/xml/route.ts` montava a descrição de cada anúncio com
 * `car.descricao_seo || "Aproveite as melhores condições..."` (frase trocada
 * em 2026-08-25, por vocabulário e concordância). A propriedade
 * nunca chegava: não era coluna de `estoque_motors`, o mapper não a definia, e
 * `select("*")` não reclama de campo inexistente — só devolve `undefined`.
 *
 * Medido em produção em 2026-08-17: os 41 veículos do feed saíam com a MESMA
 * frase, mudando só marca e modelo. É primo do bug de `preco_compra`, sem o
 * 42703 que denunciaria: ali havia query citando a coluna; aqui, nada.
 *
 * Decisão do dono em 2026-08-17: o campo é necessário. Nasce como coluna do
 * painel (20260817130000), fora do alcance do sync do RevendaMais.
 */

const raiz = join(__dirname, "..");
const ler = (caminho: string) => readFileSync(join(raiz, caminho), "utf8");

const FEED = "src/app/api/feed/xml/route.ts";
const PDP = "src/app/[categoria]/[marca]/[modelo]/[ficha]/page.tsx";
const MAPPER = "src/lib/supabase.ts";
const EDITOR = "src/components/admin/EditorDeVeiculo.tsx";

/** Colunas de `estoque_motors` segundo o histórico de migrações. */
function colunasDeMigracoes(): Set<string> {
  const dir = join(raiz, "supabase", "migrations");
  const colunas = new Set<string>();
  for (const arquivo of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, arquivo), "utf8")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    let m: RegExpExecArray | null;
    const add = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
    while ((m = add.exec(sql)) !== null) colunas.add(m[1]);
  }
  return colunas;
}

describe("a coluna existe de verdade", () => {
  it("`descricao_seo` entra por migração, não por tipo TypeScript", () => {
    // O bug original em uma frase: o campo existia em `src/types/index.ts` e em
    // lugar nenhum além disso. Declarar no tipo não cria coluna.
    expect(colunasDeMigracoes().has("descricao_seo")).toBe(true);
  });

  it("é campo do painel — o sync não pode sobrescrevê-la", () => {
    // Mesmo contrato de `placa`, `motor` e `preco_compra`: o texto escrito no
    // painel tem de sobreviver a todo ciclo do RevendaMais.
    expect(CAMPOS_NOSSOS).toContain("descricao_seo");
  });

  it("o trigger de conteúdo enxerga a coluna nova", () => {
    // `descricao_seo` é literalmente o texto que o portal publica. Se mudá-la
    // não mover `conteudo_atualizado_em`, o portal nunca reprocessa o anúncio
    // reescrito — que é o caso de uso que motivou o carimbo.
    const migracao = ler("supabase/migrations/20260817130000_descricao_seo.sql");
    expect(migracao).toMatch(
      /new\.descricao_seo\s+is distinct from\s+old\.descricao_seo/
    );
    // A coluna precisa nascer ANTES da função que a cita: entre as duas
    // migrações não pode existir instante em que o trigger referencie campo
    // inexistente, senão todo UPDATE na tabela quebra no intervalo.
    expect(migracao.indexOf("ADD COLUMN IF NOT EXISTS descricao_seo")).toBeLessThan(
      migracao.indexOf("create or replace function")
    );
  });
});

describe("cadeia de fallback do texto", () => {
  it("o feed tenta descricao_seo, depois descricao, e só então o genérico", () => {
    const fonte = ler(FEED);
    expect(fonte).toMatch(
      /car\.descricao_seo\s*\|\|\s*\n?\s*car\.descricao\s*\|\|/
    );
    // O degrau do meio é o que faltava: enquanto ninguém escrever a versão
    // curta, o portal já recebe texto real em vez de catálogo.
    //
    // O último degrau existe e é genérico — o que mudou em 2026-08-25 foi a
    // frase: "Aproveite as melhores condições para comprar **seu** {marca}
    // {modelo}" cravava o masculino e usava um termo da coluna *Evitar* do
    // POSICIONAMENTO. O teste prende o degrau, não as palavras dele.
    expect(fonte).toMatch(/perícia cautelar independente e laudo na ficha/);
  });

  it("a meta description da PDP usa a mesma ordem", () => {
    expect(ler(PDP)).toMatch(
      /veiculo\.descricao_seo\s*\|\|\s*veiculo\.descricao\s*\|\|/
    );
  });

  it("o feed tira HTML antes de publicar", () => {
    // `descricao` é o texto editorial da PDP e pode vir com marcação do painel.
    // O feed é XML: `<p>` viraria parte da frase do anúncio.
    expect(ler(FEED)).toMatch(/\.replace\(\/<\[\^>\]\*>\/g/);
  });

  it("o mapper devolve o campo cru, sem embutir fallback", () => {
    // A cadeia é decisão de cada consumidor: o feed aceita texto longo, a meta
    // description corta em 155. Embutir o fallback no mapper tiraria essa
    // escolha de quem sabe o tamanho que cabe.
    expect(ler(MAPPER)).toMatch(/descricao_seo:\s*textoUtil\(dbItem\.descricao_seo\)/);
  });
});

describe("marcador de campo vazio não vira anúncio", () => {
  it('"Sem descrição informada" conta como vazio', () => {
    // O RevendaMais manda esse texto em vez de deixar a coluna nula — 3 dos 41
    // veículos em 2026-08-17. Enquanto só a PDP lia `descricao`, era texto
    // ruim; quando o feed passou a usá-la como fallback, virava anúncio dizendo
    // "sem descrição informada" nos portais, pior que a frase genérica.
    expect(textoUtil("Sem descrição informada")).toBe("");
    expect(textoUtil("  sem descricao informada  ")).toBe("");
    expect(textoUtil("SEM DESCRIÇÃO INFORMADA")).toBe("");
  });

  it("texto de verdade passa intacto, só aparado", () => {
    expect(textoUtil("  Único dono, revisões em dia.  ")).toBe("Único dono, revisões em dia.");
  });

  it("não confunde descrição legítima que começa com 'sem'", () => {
    // Contraprova da decisão de usar lista literal em vez de heurística:
    // qualquer regra do tipo "começa com sem" descartaria isto.
    const real = "Sem retoques na pintura, sem sinistro, laudo aprovado.";
    expect(textoUtil(real)).toBe(real);
  });

  it("aguenta não-string sem estourar", () => {
    expect(textoUtil(null)).toBe("");
    expect(textoUtil(undefined)).toBe("");
    expect(textoUtil(42)).toBe("");
  });
});

describe("o painel consegue preencher", () => {
  it("existe campo editável na aba de texto", () => {
    // Campo que só o banco conhece nasce morto: sem lugar para escrever, a
    // coluna ficaria NULL para sempre e o feed viveria do fallback.
    const fonte = ler(EDITOR);
    expect(fonte).toMatch(/set\(\s*["']descricao_seo["']/);
    expect(fonte).toMatch(/value=\{v\.descricao_seo\s*\?\?\s*""\}/);
  });

  it("a alteração aparece no histórico com nome legível", () => {
    expect(ler(EDITOR)).toMatch(/descricao_seo:\s*["'][^"']+["']/);
  });
});
