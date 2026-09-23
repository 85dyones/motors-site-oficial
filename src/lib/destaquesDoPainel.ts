import { INTERVALO_MS } from "./ritmoDaVitrine";
import { VAGAS_NA_GRADE } from "./destaquesDaSemana";
import type { EstadoDoVeiculo, LinhaDeEstoque } from "./estoqueTabela";

/**
 * As três listas de curadoria do painel — e o que cada uma alimenta.
 *
 * ---------------------------------------------------------------------------
 * Por que três, e não uma
 * ---------------------------------------------------------------------------
 * Até 2026-09-22 `carousel_vehicles` servia ao banner da home (teto de 3) E à
 * TV do showroom (sem teto). Curar bem para as duas é impossível: marcar
 * muitos entope o banner, marcar poucos esvazia a TV. Medido em produção em
 * 21/09, o resultado era uma lista de 9 ids em que 5 eram carros arquivados ou
 * vendidos e o carro marcado por último nunca chegava à home.
 *
 * Ver `docs/superpowers/specs/2026-09-21-destaques-e-filtros-do-painel-design.md`.
 */
export type Vitrine = "banner" | "grade" | "tv";

/**
 * Quantas vagas cada vitrine tem. `null` é "sem teto".
 *
 * `grade` IMPORTA `VAGAS_NA_GRADE` em vez de redigitar o seis: dois seis em
 * arquivos diferentes divergem no dia em que um deles mudar, e o sintoma seria
 * a tela desenhando a régua numa vaga e a home cortando noutra.
 *
 * A TV é `null` de propósito, e não um número grande: ela pagina a lista
 * inteira, então o limite dela não é de vagas — é de tempo de volta
 * (`voltaCompletaEmSegundos`).
 *
 * A declaração usa `as const satisfies` para carregar cada chave com seu tipo
 * literal (banner = 4, tv = null), não "number | null". Isso previne erros
 * silenciosos: se `banner` virasse `null` um dia (copiar-colar do padrão tv),
 * TypeScript reclamaria antes do deploy — e o `.slice(0, null)` em produção não
 * zeraria o carrossel sem avisar.
 */
export const VAGAS = {
  banner: 4,
  grade: VAGAS_NA_GRADE,
  tv: null,
} as const satisfies Record<Vitrine, number | null>;

/**
 * Segundos que a TV gasta em cada carro — DERIVADO de `INTERVALO_MS`, nunca
 * redigitado.
 *
 * Era um `8` literal com um comentário admitindo que "espelha" o componente, e
 * espelho não é vínculo: no dia em que o dono pedir outro ritmo e alguém subir
 * `INTERVALO_MS` para 10000, a tela de curadoria seguiria anunciando "volta
 * completa: 48 segundos" para uma volta real de 60 — número errado na cara do
 * operador, com a suíte inteira verde, porque nada no repositório ligava os
 * dois. Importar o milissegundo faz a divergência virar impossível em vez de
 * improvável.
 *
 * A origem do import é `ritmoDaVitrine.ts`, e NÃO o componente da TV, que é
 * `"use client"`. A primeira versão desta linha lia do componente e se defendia
 * dizendo que `/vitrine/page.tsx` já fazia o mesmo com `POR_PAGINA` — mas o
 * precedente era o defeito, não a licença. Este módulo é importado por
 * `src/app/page.tsx`, a home pública, que não desenha a TV: a constante
 * atravessaria a fronteira do App Router como referência do bundler, e o
 * `NaN` sairia daqui sem erro de compilação e sem aviso em runtime. Os dois
 * consumidores de servidor foram mudados junto. 2026-09-22.
 */
const SEGUNDOS_POR_CARRO_NA_TV = INTERVALO_MS / 1000;

