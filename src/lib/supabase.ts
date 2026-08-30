import { createClient } from "@supabase/supabase-js";
import { limparModelo, segmentoDoVeiculo, slugificar } from "./veiculoUrl";
import { perfisDoValorAntigo, perfisValidos } from "./perfisDeUso";
import { publicavel } from "./coerenciaDoCadastro";
import type { Veiculo } from "../types";
export type { Veiculo };

// 1. Supabase credentials from .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// 2. Safe initialization of Supabase client
const isSupabaseConfigured = supabaseUrl !== "" && supabaseAnonKey !== "";

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// 3. High-Fidelity Mock Fallback Data (Enables perfect client demonstration if Supabase variables are missing)
const MOCK_ESTOQUE: Veiculo[] = [
  {
    id: "porsche-911-carrera-s-2023",
    marca: "Porsche",
    modelo: "911 Carrera S",
    versao: "3.0 PDK Cabriolet",
    ano: 2023,
    quilometragem: 8500,
    cambio: "Automático PDK",
    combustivel: "Gasolina",
    cor: "Cinza Nardo",
    fipe: "R$ 1.050.000",
    preco_original: 1050000,
    preco_promocional: 998000,
    pericia: "Cautelar 100% Aprovada",
    whatsapp_images: [
      "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1611245801314-e0c5fd92237e?auto=format&fit=crop&w=800&q=80"
    ],
    web_full_images: [
      "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1611245801314-e0c5fd92237e?auto=format&fit=crop&w=800&q=80"
    ],
    opcionais: "Teto Solar Conversível Elétrico, Sistema de Som Burmester High-End, Interior em Couro Bicolor Club, Faróis LED Matrix com PDLS Plus, Eixo Traseiro Direcional, Escapamento Esportivo Ativo com Seletor, Rodas RS Spyder Design de 20/21 Polegadas.",
    laudo_pericia: "Laudo cautelar 100% aprovado pela SuperVisão. Pintura 100% original, sem retoques. Todas as revisões realizadas pontualmente na concessionária Eurobike. Garantia de fábrica ativa até julho de 2026."
  },
  {
    id: "land-rover-defender-110-2022",
    marca: "Land Rover",
    modelo: "Defender 110",
    versao: "3.0 D300 MHEV HSE Luxury",
    ano: 2022,
    quilometragem: 24500,
    cambio: "Automático ZF8",
    combustivel: "Diesel (Híbrido Leve)",
    cor: "Preto Santorini",
    fipe: "R$ 610.000",
    preco_original: 620000,
    preco_promocional: 589900,
    pericia: "Laudo Cautelar Aprovado",
    whatsapp_images: [
      "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1506015391300-4802dc74de2e?auto=format&fit=crop&w=800&q=80"
    ],
    web_full_images: [
      "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1506015391300-4802dc74de2e?auto=format&fit=crop&w=800&q=80"
    ],
    opcionais: "Suspensão Pneumática Adaptativa com Controle de Altura, Teto Solar Panorâmico com Abertura, Central Meridian Surround 700W, Câmera 3D de 360 Graus, Geladeira no Console Central, Pacote de Assistência ao Condutor Ativo, Engate de Reboque Elétrico.",
    laudo_pericia: "Estrutural impecável, sem retoques. Laudo cautelar pericial aprovado sem apontamentos. Todas as revisões efetuadas em concessionária Land Rover. Único dono."
  },
  {
    id: "byd-dolphin-gs-2024",
    marca: "BYD",
    modelo: "Dolphin",
    versao: "GS EV Premium",
    ano: 2024,
    quilometragem: 3100,
    cambio: "Automático",
    combustivel: "Elétrico",
    cor: "Cinza Dolphin",
    fipe: "R$ 149.800",
    preco_original: 149800,
    preco_promocional: 0, // No promotion active
    pericia: "Laudo 100% Livre",
    whatsapp_images: [
      "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80"
    ],
    web_full_images: [
      "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80"
    ],
    opcionais: "Central Multimídia Rotativa Inteligente de 12.8\", Assistente de Direção Inteligente Nível 2 (ADAS), Carregador Celular Wireless por Indução, Faróis Full LED, Sistema V2L de fornecimento de energia externa, Controle por Aplicativo Celular.",
    laudo_pericia: "Veículo em estado de novo. Laudo pericial cautelar sem qualquer apontamento, pintura original e sem detalhes estéticos. IPVA integral pago. Garantia de bateria de 8 anos da BYD."
  },
  {
    id: "bmw-x5-m-sport-2023",
    marca: "BMW",
    modelo: "X5",
    versao: "3.0 TwinPower M Sport Híbrido",
    ano: 2023,
    quilometragem: 14200,
    cambio: "Automático ZF8",
    combustivel: "Híbrido (Gasolina/Elétrico)",
    cor: "Branco Mineral",
    fipe: "R$ 685.000",
    preco_original: 689000,
    preco_promocional: 659900,
    pericia: "Cautelar Aprovada",
    whatsapp_images: [
      "https://images.unsplash.com/photo-1552215695-3004980ad54e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1607853202273-797f1c22a38e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80"
    ],
    web_full_images: [
      "https://images.unsplash.com/photo-1552215695-3004980ad54e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1607853202273-797f1c22a38e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80"
    ],
    opcionais: "BMW Laserlight, Teto Solar Panorâmico Sky Lounge com LEDs Integrados, Fechamento de Portas por Sucção Pneumática, Ar Condicionado Automático Quadri-Zone, Pacote Aerodinâmico e Suspensão M Sport, Sistema de Som Harman Kardon Surround.",
    laudo_pericia: "Laudo pericial cautelar 100% aprovado sem observações. Único dono, IPVA 2026 pago, revisões feitas por tempo na concessionária BMW Autostar."
  },
  {
    id: "toyota-hilux-srx-2023",
    marca: "Toyota",
    modelo: "Hilux",
    versao: "2.8 D-4D Turbo Diesel SRX Automatic",
    ano: 2023,
    quilometragem: 18500,
    cambio: "Automático 6m",
    combustivel: "Diesel",
    cor: "Prata Metalizado",
    fipe: "R$ 290.000",
    preco_original: 295000,
    preco_promocional: 279900,
    pericia: "Cautelar 100% Aprovada",
    whatsapp_images: [
      "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80"
    ],
    web_full_images: [
      "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80"
    ],
    opcionais: "Tração 4x4 Ativa com Reduzida, Santantônio Integrado Linha Premium, Central Multimídia JBL de 9\" com GPS e Wi-Fi, Rodas de Liga Leve de 18 Polegadas, Faróis de LED Ativos, Protetor de Caçamba Reforçado, Capota Marítima Premium.",
    laudo_pericia: "Inspeção e perícia cautelar aprovadas com nota máxima. Sem passagem por sinistros ou leilões. Todas as revisões registradas na concessionária Toyota."
  }
];

