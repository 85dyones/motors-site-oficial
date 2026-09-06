import type { CompanySettings, Veiculo } from "../types";
import { precoVigente } from "./regrasEstoque";
import { SITE_URL } from "./site";

/**
 * O `AutoDealer` da Motors Store — um só, com identidade estável.
 *
 * Nasceu dentro de `src/app/page.tsx`, onde só a home o emitia. O plano de
 * aquisição (§0.5.5 itens 6 e 7, §2.2.4a) pede três coisas que a versão de lá
 * não tinha:
 *
 *   1. um `@id`, sem o qual nada pode REFERENCIAR a loja — é por ele que a
 *      oferta de cada veículo passa a dizer quem vende e onde se retira;
 *   2. presença fora da home (ficha, hubs, páginas de bairro);
 *   3. os campos que sustentam SEO local: `geo`, `priceRange`, `areaServed`,
 *      `paymentAccepted`.
 *
 * ---------------------------------------------------------------------------
 * Uma loja, um `@id`
 * ---------------------------------------------------------------------------
 * O plano previa duas unidades (Ernesto Piazzetta e Rua Canadá). O dono
 * confirmou em 2026-08-25 que a operação é **uma só**, na Ernesto Piazzetta —
 * a Rua Canadá é cadastro velho em portal, e o caminho é corrigir a citação lá,
 * não criar uma segunda unidade aqui. Por isso `@id` é único e sem sufixo: se
 * um dia houver filial de verdade, o `#dealer` da matriz continua válido e a
 * filial nasce com `@id` próprio, sem reescrever o que já está indexado.
 */

/** O identificador da loja no grafo. Estável — não mudar sem motivo forte. */
export const ID_DA_LOJA = `${SITE_URL}/#dealer`;

/** Referência à loja para usar dentro de outro nó (`seller`, `availableAtOrFrom`). */
export const REFERENCIA_DA_LOJA = { "@id": ID_DA_LOJA } as const;

/**
 * Perfis oficiais da loja fora do site.
 *
 * `sameAs` é como se diz ao Google "estes perfis e este site são a mesma
 * empresa" — é o que consolida a entidade e transporta reputação de portal
 * para o pacote local. Instagram e Facebook saem das configurações (o dono
 * edita no painel); os portais ficam aqui porque não têm campo próprio.
 *
 * ⚠️ O perfil do Mobiauto ainda exibia o endereço antigo (Rua Canadá) na
 * auditoria de 24/08/2026. Declará-lo aqui está certo — é a mesma empresa —
 * mas a correção do NAP naquele cadastro é tarefa da operação, não do código.
 */
export const PERFIS_EM_PORTAIS = [
  "https://www.chavesnamao.com.br/revenda/motors-store/pr-curitiba/id-292906/",
  "https://www.mobiauto.com.br/comprar/estoque/motors-store-69363",
];

