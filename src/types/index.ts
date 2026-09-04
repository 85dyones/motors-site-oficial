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

/**
 * O que o WhatsApp, o Facebook e o LinkedIn mostram quando alguém cola o link
 * de uma página.
 *
 * Campo vazio não vira texto padrão nem imagem quebrada: cai no fallback da
 * página (o texto que o SEO já usa) e, na falta de imagem, no card gerado por
 * `/api/og`. Mesma regra do resto do painel — branco significa "usa o de
 * fábrica", não "publica em branco".
 */
export interface CardCompartilhamento {
  titulo?: string;
  descricao?: string;
  /** 1200×630. O upload do painel já entrega nessa proporção, em JPEG. */
  imagemUrl?: string;
}

/**
 * Cards por página, com `padrao` valendo para toda página sem card próprio.
 *
 * A PDP não está aqui de propósito: ela compartilha a foto do próprio veículo,
 * que é sempre melhor do que qualquer arte fixa que a loja subisse.
 */
export interface CompartilhamentoSettings {
  padrao?: CardCompartilhamento;
  home?: CardCompartilhamento;
  estoque?: CardCompartilhamento;
  avaliacao?: CardCompartilhamento;
  carroPerfeito?: CardCompartilhamento;
  sobre?: CardCompartilhamento;
  contato?: CardCompartilhamento;
  destaques?: CardCompartilhamento;
  privacidade?: CardCompartilhamento;
}