const formatCambio = (c: string): string => {
  if (!c) return "Automático";
  const val = c.toLowerCase().trim();
  if (val.includes("manual")) return "Manual";
  if (val.includes("automatico") || val.includes("automático") || val.includes("automatic") || val.includes("pdk") || val.includes("zf8") || val.includes("aut")) {
    if (val.includes("pdk")) return "Automático PDK";
    if (val.includes("zf8")) return "Automático ZF8";
    if (val.includes("cvt")) return "Automático CVT";
    return "Automático";
  }
  return c.charAt(0).toUpperCase() + c.slice(1);
};

const formatCombustivel = (c: string): string => {
  if (!c) return "Flex";
  const val = c.toLowerCase().trim();
  if (val.includes("gasolina") || val.includes("gasoline") || val.includes("petrol")) return "Gasolina";
  if (val.includes("diesel")) return "Diesel";
  if (val.includes("flex")) return "Flex";
  if (val.includes("eletrico") || val.includes("elétrico") || val.includes("ev")) return "Elétrico";
  if (val.includes("hibrido") || val.includes("híbrido") || val.includes("mhev")) return "Híbrido";
  return c.charAt(0).toUpperCase() + c.slice(1);
};

/**
 * Status de perícia do veículo, a partir do campo `pericia` do feed.
 *
 * Só aprova com afirmação EXPLÍCITA de aprovação, e nunca quando há negação
 * junto. A versão anterior aprovava se o texto contivesse "cautelar", "ok" ou
 * "100%" — bastava um "cautelar reprovada" ou "laudo cautelar pendente" no
 * feed para o site estampar selo verde de perícia aprovada num carro reprovado.
 * Também aprovava por presença de `laudo_pericia`, texto livre que hoje é o
 * default promocional do mapper: aprovação por conteúdo de marketing.
 *
 * Valores reais em produção (2026-08-06): "Aprovado" e "Em análise".
 */
const formatPericia = (p: string): string => {
  const val = (p || "").toLowerCase().trim();
  if (!val) return "EM ANÁLISE";

  const nega = /\b(nao|não|sem|reprovad|pendent|negad|indeferid)\b/.test(val);
  if (!nega && /aprovad/.test(val)) return "PERÍCIA APROVADA";
  if (/analise|análise/.test(val)) return "EM ANÁLISE";

  return p.toUpperCase();
};

/**
 * Maps a database row from the live `estoque_motors` table to the visual frontend interface `Veiculo`.
 */
