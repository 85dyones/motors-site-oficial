-- ==========================================================
-- SCRIPT DE SCHEMA PARA DADOS DA EMPRESA E SOBRE (SITE SETTINGS)
-- Execute este script no SQL Editor do seu Dashboard do Supabase.
-- ==========================================================

-- 1. Criar a tabela 'site_settings'
CREATE TABLE IF NOT EXISTS public.site_settings (
    id text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. Habilitar o Row Level Security (RLS)
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- 3. Criar políticas para permitir leitura e gravação públicas
-- IMPORTANTE: Garante acesso livre para que o site consiga sincronizar entre desktop e mobile
CREATE POLICY "Allow public read access" ON public.site_settings
    FOR SELECT USING (true);

CREATE POLICY "Allow public update access" ON public.site_settings
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow public insert access" ON public.site_settings
    FOR INSERT WITH CHECK (true);

-- 4. Inserir dados padrão de semente (Seeding) caso não existam
-- Usamos "isCustom": false por padrão para que o primeiro acesso do cliente com dados customizados
-- no localStorage consiga realizar o upload de suas configurações para a nuvem.
INSERT INTO public.site_settings (id, data)
VALUES 
('company', '{"name": "Motors Store", "phone": "(11) 4003-0000", "whatsapp": "(11) 99999-9999", "whatsappRaw": "5511999999999", "address": "Av. Europa, 1000 - Jardim Europa, São Paulo - SP, CEP 01449-000", "hours": "Seg a Sex das 9h às 19h\nSáb das 9h às 14h", "instagram": "https://instagram.com/motorsstore", "facebook": "https://facebook.com/motorsstore", "cnpj": "12.345.678/0001-99", "isCustom": false}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.site_settings (id, data)
VALUES 
('about', '{"heroTitle": "MOLDANDO A CURADORIA PREMIUM", "heroSubtitle": "De um tradicional showroom físico na icônica Avenida Europa à vanguarda da inteligência artificial automotiva. A Motors Store é a fusão exata de legado, engenharia de procedência e tecnologia de ponta.", "historyTitle": "A Herança da Avenida Europa", "historyP1": "Fundada há mais de uma década no coração financeiro e automotivo de alto padrão de São Paulo, a Motors Store nasceu com a missão de transformar o mercado de veículos seminovos selecionados. Desde os primeiros supercarros clássicos até os modernos hyper-EVs, cada veículo em nosso acervo passa por uma avaliação cirúrgica.", "historyP2": "Nosso compromisso inegociável é com a transparência total. Fomos a primeira revenda a disponibilizar laudos de perícia cautelar 100% integrados em tempo real na listagem web, garantindo ao comprador a segurança de fábrica em cada compra.", "valuesTitle": "Perícia e Rigor Técnico", "value1": "Laudo Cautelar 100% Livre: Histórico estrutural intocado e verificado.", "value2": "Garantia de Showroom: Revisão profunda de 120 itens em mecânica e elétrica.", "value3": "Valoração Fipe de Precisão: Atualização contínua com indicadores oficiais de mercado.", "techTitle": "A EXPERIÊNCIA COMPLETA MOTORS STORE", "techSubtitle": "Nossa plataforma web 2.0 não é apenas um catálogo digital. Criamos sistemas inteligentes locais para guiar seu investimento com máxima precisão.", "card1Title": "PREVISÃO FIPE EXPRESS", "card1Desc": "Algoritmo de cálculo instantâneo que traduz dados técnicos e quilometragem em uma cotação justa de mercado para seu veículo de entrada em segundos.", "card2Title": "ALGORITMO DE DISTÂNCIA", "card2Desc": "Sistema dinâmico que cruza faixa de investimento, buffers de tolerância de 15% para upgrades recomendados e preferences de carroceria do usuário.", "card3Title": "ASSISTENTE SEMÂNTICO LOCAL", "card3Desc": "Analisador natural de texto livre de alta velocidade. Extrai limites numéricos de orçamento de expressões livres e mapeia styles de uso.", "ctaTitle": "PRONTO PARA ENCONTRAR SEU PRÓXIMO DESTINO?", "ctaDescription": "Experimente a segurança da nossa curadoria digital ou agende uma visita ao nosso showroom no Bacacheri, pertinho da Rua Canadá. Atendimento presencial de excelência e logística de entrega para todo o Brasil.", "ctaBtn1Text": "INICIAR CURADORIA IA", "ctaBtn2Text": "FALE CONOSCO", "isCustom": false}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.site_settings (id, data)
VALUES 
('webhooks', '{"webhookUrl": "https://n8n.v2o5.com.br/webhook/lead-entrada", "webhookAvaliacaoUrl": "https://n8n.v2o5.com.br/webhook/sdr-captura-lead"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.site_settings (id, data)
VALUES 
('popups', '{"campaigns": [
  {
    "id": "camp-home-wa",
    "name": "🔥 Ofertão Relâmpago (WhatsApp)",
    "enabled": true,
    "targetPage": "home",
    "triggerType": "time",
    "delaySeconds": 45,
    "actionType": "whatsapp",
    "actionTarget": "Olá! Vi a condição especial no site e gostaria de falar com um especialista agora! (Ref: {ref})",
    "icon": "🔥",
    "title": "CONDIÇÃO EXCLUSIVA PRA VOCÊ",
    "subtitle": "Fale agora com nosso especialista e garanta sua condição diferenciada. Oferta válida por tempo limitado.",
    "ctaText": "FALAR COM ESPECIALISTA AGORA"
  },
  {
    "id": "camp-pdp-wa",
    "name": "⚡ Oferta Ficha Técnico (WhatsApp)",
    "enabled": true,
    "targetPage": "pdp",
    "triggerType": "time",
    "delaySeconds": 20,
    "actionType": "whatsapp",
    "actionTarget": "Olá! Vi a oferta especial do {carro} no site e gostaria de aproveitar a condição exclusiva! (Ref: {ref})",
    "icon": "⚡",
    "title": "OPORTUNIDADE ÚNICA — {carro}",
    "subtitle": "Condição especial exclusiva para o {carro}{preco}. Fale com nosso especialista antes que expire.",
    "ctaText": "GARANTIR MINHA CONDIÇÃO"
  },
  {
    "id": "camp-carmatch",
    "name": "🤖 Assistente de Garagem IA (Link)",
    "enabled": true,
    "targetPage": "home",
    "triggerType": "time",
    "delaySeconds": 30,
    "actionType": "link",
    "actionTarget": "/#match-garagem",
    "icon": "🤖",
    "title": "BUSCANDO O CARRO PERFEITO?",
    "subtitle": "Experimente nosso Assistente de Garagem IA. Responda 3 perguntas e o algoritmo faz a curadoria ideal para você.",
    "ctaText": "FAZER MATCH DE GARAGEM"
  },
  {
    "id": "camp-avaliacao",
    "name": "🚗 Avaliação Express (Link)",
    "enabled": true,
    "targetPage": "home",
    "triggerType": "time",
    "delaySeconds": 60,
    "actionType": "link",
    "actionTarget": "/#avaliacao-express",
    "icon": "🚗",
    "title": "QUER VENDER SEU VEÍCULO?",
    "subtitle": "Simule a avaliação do seu carro usado agora mesmo na nossa ferramenta online. Simples, rápido e com preço de pátio.",
    "ctaText": "AVALIAR MEU USADO AGORA"
  },
  {
    "id": "camp-comparador",
    "name": "📊 Educacional Comparador (Ação Interna)",
    "enabled": true,
    "targetPage": "pdp",
    "triggerType": "time",
    "delaySeconds": 35,
    "actionType": "compare",
    "actionTarget": "",
    "icon": "📊",
    "title": "DÚVIDA ENTRE MODELOS?",
    "subtitle": "Sabia que você pode adicionar veículos do catálogo para comparar as especificações técnicas completas lado a lado?",
    "ctaText": "ABRIR MEU COMPARADOR"
  },
  {
    "id": "camp-exit-intent",
    "name": "👋 Intenção de Saída (WhatsApp)",
    "enabled": true,
    "targetPage": "any",
    "triggerType": "exit",
    "delaySeconds": 0,
    "actionType": "whatsapp",
    "actionTarget": "Olá! Gostaria de receber uma avaliação exclusiva sem compromisso antes de decidir. (Ref: {ref})",
    "icon": "👋",
    "title": "ANTES DE IR...",
    "subtitle": "Que tal uma avaliação sem compromisso? Nosso especialista está disponível agora para te atender com exclusividade.",
    "ctaText": "FALAR COM ESPECIALISTA"
  }
]}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.site_settings (id, data)
VALUES 
('quick_tags', '{"quickTags": [
  { "id": "curadoria", "name": "CURADORIA EXCLUSIVA", "field": "perfil_uso", "operator": "equals", "value": "CURADORIA EXCLUSIVA" },
  { "id": "economicos", "name": "ECONÔMICOS", "field": "preco", "operator": "less", "value": "180000" },
  { "id": "baixa_km", "name": "BAIXA QUILOMETRAGEM", "field": "quilometragem", "operator": "less", "value": "40000" },
  { "id": "parcela_1k", "name": "PARCELA 1K", "field": "preco", "operator": "less", "value": "120000" }
]}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.site_settings (id, data)
VALUES 
('stock_overrides', '{"overrides": {}}')
ON CONFLICT (id) DO NOTHING;

