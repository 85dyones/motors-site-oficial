/**
 * Onde cada guia aparece FORA do próprio corpo: no índice agrupado, nas páginas
 * comerciais e nos hubs de modelo.
 *
 * ---------------------------------------------------------------------------
 * Por que existe (auditoria de 29/09/2026)
 * ---------------------------------------------------------------------------
 * Medido no HTML servido das 182 páginas do sitemap fora de `/guias`: 22 dos
 * 26 guias não recebiam link de NENHUMA delas. Entre si os guias trocavam 143
 * links, e isso funcionava; o que faltava era a ponte com o resto do site.
 * `/avaliacao` era o destino dos 10 guias de venda e não linkava nenhum;
 * `/garantia` linkava dois guias, e nenhum dos dois era de garantia.
 *
 * O linkador (`linksNoTexto.ts`) não resolve isso sozinho: ele só liga o texto
 * que JÁ cita o assunto, e as páginas comerciais não citam guia. Aqui mora a
 * outra metade: listas curtas, escolhidas à mão, do guia que responde à
 * próxima pergunta de quem está naquela página.
 *
 * ---------------------------------------------------------------------------
 * Por que os títulos estão escritos aqui, e não lidos do banco
 * ---------------------------------------------------------------------------
 * `/avaliacao` é o funil de captação e foi desenhada para não depender do
 * banco (ver o docblock da rota). Um bloco de guias que lesse `public.guias`
 * traria para ela exatamente a falha que a rota evita. O preço é o mesmo que
 * `TERMOS_COM_DESTINO` já paga: título copiado. Quem guarda a cópia é
 * `tests/guias-no-site.test.ts`, que compara cada título com os JSON de
 * `conteudo-seo/` (a versão que está no ar, ver `GRAVACAO-2026-09-21.md`).
 *
 * O índice `/guias` é o único lugar que lê o banco, e lá o grupo vem daqui:
 * guia publicado pelo painel que ainda não está nesta lista entra em "Outros
 * guias", no fim, em vez de sumir.
 */

export type GrupoDeGuias = "procedencia" | "mecanica" | "garantia" | "venda";

export interface GrupoNoIndice {
  id: GrupoDeGuias;
  /** Vira `<h2>` no índice. */
  titulo: string;
  /** Uma frase sob o `<h2>`: do que o grupo trata. */
  resumo: string;
}

/**
 * A ordem dos grupos no índice. Procedência vem primeiro porque é o assunto
 * que só a loja pode escrever do lado de quem recusa o carro; até 29/09 ela
 * estava no FIM da lista, empurrada para baixo a cada guia novo, porque o
 * índice ordenava por data de publicação.
 */
export const GRUPOS_DE_GUIAS: readonly GrupoNoIndice[] = [
  {
    id: "procedencia",
    titulo: "Procedência e perícia cautelar",
    resumo:
      "O que a perícia cautelar examina, o que mais reprova um carro e como conferir leilão e chassi antes de comprar.",
  },
  {
    id: "mecanica",
    titulo: "Mecânica: o que checar antes de comprar",
    resumo:
      "Motor turbo pequeno, correia banhada em óleo, injeção direta e câmbio de dupla embreagem, com o roteiro de test-drive da loja.",
  },
  {
    id: "garantia",
    titulo: "Garantia e compra",
    resumo:
      "O que a garantia de loja cobre, quando a estendida compensa e o que muda entre comprar de loja e de particular.",
  },
  {
    id: "venda",
    titulo: "Vender, trocar e avaliar o seu carro",
    resumo:
      "Como a loja chega no valor do usado, o que ela assume na compra e o que cada caminho de venda pede de você.",
  },
];

export const TITULO_DE_OUTROS_GUIAS = "Outros guias";

interface GuiaConhecido {
  titulo: string;
  grupo: GrupoDeGuias;
}

/**
 * Os 26 guias publicados, na ordem em que aparecem dentro de cada grupo: o guia
 * que abre o assunto primeiro, os de detalhe depois.
 */
