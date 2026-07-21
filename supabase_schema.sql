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

-- 3. Criar políticas para permitir leitura pública e gravação protegida para administradores
DROP POLICY IF EXISTS "Allow public read access" ON public.site_settings;
CREATE POLICY "Allow public read access" ON public.site_settings
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public update access" ON public.site_settings;
DROP POLICY IF EXISTS "Allow admin update access" ON public.site_settings;
CREATE POLICY "Allow admin update access" ON public.site_settings
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
            ) OR auth.jwt() ->> 'email' IN ('motors@motorsstoreoficial.com.br', 'dyones@gmail.com')
        )
    ) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public insert access" ON public.site_settings;
DROP POLICY IF EXISTS "Allow admin insert access" ON public.site_settings;
CREATE POLICY "Allow admin insert access" ON public.site_settings
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
            ) OR auth.jwt() ->> 'email' IN ('motors@motorsstoreoficial.com.br', 'dyones@gmail.com')
        )
    );

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


-- ==========================================================
-- 5. AJUSTES DA TABELA 'veiculos' (OPCIONAIS, LAUDO E RLS)
-- Execute estas instruções para garantir que a tabela de veículos
-- tenha as colunas customizadas do painel e as políticas RLS adequadas.
-- ==========================================================

-- Adicionar colunas customizadas do painel administrativo se não existirem
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS laudo_pericia text;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS opcionais text;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS perfil_uso text;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS status_tag text;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS status_tag_color text;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS vendido boolean DEFAULT false;

-- Habilitar o Row Level Security (RLS) na tabela 'veiculos'
ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;

-- Criar políticas para permitir leitura, inserção e atualização públicas na tabela 'veiculos'
DROP POLICY IF EXISTS "Allow public read access" ON public.veiculos;
CREATE POLICY "Allow public read access" ON public.veiculos
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public update access" ON public.veiculos;
CREATE POLICY "Allow public update access" ON public.veiculos
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public insert access" ON public.veiculos;
CREATE POLICY "Allow public insert access" ON public.veiculos
    FOR INSERT WITH CHECK (true);


-- ==========================================================
-- 6. TABELA DE PERFIS DE USUÁRIOS E CONTROLE DE ACESSO (AUTH)
-- ==========================================================

-- Criar a tabela 'profiles' para estender auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'comercial' CHECK (role IN ('admin', 'comercial', 'financeiro')),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Funções auxiliares para evitar recursão infinita no RLS
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_finance_access(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role IN ('admin', 'financeiro') AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Políticas de RLS
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT USING ( public.is_admin(auth.uid()) );

DROP POLICY IF EXISTS "Admins manage all profiles" ON public.profiles;
CREATE POLICY "Admins manage all profiles" ON public.profiles
  FOR ALL USING ( public.is_admin(auth.uid()) );

-- Trigger para criação automática de perfil no cadastro do usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'comercial')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==========================================================
-- 7. TABELAS DO MÓDULO FINANCEIRO E ADMINISTRATIVO
-- ==========================================================

-- 7.1. Tabela de Categorias Financeiras
CREATE TABLE IF NOT EXISTS public.categorias_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  cor TEXT DEFAULT '#6B7280',
  icone TEXT DEFAULT '📁',
  ativa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.categorias_financeiras ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para categorias_financeiras (Apenas admin e financeiro)
DROP POLICY IF EXISTS "Finance categories access" ON public.categorias_financeiras;
CREATE POLICY "Finance categories access" ON public.categorias_financeiras
  FOR ALL USING ( public.has_finance_access(auth.uid()) );

-- 7.1.B. Tabela de Parceiros (Fornecedores e Clientes)
CREATE TABLE IF NOT EXISTS public.parceiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('fornecedor', 'cliente', 'ambos')),
  documento TEXT, -- CPF ou CNPJ
  telefone TEXT,
  email TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para parceiros
DROP POLICY IF EXISTS "Finance partners access" ON public.parceiros;
CREATE POLICY "Finance partners access" ON public.parceiros
  FOR ALL USING ( public.has_finance_access(auth.uid()) );

-- Limpar categorias duplicadas e criar constraint única para evitar duplicação em execuções subsequentes
DELETE FROM public.categorias_financeiras a
USING public.categorias_financeiras b
WHERE a.id > b.id
  AND a.nome = b.nome
  AND a.tipo = b.tipo;

ALTER TABLE public.categorias_financeiras DROP CONSTRAINT IF EXISTS unique_nome_tipo;
ALTER TABLE public.categorias_financeiras ADD CONSTRAINT unique_nome_tipo UNIQUE (nome, tipo);

-- Inserir Categorias Padrão
INSERT INTO public.categorias_financeiras (nome, tipo, cor, icone) VALUES
('Venda de Veículo', 'receita', '#10B981', '🚗'),
('Financiamento / Consórcio', 'receita', '#3B82F6', '🏦'),
('Serviços Mecânicos', 'receita', '#8B5CF6', '🔧'),
('Venda de Acessórios', 'receita', '#F59E0B', '🎒'),
('Outras Receitas', 'receita', '#6B7280', '💵'),
('Aluguel da Loja', 'despesa', '#EF4444', '🏠'),
('Energia Elétrica', 'despesa', '#F59E0B', '⚡'),
('Água e Saneamento', 'despesa', '#3B82F6', '💧'),
('Internet / Telefone', 'despesa', '#6366F1', '🌐'),
('Combustível', 'despesa', '#EC4899', '⛽'),
('Manutenção da Loja', 'despesa', '#14B8A6', '🛠️'),
('Salários e Comissões', 'despesa', '#10B981', '👥'),
('Impostos e Taxas', 'despesa', '#F43F5E', '📄'),
('Marketing e Tráfego', 'despesa', '#8B5CF6', '📢'),
('Compra de Veículo (Estoque)', 'despesa', '#EF4444', '🔑'),
('Outras Despesas', 'despesa', '#6B7280', '💸')
ON CONFLICT DO NOTHING;

