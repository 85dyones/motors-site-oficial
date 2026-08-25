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
  const preco = faixaDePreco(opcoes.disponiveis ?? []);

  return {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    "@id": ID_DA_LOJA,
    name: empresa.name,
    image: `${SITE_URL}/logo.png`,
    logo: `${SITE_URL}/logo.png`,
    url: SITE_URL,
    // `whatsappRaw` é o número da loja em formato discável, o mesmo que
    // alimenta todo botão de WhatsApp do site (`lib/whatsapp.ts`).
    telephone: empresa.whatsappRaw ? `+${empresa.whatsappRaw}` : undefined,
    address: enderecoDoSchema(empresa.address),
    geo: geoDoSchema(empresa),
    priceRange: preco,
    currenciesAccepted: "BRL",
    paymentAccepted: "Dinheiro, Cartão de Crédito, Financiamento, Consórcio, Troca",
    areaServed: CIDADES_ATENDIDAS.map((name) => ({ "@type": "City", name })),
    sameAs: [empresa.instagram, empresa.facebook, ...PERFIS_EM_PORTAIS].filter(Boolean),
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