export const GUIAS_CONHECIDOS: Record<string, GuiaConhecido> = {
  // ---- Procedência -------------------------------------------------------
  "laudo-cautelar-carro-usado": { titulo: "Laudo cautelar: o que verifica e o que não verifica", grupo: "procedencia" },
  "o-que-reprova-pericia-cautelar": { titulo: "O que reprova um carro na perícia cautelar", grupo: "procedencia" },
  "resultados-laudo-cautelar": { titulo: "Laudo cautelar: aprovado, com apontamento ou reprovado", grupo: "procedencia" },
  "consultar-carro-leilao-sinistro": { titulo: "Como saber se um carro passou por leilão", grupo: "procedencia" },
  "chassi-remarcado": { titulo: "Chassi remarcado: quando é legal e quando é crime", grupo: "procedencia" },
  "cautelar-x-vistoria-transferencia": { titulo: "Laudo cautelar x vistoria de transferência", grupo: "procedencia" },
  "pericia-cautelar-curitiba": { titulo: "Perícia cautelar em Curitiba: onde fazer e quanto custa", grupo: "procedencia" },
  "carro-reprovado-cautelar-como-vender": { titulo: "Meu carro reprovou no laudo cautelar. E agora?", grupo: "procedencia" },

  // ---- Mecânica ----------------------------------------------------------
  "test-drive-carro-usado": { titulo: "Test-drive de carro usado: o que observar, na ordem", grupo: "mecanica" },
  "motores-turbo-usados-o-que-checar": { titulo: "Motor turbo de baixa cilindrada usado: o que checar", grupo: "mecanica" },
  "correia-dentada-banhada-em-oleo": { titulo: "Correia dentada banhada em óleo: por que ela falha", grupo: "mecanica" },
  "carbonizacao-valvulas-injecao-direta": { titulo: "Carbonização de válvulas em injeção direta", grupo: "mecanica" },
  "cambio-dupla-embreagem-usado": { titulo: "Câmbio de dupla embreagem em carro usado: o que checar", grupo: "mecanica" },

  // ---- Garantia e compra -------------------------------------------------
  "garantia-carro-usado-loja": { titulo: "Garantia de carro usado em loja: o que está coberto", grupo: "garantia" },
  "garantia-estendida-vale-a-pena": { titulo: "Garantia estendida de carro usado vale a pena?", grupo: "garantia" },
  "vicio-oculto-carro-usado": { titulo: "Vício oculto em carro usado: o que é e o que não é", grupo: "garantia" },
  "carro-de-loja-ou-particular": { titulo: "Carro de loja ou de particular: o que o preço inclui", grupo: "garantia" },

  // ---- Venda e troca -----------------------------------------------------
  "quanto-vale-meu-carro-usado": { titulo: "Quanto vale meu carro usado: como a loja chega no número", grupo: "venda" },
  "carro-na-troca": { titulo: "Carro na troca: como funciona e o que muda no preço", grupo: "venda" },
  "vender-carro-financiado": { titulo: "Carro financiado: dá para vender ou trocar?", grupo: "venda" },
  "o-que-a-loja-assume-na-compra": { titulo: "O que a loja assume quando compra o seu carro", grupo: "venda" },
  "vender-carro-curitiba": { titulo: "Onde vender carro em Curitiba e o que cada opção pede", grupo: "venda" },
  "vender-sozinho-ou-para-loja": { titulo: "Vender sozinho ou para a loja: o que muda além do preço", grupo: "venda" },
  "consignacao-de-carro": { titulo: "Consignação de carro: como funciona", grupo: "venda" },
  "documentos-para-vender-carro": { titulo: "Documentos para vender carro no Paraná, passo a passo", grupo: "venda" },
  "tabela-fipe-nao-e-preco-de-venda": { titulo: "Tabela FIPE não é preço de venda: o que ela diz", grupo: "venda" },
};

