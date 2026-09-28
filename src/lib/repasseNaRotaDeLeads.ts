/**
 * O que a rota de leads faz com o banco no ramo do repasse — só servidor.
 *
 * As regras (o pedido é válido? insere ou atualiza? o CNPJ trocou?) moram em
 * `leadDoRepasse.ts`, puras e testadas sem banco. Aqui fica só a conversa com
 * o Supabase, pela chave de serviço: `repasse_inscritos` não tem escrita para
 * ninguém além dela desde 20260924200000_repasse_escrita_pela_rota.sql.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { decidirInscricao, type CarroDoExame, type InscricaoNaLista } from "./leadDoRepasse";
import { ERROS_DO_REPASSE } from "./paginaDoRepasse";
import { aparecePublicamente, type SituacaoDoRepasse } from "./repasse";

export type CarroConferido = CarroDoExame & { id: string; preco: number | null };

export type ConferenciaDoExame = { ok: true; carro: CarroConferido } | { ok: false; status: 409 | 500; erro: string };

/**
 * A linha de `repasses` como carro, ou `null` quando falta o que nomeia o
 * carro. O `preco` é o valor do Lead na CAPI (decisão (e) da final-review,
 * 25/09): o pixel manda `carro.preco`, e o servidor lê o mesmo número do
 * banco, não do corpo. Sem preço válido, `null`, e a CAPI sai sem `value`.
 */
function carroDaLinha(linha: Record<string, unknown> | null): CarroConferido | null {
  const marca = linha?.marca;
  const modelo = linha?.modelo;
  const anoModelo = Number(linha?.ano_modelo);
  if (!linha || typeof marca !== "string" || typeof modelo !== "string" || !Number.isFinite(anoModelo)) return null;
  const preco = Number(linha.preco);
  return {
    id: String(linha.id),
    marca,
    modelo,
    versao: typeof linha.versao === "string" ? linha.versao : null,
    ano_modelo: anoModelo,
    preco: Number.isFinite(preco) && preco > 0 ? preco : null,
  };
}

/**
 * O exame só vale para carro publicado (decisão 4 do PR 3). Reservado,
 * vendido, arquivado ou id que não existe: 409 com a mensagem da ficha.
 */
export async function carroDoExame(admin: SupabaseClient, repasseId: string): Promise<ConferenciaDoExame> {
  const { data, error } = await admin
    .from("repasses")
    .select("id, situacao, marca, modelo, versao, ano_modelo, preco")
    .eq("id", repasseId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, erro: ERROS_DO_REPASSE.conferencia };
  const linha = (data ?? null) as Record<string, unknown> | null;
  const carro = linha?.situacao === "publicado" ? carroDaLinha(linha) : null;
  if (!carro) return { ok: false, status: 409, erro: ERROS_DO_REPASSE.exameFechado };
  return { ok: true, carro };
}

/**
 * O carro do contato pelo WhatsApp (28/09) — o irmão de `carroDoExame` que
 * não exige "publicado": liga o lead a todo carro que o site ainda mostra
 * (`aparecePublicamente`: publicado, reservado e vendido na carência), porque
 * a ficha reservada e a vendida também têm o botão do WhatsApp.
 *
 * E NUNCA recusa: carro que não existe, que saiu do ar ou leitura que falhou
 * devolvem `null`, e o lead entra sem o elo. É a régua da ficha do estoque,
 * em que o lead nunca segura o visitante a caminho do WhatsApp. O cliente
 * entra por função para que nem a criação dele, que lança sem a chave de
 * serviço, derrube o contato.
 */
export async function carroDoContato(
  criarAdmin: () => SupabaseClient,
  repasseId: string,
  agora: Date,
): Promise<CarroConferido | null> {
  try {
    const { data, error } = await criarAdmin()
      .from("repasses")
      .select("id, situacao, vendido_em, marca, modelo, versao, ano_modelo, preco")
      .eq("id", repasseId)
      .maybeSingle();
    if (error) {
      console.warn("[Leads API] Carro do WhatsApp não conferido (lead segue sem o elo):", error.message);
      return null;
    }
    const linha = (data ?? null) as Record<string, unknown> | null;
    const noSite =
      linha !== null &&
      aparecePublicamente(
        {
          situacao: linha.situacao as SituacaoDoRepasse,
          vendido_em: typeof linha.vendido_em === "string" ? linha.vendido_em : null,
        },
        agora,
      );
    return noSite ? carroDaLinha(linha) : null;
  } catch (erro) {
    console.warn("[Leads API] Carro do WhatsApp não conferido (lead segue sem o elo):", (erro as Error)?.message);
    return null;
  }
}

/**
 * Lê por trilha + WhatsApp e insere ou atualiza (`decidirInscricao`). Duas
 * voltas: se outra inscrição do mesmo WhatsApp entrou entre a leitura e o
 * insert, a unique `(org_id, trilha, whatsapp)` recusa com 23505, e a segunda
 * volta lê a linha nova e atualiza. O `detalhe` vai para `registrarFalha`,
 * que mascara telefone e CNPJ antes de gravar.
 */
export async function gravarInscricao(
  admin: SupabaseClient,
  inscricao: InscricaoNaLista,
  leadId: string | null,
): Promise<{ ok: true } | { ok: false; detalhe: string }> {
  for (let volta = 0; volta < 2; volta++) {
    const { data, error } = await admin
      .from("repasse_inscritos")
      .select("id, cnpj")
      .eq("trilha", inscricao.trilha)
      .eq("whatsapp", inscricao.whatsapp)
      .maybeSingle();
    if (error) return { ok: false, detalhe: `${error.code ?? "sem-codigo"}: ${error.message}` };
    const linha = (data ?? null) as { id?: unknown; cnpj?: unknown } | null;
    const existente =
      linha && typeof linha.id === "string"
        ? { id: linha.id, cnpj: typeof linha.cnpj === "string" ? linha.cnpj : null }
        : null;
    const escrita = decidirInscricao(existente, inscricao, leadId);
    const { error: erroDaEscrita } =
      escrita.operacao === "insert"
        ? await admin.from("repasse_inscritos").insert(escrita.linha)
        : await admin.from("repasse_inscritos").update(escrita.colunas).eq("id", escrita.id);
    if (!erroDaEscrita) return { ok: true };
    if (erroDaEscrita.code !== "23505" || volta === 1) {
      return { ok: false, detalhe: `${erroDaEscrita.code ?? "sem-codigo"}: ${erroDaEscrita.message}` };
    }
  }
  return { ok: false, detalhe: "inscrição não gravada" };
}