export function mapVeiculoDbToVeiculo(dbItem: any): Veiculo {
  if (!dbItem) {
    throw new Error("Cannot map empty database item");
  }

  // Capitalization helper for consistent visual display
  const capitalizeWords = (str: string): string => {
    if (!str) return "";
    return str
      .split(" ")
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ""))
      .filter(Boolean)
      .join(" ");
  };

  const formatBrand = (brand: string): string => {
    if (!brand) return "Sem Marca";
    const b = brand.trim().toUpperCase();
    if (b === "BMW" || b === "BYD" || b === "GWM" || b === "GM") return b;
    return capitalizeWords(brand.trim());
  };

  // Use array of images from S3 if present, otherwise fallback to url_imagem
  const whatsappImgs = Array.isArray(dbItem.whatsapp_images) && dbItem.whatsapp_images.length > 0
    ? dbItem.whatsapp_images
    : (dbItem.url_imagem ? [dbItem.url_imagem] : ["/logo.png"]);

  const webFullImgs = Array.isArray(dbItem.web_full_images) && dbItem.web_full_images.length > 0
    ? dbItem.web_full_images
    : (dbItem.url_imagem ? [dbItem.url_imagem] : ["/logo.png"]);

  const precoOriginal = typeof dbItem.preco_original === "number" ? dbItem.preco_original : (typeof dbItem.preco === "number" ? dbItem.preco : 0);
  const precoPromocional = typeof dbItem.preco_promocional === "number" ? dbItem.preco_promocional : 0;

  // Modelo e versão — o override do painel vence o feed.
  //
  // Aqui, e só aqui: daí para cima ninguém sabe que o override existe. A URL
  // da ficha, os hubs de marca e modelo, o feed XML e o JSON-LD recebem o
  // objeto já resolvido, e por isso concordam entre si sem combinar nada.
  //
  // O que isso conserta (medido no sitemap de 2026-08-26): quatro modelos
  // chegaram do feed com a VERSÃO inteira na coluna `modelo`, e cada um gerou
  // um hub próprio — `/carros/ford/ka-sedan-10-se-flex-4p` disputando com
  // `/carros/ford/ka`, que por isso listava dois dos três Ka.
  //
  // Texto em branco não conta como override: string vazia gravada sem querer
  // apagaria o nome do modelo do site inteiro.
  const comOverride = (override: unknown, doFeed: string): string => {
    const escrito = typeof override === "string" ? override.trim() : "";
    return escrito || doFeed;
  };

  // Carroceria — só o que o feed traz.
  //
  // Até 2026-08-06 este resolvedor caía numa cadeia de `modelo.includes()`
  // quando `tipo` vinha vazio ("hilux" → Picape, "compass" → SUV, "corolla" →
  // Sedan) e, sem nenhum match, devolvia o literal "Premium" — que não é
  // carroceria de coisa nenhuma. A ficha do veículo exibe esse valor na linha
  // CATEGORIA, como fato sobre o produto.
  //
  // Medido contra produção em 2026-08-06: `tipo` preenchido em 88 de 88
  // veículos (Hatch 43, SUV 22, Sedan 13, Motocicleta 6, Picape 4), nenhum
  // "Selecionado". A cadeia inteira era código morto — palpite guardado
  // esperando o dia em que o feed viesse vazio. Sem dado, string vazia: a UI
  // oculta a linha, como em `cambio`, `combustivel` e `cor`.
  const resolveTipo = (item: any): string => {
    const bruto = (item.tipo || "").trim();
    if (!bruto || bruto.toLowerCase() === "selecionado") return "";

    // Normalização de exibição, não inferência: "suv" → "SUV", "hatch" → "Hatch".
    const minusculo = bruto.toLowerCase();
    if (minusculo === "suv") return "SUV";
    if (minusculo === "ev" || minusculo === "elétrico") return "Elétrico";
    return bruto.charAt(0).toUpperCase() + bruto.slice(1).toLowerCase();
  };

  // Perfil de uso — coluna do banco, não classificação por palpite.
  //
  // A versão anterior nunca leu coluna nenhuma. Classificava o veículo em
  // "CURADORIA EXCLUSIVA" / "LINHAGEM ESPORTIVA" / "FORÇA & OFF-ROAD" /
  // "URBANO & EFICIENTE" a partir de marca, preço, quilometragem e palavras
  // soltas na versão e no texto livre de `opcionais`/`laudo_pericia`: qualquer
  // diesel virava "FORÇA & OFF-ROAD", qualquer "tsi" na versão virava
  // esportivo.
  //
  // Medido contra produção em 2026-08-06: `perfil_uso` preenchido em 88 de 88
  // veículos, com vocabulário próprio do feed — Família / Conforto (31),
  // Econômico / Diário (24), Uso Diário (13), Performance / Premium (10),
  // Agilidade / Economia (6), Trabalho / Robustez (4). O palpite coincidia com
  // o dado real em 0 dos 88: 71 veículos eram rotulados "URBANO & EFICIENTE",
  // entre eles os 31 de família e 2 dos 10 de performance.
  //
  // Ler a coluna não é só apagar palpite, também conserta o que dependia dela:
  // as condições de `perfil_uso` em `car-match.ts` procuram "premium",
  // "performance", "econ" e "diário" — nenhum dos quatro rótulos inventados
  // contém essas palavras, então estavam mortas. Com o dado real elas voltam a
  // casar (10 luxo, 10 esportivo, 43 econômico).
  const resolvePerfilUso = (item: any): string => {
    const bruto = (item.perfil_uso || "").trim();
    if (!bruto || bruto.toLowerCase() === "selecionado") return "";
    return bruto;
  };

  const periciaVal = formatPericia(dbItem.pericia);
  
  const rawDesc = (dbItem.laudo_pericia || dbItem.opcionais || dbItem.description || dbItem.descricao || "").toLowerCase();
  const rawM = (dbItem.modelo || "").toLowerCase();
  const rawV = (dbItem.versao || "").toLowerCase();

  // cabine_premium: "teto solar", "couro", "teto panoramico", "painel digital"
  const cabinePremiumTerms = ["teto solar", "couro", "teto panoramico", "teto panorâmico", "painel digital"];
  const hasCabinePremium = cabinePremiumTerms.some(t => rawDesc.includes(t));

  // tecnologia_embarcada: "camera 360", "alerta de colisao", "chave presencial", "sensor"
  const techTerms = ["camera 360", "câmera 360", "alerta de colisao", "alerta de colisão", "chave presencial", "sensor"];
  const hasTech = techTerms.some(t => rawDesc.includes(t));

  // conducao_dinamica: pdk, zf8, dsg, paddle shift, etc.
  const dynamicTerms = ["pdk", "zf8", "dsg", "borboleta", "paddle shift", "esportivo", "dinâmica", "dinamica", "direcional", "tração", "tracao", "chassis", "ativo", "suspensão adaptativa", "suspensao adaptativa"];
  const hasConducaoDinamica = 
    dynamicTerms.some(t => rawM.includes(t)) ||
    dynamicTerms.some(t => rawV.includes(t)) ||
    dynamicTerms.some(t => rawDesc.includes(t)) ||
    (dbItem.cambio && (dbItem.cambio.toLowerCase().includes("pdk") || dbItem.cambio.toLowerCase().includes("zf8") || dbItem.cambio.toLowerCase().includes("dsg") || dbItem.cambio.toLowerCase().includes("dupla embreagem")));

  // cautelar_100 — só com a perícia REALMENTE aprovada no feed.
  //
  // Antes bastava a descrição mencionar a palavra "perícia" (ou "cautelar")
  // para o badge acender: um texto dizendo "perícia pendente" ligava o selo.
  // O badge afirma aprovação ao cliente; só o status real pode acendê-lo.
  const hasCautelar100 = periciaVal === "PERÍCIA APROVADA";

  // baixa_km: km < 40000
  const hasBaixaKm = (typeof dbItem.quilometragem === "number" ? dbItem.quilometragem : (Number(dbItem.quilometragem) || 0)) < 40000;

  // unico_dono
  const hasUnicoDono = rawDesc.includes("único dono") || rawDesc.includes("unico dono") || rawDesc.includes("única dona") || rawDesc.includes("unica dona") || (dbItem.laudo_pericia && (dbItem.laudo_pericia.toLowerCase().includes("único dono") || dbItem.laudo_pericia.toLowerCase().includes("unico dono")));

  // oportunidade_patio
  const hasOportunidadePatio = precoPromocional > 0 && precoPromocional < precoOriginal;

  return {
    id: dbItem.id !== undefined && dbItem.id !== null ? String(dbItem.id) : "",
    marca: formatBrand(dbItem.marca),
    modelo: comOverride(
      dbItem.modelo_override,
      dbItem.modelo ? capitalizeWords(dbItem.modelo.trim()) : "Sem Modelo",
    ),
    // O override passa por `capitalizeWords`? Não: "HR-V" e "C-180" viram
    // "Hr-v" e "C-180" nessa moagem, e o ponto de escrever à mão é justamente
    // poder grafar o nome como ele é. O valor do feed continua normalizado.
    versao: comOverride(dbItem.versao_override, dbItem.versao ? dbItem.versao.trim() : "Padrão"),
    ano: typeof dbItem.ano === "number" ? dbItem.ano : (Number(dbItem.ano) || new Date().getFullYear()),
    quilometragem: typeof dbItem.quilometragem === "number" ? dbItem.quilometragem : (Number(dbItem.quilometragem) || 0),
    // ⚠️  NADA DE DEFAULT INVENTADO NOS CAMPOS ABAIXO.
    //
    // Até 2026-08-06 este mapper preenchia atributos ausentes com texto
    // promocional fixo, e o site os exibia como fato ao cliente. Medido contra
    // produção no dia da correção:
    //
    //   `opcionais`      vazio em 87 dos 88 veículos → praticamente TODO o
    //                    estoque anunciava "Teto solar, Multimídia, Rodas de
    //                    liga leve, Câmera de ré".
    //   `laudo_pericia`  vazio em 88 de 88 → todo carro exibia "Estrutura
    //                    íntegra, histórico livre de passagens por leilão ou
    //                    sinistros", incluindo os com perícia "Em análise".
    //   `combustivel`    vazio em 19 de 88 → exibidos como "Flex", inclusive
    //                    veículos elétricos e a diesel.
    //
    // Anunciar teto solar num carro que não tem, ou laudo limpo num carro não
    // periciado, é afirmação falsa sobre o produto — exposição direta ao CDC
    // para uma loja de veículos. String vazia deixa a UI ocultar a seção.
    cambio: dbItem.cambio ? formatCambio(dbItem.cambio) : "",
    combustivel: dbItem.combustivel ? formatCombustivel(dbItem.combustivel) : "",
    cor: dbItem.cor ? capitalizeWords(dbItem.cor.trim()) : "",
    fipe: dbItem.fipe || "",
    preco_original: precoOriginal,
    preco_promocional: precoPromocional,
    pericia: periciaVal,
    whatsapp_images: whatsappImgs,
    web_full_images: webFullImgs,
    opcionais: dbItem.opcionais || "",
    laudo_pericia: dbItem.laudo_pericia || "",
    tipo: resolveTipo(dbItem),
    perfil_uso: resolvePerfilUso(dbItem),
    // Para que o carro serve — array SEMPRE, mesmo em linha que ainda só tem o
    // `perfil_uso` singular. A conversão do vocabulário antigo acontece aqui,
    // na leitura: daí para cima ninguém precisa saber que houve um campo de um
    // valor só, e o hub, o painel e o motor de regras leem a mesma coisa.
    //
    // `perfisValidos` descarta slug fora do vocabulário. O feed não escreve
    // nesta coluna, mas o painel escreve, e um valor inventado criaria uma
    // vitrine `/estoque/{slug}` que ninguém pediu.
    perfis_uso: Array.isArray(dbItem.perfis_uso) && dbItem.perfis_uso.length > 0
      ? perfisValidos(dbItem.perfis_uso)
      : perfisDoValorAntigo(dbItem.perfil_uso),
    // `textoUtil` e não `||` cru: o feed manda "Sem descrição informada" em vez
    // de deixar vazio, e esse marcador vazava para a página e para o anúncio.
    descricao: textoUtil(dbItem.descricao) || textoUtil(dbItem.laudo_pericia),
    // Sem `|| descricao` aqui de propósito: o mapper devolve o campo como ele
    // é no banco, e quem decide a cadeia de fallback é cada consumidor — o
    // feed e a meta description querem textos de tamanhos diferentes. Até a
    // migração 20260817130000 esta coluna não existia e o valor era `undefined`
    // em silêncio, que é como todo anúncio do feed acabou com a mesma frase.
    descricao_seo: textoUtil(dbItem.descricao_seo),
    cabine_premium: hasCabinePremium,
    tecnologia_embarcada: hasTech,
    conducao_dinamica: hasConducaoDinamica,
    cautelar_100: hasCautelar100,
    baixa_km: hasBaixaKm,
    unico_dono: hasUnicoDono,
    oportunidade_patio: hasOportunidadePatio,
    // Data de chegada. Sem inventar: linha sem carimbo devolve `null`, e o
    // consumidor decide (a camada de dados omite `days_in_stock`, o painel
    // mostra "—"). Ver a migração `20260826030000_first_seen_at.sql`.
    first_seen_at: dbItem.first_seen_at ?? null,
    status_tag: dbItem.status_tag || "",
    status_tag_color: dbItem.status_tag_color || "green",
    vendido: !!dbItem.vendido,
    // Quem manda nesta ficha (migração 20260829130000): `sync` é do
    // RevendaMais e é reescrito a cada ciclo; `painel` é nosso e o sync não
    // toca. Metadado operacional, não sensível — por isso sai no mapper.
    origem: dbItem.origem === "painel" ? "painel" : "sync",
    // Ficha própria do painel (migração 20260807160000): vazio até alguém
    // preencher — a UI oculta a linha, como em cambio/combustivel/cor.
    //
    // `placa` NÃO sai daqui, pelo mesmo motivo de `preco_compra`: o objeto
    // mapeado é passado como prop de Server Component para o catálogo e a PDP,
    // e tudo que é prop vai serializado no HTML da página pública. Até
    // 2026-08-08 ele levava `placa:""` 65 vezes em /estoque — inofensivo só
    // porque nenhuma placa estava preenchida. Documento do veículo é dado
    // interno; quem precisa dele pede `incluirPlaca` em `getEstoque`, e isso
    // só acontece em rota autenticada.
    motor: dbItem.motor || "",
    cor_interna: dbItem.cor_interna || "",
    donos_anteriores:
      typeof dbItem.donos_anteriores === "number" ? dbItem.donos_anteriores : undefined,
    garantia_fabrica: dbItem.garantia_fabrica || "",
    // SECURITY FIX: Do not expose preco_compra to the frontend
    // preco_compra is a sensitive business logic field
  };
}