export type DestinoDoDestaque =
  /** Dentro do teto da sua vitrine — ou numa vitrine sem teto. */
  | "no_ar"
  /** Vivo no estoque, mas além da última vaga: marcado e invisível. */
  | "fora_do_teto"
  /** Vendido, arquivado, rascunho, sem foto, ou fora do estoque. */
  | "fora_do_ar";

export interface ItemDestacado {
  id: string;
  rotulo: string;
  preco: number | null;
  /** 1-based na lista gravada, mortos inclusive. */
  posicao: number;
  /**
   * 1-based contando SÓ os vivos — é este que a linha de corte lê.
   *
   * Existe separado de `posicao` porque cortar pela posição crua poria a régua
   * no lugar errado sempre que houvesse um morto acima dela. Na fotografia de
   * 21/09 o Titano é o 4º da lista e o 1º do banner: uma tela que mostrasse
   * "vaga 4" ao lado do primeiro slide estaria mentindo com número.
   */
  posicaoViva: number | null;
  destino: DestinoDoDestaque;
  motivoForaDoAr: string | null;
}

/**
 * Rotula um estado morto no vocabulário do operador.
 *
 * A régua de verdade é CONSULTADA, não reescrita: `estado !== "publicado"`.
 * Este mapa TRADUZ o motivo, nunca decide. Decidiria se omitisse estados — hoje
 * cobre os 4 mortos de uma união fechada de 5, mas se um 6º nascer,
 * `montarPainelDeDestaques` trataria por omissão (segurança: "fora do ar").
 * Recalcular qualquer parte da régua aqui criaria uma segunda régua para a
 * mesma pergunta — o defeito que a contagem de fotos da tabela de estoque
 * já documenta.
 */
const MOTIVO_POR_ESTADO: Partial<Record<EstadoDoVeiculo, string>> = {
  vendido: "vendido",
  arquivado: "arquivado",
  rascunho: "rascunho",
  fora_da_vitrine: "sem foto",
};

/**
 * Monta o rótulo legível da linha a partir de marca, modelo e versão já tratada.
 *
 * A deduplicação da versão com o modelo é responsabilidade de `versaoParaExibir`,
 * que foi executada ANTES desta linha entrar na projeção — aqui só se junta o que
 * já veio limpo.
 */
function rotuloDe(linha: LinhaDeEstoque): string {
  return [linha.marca, linha.modelo, linha.versao].filter(Boolean).join(" ").trim();
}

/**
 * Casa a lista gravada com o estoque e decide o destino de cada id.
 *
 * O id que não está mais no estoque NÃO é descartado: ele vira uma entrada
 * `fora_do_ar`, porque a tela precisa mostrá-lo para o operador poder limpá-lo.
 * Era justamente a invisibilidade dele que deixava 5 carros mortos entupindo a
 * lista sem ninguém ver.
 */
export function montarPainelDeDestaques(
  ids: string[],
  linhas: LinhaDeEstoque[],
  vitrine: Vitrine,
): ItemDestacado[] {
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const teto = VAGAS[vitrine];

  let vivos = 0;

  return ids.map((id, i) => {
    const linha = porId.get(id);

    if (!linha) {
      return {
        id,
        rotulo: id,
        preco: null,
        posicao: i + 1,
        posicaoViva: null,
        destino: "fora_do_ar" as const,
        motivoForaDoAr: "fora do estoque",
      };
    }

    if (linha.estado !== "publicado") {
      return {
        id,
        rotulo: rotuloDe(linha),
        preco: linha.preco,
        posicao: i + 1,
        posicaoViva: null,
        destino: "fora_do_ar" as const,
        motivoForaDoAr: MOTIVO_POR_ESTADO[linha.estado] ?? "fora do ar",
      };
    }

    vivos += 1;
    return {
      id,
      rotulo: rotuloDe(linha),
      preco: linha.preco,
      posicao: i + 1,
      posicaoViva: vivos,
      destino: teto === null || vivos <= teto ? ("no_ar" as const) : ("fora_do_teto" as const),
      motivoForaDoAr: null,
    };
  });
}

