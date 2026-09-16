import type { Guia, SecaoDoGuia } from "./guias";
import type { PerguntaFrequente } from "../components/modernist/PaginaDeEstoque";

/**
 * O que a API aceita de quem escreve um guia no painel.
 *
 * Mora numa lib, e não dentro de `app/api/guias/route.ts`, por uma razão
 * prática: um route handler do Next só pode exportar os verbos HTTP e as
 * configs. Enquanto estas funções viviam lá, não havia como testá-las a não
 * ser pela porta HTTP — e a revisão da F3 mostrou o custo disso, achando que
 * `startsWith("/")` deixava passar `//exemplo.com/promo` sem que nenhum teste
 * percebesse.
 *
 * A trava contra formato ruim mora AQUI, na escrita, porque é onde dá para
 * avisar quem digitou. `lib/guiasDoBanco.ts` filtra de novo na leitura, mas
 * ali o descarte é silencioso — linha antiga não pode derrubar a página.
 */

export function texto(bruto: unknown, limite: number): string {
  return typeof bruto === "string" ? bruto.trim().slice(0, limite) : "";
}

/**
 * Slug servível: minúsculas, números e hífen. É o que fecha a URL.
 *
 * A ordem das duas últimas operações importa, e a primeira versão errou. O
 * corte vinha DEPOIS de aparar os hífens — então um título longo cujo
 * caractere 90 caísse num separador gerava slug terminado em `-`, que o CHECK
 * `guias_slug_formato` da migração recusa. O resultado seria erro cru do
 * Postgres na tela de quem escreve, que é exatamente o que o teto de 90 no
 * banco existe para evitar.
 */
export function normalizarSlug(bruto: unknown): string {
  return String(bruto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 90)
    .replace(/^-+|-+$/g, "");
}

export function normalizarCorpo(bruto: unknown): SecaoDoGuia[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((secao) => ({
      titulo: texto((secao as Record<string, unknown>)?.titulo, 140),
      paragrafos: Array.isArray((secao as Record<string, unknown>)?.paragrafos)
        ? ((secao as Record<string, unknown>).paragrafos as unknown[])
            .map((p) => texto(p, 2000))
            .filter(Boolean)
        : [],
    }))
    .filter((s) => s.titulo && s.paragrafos.length > 0);
}

export function normalizarFaq(bruto: unknown): PerguntaFrequente[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((item) => ({
      pergunta: texto((item as Record<string, unknown>)?.pergunta, 300),
      resposta: texto((item as Record<string, unknown>)?.resposta, 2000),
    }))
    .filter((p) => p.pergunta && p.resposta);
}

/**
 * O caminho aponta para dentro do site?
 *
 * Uma função só, usada na ESCRITA e na LEITURA. Enquanto eram duas checagens
 * soltas, elas divergiram: a API passou a recusar `//` e `guiasDoBanco`
 * continuou aceitando — as duas pontas com réguas diferentes para a mesma
 * pergunta.
 *
 * ---------------------------------------------------------------------------
 * Por que `startsWith("/")` e a exceção do `//` não bastam
 * ---------------------------------------------------------------------------
 * Foram duas lições, e a segunda é a que importa: eu tinha fechado a GRAFIA e
 * deixado a CLASSE aberta. Estas quatro passavam pela regra anterior e todas
 * resolvem para outro domínio — medido com o parser do próprio Node:
 *
 *   `/\exemplo.com/promo`   → https://exemplo.com
 *   `/<TAB>/exemplo.com`    → https://exemplo.com
 *   `/<LF>/exemplo.com`     → https://exemplo.com
 *   `/<CR>/exemplo.com`     → https://exemplo.com
 *
 * O parser da WHATWG trata `\` como `/` em esquema especial, e REMOVE tabulação
 * e quebra de linha da URL antes de parsear — então `/<TAB>/host` chega como
 * `//host`. `trim()` não pega, porque os caracteres estão no meio.
 *
 * A régua correta é sobre o SEGUNDO caractere, não sobre um prefixo específico:
 * uma barra, e o que vem depois não pode ser barra nem contrabarra.
 */
export function ehCaminhoInterno(href: string): boolean {
  if (!href.startsWith("/")) return false;
  if (/^[/\\]/.test(href.slice(1))) return false;
  // Removidos pelo navegador antes do parse — deixá-los passar é deixar passar
  // a autoridade que eles escondem.
  if (/[\t\n\r]/.test(href)) return false;
  return true;
}

/**
 * A saída comercial — e só caminho interno.
 *
 * O CHECK `guias_saida_forma` da migração valida o TIPO do jsonb, não o
 * conteúdo do `href`, então o banco não pega isto: a régua é aqui e em
 * `guiasDoBanco`, pela mesma função.
 */
export function normalizarSaida(bruto: unknown): Guia["saida"] | null {
  const dado = (bruto ?? {}) as Record<string, unknown>;
  const href = texto(dado.href, 200);

  if (!ehCaminhoInterno(href)) return null;

  return {
    rotulo: texto(dado.rotulo, 80) || "Ver o estoque",
    href,
    apoio: texto(dado.apoio, 300),
  };
}

export function normalizarSobre(bruto: unknown): string[] {
  return Array.isArray(bruto) ? bruto.map((s) => texto(s, 120)).filter(Boolean) : [];
}

/**
 * O que impede um guia de ir ao ar pela metade.
 *
 * Não é validação de formulário — é a régua editorial de `REGUA_DO_GUIA`
 * traduzida no que dá para verificar por código. O resto (assunto que a loja
 * pratica, ângulo de quem recusa o carro) é julgamento de quem escreve, e a
 * tela mostra a régua ao lado do campo.
 *
 * As quatro regras batem uma a uma com os CHECKs de publicação da migração: a
 * API dá a mensagem amigável, o banco dá a última palavra.
 */
export function problemasParaPublicar(guia: {
  titulo: string;
  descricao: string;
  corpo: SecaoDoGuia[];
  saida: Guia["saida"] | null;
}): string[] {
  const problemas: string[] = [];
  if (!guia.titulo) problemas.push("O guia precisa de título.");
  if (!guia.descricao) problemas.push("O guia precisa de descrição — ela vira o resumo na busca.");
  if (guia.corpo.length === 0) problemas.push("O guia precisa de pelo menos uma seção com texto.");
  if (!guia.saida) {
    problemas.push("O guia precisa de uma saída comercial: um caminho interno começando com /.");
  }
  return problemas;
}