// Helper to apply client-side LocalStorage/Supabase overrides for category/lifestyle mapping
function applyLocalOverrides(veiculos: Veiculo[]): Veiculo[] {
  if (typeof window === "undefined") return veiculos;
  try {
    const windowOverrides = (window as any).ag_stock_overrides;
    if (windowOverrides) {
      return veiculos.map((v) => {
        if (windowOverrides[v.id]) {
          return { ...v, ...windowOverrides[v.id] };
        }
        return v;
      });
    }

    const raw = localStorage.getItem("ag_stock_overrides");
    if (!raw) return veiculos;
    const overrides = JSON.parse(raw);
    return veiculos.map((v) => {
      if (overrides[v.id]) {
        return { ...v, ...overrides[v.id] };
      }
      return v;
    });
  } catch (e) {
    console.warn("[Overrides] Error reading overrides:", e);
    return veiculos;
  }
}

function applyLocalOverridesToSingle(v: Veiculo | null): Veiculo | null {
  if (!v || typeof window === "undefined") return v;
  try {
    const windowOverrides = (window as any).ag_stock_overrides;
    if (windowOverrides && windowOverrides[v.id]) {
      return { ...v, ...windowOverrides[v.id] };
    }

    const raw = localStorage.getItem("ag_stock_overrides");
    if (!raw) return v;
    const overrides = JSON.parse(raw);
    if (overrides[v.id]) {
      return { ...v, ...overrides[v.id] };
    }
  } catch (e) {
    console.warn("[Overrides] Error reading overrides:", e);
  }
  return v;
}