/** Um guia pronto para virar card: título, destino e uma linha de apoio. */
export interface GuiaRelacionado {
  slug: string;
  titulo: string;
  href: string;
  apoio: string;
}

function guia(slug: string, apoio: string): GuiaRelacionado {
  const conhecido = GUIAS_CONHECIDOS[slug];
  // Estourar no módulo, e não servir card sem título: o teste pega no CI, e em
  // produção a página nem chega a subir com um slug digitado errado.
  if (!conhecido) throw new Error(`Guia desconhecido em guiasNoSite: ${slug}`);
  return { slug, titulo: conhecido.titulo, href: `/guias/${slug}`, apoio };
}

/**
 * Os guias de cada página comercial.
 *
 * Duas entradas passaram por decisão do dono em 29/09/2026, e o motivo de cada
 * uma fica escrito para ninguém tirar achando que foi descuido:
 *
 *  · "Tabela FIPE não é preço de venda" em `/avaliacao`. A regra da página é
 *    que a FIPE é a única cifra: o cliente não vê valor de compra antes da
 *    vistoria, e a proposta é do consultor. Que a compra fica abaixo da FIPE
 *    o próprio formulário diz ("A compra da loja fica abaixo da FIPE…", em
 *    `AutoAvaliacao.tsx`), e o dono confirmou em 29/09/2026 que a frase fica:
 *    é a verdade do negócio e já orienta quem vai avaliar. O guia da FIPE diz
 *    o mesmo por outro caminho, como "Quanto vale meu carro usado", que já
 *    estava na lista (a avaliação parte da FIPE e tira da média).
 *  · "Vício oculto" em `/garantia`. A regra do material comercial é não
 *    explicar a garantia legal nem enumerar o escopo dela. O guia segue a
 *    regra: diz que vício oculto é conceito jurídico, manda a dúvida de
 *    direito para o Procon ou um advogado e descreve só o que a loja cobre.
 */
export const GUIAS_DA_PAGINA = {
  "/avaliacao": [
    guia("quanto-vale-meu-carro-usado", "Cada fator que entra no número, e o que fazer antes de avaliar."),
    guia("carro-na-troca", "Como o seu carro vira entrada no próximo."),
    guia("vender-carro-financiado", "A loja quita o banco, e o saldo vira entrada ou dinheiro."),
    guia("o-que-a-loja-assume-na-compra", "O que a loja resolve e o que sai do valor."),
    guia("documentos-para-vender-carro", "O que o vendedor precisa, na ordem, no Paraná."),
    guia("tabela-fipe-nao-e-preco-de-venda", "O que a tabela mede, e por que cada carro vale diferente dela."),
  ],
  "/financiamento": [
    guia("vender-carro-financiado", "Quem ainda paga o carro atual também troca: a loja quita o banco."),
    guia("carro-na-troca", "O seu usado vira entrada no próximo carro."),
  ],
  "/garantia": [
    guia("garantia-carro-usado-loja", "O que a garantia de uma loja cobre e o que fica de fora."),
    guia("garantia-estendida-vale-a-pena", "Quando o plano opcional compensa, e o que perguntar antes."),
    guia("vicio-oculto-carro-usado", "O defeito que já existia na venda: até onde a perícia alcança e o que a garantia da loja banca."),
  ],
  "/seminovos-curitiba": [
    guia("pericia-cautelar-curitiba", "Onde fazer, quanto demora e o que levar."),
    guia("vender-carro-curitiba", "Loja, consignação, anúncio ou troca: o que cada caminho pede."),
    guia("laudo-cautelar-carro-usado", "O que a perícia confere e o que fica de fora."),
  ],
  "/sobre": [
    guia("o-que-reprova-pericia-cautelar", "O levantamento por trás da seleção: 57 avaliados, 10 comprados, motivos em porcentagem."),
    guia("laudo-cautelar-carro-usado", "O exame que todo carro faz antes de entrar no estoque."),
  ],
} as const satisfies Record<string, readonly GuiaRelacionado[]>;