/**
 * O lugar da loja no Google — um identificador, duas URLs, dois usos.
 *
 * A ficha do Perfil da Empresa é o que carrega as avaliações e responde no
 * pacote local. Até 2026-09-04 o site não a citava em lugar nenhum: nem
 * `sameAs`, nem `hasMap`, nem link no endereço do rodapé. Sem citação, o
 * buscador não tem por onde juntar as duas coisas.
 *
 * ---------------------------------------------------------------------------
 * De onde saíram os identificadores
 * ---------------------------------------------------------------------------
 * O dono mandou o link de compartilhamento (`share.google/…`), que redireciona
 * para uma URL de BUSCA com `kgmid=/g/11kc2q4gmp`. Nenhuma das duas serve:
 * encurtador é opaco e some sem aviso, e URL de busca não é a página da
 * entidade.
 *
 * O que serve sai do `ftid` que o Maps publica na URL do lugar,
 * `0x94dce75dbdaa40bf:0x579b5ba0d1b9e4aa`:
 *
 *  - a segunda metade em decimal é o CID, `6312740048961397930`;
 *  - o `place_id` abaixo decodifica (base64url) para as MESMAS duas metades em
 *    little-endian — `bf40aabd5de7dc94` e `aae4b9d1a05b9b57`. Conferido, não
 *    copiado: é o mesmo feature por dois caminhos.
 *
 * O Google documenta que `place_id` pode mudar; o `ftid`/CID não. Por isso a
 * URL canônica da ficha usa `?cid=`, e o `place_id` fica para onde a API do
 * Maps o exige. A forma `www.google.com/maps?cid=` responde 200 direto —
 * `maps.google.com/?cid=` faz um salto de redirecionamento antes, e declarar o
 * atalho em vez do endereço é o tipo de coisa que envelhece mal.
 *
 * ---------------------------------------------------------------------------
 * Duas URLs do Maps no repositório, de propósito
 * ---------------------------------------------------------------------------
 * `components/LinkComoChegar.tsx` usa `maps/dir/?api=1&destination=…`, que é
 * ROTA — leva de onde a pessoa está até aqui, abre o app no celular, e dispara
 * `click_directions`. Isto aqui é o LUGAR — a ficha, com mapa, avaliações e
 * horário. São propósitos diferentes e as duas formas continuam existindo; o
 * que não podia continuar era cada uma identificar a loja do seu jeito. Desde
 * 04/09 a rota também é fixada por `destination_place_id`, com o `place_id`
 * daqui, em vez de depender do geocode do endereço em texto.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ Duas divergências de NAP no perfil
 * ---------------------------------------------------------------------------
 * Medidas em 2026-09-04. As duas são tarefa da operação, não do código, e a
 * segunda é grave:
 *
 *  - o telefone lá é (41) 99842-6127, que é o número que o SITE aposentou em
 *    2026-08-25 (a nota está em `components/Footer.tsx`). O site hoje publica
 *    +55 41 99737-2165.
 *  - o campo "site" do perfil aponta para `motorsstoreoficial.com.br`, que
 *    resolve DNS mas não responde em HTTPS (25s de timeout). O botão "Site"
 *    da ficha não leva a lugar nenhum, e é justamente esse campo que o Google
 *    usa para ligar o perfil ao domínio. Enquanto ele não apontar para
 *    `motorsstore.com.br`, o elo que este arquivo declara não fecha do outro
 *    lado.
 */
export const PERFIL_NO_GOOGLE = "https://www.google.com/maps?cid=6312740048961397930";

/** O mesmo lugar no formato que a API do Maps consome. Ver a nota acima. */
export const PLACE_ID_NO_GOOGLE = "ChIJv0CqvV3n3JQRquS50aBbm1c";

/**
 * As cidades que a loja atende de fato.
 *
 * Curitiba mais a Região Metropolitana de onde o comprador se desloca — o
 * mapa competitivo do §1.5. Não é promessa de entrega nacional: é o raio em
 * que a loja compete, e é o que o `areaServed` significa.
 */
export const CIDADES_ATENDIDAS = [
  "Curitiba",
  "Pinhais",
  "Colombo",
  "São José dos Pinhais",
  "Almirante Tamandaré",
  "Araucária",
];

/**
 * O endereço da loja em `PostalAddress`, derivado do endereço em vigor — o
 * mesmo que alimenta o rodapé e a ficha impressa.
 *
 * Até 2026-08-06 o schema declarava "Av. Europa, 1000, São Paulo-SP" e um
 * telefone fictício: a loja é em Curitiba. O Google recebia um NAP que
 * contradizia o rodapé, o que anula SEO local e derruba a confiança no
 * structured data do domínio inteiro. Derivar da mesma fonte impede a
 * divergência de voltar.
 *
 * Falha segura: endereço parcial é pior que endereço nenhum. Se alguém
 * reescrever o campo no painel num formato que este parse não entenda,
 * preferimos omitir a publicar truncado.
 */
export function enderecoDoSchema(endereco: string) {
  // Formato esperado, o que o painel grava hoje:
  // "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350"
  //  └─ logradouro ──────┘   └ bairro ┘  └ cidade ┘  └UF┘ └─ CEP ─┘
  const bruto = (endereco || "").trim();

  const logradouro = bruto.split(" - ")[0]?.trim() || "";
  const miolo = bruto.split(" - ")[1] || "";
  const bairro = miolo.split(",")[0]?.trim() || "";
  const cidade = miolo.split(",")[1]?.trim() || "";
  const uf = (bruto.match(/\b([A-Z]{2})\b(?=\s*,|\s*\d{5})/) || [])[1] || "";
  const cep = (bruto.match(/\d{5}-?\d{3}/) || [""])[0];

  if (!logradouro || !cidade || !uf) return undefined;

  return {
    "@type": "PostalAddress",
    streetAddress: [logradouro, bairro].filter(Boolean).join(" - "),
    addressLocality: cidade,
    addressRegion: uf,
    postalCode: cep || undefined,
    addressCountry: "BR",
  };
}