export interface CompanySettings {
  name: string;
  phone: string;
  whatsapp: string;
  whatsappRaw: string;
  address: string;
  /**
   * Coordenadas da entrada da loja, como o Google Maps entrega (clique com o
   * botão direito no pin → copiar coordenadas). Alimentam o `geo` do
   * `AutoDealer` (`lib/schemaLoja.ts`).
   *
   * Opcionais e sem padrão de propósito: coordenada aproximada diverge do pin
   * do Perfil da Empresa, e divergência é sinal negativo de SEO local — pior
   * que campo ausente. Em branco, o `geo` não é publicado.
   */
  latitude?: string;
  longitude?: string;
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
  /**
   * O container do GTM já tem as tags de evento publicadas?
   *
   * Enquanto for falso, `lib/telemetry.ts` continua mandando `generate_lead` e
   * a conversão do Ads por `gtag`. Quando virar verdadeiro, ele cede a vez ao
   * container.
   *
   * ⚠️ **Existir `gtmId` NÃO basta**, e essa confusão custou caro em
   * 2026-08-26: o container `GTM-TB665RN9` estava configurado no painel e
   * carregando em produção, mas **vazio** — importado sem as tags. O código
   * cedeu a vez para quem não media nada, e o `generate_lead` parou de chegar
   * ao GA4. Container carregando e container medindo são coisas diferentes, e
   * o site não tem como distinguir sozinho: só quem publicou sabe.
   *
   * Ligar **depois** de importar, publicar e conferir no GTM Preview.
   */
  gtmAssumeEventos?: boolean;
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
  /** Cards de compartilhamento por página (aba "Compartilhar" do painel). */
  compartilhamento?: CompartilhamentoSettings;
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

/**
 * Credenciais de LEITURA do Google Analytics 4 — as que o painel usa para
 * mostrar visitas. Nada a ver com a coleta, que roda no navegador com o
 * `G-...` público (ver `IntegrationsTracker` e TRACKING_SPEC.md).
 *
 * Guardadas em `site_settings` (id `ga4`), editáveis pelo painel, com
 * `process.env.GA4_*` de reserva — mesmo contrato do `apiSecretToken`.
 */
export interface Ga4Settings {
  /** ID NUMÉRICO da propriedade. Não é o "G-KBL1MFN9E3". */
  propertyId?: string;
  /** E-mail da conta de serviço do Google Cloud. */
  clientEmail?: string;
  /**
   * Chave privada do JSON da conta de serviço.
   *
   * ⚠️ **Só existe no sentido servidor → banco.** O `GET /api/settings` a
   * substitui por `privateKeyConfigurada` antes de responder; quem vier daqui
   * para a tela nunca deve encontrá-la preenchida. Ver `mascararGa4`.
   */
  privateKey?: string;
  /**
   * O que a tela recebe no lugar da chave: "tem uma guardada" ou "não tem".
   * Nunca é gravado no banco — é um campo de resposta, não de dado.
   */
  privateKeyConfigurada?: boolean;
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

/** Os campos que o editor de destaque oferece. Aberto na leitura — ver `checkTagMatchesVehicle`. */
export type CampoDeTag =
  | "perfil_uso"
  | "preco"
  | "quilometragem"
  | "tipo"
  | "marca"
  | "combustivel"
  | "cambio"
  | "ano"
  | "manual";

export type OperadorDeTag = "equals" | "less" | "greater" | "contains" | "none";

/**
 * Uma condição da regra de curadoria.
 *
 * A regra nasceu com UMA condição — um campo, um operador, um valor — e isso
 * não expressa "SUV para família" nem "automático com baixa km", que é
 * justamente o que o vocabulário de perfis múltiplos abriu.
 */
export interface CondicaoDeTag {
  field: CampoDeTag;
  operator: OperadorDeTag;
  value: string;
}

export interface QuickTag {
  id: string;
  name: string;
  /**
   * ⚠️ Os três campos abaixo são a forma ANTIGA, e continuam sendo lidos para
   * sempre. As tags gravadas em produção estão nela, e reescrever o que
   * funciona seria risco sem retorno — `condicoesDaTag` (lib/regrasEstoque)
   * traduz as duas formas num lugar só.
   *
   * O painel grava `condicoes`.
   */
  field?: CampoDeTag;
  operator?: OperadorDeTag;
  value?: string;
  /** A forma nova: todas as condições precisam casar (E). */
  condicoes?: CondicaoDeTag[];
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
  /**
   * Para que o carro serve — um ou vários. Vocabulário fechado em
   * `lib/perfisDeUso.ts`; cada valor vira `/estoque/{slug}`.
   *
   * Sempre array depois de `mapDbToVeiculo`, mesmo quando a linha só tem o
   * `perfil_uso` singular: a resolução acontece na leitura, num lugar só.
   */
  perfis_uso?: string[];
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
  /**
   * De onde a linha veio: `sync` (RevendaMais) ou `painel` (cadastro nativo,
   * migração 20260829130000). Metadado operacional, não dado sensível — por
   * isso viaja no mapper como qualquer outro campo, ao contrário de
   * `preco_compra`/`placa`, que exigem pedido explícito.
   *
   * Quem precisa dele: o painel, para dizer quem manda naquela ficha — veículo
   * do sync é sobrescrito pelo RevendaMais a cada 6 h, veículo do painel não
   * (a trava vive no banco). E `bloqueiosDePublicacao`, para mandar o operador
   * subir a foto em vez de esperar um feed que nunca vai trazê-la.
   */
  origem?: "sync" | "painel";
  // Ficha própria do painel (migração 20260807160000) — preenchida por nós,
  // nunca pelo sync do RevendaMais. `placa` voltou ao tipo por decisão do
  // dono em 2026-08-07: agora a coluna EXISTE, então o campo deixa de ser
  // convite a inventar valor (o incidente que o tirou daqui). O site público
  // não exibe a placa; ela é operacional do painel.
  placa?: string;
  motor?: string;
  cor_interna?: string;
  donos_anteriores?: number;
  /**
   * Quando o veículo apareceu no feed pela primeira vez — a data de chegada.
   *
   * `null` nas linhas anteriores à migração `20260826030000`: idade
   * desconhecida, e quem consome omite o campo em vez de inventar zero.
   */
  first_seen_at?: string | null;
  garantia_fabrica?: string;
  /**
   * Quantas portas — do `<DOORS>` do feed (migração `20260904120000`).
   *
   * `undefined` quando não se aplica ou não foi informado. O feed manda `0` em
   * moto, e a importação converte para nulo: `numberOfDoors: 0` no JSON-LD não
   * é campo vazio, é afirmação falsa.
   *
   * **Nunca deduzir da carroceria.** Medido no feed de 04/09: duas Kombis com
   * contagens diferentes entre si (4 e 3), duas Saveiros cabine simples (2) e
   * o Fusca (2) — a dedução erraria em pelo menos cinco dos 39.
   */
  portas?: number;
}

export type StockOverrides = Record<string, {
  status_tag?: string;
  status_tag_color?: string;
  vendido?: boolean;
  tipo?: string;
  perfil_uso?: string;
  /**
   * Para que o carro serve — um ou vários. Vocabulário fechado em
   * `lib/perfisDeUso.ts`; cada valor vira `/estoque/{slug}`.
   *
   * Sempre array depois de `mapDbToVeiculo`, mesmo quando a linha só tem o
   * `perfil_uso` singular: a resolução acontece na leitura, num lugar só.
   */
  perfis_uso?: string[];
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