/**
 * Marcadores de "campo não preenchido" que chegam do feed como se fossem texto.
 *
 * O RevendaMais manda "Sem descrição informada" no lugar de deixar a coluna
 * vazia. Medido em 2026-08-17: 3 dos 41 veículos do feed. Enquanto o único
 * consumidor era a PDP isso passava por texto ruim; virou publicação de anúncio
 * quando o feed XML passou a usar `descricao` como fallback, e um anúncio que
 * diz "sem descrição informada" é pior que a frase genérica que ele substituiu.
 *
 * Lista curta e literal de propósito: heurística mais esperta (procurar "sem
 * "…, medir tamanho mínimo) descartaria descrição legítima. Quando o painel
 * assumir os textos, isto aqui pode sair — e o teste que o cobre vai avisar.
 */
const TEXTOS_QUE_SIGNIFICAM_VAZIO = ["sem descrição informada", "sem descricao informada"];

/** O texto tem conteúdo, ou é marcador de campo vazio disfarçado? */
export function textoUtil(bruto: unknown): string {
  if (typeof bruto !== "string") return "";
  const limpo = bruto.trim();
  if (!limpo) return "";
  return TEXTOS_QUE_SIGNIFICAM_VAZIO.includes(limpo.toLowerCase()) ? "" : limpo;
}

/**
 * Tolerância para agrupar linhas de um mesmo ciclo de sync.
 *
 * O n8n grava um veículo por requisição, então os carimbos de um mesmo ciclo
 * ficam espalhados por alguns segundos. 30 minutos é folga de sobra para isso
 * (45 requisições levam segundos) e curto o bastante para que o ciclo ANTERIOR,
 * horas antes, fique de fora.
 */
const JANELA_MESMO_SYNC_MS = 30 * 60 * 1000;

/**
 * Quão menor que o ciclo anterior um ciclo pode ser antes de virar suspeito.
 *
 * Metade é folgado de propósito. A variação real entre ciclos é de poucos
 * veículos (45 em 2026-08-04, 43 em 2026-08-17), então qualquer coisa acima
 * deste piso passa sem atrito; e uma coleta que morre no meio costuma trazer
 * uma fração muito menor, não 49%. O limiar existe para separar catástrofe de
 * rotina, não para auditar o tamanho do estoque.
 *
 * Errar aqui para o lado permissivo é barato: o pior caso é a vitrine mostrar
 * por algumas horas um carro que já saiu. Errar para o lado severo tira do
 * índice do Google carros que estão à venda, e isso não volta em horas.
 */
const FRACAO_MINIMA_DO_CICLO = 0.5;

/**
 * Descarta veículos que não vieram no ciclo de sync mais recente.
 *
 * O feed do RevendaMais é a fonte da verdade sobre o que está à venda, e o sync
 * é upsert puro — quem sai do feed nunca é removido do banco. Em 2026-08-04 o
 * feed tinha 45 veículos e a tabela 88: 43 anúncios de carros que a loja não
 * lista mais, todos com `vendido = false`, todos visíveis no site.
 *
 * A comparação é contra o carimbo MAIS RECENTE DA PRÓPRIA TABELA, nunca contra
 * `Date.now()`. O workflow n8n não tem agendamento (só gatilho manual), então
 * um corte por relógio de parede esvaziaria o site em qualquer período sem
 * ninguém rodar o sync. Assim, o pior caso é servir estoque velho — nunca
 * estoque vazio.
 */
