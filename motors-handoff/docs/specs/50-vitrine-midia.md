# Spec 50 — Vitrine, portais e mídia

- F2: estoque_motors vira projeção do núcleo (shape preservado — o site não muda). Publicável =
  situacao estoque + fotos mínimas + preço vigente + sem bloqueio/pendência grave de procedência.
- Integrador: feed/API por portal (Webmotors, OLX, ML — confirmar ativos), tabela anuncios com
  status/id_externo/erro/último sync + reprocesso. Despublicação automática no VENDA (e na
  PRE_VENDA_LANCADA: remover da vitrine; portais conforme regra).
- VERSIONAR anúncio publicado: texto, fotos, preço, km, data, portal — imutável, preso à unidade.
  Anúncio integra o contrato (CDC art. 30); isto é prova. Diferencial: ninguém no segmento faz.
- Fotos DA VITRINE: sessão profissional + upload posterior no admin (desktop), Supabase Storage
  próprio (ELIMINAR dependência de s3.carro57.com.br na F1), pipeline de tratamento em fila,
  ordenação padrão, capa. Fotos do PWA de pátio são só REGISTRO INTERNO (recebimento, avarias,
  vistoria) — nunca publicadas na vitrine/portais. Carro sem sessão profissional = não publicável.
  Descrição via Gemini: manter fluxo n8n, trocar origem.
- Mídia (F2): ingestão diária de gasto Meta por campanha → MIDIA_ATRIBUIDA por unidade via
  parâmetros de clique já usados no funil → partida D4.2.1 com dimensão campanha.
  Margem após mídia por unidade = diferencial competitivo nº 1.