/**
 * Espelha `moverArea` de `areasDoSite.ts` — mesmo formato, mesma guarda —
 * com uma diferença que não é opcional: troca com o vizinho VISÍVEL, não
 * com o adjacente cru da lista gravada.
 *
 * ---------------------------------------------------------------------------
 * Por que `ehVisivel` é obrigatório, não um `true` por padrão
 * ---------------------------------------------------------------------------
 * A lista gravada intercala id de carro morto (vendido, arquivado...) com os
 * vivos, e a tela só DESENHA os vivos. A primeira versão trocava com o
 * adjacente cru: com `[vivoA, morto, vivoB]`, subir `vivoB` trocava ele com o
 * `morto` invisível. Sintoma medido na revisão: a tela não mudava nada (o
 * morto não aparece em lugar nenhum) e "Alteração não publicada" acendia do
 * mesmo jeito, porque o array TINHA mudado — só numa posição que ninguém via.
 * Clique sem efeito e aviso de pendência fantasma: a exata doença que esta
 * tela existe para curar, reaparecendo dentro dela mesma. Um padrão "tudo
 * visível" deixaria fácil esquecer o predicado e reintroduzir o defeito em
 * silêncio — por isso o parâmetro não tem valor default.
 *
 * Fora dos limites (já é o primeiro ou o último entre os VISÍVEIS) devolve a
 * lista INTACTA em vez de estourar — mesma guarda de sempre.
 */
export function moverDestaque(
  ids: string[],
  id: string,
  direcao: "cima" | "baixo",
  ehVisivel: (id: string) => boolean,
): string[] {
  const proximos = [...ids];
  const i = proximos.indexOf(id);
  if (i < 0) return ids;

  const passo = direcao === "cima" ? -1 : 1;
  let j = i + passo;
  while (j >= 0 && j < proximos.length && !ehVisivel(proximos[j])) {
    j += passo;
  }
  if (j < 0 || j >= proximos.length) return ids;

  [proximos[i], proximos[j]] = [proximos[j], proximos[i]];
  return proximos;
}