/**
 * Os guias de mecânica que valem para cada modelo, pela chave
 * `<slug da marca>/<slug do modelo>` do hub.
 *
 * A fonte é o TEXTO dos próprios guias, que lista quais motores e câmbios usam
 * cada tecnologia (seções "Quais motores…" e "Quais câmbios…"). Nenhum modelo
 * entrou por dedução. A linha de apoio carrega a ressalva de versão que o guia
 * faz, porque nem todo Onix tem injeção direta e nem todo HR-V é turbo.
 *
 * Chave sem hub no site hoje não custa nada: o hub que não existe não é
 * renderizado. Por isso os irmãos citados pelos guias entram junto.
 */
const TURBO = "motores-turbo-usados-o-que-checar";
const CORREIA = "correia-dentada-banhada-em-oleo";
const CARBONIZACAO = "carbonizacao-valvulas-injecao-direta";
const DUPLA = "cambio-dupla-embreagem-usado";

const TSI = [
  guia(TURBO, "Nas versões TSI."),
  guia(CARBONIZACAO, "Nas versões TSI, que têm injeção direta."),
];
const CHEVROLET_TRES_CILINDROS = [
  guia(CORREIA, "Os três-cilindros da Chevrolet usam essa correia desde o fim de 2019."),
  guia(TURBO, "Nas versões turbo."),
  guia(CARBONIZACAO, "Nos turbo da linha 2025 em diante; os turbo anteriores são de injeção indireta."),
];
const FIREFLY_TURBO = [
  guia(TURBO, "Nas versões com motor T200 ou T270."),
  guia(CARBONIZACAO, "Nas versões com motor T200 ou T270, que têm injeção direta."),
];
const TCE = (motor: string) => [
  guia(TURBO, `Nas versões ${motor}.`),
  guia(CARBONIZACAO, `Nas versões ${motor}, que têm injeção direta.`),
];

