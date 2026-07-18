// Global TypeScript Interfaces for Motors Store

export type ThemeType = "luxury-light" | "stealth-dark" | "sport-nardo";

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
  ga4Id?: string;
  metaPixelId?: string;
  googleAdsId?: string;
  googleAdsConversionLabel?: string;
  instagramUsername?: string;
  instagramElfsightId?: string;
  googleReviewsElfsightId?: string;
  carMatchTitle?: string;
  avaliacaoExpressTitle?: string;
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
  preco?: number;
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
  whatsappNumber: string;
}
