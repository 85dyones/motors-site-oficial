/**
 * Os perfis de uso — para que o carro serve, e as vitrines que saem disso.
 *
 * ---------------------------------------------------------------------------
 * Por que a lista mudou em 2026-08-26
 * ---------------------------------------------------------------------------
 * A anterior (`PERFIS_DE_USO`, em `classificacaoVeiculo.ts`) tinha dez valores
 * e era **um por carro**. Medida contra os 38 veículos servidos:
 *
 *   Família / Conforto      12      URBANO & EFICIENTE       0
 *   Econômico / Diário      12      FORÇA & OFF-ROAD         0
 *   Uso Diário               5      LINHAGEM ESPORTIVA       0
 *   Performance / Premium    4      CURADORIA EXCLUSIVA      0
 *   Trabalho / Robustez      3
 *   Agilidade / Economia     2
 *
 * Dois problemas de uma vez. Três valores diziam quase a mesma coisa — 19 dos
 * 38 carros —, e quatro não existiam em veículo nenhum, o que deixava
 * `/destaques/curadoria` indexado com a vitrine vazia.
 *
 * E o defeito de fundo: **um carro é várias coisas ao mesmo tempo**. Um HB20 é
 * urbano, econômico e primeiro carro; um valor só obriga a escolher qual
 * verdade contar. Daí a coluna virar `text[]` e o painel virar caixa de
 * marcação.
 *
 * ---------------------------------------------------------------------------
 * Por que o título é escrito, e não montado
 * ---------------------------------------------------------------------------
 * A tentação é `Carros para ${nome.toLowerCase()}`. Ela produz "Carros para
 * primeiro carro" e "Carros para performance" — e é exatamente o erro que os
 * plurais de carroceria já cometeram uma vez ("Conversívels", "suvs" com a
 * sigla comida no `<h1>`). Cada linha traz a sua frase, escrita.
 *
 * ---------------------------------------------------------------------------
 * Por que sem nenhum import
 * ---------------------------------------------------------------------------
 * Mesma razão de `lib/faixasDePreco.ts`: a lista é lida pelo hub, que roda no
 * servidor, e pelas caixas de marcação do painel, que rodam no cliente. Um
 * import de `./supabase` aqui arrastaria o cliente do banco para o bundle do
 * navegador. **Não acrescente import neste arquivo.**
 */

export interface PerfilDeUso {
  /** Segmento de URL: `/estoque/{slug}`. Renomear é renomear página indexada. */
  slug: string;
  /** O que a caixa de marcação mostra no painel. */
  nome: string;
  /**
   * O `<h1>` da vitrine, escrito por extenso.
   *
   * Sem "em Curitiba" — a rota acrescenta, como já faz com carroceria e faixa.
   */
  titulo: string;
  /**
   * Como o perfil entra no meio de uma frase: "quem procura {frase}".
   * Existe para o texto perene não repetir o título quatro vezes.
   */
  frase: string;
}

/**
 * Oito, e ortogonais de propósito: marcar dois ou três é o esperado, não a
 * exceção. Foi por isso que os três valores redundantes do vocabulário antigo
 * viraram `urbano` + `economico` — quem era "Econômico / Diário" é os dois.
 *
 * `primeiro-carro`, `estrada` e `off-road` nascem vazios: são os que só quem
 * conhece o pátio sabe atribuir, e inventar seria pior que deixar em branco.
 */
export const PERFIS_DE_USO: readonly PerfilDeUso[] = [
  {
    slug: "familia",
    nome: "Família",
    titulo: "Carros para família",
    frase: "espaço para a família",
  },
  {
    slug: "primeiro-carro",
    nome: "Primeiro carro",
    titulo: "Primeiro carro",
    frase: "o primeiro carro",
  },
  {
    slug: "urbano",
    nome: "Urbano",
    titulo: "Carros para a cidade",
    frase: "rodar na cidade",
  },
  {
    slug: "estrada",
    nome: "Estrada e viagem",
    titulo: "Carros para estrada",
    frase: "estrada e viagem",
  },
  {
    slug: "trabalho",
    nome: "Trabalho",
    titulo: "Carros para trabalho",
    frase: "trabalhar",
  },
  {
    slug: "performance",
    nome: "Performance",
    titulo: "Carros de performance",
    frase: "prazer ao dirigir",
  },
  {
    slug: "off-road",
    nome: "Off-road 4x4",
    titulo: "Carros 4x4 e off-road",
    frase: "sair do asfalto",
  },
  {
    slug: "economico",
    nome: "Econômico",
    titulo: "Carros econômicos",
    frase: "gastar pouco",
  },
] as const;

/** Os slugs, para varredura de colisão e para o sitemap. */
export const SLUGS_DE_PERFIL: readonly string[] = PERFIS_DE_USO.map((p) => p.slug);

/** O perfil deste slug, ou `null`. A rota de recorte usa para decidir o ramo. */
export function perfilPorSlug(slug: string): PerfilDeUso | null {
  const limpo = (slug ?? "").trim().toLowerCase();
  return PERFIS_DE_USO.find((p) => p.slug === limpo) ?? null;
}

/**
 * O de-para do vocabulário antigo, usado pelo backfill e pela leitura de
 * linhas que ainda não passaram por ele.
 *
 * Chaves em minúscula sem acento — o feed já mandou "Uso Diário" e "USO
 * DIÁRIO" no mesmo ciclo. Valor fora da tabela devolve lista vazia: perfil
 * inventado é pior que perfil ausente, porque cria vitrine que ninguém pediu.
 */
const DE_PARA: Record<string, string[]> = {
  "familia / conforto": ["familia"],
  "economico / diario": ["economico", "urbano"],
  "uso diario": ["urbano"],
  "performance / premium": ["performance"],
  "agilidade / economia": ["economico", "urbano"],
  "trabalho / robustez": ["trabalho"],
};

function normalizar(valor: string): string {
  return (valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** "Econômico / Diário" → `["economico", "urbano"]`. Desconhecido → `[]`. */
export function perfisDoValorAntigo(valor: string | null | undefined): string[] {
  return DE_PARA[normalizar(valor ?? "")] ?? [];
}

/** Só os slugs que existem, sem repetição e na ordem da lista acima. */
export function perfisValidos(brutos: readonly string[] | null | undefined): string[] {
  const pedidos = new Set((brutos ?? []).map((s) => normalizar(s)));
  return PERFIS_DE_USO.filter((p) => pedidos.has(p.slug)).map((p) => p.slug);
}
