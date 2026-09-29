/**
 * Quais colunas de `estoque_motors` a chave PÚBLICA lê — e quais nunca lê.
 *
 * ---------------------------------------------------------------------------
 * Por que existe (2026-09-29)
 * ---------------------------------------------------------------------------
 * A tabela tinha a policy `Allow public read access … USING (true)` e o papel
 * `anon` com SELECT em todas as colunas. Com a `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * — que está no bundle do site, é pública por natureza —, qualquer pessoa
 * lia na API do Supabase a placa, o chassi, o renavam e o CUSTO de compra de
 * todo o estoque. O mapper (`mapVeiculoDbToVeiculo`) nunca devolvia essas
 * colunas, mas o mapper não protege nada no banco.
 *
 * O conserto tem duas pontas, e as duas leem ESTE arquivo:
 *   - o código público pede exatamente `COLUNAS_PUBLICAS_DO_ESTOQUE` (nunca
 *     `select("*")`, que o PostgREST recusa inteiro quando falta privilégio em
 *     qualquer coluna);
 *   - a migração `20260929220000_leitura_anonima_sem_documento_nem_custo`
 *     revoga o SELECT de tabela do `anon` e concede, coluna a coluna, esta
 *     mesma lista. `tests/leitura-anonima-do-estoque.test.ts` trava as duas
 *     iguais.
 *
 * ---------------------------------------------------------------------------
 * Por que a lista é "tudo menos as internas", e não "o que o mapper lê"
 * ---------------------------------------------------------------------------
 * A primeira varredura do mapper não viu `tipo` — ele é lido por uma função
 * auxiliar (`resolveTipo(item)`), não por `dbItem.tipo`. Uma lista montada pelo
 * que o código parece ler deixa a vitrine degradar em silêncio (o carro sem
 * carroceria cai no segmento errado) sem erro nenhum. A régua segura é outra:
 * público é tudo que não é documento nem custo.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ Coluna nova em `estoque_motors`
 * ---------------------------------------------------------------------------
 * Nasce FECHADA para o `anon` — não há mais SELECT de tabela. Se ela é pública
 * (o site precisa ler), entra aqui E num `grant select (coluna) … to anon` de
 * migração, e o teste confere as duas. Se é interna, entra em
 * `COLUNAS_INTERNAS_DO_ESTOQUE`. Esquecer os dois é seguro (fica fechada);
 * esquecer só a migração faz a vitrine ser recusada inteira — e é isso que o
 * teste pega antes do deploy.
 */

/** Documento e custo: nunca na chave pública. */
export const COLUNAS_INTERNAS_DO_ESTOQUE = [
  "placa",
  "chassi",
  "renavam",
  "preco_compra",
  "valor_fipe",
  "codigo_fipe",
] as const;

/** Tudo que a chave pública lê — as 49 colunas de 29/09 menos as 6 internas. */
export const COLUNAS_PUBLICAS_DO_ESTOQUE = [
  "id",
  "marca",
  "modelo",
  "versao",
  "ano",
  "ano_fabricacao",
  "preco",
  "preco_original",
  "preco_promocional",
  "quilometragem",
  "cambio",
  "combustivel",
  "cor",
  "tipo",
  "perfil_uso",
  "url_imagem",
  "link_conversao",
  "pericia",
  "whatsapp_images",
  "web_full_images",
  "created_at",
  "descricao",
  "laudo_pericia",
  "opcionais",
  "status_tag",
  "status_tag_color",
  "vendido",
  "last_seen_at",
  "motor",
  "cor_interna",
  "donos_anteriores",
  "garantia_fabrica",
  "conteudo_atualizado_em",
  "descricao_seo",
  "first_seen_at",
  "modelo_override",
  "versao_override",
  "perfis_uso",
  "origem",
  "estado_cadastro",
  "portas",
  "em_preparacao",
  "previsao_chegada_em",
] as const;

/** O `select` do PostgREST para a leitura pública. */
export const SELECT_PUBLICO_DO_ESTOQUE = COLUNAS_PUBLICAS_DO_ESTOQUE.join(",");