export function removerDestaque(ids: string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/**
 * Tira os ids que não estão vivos. Não mexe na ordem do resto.
 *
 * Limpar NÃO muda nada do que está no ar: a home e a TV já descartam estes ids
 * no `filter(Boolean)`, antes de qualquer corte. É higiene — e a tela precisa
 * dizer isso em texto, senão o botão assusta e ninguém aperta.
 */
export function limparForaDoAr(ids: string[], linhas: LinhaDeEstoque[]): string[] {
  const vivos = new Set(
    linhas.filter((l) => l.estado === "publicado").map((l) => l.id),
  );
  return ids.filter((id) => vivos.has(id));
}

/**
 * Quanto tempo a TV leva para dar uma volta completa.
 *
 * É o limite REAL da lista da TV, no lugar do teto de vagas que ela não tem:
 * rodar o pátio inteiro a `SEGUNDOS_POR_CARRO_NA_TV` por carro daria mais de
 * dez minutos, e quem passa pelo showroom não espera dez minutos para rever um
 * carro. (O número não é repetido nesta frase de propósito — ele mora em
 * `INTERVALO_MS`, e prosa com número solto envelhece sem avisar.)
 */
export function voltaCompletaEmSegundos(itens: number): number {
  return itens * SEGUNDOS_POR_CARRO_NA_TV;
}

/**
 * Os ids que a TV do showroom mostra — com a herança embutida. A CASA ÚNICA
 * dessa pergunta: quem precisar da lista da TV chama esta função.
 *
 * ---------------------------------------------------------------------------
 * Por que existe herança
 * ---------------------------------------------------------------------------
 * A TV ganhou lista própria (`vitrine_tv`) em 2026-09-22. Até ali dividia
 * `carousel_vehicles` com o banner da home, e as duas vitrines têm capacidades
 * incompatíveis: o banner corta em `VAGAS.banner`, a TV pagina a lista inteira.
 * Em produção, HOJE, a linha `vitrine_tv` ainda não existe e a
 * `carousel_vehicles` tem 9 ids (4 de carros vivos, 5 de arquivados ou
 * vendidos). Sem herança, o dia da subida apagaria a TV do showroom.
 *
 * ---------------------------------------------------------------------------
 * Por que ela é temporária
 * ---------------------------------------------------------------------------
 * A primeira publicação em `/admin/site/destaques` GRAVA `vitrine_tv`. A partir
 * daí o primeiro ramo responde para sempre e o segundo nunca mais roda. Quando
 * a linha existir em todos os ambientes, o corpo desta função vira uma leitura
 * só e a herança sai — mas ela sai de UM lugar, que é o ponto abaixo.
 *
 * ---------------------------------------------------------------------------
 * Por que ter uma casa só importa — o defeito que pagou por esta função
 * ---------------------------------------------------------------------------
 * Porque a herança já morou em um lugar quando precisava morar em três, e isso
 * custou um defeito Crítico, medido em 22/09: só `/vitrine` herdava.
 *
 * 1. A tela de curadoria lia `settings.vitrineTv` cru, mostrava a seção da TV
 *    VAZIA e afirmava em texto "Nenhum carro curado. A TV está mostrando uma
 *    página do estoque" — mentira: a TV estava mostrando os 4 curados.
 * 2. Bastava o dono mexer só no banner e clicar em "Publicar alterações". O
 *    POST levava `vitrineTv: []`, a guarda `if (vitrineTv)` da rota deixa `[]`
 *    passar (array vazio é truthy), e a linha nascia VAZIA.
 * 3. Na revalidação seguinte `/vitrine` caía em `disponiveis.slice(0,
 *    POR_PAGINA)` e a TV do showroom trocava os 4 curados pelos 6 primeiros do
 *    estoque — em silêncio, sem ninguém ter pedido. "Tirar da TV" em
 *    `/admin/estoque` sem nada marcado dava no mesmo.
 * 4. E enquanto a herança valesse, a tabela de estoque mentia por outro
 *    caminho: nenhuma linha mostrava "· na TV" e o filtro `destaque: "tv"` não
 *    devolvia nada, com 4 carros no ar pela TV.
 *
 * Com os três consumidores chamando ESTA função, a primeira publicação vira
 * no-op para a TV: a tela carrega os 4 ids herdados e publica os mesmos 4.
 * Ler `carouselVehicleIds` direto para montar lista de TV é o defeito voltando
 * — e `tests/lista-da-tv-uma-casa-so.test.ts` tranca os três arquivos contra
 * isso, justamente para ninguém reduplicar a leitura por conta própria.
 *
 * ---------------------------------------------------------------------------
 * A régua
 * ---------------------------------------------------------------------------
 * Array MANDA, mesmo vazio: lista própria vazia é decisão deliberada do
 * operador ("a TV volta a paginar o estoque"), e herdar por cima dela desfaria
 * a decisão na cara de quem a tomou. Só a AUSÊNCIA da linha — `vitrineTv` que
 * não é array — abre a herança.
 *
 * O parâmetro é o objeto de `getCachedSettings` inteiro, e não os dois campos
 * soltos: passar o objeto impede que um chamador escolha errado qual campo
 * entregar em qual posição.
 */
export function idsDaTvComHeranca(settings: {
  vitrineTv?: unknown;
  carouselVehicleIds?: unknown;
}): string[] {
  if (Array.isArray(settings.vitrineTv)) return (settings.vitrineTv as unknown[]).map(String);
  if (Array.isArray(settings.carouselVehicleIds)) {
    return (settings.carouselVehicleIds as unknown[]).map(String);
  }
  return [];
}