/**
 * `priceRange` a partir do estoque real, não de uma fileira de cifrões.
 *
 * O schema.org aceita texto livre, e o exemplo que circula em playbook é
 * `"R$$$$"` — um chute sobre quão cara é a loja. A faixa medida é verificável
 * e diz mais: quem lê "R$ 23.900 - R$ 318.900" entende que a loja opera do
 * carro de entrada ao topo da praça — e que o mesmo filtro vale nos dois
 * extremos, que é o posicionamento real (`conteudo-seo/POSICIONAMENTO.md`).
 *
 * Sem estoque, devolve `undefined` — campo ausente em vez de faixa inventada.
 */
export function faixaDePreco(disponiveis: Pick<Veiculo, "preco_original" | "preco_promocional">[]): string | undefined {
  const precos = (disponiveis ?? [])
    .map(precoVigente)
    .filter((p) => Number.isFinite(p) && p > 0);

  if (precos.length === 0) return undefined;

  const formatar = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return `${formatar(Math.min(...precos))} - ${formatar(Math.max(...precos))}`;
}

/**
 * Coordenadas da loja, só quando o painel as tem.
 *
 * Divergência entre `geo`, o pin do Perfil da Empresa e o endereço textual é
 * sinal negativo de SEO local — pior que não declarar. Enquanto o dono não
 * colar as coordenadas reais do Maps em "Dados da concessionária", o campo
 * simplesmente não sai.
 */
function geoDoSchema(empresa: Pick<CompanySettings, "latitude" | "longitude">) {
  const lat = Number(empresa.latitude);
  const lon = Number(empresa.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return undefined;
  }
  return { "@type": "GeoCoordinates", latitude: lat, longitude: lon };
}

export interface OpcoesDoSchemaDaLoja {
  /** Estoque disponível, só para calcular a faixa de preço. Opcional. */
  disponiveis?: Pick<Veiculo, "preco_original" | "preco_promocional">[];
}

/**
 * O nó completo da loja. Emitido na home, nas páginas de bairro e nos hubs;
 * a ficha do veículo referencia por `@id` em vez de repetir o bloco.
 */
export function schemaDaLoja(empresa: CompanySettings, opcoes: OpcoesDoSchemaDaLoja = {}) {
  /**
   * `empresa` chega `null` mais vezes do que o tipo admite, e derrubava a
   * página.
   *
   * `getCachedSettings` nunca rejeita — engole a falha e segue —, mas devolve
   * `companySettings: null` quando `site_settings` tem linhas e nenhuma com
   * `id='company'`: nesse caminho o fallback do JSON local é pulado, porque a
   * leitura do banco "deu certo". Aí `empresa.name` estoura, e o que cai não é
   * o schema: é a rota inteira.
   *
   * Achado pela revisão da F2, que renderizou `/carro-perfeito` com settings
   * nula e recebeu `TypeError`. A F2 espalhou o risco de duas rotas para seis
   * ao levar o nó para `/sobre`, `/contato`, `/carro-perfeito` e
   * `/destaques/[tag]` — a guarda mora aqui, e não em cada chamador, porque é
   * uma linha que fecha para todos.
   *
   * Campo ausente é o comportamento certo: `JSON.stringify` descarta
   * `undefined`, então o nó sai menor em vez de a página sair 500.
   */
  const dados = empresa ?? ({} as CompanySettings);
  const preco = faixaDePreco(opcoes.disponiveis ?? []);

  return {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    "@id": ID_DA_LOJA,
    name: dados.name,
    image: `${SITE_URL}/logo.png`,
    logo: `${SITE_URL}/logo.png`,
    url: SITE_URL,
    // `whatsappRaw` é o número da loja em formato discável, o mesmo que
    // alimenta todo botão de WhatsApp do site (`lib/whatsapp.ts`).
    telephone: dados.whatsappRaw ? `+${dados.whatsappRaw}` : undefined,
    address: enderecoDoSchema(dados.address),
    geo: geoDoSchema(dados),
    // A ficha do Google como mapa do lugar. `geo` continua saindo do painel e
    // continua ausente enquanto ele não tiver as coordenadas — as duas coisas
    // são independentes de propósito: `hasMap` aponta para o pin oficial,
    // `geo` afirma um par de números nosso, e afirmar um que diverge do pin é
    // pior que não afirmar nenhum.
    hasMap: PERFIL_NO_GOOGLE,
    priceRange: preco,
    currenciesAccepted: "BRL",
    paymentAccepted: "Dinheiro, Cartão de Crédito, Financiamento, Consórcio, Troca",
    areaServed: CIDADES_ATENDIDAS.map((name) => ({ "@type": "City", name })),
    sameAs: [
      dados.instagram,
      dados.facebook,
      PERFIL_NO_GOOGLE,
      ...PERFIS_EM_PORTAIS,
    ].filter(Boolean),
    // Horário real da loja: Seg-Sex 08h30-18h30, Sáb 08h30-15h.
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "08:30",
        closes: "18:30",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Saturday"],
        opens: "08:30",
        closes: "15:00",
      },
    ],
  };
}