export const GUIAS_POR_MODELO: Record<string, GuiaRelacionado[]> = {
  "chevrolet/onix": CHEVROLET_TRES_CILINDROS,
  "chevrolet/onix-plus": CHEVROLET_TRES_CILINDROS,
  "chevrolet/tracker": CHEVROLET_TRES_CILINDROS,
  "chevrolet/montana": CHEVROLET_TRES_CILINDROS,

  "ford/ka": [guia(CORREIA, "No 1.5 Dragon de três cilindros, de 2017 em diante.")],
  "ford/ecosport": [
    guia(CORREIA, "No 1.5 Dragon de três cilindros, de 2017 em diante."),
    guia(DUPLA, "No 2.0 com câmbio PowerShift."),
  ],
  "ford/fiesta": [
    guia(CORREIA, "No 1.0 EcoBoost do New Fiesta."),
    guia(TURBO, "No 1.0 EcoBoost do New Fiesta."),
    guia(DUPLA, "Nas versões com câmbio PowerShift."),
  ],
  "ford/focus": [guia(DUPLA, "Nas versões com câmbio PowerShift.")],

  "peugeot/208": [
    guia(CORREIA, "No 1.2 PureTech."),
    ...FIREFLY_TURBO,
  ],
  "peugeot/2008": [
    guia(CORREIA, "No 1.2 PureTech."),
    guia(TURBO, "Nas versões com 1.6 THP, T200 ou T270."),
    guia(CARBONIZACAO, "Nas versões com 1.6 THP, T200 ou T270, que têm injeção direta."),
  ],
  "citroen/c3": [
    guia(CORREIA, "No 1.2 PureTech."),
    ...FIREFLY_TURBO,
  ],

  "volkswagen/polo": TSI,
  "volkswagen/virtus": TSI,
  "volkswagen/t-cross": TSI,
  "volkswagen/nivus": TSI,
  "volkswagen/taos": [TSI[0]],
  "volkswagen/golf": [
    ...TSI,
    guia(DUPLA, "No Golf 1.4 TSI com câmbio DSG."),
  ],
  "volkswagen/jetta": [guia(CARBONIZACAO, "Nas versões TSI, que têm injeção direta.")],
  "volkswagen/tiguan": [guia(DUPLA, "No Tiguan Allspace, com DSG banhado em óleo.")],

  "fiat/pulse": FIREFLY_TURBO,
  "fiat/fastback": FIREFLY_TURBO,
  "fiat/strada": FIREFLY_TURBO,
  "fiat/toro": FIREFLY_TURBO,
  "jeep/renegade": FIREFLY_TURBO,
  "jeep/compass": FIREFLY_TURBO,
  "jeep/commander": FIREFLY_TURBO,

  "hyundai/hb20": [
    guia(TURBO, "Nas versões 1.0 TGDI."),
    guia(CARBONIZACAO, "Nas versões 1.0 TGDI, que têm injeção direta."),
  ],
  "hyundai/hb20s": [
    guia(TURBO, "Nas versões 1.0 TGDI."),
    guia(CARBONIZACAO, "Nas versões 1.0 TGDI, que têm injeção direta."),
  ],
  "hyundai/creta": [
    guia(TURBO, "Nas versões 1.0 TGDI."),
    guia(CARBONIZACAO, "Nas versões 1.0 TGDI, que têm injeção direta."),
    guia(DUPLA, "Na geração nova, com o 1.6 turbo."),
  ],
  "hyundai/tucson": [guia(DUPLA, "No 1.6 turbo.")],

  "renault/kardian": [
    ...TCE("1.0 TCe"),
    guia(DUPLA, "Nas versões com câmbio EDC."),
  ],
  "renault/captur": TCE("1.3 TCe"),
  "renault/duster": TCE("1.3 TCe"),
  "renault/oroch": TCE("1.3 TCe"),

  "honda/hr-v": [
    guia(TURBO, "Só nas versões Advance e Touring; EX e EXL são aspiradas."),
    guia(CARBONIZACAO, "No 1.5 turbo das versões Advance e Touring."),
  ],
  "honda/civic": [
    guia(TURBO, "No 1.5 turbo da geração passada."),
    guia(CARBONIZACAO, "No 1.5 turbo da geração passada."),
  ],

  "mercedes-benz/classe-a": [guia(DUPLA, "O Classe A usa o 7G-DCT.")],
};

/** Os guias de mecânica de um hub de modelo; lista vazia quando não há. */
export function guiasDoModelo(slugMarca: string, slugModelo: string): GuiaRelacionado[] {
  return GUIAS_POR_MODELO[`${slugMarca}/${slugModelo}`] ?? [];
}

/** O grupo de um guia publicado; `null` = guia que o índice põe em "Outros guias". */
export function grupoDoGuia(slug: string): GrupoDeGuias | null {
  return GUIAS_CONHECIDOS[slug]?.grupo ?? null;
}

/**
 * Os guias publicados arrumados em grupos, na ordem de `GRUPOS_DE_GUIAS` e,
 * dentro de cada um, na ordem de `GUIAS_CONHECIDOS`. O que o painel publicou e
 * esta lista ainda não conhece fecha o índice, na ordem em que chegou.
 */
export function agruparGuias<T extends { slug: string }>(
  guias: readonly T[],
): { titulo: string; resumo?: string; guias: T[] }[] {
  const ordem = Object.keys(GUIAS_CONHECIDOS);
  const grupos = GRUPOS_DE_GUIAS.map((g) => ({
    titulo: g.titulo,
    resumo: g.resumo,
    guias: guias
      .filter((x) => grupoDoGuia(x.slug) === g.id)
      .sort((a, b) => ordem.indexOf(a.slug) - ordem.indexOf(b.slug)),
  }));
  const outros = guias.filter((x) => grupoDoGuia(x.slug) === null);
  return [
    ...grupos,
    { titulo: TITULO_DE_OUTROS_GUIAS, guias: outros },
  ].filter((g) => g.guias.length > 0);
}
