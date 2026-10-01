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
 * Nasce FECHADA para o `anon` e, desde 20261001150000, para o `authenticated`
 * também — nenhum dos dois tem mais SELECT de tabela. Se ela é pública (o site
 * precisa ler), entra aqui E num `grant select (coluna) … to anon,
 * authenticated` de migração, e os testes conferem os dois papéis. Se é
 * interna, entra em `COLUNAS_INTERNAS_DO_ESTOQUE`. Esquecer os dois é seguro
 * (fica fechada); esquecer só a migração faz a vitrine ser recusada inteira —
 * e é isso que o teste pega antes do deploy. Nos dois casos, a mesma migração
 * recria a view da equipe (ver `ESTOQUE_DA_EQUIPE` abaixo).
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

/**
 * Por onde a EQUIPE lê documento e custo — 2026-10-01.
 *
 * ---------------------------------------------------------------------------
 * Por que existe
 * ---------------------------------------------------------------------------
 * Até aqui o `authenticated` lia a tabela inteira, e `authenticated` não é
 * "equipe": cliente da Garagem e investidor com login também são. Privilégio
 * de coluna não distingue usuário, então a migração
 * `20261001150000_documento_e_custo_so_para_a_equipe` dá ao `authenticated`,
 * na TABELA, só `COLUNAS_PUBLICAS_DO_ESTOQUE` — como ao `anon` — e abre esta
 * view para a equipe: ela roda como dona, lê a tabela inteira e corta por
 * `is_staff(auth.uid())`. Quem não é equipe recebe zero linhas.
 *
 * Regra para o código do painel: leitura que precisa de placa, chassi,
 * renavam, custo ou FIPE vai por `lerComoEquipe`; leitura que não precisa
 * pede `SELECT_PUBLICO_DO_ESTOQUE` à tabela. Pedir coluna interna à tabela faz
 * o PostgREST recusar a consulta INTEIRA (`tests/documento-e-custo-so-para-a-equipe`
 * trava as duas coisas).
 *
 * ⚠️ Coluna nova em `estoque_motors` não aparece na view sozinha — `e.*` se
 * expande quando ela é criada. A migração que cria a coluna recria a view
 * (`create or replace view public.estoque_motors_equipe … select e.* …`), e o
 * teste acusa a migração que esquecer.
 */
export const ESTOQUE_DA_EQUIPE = "estoque_motors_equipe";

const MIGRACAO_DA_VIEW = "20261001150000_documento_e_custo_so_para_a_equipe.sql";

/**
 * Lê pela view da equipe; se a view ainda não existe, pela tabela.
 *
 * O "ainda não existe" é a janela entre o deploy deste código e a migração:
 * a migração só pode ir depois do deploy (o código antigo lê `select("*")` da
 * tabela, que ela fecha), e até lá a tabela entrega tudo, como sempre
 * entregou. Só a view AUSENTE volta para a tabela — erro de permissão, de
 * rede ou de coluna fica como erro: pedir à porta fechada o que a porta
 * certa negou não é rede, é desvio.
 */
type ComErro = { error: { code?: string; message?: string } | null };

// O tipo vem do que `ler` devolve, e não de um `PromiseLike<R>`: com o cliente
// sem tipo (`supabase: any`, como em `estoqueEscrita`), inferir `R` a partir de
// `any` cairia na restrição e apagaria o `data` do resultado.
export async function lerComoEquipe<T extends PromiseLike<ComErro>>(
  ler: (origem: string) => T,
): Promise<Awaited<T>> {
  const pelaView = await ler(ESTOQUE_DA_EQUIPE);
  const codigo = (pelaView as unknown as ComErro).error?.code;
  if (codigo !== "PGRST205" && codigo !== "42P01") return pelaView;
  console.warn(
    `[Estoque] A view ${ESTOQUE_DA_EQUIPE} ainda não existe — lendo a tabela. ` +
      `Aplique ${MIGRACAO_DA_VIEW} depois do deploy.`,
  );
  return await ler("estoque_motors");
}
