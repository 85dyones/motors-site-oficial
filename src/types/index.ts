// Global TypeScript Interfaces for Motors Store

export type ThemeType = "luxury-light" | "stealth-dark" | "sport-nardo" | "motors-modernist";

export interface ThemeProperties {
  "--brand-background": string;
  "--brand-foreground": string;
  "--brand-primary": string;
  "--brand-primary-hover": string;
  "--brand-gold": string;
  "--brand-card": string;
  "--brand-card-border": string;
  "--brand-border": string;
  "--brand-shadow": string;
  "--brand-glass-bg": string;
  "--brand-footer-bg": string;
}

export interface CompanySettings {
  name: string;
  phone: string;
  whatsapp: string;
  whatsappRaw: string;
  address: string;
  hours: string;
  instagram: string;
  facebook: string;
  cnpj: string;
  tabTitle?: string;
  faviconUrl?: string;
  logoUrl?: string;
  isCustom?: boolean;
  /** Canal de contato para solicitações de titular de dados (LGPD Art. 18/41). Exibido em /privacidade. */
  privacyContactEmail?: string;
  ga4Id?: string;
  gtmId?: string;
  metaPixelId?: string;
  googleAdsId?: string;
  googleAdsConversionLabel?: string;
  instagramUsername?: string;
  // `instagramElfsightId` e `googleReviewsElfsightId` saíram em 2026-08-06.
  // Eram o ID do widget de terceiro que renderizava a faixa do Instagram e a
  // seção de reputação. Ambas passaram a ser servidas pelo próprio site — ver
  // `lib/instagramCuradoria.ts` e `lib/avaliacoesGoogle.ts`. Linha que sobrar
  // no blob de `site_settings` é ignorada: nada mais lê esses campos.
  carMatchTitle?: string;
  avaliacaoExpressTitle?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
}

export interface AboutSettings {
  heroTitle: string;
  heroSubtitle: string;
  historyTitle: string;
  historyP1: string;
  historyP2: string;
  valuesTitle: string;
  value1: string;
  value2: string;
  value3: string;
  techTitle: string;
  techSubtitle: string;
  card1Title: string;
  card1Desc: string;
  card2Title: string;
  card2Desc: string;
  card3Title: string;
  card3Desc: string;
  ctaTitle?: string;
  ctaDescription?: string;
  ctaBtn1Text?: string;
  ctaBtn2Text?: string;
  isCustom?: boolean;
}

/**
 * Um dos blocos da faixa de procedência da página do veículo.
 *
 * O texto é institucional — vale para todo o estoque — mas é editável no
 * painel porque promete coisa que nem sempre a loja pode cumprir do mesmo
 * jeito (histórico de revisões que não existe, transferência que depende do
 * caso). `ativo: false` tira o bloco do ar sem apagar o texto.
 */
export interface ItemProcedencia {
  id: string;
  titulo: string;
  descricao: string;
  ativo: boolean;
}

export interface Webhooks {
  webhookUrl: string;
  webhookAvaliacaoUrl: string;
  webhookNotificacoesUrl: string;
  webhookPropostaUrl?: string;
  webhookDuvidasUrl?: string;
  events?: Record<string, boolean>;
  apiSecretToken?: string;
}

export interface Campaign {
  id: string;
  name: string;
  enabled: boolean;
  targetPage: "home" | "pdp" | "any" | "specific";
  triggerType: "time" | "exit";
  delaySeconds: number;
  actionType: "whatsapp" | "link" | "compare";
  actionTarget: string;
  icon: string;
  title: string;
  subtitle: string;
  ctaText: string;
  targetVehicleId?: string;
}

export interface QuickTag {
  id: string;
  name: string;
  field: "perfil_uso" | "preco" | "quilometragem" | "tipo" | "marca" | "combustivel" | "manual";
  operator: "equals" | "less" | "greater" | "contains" | "none";
  value: string;
  description?: string;
  bannerMode?: "image" | "carousel";
  bgImageUrl?: string;
  featuredVehicleIds?: string[];
}

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
  preco?: number;
  // Ficha própria do painel (migração 20260807160000) — preenchida por nós,
  // nunca pelo sync do RevendaMais. `placa` voltou ao tipo por decisão do
  // dono em 2026-08-07: agora a coluna EXISTE, então o campo deixa de ser
  // convite a inventar valor (o incidente que o tirou daqui). O site público
  // não exibe a placa; ela é operacional do painel.
  placa?: string;
  motor?: string;
  cor_interna?: string;
  donos_anteriores?: number;
  garantia_fabrica?: string;
}

export type StockOverrides = Record<string, {
  status_tag?: string;
  status_tag_color?: string;
  vendido?: boolean;
  tipo?: string;
  perfil_uso?: string;
  quick_tags?: string[];
}>;

export interface PopupSettings {
  enabled: boolean;
  cooldownHours: number;
  /**
   * O pop-up não tem mais número próprio — usa o da concessionária, como o
   * resto do site (`lib/whatsapp.ts`). A chave pode continuar existindo no
   * JSON já gravado em `site_settings`; ninguém a lê. Removida do tipo de
   * propósito: campo morto que parece vivo é como a loja acaba atendendo em
   * dois números sem perceber.
   */
}