export function apenasDoUltimoSync<T extends { last_seen_at?: string | null }>(linhas: T[]): T[] {
  const carimbos = linhas
    .map((l) => (l.last_seen_at ? new Date(l.last_seen_at).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));

  // Nenhum carimbo: banco anterior à migração `last_seen_at`, ou sync ainda não
  // rodou com o campo. Filtrar aqui esconderia o estoque inteiro — não filtra.
  if (carimbos.length === 0) return linhas;

  const maisRecente = Math.max(...carimbos);
  let corte = maisRecente - JANELA_MESMO_SYNC_MS;

  // ----------------------------------------------------------
  // Piso de sanidade: ciclo que chegou pela metade não vira verdade
  // ----------------------------------------------------------
  // A válvula que já existia protege do zero absoluto (`getEstoque` serve tudo
  // se o filtro descartar todas as linhas). Não protegia do caso intermediário:
  // o n8n morrer no meio da fila e carimbar 5 dos 43 veículos. Esses 5 viram o
  // "ciclo mais recente" e os outros 38 caem fora da janela.
  //
  // Isso sempre encolheu a vitrine — recuperável no ciclo seguinte, 6h depois.
  // Passou a custar caro quando a saída do feed passou a implicar `noindex` e
  // remoção do sitemap: a vitrine volta em 6h, o índice do Google leva semanas.
  // O erro deixou de ser simétrico, então o filtro precisa desconfiar.
  //
  // A comparação é entre CICLOS, não entre contagens visíveis. Ciclo a ciclo, a
  // variação real é pequena: em 2026-08-04 o feed trouxe 45 veículos e em
  // 2026-08-17 trouxe 43. Uma queda para menos da metade não é a loja vendendo,
  // é a coleta falhando.
  const anteriores = carimbos.filter((t) => t < corte);
  if (anteriores.length > 0) {
    const noUltimoCiclo = carimbos.length - anteriores.length;
    const ancoraAnterior = Math.max(...anteriores);
    const corteAnterior = ancoraAnterior - JANELA_MESMO_SYNC_MS;
    const noCicloAnterior = anteriores.filter((t) => t >= corteAnterior).length;

    if (noUltimoCiclo < FRACAO_MINIMA_DO_CICLO * noCicloAnterior) {
      // Alarga o corte até abraçar o ciclo anterior, em vez de servir a tabela
      // inteira: servir tudo traria de volta os fantasmas de meses atrás, que é
      // o problema que este filtro existe para resolver. Assim a vitrine mostra
      // o último inventário completo mais o que o ciclo parcial já confirmou —
      // no máximo algumas horas de atraso, nunca um catálogo inventado.
      console.warn(
        "[Supabase] Ciclo de sync suspeito: %d veículos contra %d do ciclo anterior. " +
          "Servindo os dois ciclos até a próxima coleta — nenhum veículo será " +
          "declarado fora do feed por causa disto.",
        noUltimoCiclo,
        noCicloAnterior
      );
      corte = corteAnterior;
    }
  }

  // Linha sem carimbo é mantida — e desde 2026-08-29 isso deixou de ser
  // hipótese e virou caso de primeira classe: o veículo cadastrado no painel
  // (`origem = 'painel'`, migração 20260829130000) nasce com `last_seen_at`
  // NULO de propósito, porque ele nunca veio em sync nenhum. Filtrá-lo pela
  // janela do feed o faria sumir do site no primeiro ciclo — o oposto do que a
  // trava do sync existe para garantir. Quem decide se ele vai à vitrine é
  // `bloqueiosDePublicacao` (as 8 fotos), como para qualquer outro carro.
  return linhas.filter((l) => {
    if (!l.last_seen_at) return true;
    return new Date(l.last_seen_at).getTime() >= corte;
  });
}

/**
 * Este veículo ficou de fora do ciclo de sync mais recente?
 *
 * `getVeiculoById` consulta por id e NÃO passa por `apenasDoUltimoSync` — e
 * isso é proposital: a PDP precisa continuar resolvendo o carro para poder
 * dizer que ele não está mais disponível. O efeito colateral era o veículo
 * fora do feed responder 200 com a página normal, `schema.org/InStock` e o
 * botão de WhatsApp abrindo negociação de um carro que a loja não tem. Quem
 * responde essa pergunta agora é esta função.
 *
 * Consulta só `id, last_seen_at`: é a mesma decisão de janela que a vitrine
 * usa, sem arrastar o estoque inteiro para resolver um booleano.
 *
 * Falha SEMPRE para `false`. Banco fora do ar, tabela vazia ou filtro que
 * zerou tudo devolvem "está no feed" — declarar um carro indisponível por
 * causa de um soluço do Supabase é pior que o 200 enganoso que esta função
 * existe para corrigir.
 */
export async function getSinaisDeEstoque(
  id: string
): Promise<{ foraDoFeed: boolean; ultimaPresenca: string | null }> {
  const nadaSabido = { foraDoFeed: false, ultimaPresenca: null };
  if (!isSupabaseConfigured || !supabase) return nadaSabido;

  try {
    const { data, error } = await supabase
      .from("estoque_motors")
      .select("id, last_seen_at, estado_cadastro");

    if (error || !data || data.length === 0) return nadaSabido;

    // Desde 2026-08-30 "fora do feed" tem nome próprio: `arquivado`. A PDP
    // continua resolvendo o carro (é o que permite dizer que ele não está mais
    // disponível, em vez de responder 200 anunciando o que a loja não tem),
    // mas quem responde "saiu do estoque" agora é a decisão da loja, não a
    // ausência dele no último ciclo do robô.
    const propriaLinha = data.find((l: any) => String(l.id) === String(id));
    if (propriaLinha?.estado_cadastro) {
      return {
        foraDoFeed: propriaLinha.estado_cadastro !== "publicado",
        ultimaPresenca: propriaLinha.last_seen_at ?? null,
      };
    }

    const visiveis = apenasDoUltimoSync(data);
    // Mesma válvula de segurança do `getEstoque`: se o filtro descartou tudo,
    // o carimbo é que está errado — ninguém é declarado fora do feed.
    if (visiveis.length === 0) return nadaSabido;

    const propria = data.find((linha: any) => String(linha.id) === String(id));

    return {
      foraDoFeed: !visiveis.some((linha: any) => String(linha.id) === String(id)),
      ultimaPresenca: propria?.last_seen_at ?? null,
    };
  } catch (err) {
    console.warn(`[Supabase] Falha ao checar o feed do veículo ${id}:`, err);
    return nadaSabido;
  }
}

