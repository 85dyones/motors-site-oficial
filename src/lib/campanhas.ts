/**
 * O registro das campanhas — a fonte única sobre cada landing page de ação
 * pontual da loja (feirão, lote, parceria, condição de mês).
 *
 * Quatro consumidores leem daqui, e é isso que impede a lista de redirects
 * órfãos que campanha costuma deixar para trás:
 *
 *   `sitemap.ts` ................ lista as vivas de hoje
 *   a página da campanha ........ redireciona quando a data venceu
 *   `MolduraDoSite` ............. sabe que a rota larga header e rodapé
 *   `CtaDeCampanha` ............. carimba o lead com o nome da campanha
 *
 * A aposentadoria de uma campanha é uma DATA no mesmo objeto onde ela nasceu,
 * e não uma entrada numa lista paralela que ninguém limpa.
 *
 * Sem React e sem `"use client"` de propósito: este módulo é importado por um
 * client component, por um server component e pelo sitemap. Só dado e função
 * pura atravessa as três fronteiras sem arrastar bundle.
 */

/** Curitiba. As datas do registro são dias civis daqui, não instantes UTC. */
const FUSO = "-03:00";

export interface Campanha {
  /**
   * O endereço na raiz, sem prefixo: `pole-position-2026` responde em
   * `/pole-position-2026`.
   *
   * **Carrega o ano e nunca se reusa.** A aposentadoria responde 308, que o
   * navegador guarda para sempre: um slug reciclado no ano seguinte herdaria o
   * redirect do anterior e a campanha nova nunca abriria. O teste cobra o ano.
   */
  slug: string;
  /** Nome comercial. Vira a etiqueta `canal` do lead, lida no Kanban. */
  nome: string;
  /** Dia civil de início, ISO `AAAA-MM-DD`. Vale a partir de 00:00 em Curitiba. */
  inicio: string;
  /** Último dia, INCLUSIVE. Vale até 23:59:59 em Curitiba. */
  fim: string;
  /** Para onde o 308 aponta depois de `fim`. Caminho interno, começa com `/`. */
  destinoAposFim: string;
  /** Uma linha, para o sitemap e para o card de compartilhamento. */
  descricao: string;
  /**
   * A frase que vai no WhatsApp e vira `interesse` no banco — **na voz do
   * cliente**, porque é ele quem manda o texto.
   *
   * Campo, e não template. `Olá, vi sobre o feirão ${nome}…` funcionaria para
   * a Pole Position e sairia errado na primeira campanha que não for feirão —
   * uma condição de mês, uma parceria. Cada campanha declara a sua, e o teste
   * cobra as proibições: sem prazo que a loja não controla, sem FIPE, sem
   * "abaixo da tabela", sem falar na voz da loja.
   */
  fraseDoCliente: string;
}

export const CAMPANHAS: Campanha[] = [
  {
    slug: "pole-position-2026",
    nome: "Pole Position",
    inicio: "2026-09-12",
    fim: "2026-09-20",
    destinoAposFim: "/estoque",
    descricao:
      "Pole Position na Motors Store: lives com ofertas relâmpago, primeira parcela em até 120 dias " +
      "e transferência por nossa conta em veículos selecionados. De 12 a 20 de setembro, em Curitiba.",
    // Escrita pelo dono em 08/09. É o que chega no WhatsApp e vira `interesse`.
    fraseDoCliente: "Olá, vi sobre o feirão Pole Position Motors e quero saber as condições",
  },
];

export function campanhaPorSlug(slug: string): Campanha | undefined {
  return CAMPANHAS.find((c) => c.slug === slug);
}

/**
 * O dia civil de Curitiba, e não o instante UTC.
 *
 * `new Date("2026-09-20")` é meia-noite UTC — 21h do dia 19 aqui. Comparar
 * assim mataria a campanha 27 horas antes da hora, no meio do último dia de
 * feirão, e ninguém veria até um cliente reclamar que o link caiu.
 */
export function campanhaEstaViva(campanha: Campanha, agora: Date): boolean {
  const abre = new Date(`${campanha.inicio}T00:00:00.000${FUSO}`).getTime();
  const fecha = new Date(`${campanha.fim}T23:59:59.999${FUSO}`).getTime();
  const instante = agora.getTime();
  return instante >= abre && instante <= fecha;
}

export function campanhasVivas(agora: Date): Campanha[] {
  return CAMPANHAS.filter((c) => campanhaEstaViva(c, agora));
}

/**
 * Já passou do último dia?
 *
 * Existe separado de `campanhaEstaViva` por causa de um defeito real, pego na
 * verificação de 08/09: a página respondia **308 permanente** também ANTES do
 * início, e 308 o navegador guarda para sempre. Quem abrisse o link no dia 9
 * — o dono conferindo, um consultor, alguém que recebeu o card adiantado —
 * ficaria com o redirect gravado e **a LP não abriria para essa pessoa nem
 * durante o feirão**.
 *
 * A régua certa não é "está viva", é "já acabou":
 *   - **acabou** → 308, e aí permanente é o correto: não volta mesmo;
 *   - **ainda não começou** → a página ABRE, dizendo a data. É destino de
 *     anúncio, e anúncio se monta e se revisa antes de começar a rodar.
 *
 * Não estar no ar cedo demais é problema do sitemap, e ele já resolve sozinho:
 * `campanhasVivas` só lista as vigentes.
 */
export function campanhaAcabou(campanha: Campanha, agora: Date): boolean {
  const fecha = new Date(`${campanha.fim}T23:59:59.999${FUSO}`).getTime();
  return agora.getTime() > fecha;
}

export function caminhoDaCampanha(campanha: Campanha): string {
  return `/${campanha.slug}`;
}

export function ehRotaDeCampanha(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return CAMPANHAS.some((c) => pathname === caminhoDaCampanha(c));
}