-- 7.2. Tabela de Contas (A Pagar e A Receber)
CREATE TABLE IF NOT EXISTS public.contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('pagar', 'receber')),
  descricao TEXT NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'vencido', 'cancelado', 'parcial')),
  categoria_id UUID REFERENCES public.categorias_financeiras(id),
  veiculo_id TEXT, -- Referência ao veículo do inventário
  fornecedor TEXT,
  cliente TEXT,
  forma_pagamento TEXT CHECK (forma_pagamento IN (
    'dinheiro', 'pix', 'cartao_credito', 'cartao_debito',
    'boleto', 'transferencia', 'cheque', 'financiamento'
  )),
  parcela_atual INTEGER DEFAULT 1,
  total_parcelas INTEGER DEFAULT 1,
  grupo_parcela UUID,
  recorrencia_id UUID,
  observacoes TEXT,
  comprovante_url TEXT,
  notificado BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices de Performance
CREATE INDEX IF NOT EXISTS idx_contas_vencimento ON public.contas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_status ON public.contas(status);
CREATE INDEX IF NOT EXISTS idx_contas_tipo ON public.contas(tipo);
CREATE INDEX IF NOT EXISTS idx_contas_categoria ON public.contas(categoria_id);

-- Habilitar RLS
ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para contas (Apenas admin e financeiro)
DROP POLICY IF EXISTS "Finance accounts access" ON public.contas;
CREATE POLICY "Finance accounts access" ON public.contas
  FOR ALL USING ( public.has_finance_access(auth.uid()) );

-- 7.3. Tabela de Despesas Recorrentes
CREATE TABLE IF NOT EXISTS public.despesas_recorrentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  categoria_id UUID REFERENCES public.categorias_financeiras(id),
  fornecedor TEXT,
  frequencia TEXT NOT NULL CHECK (frequencia IN (
    'semanal', 'quinzenal', 'mensal', 'bimestral',
    'trimestral', 'semestral', 'anual'
  )),
  dia_vencimento INTEGER CHECK (dia_vencimento BETWEEN 1 AND 31),
  forma_pagamento TEXT,
  ativa BOOLEAN DEFAULT true,
  proxima_geracao DATE,
  observacoes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.despesas_recorrentes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para despesas_recorrentes
DROP POLICY IF EXISTS "Finance recurring access" ON public.despesas_recorrentes;
CREATE POLICY "Finance recurring access" ON public.despesas_recorrentes
  FOR ALL USING ( public.has_finance_access(auth.uid()) );

-- 7.4. Tabela de Compras de Produtos
CREATE TABLE IF NOT EXISTS public.compras_produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  fornecedor TEXT NOT NULL,
  valor_total DECIMAL(12,2) NOT NULL,
  quantidade INTEGER DEFAULT 1,
  valor_unitario DECIMAL(12,2),
  data_compra DATE NOT NULL DEFAULT CURRENT_DATE,
  categoria TEXT CHECK (categoria IN (
    'peca_reposicao', 'acessorio', 'material_escritorio',
    'material_limpeza', 'combustivel', 'ferramenta', 'outro'
  )),
  veiculo_id TEXT,
  nota_fiscal TEXT,
  status TEXT DEFAULT 'recebido' CHECK (status IN ('pendente', 'encomendado', 'recebido', 'cancelado')),
  conta_id UUID REFERENCES public.contas(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.compras_produtos ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para compras_produtos
DROP POLICY IF EXISTS "Finance purchases access" ON public.compras_produtos;
CREATE POLICY "Finance purchases access" ON public.compras_produtos
  FOR ALL USING ( public.has_finance_access(auth.uid()) );

-- 7.5. Tabela de Movimentações (Audit Log / Extrato)
CREATE TABLE IF NOT EXISTS public.movimentacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id UUID REFERENCES public.contas(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  valor DECIMAL(12,2) NOT NULL,
  descricao TEXT NOT NULL,
  data_movimentacao DATE NOT NULL DEFAULT CURRENT_DATE,
  forma_pagamento TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para movimentacoes
DROP POLICY IF EXISTS "Finance movements access" ON public.movimentacoes;
CREATE POLICY "Finance movements access" ON public.movimentacoes
  FOR ALL USING ( public.has_finance_access(auth.uid()) );

-- 7.6. Tabela de Notificações Financeiras
CREATE TABLE IF NOT EXISTS public.notificacoes_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id UUID REFERENCES public.contas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'vencimento_proximo', 'vencido', 'pago', 'cancelado'
  )),
  mensagem TEXT NOT NULL,
  enviada BOOLEAN DEFAULT false,
  canal TEXT DEFAULT 'webhook',
  enviada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.notificacoes_financeiras ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para notificacoes_financeiras
DROP POLICY IF EXISTS "Finance notifications access" ON public.notificacoes_financeiras;
CREATE POLICY "Finance notifications access" ON public.notificacoes_financeiras
  FOR ALL USING ( public.has_finance_access(auth.uid()) );

-- 7.7. Função Utilitária para Atualizar Contas Vencidas Diariamente
CREATE OR REPLACE FUNCTION public.atualizar_contas_vencidas()
RETURNS void AS $$
BEGIN
  UPDATE public.contas
  SET status = 'vencido', updated_at = now()
  WHERE status = 'pendente'
    AND data_vencimento < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;