/**
 * `id -> conteudo_atualizado_em` para o `lastmod` do sitemap.
 *
 * Carrega só as duas colunas: a pergunta é "quando cada anúncio mudou", e o
 * resto da linha não ajuda a respondê-la.
 *
 * O `catch` aqui não é decoração. Enquanto a migração 20260817120000 não
 * estiver aplicada, a coluna não existe, e o PostgREST rejeita a query INTEIRA
 * com 42703 em vez de ignorar o campo desconhecido — foi assim que o painel de
 * margens ficou morto por semanas. Sem carimbo, o sitemap OMITE o `lastmod` em
 * vez de inventar um: não declarar nada é honesto, declarar "mudou agora" é a
 * mentira que esta mudança veio desfazer.
 */
export async function getCarimbosDeConteudo(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured || !supabase) return {};

  try {
    const { data, error } = await supabase
      .from("estoque_motors")
      .select("id, conteudo_atualizado_em");

    if (error || !data) {
      console.warn(
        "[Supabase] Sem carimbos de conteúdo (%s) — o sitemap sai sem lastmod.",
        error?.message ?? "resposta vazia"
      );
      return {};
    }

    const mapa: Record<string, string> = {};
    for (const linha of data as any[]) {
      if (linha.conteudo_atualizado_em) {
        mapa[String(linha.id)] = linha.conteudo_atualizado_em;
      }
    }
    return mapa;
  } catch (err) {
    console.warn("[Supabase] Erro inesperado ao ler carimbos de conteúdo:", err);
    return {};
  }
}

/**
 * Consulta o estoque no Supabase, com fallback para os mocks.
 *
 * Por padrão devolve só o que veio no último ciclo de sync — é o que o site
 * público deve mostrar. O painel admin passa `incluirForaDoFeed: true`, porque
 * lá os veículos que saíram do feed precisam continuar visíveis para serem
 * marcados, conferidos na margem e auditados.
 */
/**
 * O que servir quando o Supabase não responde.
 *
 * `MOCK_ESTOQUE` são 5 carros FICTÍCIOS de demonstração — Porsche 911 a
 * R$ 998.000, Defender, BYD Dolphin — com preços e fotos do Unsplash falsos.
 * Servi-los em produção significa anunciar carros que a loja não tem, com CTAs
 * de WhatsApp funcionais: o cliente inicia negociação de um veículo inexistente.
 * Pior, `getEstoque()` nunca lança erro, então o `try/catch` do sitemap nunca
 * dispara — numa indisponibilidade do banco o sitemap publicaria as URLs
 * fictícias e as PDPs renderizariam schema.org com preços inventados.
 *
 * Em produção o correto é a vitrine vazia: honesta e visivelmente errada, em vez
 * de plausível e falsa. Os mocks continuam servindo o desenvolvimento local,
 * onde é exatamente o que se quer sem banco configurado.
 */
function estoqueDeContingencia(): Veiculo[] {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[Supabase] Estoque indisponível em produção — servindo vitrine vazia. " +
        "MOCK_ESTOQUE NÃO é servido: são carros fictícios."
    );
    return [];
  }
  return MOCK_ESTOQUE;
}

export async function getEstoque(
  opts: {
    incluirForaDoFeed?: boolean;
    incluirPlaca?: boolean;
    /**
     * Traz também o que está bloqueado para publicação — hoje, quem tem menos
     * de 8 fotos. Ver `bloqueiosDePublicacao`, que lista as pendências e diz
     * quais delas tiram o carro do ar.
     *
     * ⚠️ **O filtro é o padrão, e é de propósito.** Quem pede esta opção é o
     * painel, a auditoria e os testes; toda superfície pública chama sem
     * opção nenhuma e nasce protegida. Uma página nova escrita daqui a seis
     * meses não precisa saber que a regra existe para respeitá-la — e é essa
     * a única forma que não depende de alguém lembrar.
     *
     * Mesma disciplina de `incluirPlaca`: o dado sensível ou incompleto sai
     * por pedido explícito, nunca por descuido.
     */
    incluirNaoPublicaveis?: boolean;
  } = {}
): Promise<Veiculo[]> {
  /** O mapper não devolve `placa` (ver a nota lá): quem pede, recebe de volta
   *  aqui. Só chame com `incluirPlaca` em contexto autenticado — o resultado
   *  desta função vira prop de Server Component nas telas públicas. */
  const mapear = (linha: any): Veiculo => {
    const v = mapVeiculoDbToVeiculo(linha);
    return opts.incluirPlaca ? { ...v, placa: linha.placa || "" } : v;
  };

  let list: Veiculo[] = [];
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("estoque_motors")
        .select("*")
        .order("preco", { ascending: false });

      if (error) {
        console.warn("[Supabase] Query error:", error.message);
        list = estoqueDeContingencia();
      } else if (data && data.length > 0) {
        // --------------------------------------------------------------
        // Quem decide o que está no ar é a LOJA, não o robô (2026-08-30)
        // --------------------------------------------------------------
        // Até aqui a régua era `apenasDoUltimoSync`: ficava no ar quem tinha
        // `last_seen_at` dentro da janela do ciclo mais recente. Isso valia
        // enquanto o cron rodava de 6 em 6 horas e o feed era a verdade.
        //
        // Com a importação MANUAL (decisão do dono — "sem override, criamos
        // rascunhos dos carros para serem finalizados antes de serem
        // publicados"), a mesma régua se voltaria contra o site: bastaria uma
        // importação parcial, ou de um carro só, para esse carro virar "o
        // ciclo mais recente" e derrubar todo o resto da vitrine. Ninguém teria
        // mexido em nada.
        //
        // `estado_cadastro` (migração 20260830120000) é o estado explícito que
        // substitui a inferência. `apenasDoUltimoSync` fica no arquivo e segue
        // testada: ela é a régua da linha ANTIGA, sem estado, e o fallback
        // abaixo a usa enquanto houver banco por migrar.
        const temEstado = data.some((l: any) => l.estado_cadastro);
        let noFeed = opts.incluirForaDoFeed
          ? data
          : temEstado
            ? data.filter((l: any) => l.estado_cadastro === "publicado")
            : apenasDoUltimoSync(data);

        // A válvula vale para os DOIS caminhos, e pela mesma razão de sempre:
        // se o filtro zerar, o site não pode cair no MOCK_ESTOQUE — 5 carros
        // fictícios em produção. Serve o que veio do banco e registra alto.
        if (noFeed.length === 0) {
          console.warn(
            temEstado
              ? "[Supabase] Nenhum veículo com estado_cadastro='publicado'; servindo o estoque completo. Alguém arquivou tudo, ou a publicação não foi feita."
              : "[Supabase] Filtro de last_seen_at descartou todas as linhas; servindo o estoque completo."
          );
          noFeed = data;
        }

        // Bloqueio de publicação, aplicado sobre a LINHA CRUA: `laudo_pericia`
        // e `whatsapp_images` são colunas, e filtrar antes de mapear evita
        // montar objeto de veículo que ninguém vai usar.
        //
        // ⚠️ Este filtro NÃO tem válvula: se ele zerar a lista, a vitrine fica
        // vazia mesmo. Foi decidido assim porque as duas falhas não custam o
        // mesmo. Vitrine vazia o dono vê no mesmo dia; anúncio publicado sem
        // as fotos volta a ser exatamente o que ninguém notaria — foi assim
        // que duas fichas com UMA foto ficaram meses no ar.
        //
        // O que impede o gate de esvaziar a vitrine por engano não é uma
        // válvula aqui, é a medição antes de ligar cada regra: ver
        // `LAUDO_BLOQUEIA_PUBLICACAO` e a seção 5 de `npm run
        // auditoria:estoque`.
        const visiveis = opts.incluirNaoPublicaveis
          ? noFeed
          : noFeed.filter((l: any) => publicavel(l));
        if (visiveis.length === 0) {
          console.warn(
            `[Supabase] Bloqueio de publicação descartou as ${noFeed.length} linhas do pátio. Vitrine vazia.`
          );
        }
        list = visiveis.map(mapear);
      } else {
        list = estoqueDeContingencia();
      }
    } catch (err) {
      console.warn("[Supabase] Unexpected connection error:", err);
      list = estoqueDeContingencia();
    }
  } else {
    // Sem credenciais: em dev serve o catálogo local; em produção seria um
    // deploy sem env configurada — vitrine vazia, nunca carros fictícios.
    console.info("[Supabase] Client not configured.");
    list = estoqueDeContingencia();
  }

  return applyLocalOverrides(list);
}