/* ────────────────────────────────────────────────────────────────────────
   O site como entidade — `WebSite`
   ──────────────────────────────────────────────────────────────────────── */

/** O identificador do site no grafo. Estável, como o `#dealer`. */
export const ID_DO_SITE = `${SITE_URL}/#website`;

/** Referência ao site para usar em `isPartOf`. */
export const REFERENCIA_DO_SITE = { "@id": ID_DO_SITE } as const;

/**
 * O nó `WebSite`, e por que ele não é enfeite.
 *
 * Sozinho não gera rich result nenhum — nem tenta. O trabalho dele é dizer que
 * este domínio é UMA coisa, publicada por UMA empresa: sem ele, o `AutoDealer`
 * e as ~150 páginas são nós soltos que um consumidor precisa adivinhar que se
 * relacionam. É o que sustenta desambiguação de marca, e a Motors Store tem
 * esse problema de verdade — colide com "Usa Motors" e "ACX Motors", e o
 * relatório de visibilidade em IA de 05/09 mediu o resultado: nas buscas de
 * marca quem responde são os agregadores, com dados velhos, e o site próprio
 * não aparece.
 *
 * `publisher` aponta para o `#dealer` por `@id` em vez de repetir o bloco. É a
 * mesma disciplina da ficha: um nó, um lugar, e as referências apontam para ele
 * — bloco duplicado é duas versões que envelhecem em ritmos diferentes.
 *
 * ---------------------------------------------------------------------------
 * `potentialAction` fica de fora, e a razão mudou
 * ---------------------------------------------------------------------------
 * O playbook manda declarar um `SearchAction` com `/estoque?q={termo}`. A
 * objeção conhecida era que a busca do catálogo seria client-side, sem URL — e
 * ela **não procede**: `Catalogo` lê `searchParams.get("q")` e abre já filtrado.
 * A URL existe e funciona.
 *
 * O motivo de não declarar é outro, e é sobre o que a declaração PROMETE. O
 * `SearchAction` diz "este site tem uma página de resultados de busca em tal
 * endereço". `Catalogo` usa o `q` como valor INICIAL de um estado de cliente:
 * quem chega sem JavaScript — que é a condição de quem lê o HTML servido —
 * recebe os **nove** cards do fallback do `<Suspense>` (`PRIMEIRA_LEVA`), a
 * mesma primeira leva de sempre, e não o resultado da busca. Declarar seria
 * descrever um comportamento que só existe depois da hidratação.
 *
 * (Uma versão anterior dizia "a grade inteira" no lugar dos nove. O argumento
 * não dependia do número — o servidor ignora o `q` de qualquer jeito —, mas o
 * fato citado estava errado, e ficou errado por mais uma rodada porque a
 * correção foi anexada aqui embaixo em vez de aplicada na frase acima.)
 *
 * Some-se a isso que o Google descontinuou a sitelinks searchbox: o campo não
 * rende nada hoje, e o pouco que renderia não vale afirmar o que não se cumpre.
 * Quando a busca escrever na URL e o servidor devolver o recorte, entra aqui.
 */
export function schemaDoSite(empresa: Pick<CompanySettings, "name"> | null | undefined) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": ID_DO_SITE,
    url: SITE_URL,
    // Mesma guarda de `schemaDaLoja`, pelo mesmo motivo: `companySettings`
    // chega `null` quando `site_settings` existe sem a linha `id='company'`, e
    // `empresa.name` derrubava a rota inteira. Campo ausente, não página 500.
    name: empresa?.name,
    inLanguage: "pt-BR",
    publisher: REFERENCIA_DA_LOJA,
  };
}
