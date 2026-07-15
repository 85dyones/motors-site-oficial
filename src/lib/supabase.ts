import { createClient } from "@supabase/supabase-js";

// TypeScript Interface representing the `estoque_motors` Supabase schema
export interface Veiculo {
  id: string;
  marca: string;
  modelo: string;
  versao: string;
  ano: number;
  quilometragem: number;
  cambio: string;
  combustivel: string;
  cor: string;
  placa: string;
  fipe: string;
  preco_original: number;
  preco_promocional: number;
  pericia: string;
  whatsapp_images: string[];
  web_full_images: string[];
  opcionais: string; // Comma separated list of features
  laudo_pericia: string;
  tipo?: string;
  perfil_uso?: string;
  descricao?: string;
  descricao_seo?: string;
  cabine_premium?: boolean;
  tecnologia_embarcada?: boolean;
  conducao_dinamica?: boolean;
  cautelar_100?: boolean;
  baixa_km?: boolean;
  unico_dono?: boolean;
  oportunidade_patio?: boolean;
  status_tag?: string;
  status_tag_color?: string;
  vendido?: boolean;
  preco_compra?: number;
}

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
    placa: "PDK-9110",
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
    placa: "LRD-1100",
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
    placa: "BYD-0E24",
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
    placa: "BMW-5X23",
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
    placa: "TOY-2823",
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

const formatPericia = (p: string, laudo?: string): string => {
  if (laudo && laudo.toLowerCase().includes("aprovad")) {
    return "PERÍCIA APROVADA";
  }
  if (!p) return laudo ? "PERÍCIA APROVADA" : "EM ANÁLISE";
  const val = p.toLowerCase().trim();
  if (val.includes("aprovad") || val.includes("cautelar") || val.includes("ok") || val.includes("100%")) {
    return "PERÍCIA APROVADA";
  }
  if (val.includes("analise") || val.includes("análise")) {
    return "EM ANÁLISE";
  }
  return p.toUpperCase();
};

