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

export type ConferenciaDoExame =
  | { ok: true; carro: CarroDoExame & { id: string; preco: number | null } }
  | { ok: false; status: 409 | 500; erro: string };

/**
 * O exame só vale para carro publicado (decisão 4 do PR 3). Reservado,
 * vendido, arquivado ou id que não existe: 409 com a mensagem da ficha.
 *
 * O `preco` é o valor do Lead na CAPI (decisão (e) da final-review, 25/09):
 * o pixel manda `carro.preco`, e o servidor lê o mesmo número do banco, não
 * do corpo. Sem preço válido, `null`, e a CAPI sai sem `value` como antes.
 */
export async function carroDoExame(admin: SupabaseClient, repasseId: string): Promise<ConferenciaDoExame> {
  const { data, error } = await admin
    .from("repasses")
    .select("id, situacao, marca, modelo, versao, ano_modelo, preco")
    .eq("id", repasseId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, erro: ERROS_DO_REPASSE.conferencia };
  const linha = (data ?? null) as Record<string, unknown> | null;
  const marca = linha?.marca;
  const modelo = linha?.modelo;
  const anoModelo = Number(linha?.ano_modelo);
  if (!linha || linha.situacao !== "publicado" || typeof marca !== "string" || typeof modelo !== "string" || !Number.isFinite(anoModelo)) {
    return { ok: false, status: 409, erro: ERROS_DO_REPASSE.exameFechado };
  }
  const preco = Number(linha.preco);
  return {
    ok: true,
    carro: {
      id: String(linha.id),
      marca,
      modelo,
      versao: typeof linha.versao === "string" ? linha.versao : null,
      ano_modelo: anoModelo,
      preco: Number.isFinite(preco) && preco > 0 ? preco : null,
    },
  };
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