// Helper to query a single vehicle by ID
export async function getVeiculoById(id: string): Promise<Veiculo | null> {
  let car: Veiculo | null = null;
  if (isSupabaseConfigured && supabase) {
    try {
      // First try to match string ID directly
      let { data, error } = await supabase
        .from("estoque_motors")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      // If not found and ID is numeric, try numeric match
      if (!data && /^\d+$/.test(id)) {
        const numericId = parseInt(id, 10);
        const { data: numData } = await supabase
          .from("estoque_motors")
          .select("*")
          .eq("id", numericId)
          .maybeSingle();
        data = numData;
      }

      if (data) {
        car = mapVeiculoDbToVeiculo(data);
      }
    } catch (err) {
      console.warn(`[Supabase] Connection error for ID ${id}, falling back to offline database:`, err);
    }
  }

  if (!car) {
    // Em produção, veículo não encontrado é 404 — não um carro de demonstração
    // com preço inventado servido como se fosse do estoque real.
    const found = estoqueDeContingencia().find((item) => item.id === id);
    car = found || null;
  }

  return applyLocalOverridesToSingle(car);
}

export function truncateString(str: string, maxLength: number): string {
  if (!str) return "";
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

/**
 * Generates a clean, professional, and SEO-optimized PDP URL for a vehicle.
 * Eliminates duplicates between brand, model, and version slug segments.
 */
export function getVeiculoPdpUrl(veiculo: {
  id: string;
  marca: string;
  modelo: string;
  versao: string;
  /**
   * Carroceria. Decide entre os segmentos carros e motos (P6, 2026-08-19).
   * Opcional porque nem todo chamador histórico a tinha — sem ela o veículo
   * cai em carros, e a ficha redireciona se o segmento não bater.
   */
  tipo?: string | null;
}): string {
  const brandLower = veiculo.marca.toLowerCase().trim();
  const modelLower = veiculo.modelo.toLowerCase().trim();
  const versionLower = veiculo.versao.toLowerCase().trim();

  // Limpezas 1 e 2 (prefixo de marca e sufixo de versão dentro do modelo) vivem
  // em `lib/veiculoUrl.ts` desde que os hubs de marca/modelo passaram a existir:
  // `/carros/jeep/renegade` tem que gerar o MESMO segmento que a ficha, senão o
  // hub lista veículos cuja URL não bate com a sua.
  const cleanModel = limparModelo(veiculo.marca, veiculo.modelo, veiculo.versao);

  // 3. Clean version to remove duplicate brand or model prefix
  let cleanVersion = versionLower;
  if (cleanVersion.startsWith(brandLower)) {
    cleanVersion = cleanVersion.slice(brandLower.length).trim();
  }
  if (cleanVersion.startsWith(cleanModel)) {
    cleanVersion = cleanVersion.slice(cleanModel.length).trim();
  }

  // Fallback to defaults if stripped to empty
  const finalBrand = brandLower || "veiculo";
  const finalModel = cleanModel || modelLower || "padrao";
  const finalVersion = cleanVersion || versionLower || "padrao";

  // Slugify each segment
  const slugMarca = slugificar(finalBrand);
  const slugModelo = slugificar(finalModel);
  const slugVersao = slugificar(finalVersion);

  // Create clean, beautiful full slug and URL path
  const slugCompletoComId = `${slugMarca}-${slugModelo}-${slugVersao}-${veiculo.id}`;
  
  return `/${segmentoDoVeiculo(veiculo)}/${slugMarca}/${slugModelo}/${slugVersao}/${slugCompletoComId}`;
}