/**
 * Maps a database row from the live `veiculos` table to the visual frontend interface `Veiculo`.
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

  // Resolve smart defaults for vehicle body type
  const resolveTipo = (item: any): string => {
    if (item.tipo && item.tipo.trim() && item.tipo.toLowerCase() !== "selecionado") {
      // Capitalize first letter (e.g. "hatch" -> "Hatch", "suv" -> "SUV")
      const rawTipo = item.tipo.trim();
      if (rawTipo.toLowerCase() === "suv") return "SUV";
      if (rawTipo.toLowerCase() === "ev" || rawTipo.toLowerCase() === "elétrico") return "Elétrico";
      return rawTipo.charAt(0).toUpperCase() + rawTipo.slice(1).toLowerCase();
    }
    const m = (item.modelo || "").toLowerCase();
    if (m.includes("hilux") || m.includes("ranger") || m.includes("toro") || m.includes("l200") || m.includes("amarok") || m.includes("ram")) {
      return "Picape";
    }
    if (m.includes("911") || m.includes("carrera") || m.includes("boxster") || m.includes("cayman") || m.includes("mustang")) {
      return "Esportivo";
    }
    if (m.includes("defender") || m.includes("x5") || m.includes("commander") || m.includes("compass") || m.includes("renegade") || m.includes("discovery") || m.includes("tiguan")) {
      return "SUV";
    }
    if (m.includes("dolphin") || m.includes("fit") || m.includes("hb20") || m.includes("gol") || m.includes("sandero") || m.includes("c3") || m.includes("ka") || m.includes("meriva")) {
      return "Hatch";
    }
    if (m.includes("plus") || m.includes("sedan") || m.includes("prisma") || m.includes("classic") || m.includes("corolla") || m.includes("civic")) {
      return "Sedan";
    }
    return "Premium";
  };

  // Resolve smart defaults for vehicle use profile (Lifestyle Categories)
  const resolvePerfilUso = (item: any): string => {
    const brand = (item.marca || "").toLowerCase();
    const m = (item.modelo || "").toLowerCase();
    const v = (item.versao || "").toLowerCase();
    const fuel = (item.combustivel || "").toLowerCase();
    const bodyType = (item.tipo || "").toLowerCase();
    const desc = (item.laudo_pericia || item.opcionais || item.description || item.descricao || "").toLowerCase();
    
    const price = typeof item.preco_promocional === "number" && item.preco_promocional > 0
      ? item.preco_promocional
      : (typeof item.preco_original === "number" ? item.preco_original : (typeof item.preco === "number" ? item.preco : 0));
      
    const km = typeof item.quilometragem === "number" ? item.quilometragem : (Number(item.quilometragem) || 0);

    // 1. CURADORIA EXCLUSIVA
    const isPrestige = ["porsche", "bmw", "mercedes", "audi", "land rover", "volvo"].some(b => brand.includes(b));
    const isExclusive = isPrestige && (price > 140000 || km < 40000);
    if (isExclusive) {
      return "CURADORIA EXCLUSIVA";
    }

    // 2. LINHAGEM ESPORTIVA
    const esportivaTerms = ["turbo", "forjado", "prep", "m sport", "amg", "fueltech", "ft300", "gts", "tsi"];
    const isEsportiva = 
      esportivaTerms.some(t => m.includes(t)) ||
      esportivaTerms.some(t => v.includes(t)) ||
      esportivaTerms.some(t => desc.includes(t));
      
    if (isEsportiva) {
      return "LINHAGEM ESPORTIVA";
    }

    // 3. FORÇA & OFF-ROAD
    const isOffRoad = 
      fuel.includes("diesel") || 
      bodyType.includes("picape") ||
      ["toro", "amarok", "hilux", "ranger", "l200", "ram", "defender", "freedom"].some(t => m.includes(t)) ||
      desc.includes("4x4") || desc.includes("4wd") || desc.includes("awd") || desc.includes("integral") || desc.includes("tração") || desc.includes("tracao") || desc.includes("tração integral") ||
      v.includes("4x4") || v.includes("4wd") || v.includes("awd");
      
    if (isOffRoad) {
      return "FORÇA & OFF-ROAD";
    }

    // 4. URBANO & EFICIENTE
    return "URBANO & EFICIENTE";
  };

  const periciaVal = formatPericia(dbItem.pericia, dbItem.laudo_pericia);
  
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

  // cautelar_100: approved pericia
  const hasCautelar100 = 
    periciaVal.toLowerCase().includes("aprovad") ||
    periciaVal.toLowerCase().includes("cautelar") ||
    rawDesc.includes("cautelar") || rawDesc.includes("perícia") || rawDesc.includes("pericia") || rawDesc.includes("aprovado") || rawDesc.includes("aprovada");

  // baixa_km: km < 40000
  const hasBaixaKm = (typeof dbItem.quilometragem === "number" ? dbItem.quilometragem : (Number(dbItem.quilometragem) || 0)) < 40000;

  // unico_dono
  const hasUnicoDono = rawDesc.includes("único dono") || rawDesc.includes("unico dono") || rawDesc.includes("única dona") || rawDesc.includes("unica dona") || (dbItem.laudo_pericia && (dbItem.laudo_pericia.toLowerCase().includes("único dono") || dbItem.laudo_pericia.toLowerCase().includes("unico dono")));

  // oportunidade_patio
  const hasOportunidadePatio = precoPromocional > 0 && precoPromocional < precoOriginal;

  return {
    id: dbItem.id !== undefined && dbItem.id !== null ? String(dbItem.id) : "",
    marca: formatBrand(dbItem.marca),
    modelo: dbItem.modelo ? capitalizeWords(dbItem.modelo.trim()) : "Sem Modelo",
    versao: dbItem.versao ? dbItem.versao.trim() : "Padrão",
    ano: typeof dbItem.ano === "number" ? dbItem.ano : (Number(dbItem.ano) || new Date().getFullYear()),
    quilometragem: typeof dbItem.quilometragem === "number" ? dbItem.quilometragem : (Number(dbItem.quilometragem) || 0),
    cambio: dbItem.cambio ? formatCambio(dbItem.cambio) : "Automático",
    combustivel: dbItem.combustivel ? formatCombustivel(dbItem.combustivel) : "Flex",
    cor: dbItem.cor ? capitalizeWords(dbItem.cor.trim()) : "Cinza Nardo",
    placa: dbItem.placa || "V-REF100",
    fipe: dbItem.fipe || "Consulta Fipe",
    preco_original: precoOriginal,
    preco_promocional: precoPromocional,
    pericia: periciaVal,
    whatsapp_images: whatsappImgs,
    web_full_images: webFullImgs,
    opcionais: dbItem.opcionais || "Teto solar, Multimídia, Rodas de liga leve, Câmera de ré",
    laudo_pericia: dbItem.laudo_pericia || "Estrutura íntegra, histórico livre de passagens por leilão ou sinistros.",
    tipo: resolveTipo(dbItem),
    perfil_uso: resolvePerfilUso(dbItem),
    descricao: dbItem.descricao || dbItem.laudo_pericia || "Estrutura 100% íntegra, vistoria cautelar aprovada com nota máxima e procedência de showroom garantida. Veículo revisado pontualmente e mantido em perfeito estado de conservação estática e mecânica.",
    cabine_premium: hasCabinePremium,
    tecnologia_embarcada: hasTech,
    conducao_dinamica: hasConducaoDinamica,
    cautelar_100: hasCautelar100,
    baixa_km: hasBaixaKm,
    unico_dono: hasUnicoDono,
    oportunidade_patio: hasOportunidadePatio,
    status_tag: dbItem.status_tag || "",
    status_tag_color: dbItem.status_tag_color || "green",
    vendido: !!dbItem.vendido,
    preco_compra: dbItem.preco_compra ? Number(dbItem.preco_compra) : 0
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

// Helper to query the stock database from Supabase or Fallback to Mocks
export async function getEstoque(): Promise<Veiculo[]> {
  let list: Veiculo[] = [];
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("veiculos")
        .select("*")
        .order("preco", { ascending: false });

      if (error) {
        console.warn("[Supabase] Query error, falling back to offline dataset:", error.message);
        list = MOCK_ESTOQUE;
      } else if (data && data.length > 0) {
        list = data.map(mapVeiculoDbToVeiculo);
      } else {
        list = MOCK_ESTOQUE;
      }
    } catch (err) {
      console.warn("[Supabase] Unexpected connection error, falling back to offline dataset:", err);
      list = MOCK_ESTOQUE;
    }
  } else {
    console.info("[Supabase] Client not configured. Serving high-fidelity local catalog.");
    list = MOCK_ESTOQUE;
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
        .from("veiculos")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      // If not found and ID is numeric, try numeric match
      if (!data && /^\d+$/.test(id)) {
        const numericId = parseInt(id, 10);
        const { data: numData } = await supabase
          .from("veiculos")
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
    const found = MOCK_ESTOQUE.find((item) => item.id === id);
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
export function getVeiculoPdpUrl(veiculo: { id: string; marca: string; modelo: string; versao: string }): string {
  const brandLower = veiculo.marca.toLowerCase().trim();
  const modelLower = veiculo.modelo.toLowerCase().trim();
  const versionLower = veiculo.versao.toLowerCase().trim();

  // 1. Clean model to remove duplicate brand prefix (e.g., "Chevrolet Cruze" -> "Cruze")
  let cleanModel = modelLower;
  if (cleanModel.startsWith(brandLower)) {
    cleanModel = cleanModel.slice(brandLower.length).trim();
  }

  // 2. Clean model to remove duplicate version suffix (e.g., if model is "cruze ltz 1.4 ..." and version is "ltz 1.4 ...")
  if (cleanModel.endsWith(versionLower)) {
    cleanModel = cleanModel.slice(0, cleanModel.length - versionLower.length).trim();
  }

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
  const slugMarca = finalBrand.replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
  const slugModelo = finalModel.replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
  const slugVersao = finalVersion.replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");

  // Create clean, beautiful full slug and URL path
  const slugCompletoComId = `${veiculo.id}.html`;
  
  return `/carros/${slugMarca}/${slugModelo}/${slugVersao}/${slugCompletoComId}`;
}
