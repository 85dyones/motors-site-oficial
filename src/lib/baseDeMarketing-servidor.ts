/**
 * A base de marketing — o banco. Só servidor.
 *
 * A porta é a das campanhas de SMS (`autorizarCampanhasDeSms`): quem monta
 * campanha é quem alimenta a base. Tudo aqui usa a chave de serviço, porque
 * `marketing_contatos` e `marketing_interesses` são dado pessoal sem leitura
 * para nenhuma sessão do painel; o que volta para a tela é contagem.
 *
 * A importação é em lotes que a TELA manda, um depois do outro:
 *   1. `abrirImportacao` grava o registro do arquivo (é o que permite desfazer);
 *   2. `importarLote` confere de novo cada contato, liga o carro ao estoque
 *      quando dá, e entrega ao banco, que funde pelo celular;
 *   3. `desfazerImportacao` apaga o que aquela importação criou.
 *
 * Reimportar o mesmo arquivo não duplica: a pessoa é o celular, e a linha do
 * RevendaMais tem um id que o banco não aceita duas vezes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONTATOS_POR_LOTE,
  ORIGENS_DE_IMPORTACAO,
  lerContatoImportado,
  type ContatoImportado,
  type ImportacaoNaLista,
  type OrigemDeImportacao,
  type RespostaDoLoteDeImportacao,
  type ResumoDaBase,
} from "./baseDeMarketing";
import { ehTabelaAusente } from "./consultaDePlaca-servidor";
import { lerComoEquipe } from "./colunasDoEstoque";
import { familiaDoModelo, marcaCanonica } from "./familiaDoModelo";
import { DATA_DESCONHECIDA } from "./smsCampanhas";
import type { Veiculo } from "../types";

export { DATA_DESCONHECIDA };

const ehUuid = (texto: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto);

// ─────────────────────────────────────────────────────────────────────────────
// As leituras da tela
// ─────────────────────────────────────────────────────────────────────────────

export type LeituraDaBase =
  | { ok: true; resumo: ResumoDaBase; importacoes: ImportacaoNaLista[] }
  | { ok: false; faltaMigracao: boolean; motivo: string };

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const lista = <T,>(v: unknown, ler: (x: Record<string, unknown>) => T): T[] => (Array.isArray(v) ? v.flatMap((x) => (x && typeof x === "object" ? [ler(x as Record<string, unknown>)] : [])) : []);

/** O jsonb de `marketing_resumo_da_base()` no tipo da tela. */
export function lerResumoDaBase(bruto: unknown): ResumoDaBase {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  return {
    pessoas: numero(b.pessoas),
    clientes: numero(b.clientes),
    comDataDeCompra: numero(b.com_data_de_compra),
    semInteresse: numero(b.sem_interesse),
    interessadosComCarro: numero(b.interessados_com_carro),
    interessadosSemCarro: numero(b.interessados_sem_carro),
    canais: lista(b.canais, (x) => ({ canal: String(x.canal ?? ""), pessoas: numero(x.pessoas) })).filter((c) => c.canal !== ""),
    marcas: lista(b.marcas, (x) => ({ marca: String(x.marca ?? ""), pessoas: numero(x.pessoas) })).filter((m) => m.marca !== ""),
  };
}

export async function lerBaseDeMarketing(admin: SupabaseClient): Promise<LeituraDaBase> {
  const [resumo, importacoes] = await Promise.all([
    admin.rpc("marketing_resumo_da_base"),
    admin
      .from("marketing_importacoes")
      .select("id, origem, arquivo, linhas, contatos_novos, contatos_atualizados, registros_novos, criado_em, criado_por_nome")
      .order("criado_em", { ascending: false })
      .limit(30),
  ]);
  const erro = resumo.error ?? importacoes.error;
  // Função ausente (PGRST202) é a mesma falta da tabela: a migração não rodou.
  if (erro) return { ok: false, faltaMigracao: ehTabelaAusente(erro) || erro.code === "PGRST202" || erro.code === "42883", motivo: erro.message };
  return {
    ok: true,
    resumo: lerResumoDaBase(resumo.data),
    importacoes: ((importacoes.data ?? []) as Array<Record<string, unknown>>).map((i) => ({
      id: String(i.id),
      origem: i.origem as OrigemDeImportacao,
      arquivo: typeof i.arquivo === "string" ? i.arquivo : null,
      linhas: numero(i.linhas),
      contatosNovos: numero(i.contatos_novos),
      contatosAtualizados: numero(i.contatos_atualizados),
      registrosNovos: numero(i.registros_novos),
      criadoEm: String(i.criado_em),
      criadoPorNome: typeof i.criado_por_nome === "string" ? i.criado_por_nome : null,
    })),
  };
}

/**
 * Os canais que existem no público (base importada e leads do site), do mais
 * comum para o menos, para o filtro da campanha. Falha de leitura devolve
 * lista vazia: o filtro some da tela, e a campanha segue sem ele.
 */
export async function lerCanaisDoPublico(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.rpc("marketing_resumo_da_base");
  const daBase = error ? [] : lerResumoDaBase(data).canais.map((c) => c.canal);
  const { data: leads } = await admin.from("leads").select("canal").not("canal", "is", null).limit(2000);
  const doSite = [...new Set(((leads ?? []) as Array<{ canal: string | null }>).flatMap((l) => (l.canal ? [l.canal] : [])))];
  const vistos = new Set<string>();
  return [...daBase, ...doSite].filter((c) => {
    const chave = c.trim().toLowerCase();
    if (chave === "" || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A importação
// ─────────────────────────────────────────────────────────────────────────────

type Falha = { ok: false; status: 400 | 404 | 502 | 503; motivo: string };

export async function abrirImportacao(
  admin: SupabaseClient,
  pedido: unknown,
  autor: { id: string; nome: string | null },
): Promise<{ ok: true; id: string } | Falha> {
  const p = (pedido && typeof pedido === "object" ? pedido : {}) as Record<string, unknown>;
  const origem = ORIGENS_DE_IMPORTACAO.find((o) => o === p.origem);
  if (!origem) return { ok: false, status: 400, motivo: "Origem do arquivo inválida." };
  const linhas = Number(p.linhas);
  if (!Number.isInteger(linhas) || linhas <= 0) return { ok: false, status: 400, motivo: "O arquivo não tem linhas para importar." };
  const arquivo = typeof p.arquivo === "string" && p.arquivo.trim() !== "" ? p.arquivo.trim().slice(0, 200) : null;

  const { data, error } = await admin
    .from("marketing_importacoes")
    .insert({ origem, arquivo, linhas, criado_por: autor.id, criado_por_nome: autor.nome })
    .select("id")
    .single();
  if (error || !data) {
    return error && ehTabelaAusente(error)
      ? { ok: false, status: 503, motivo: "As tabelas da base ainda não existem no banco: aplique a migração das campanhas de SMS." }
      : { ok: false, status: 502, motivo: "Não deu para abrir a importação." };
  }
  return { ok: true, id: String(data.id) };
}

/** Os carros que a loja conhece, do jeito que a correlação precisa: pela placa, e pela marca + família. */
export interface IndiceDoEstoque {
  porPlaca: Map<string, number>;
  porFamilia: Map<string, number[]>;
}

export function indexarEstoque(carros: Array<Pick<Veiculo, "id" | "marca" | "modelo"> & { placa?: string | null }>): IndiceDoEstoque {
  const porPlaca = new Map<string, number>();
  const porFamilia = new Map<string, number[]>();
  for (const c of carros) {
    const id = Number(c.id);
    const placa = (c.placa ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (placa !== "") porPlaca.set(placa, id);
    const chave = `${marcaCanonica(c.marca)}|${familiaDoModelo(c.modelo)}`;
    porFamilia.set(chave, [...(porFamilia.get(chave) ?? []), id]);
  }
  return { porPlaca, porFamilia };
}

/**
 * O carro do estoque de que um registro fala, ou `null`.
 *
 * A placa decide. Sem placa, marca e família só decidem quando há UM carro
 * daquela família no cadastro: com dois Polos, dizer qual deles a pessoa
 * olhou seria inventar. O registro guarda marca e modelo de qualquer jeito, e
 * é por eles que "este modelo" e "esta marca" acham a pessoa.
 */
export function correlacionarVeiculo(registro: { marca: string | null; modelo: string | null; placa: string | null }, indice: IndiceDoEstoque): number | null {
  if (registro.placa && indice.porPlaca.has(registro.placa)) return indice.porPlaca.get(registro.placa)!;
  if (!registro.marca || !registro.modelo) return null;
  const candidatos = indice.porFamilia.get(`${marcaCanonica(registro.marca)}|${familiaDoModelo(registro.modelo)}`) ?? [];
  return candidatos.length === 1 ? candidatos[0] : null;
}

/**
 * O contato no formato que `marketing_importar_lote` recebe.
 *
 * O id de origem leva o prefixo da fonte: o banco não aceita o mesmo id duas
 * vezes, e sem o prefixo a linha 123 de uma planilha qualquer seria recusada
 * por já existir o lead 123 do RevendaMais. Planilha comum não tem id
 * confiável: vai sem, e o banco evita a repetição pelo conteúdo.
 */
export function contatoParaOBanco(c: ContatoImportado, origem: OrigemDeImportacao, indice: IndiceDoEstoque) {
  // As datas da pessoa: as das linhas dela (inclusive a de cadastro, que não vira registro) e as dos registros.
  const datas = [c.primeiroContatoEm, c.ultimoContatoEm, ...c.registros.map((r) => r.ocorreuEm)].filter((d): d is string => !!d).sort();
  return {
    telefone: c.telefone,
    nome: c.nome,
    email: c.email,
    cliente: c.cliente || c.comprouEm !== null,
    comprou_em: c.comprouEm,
    sem_interesse: c.semInteresse,
    canais: c.canais,
    primeiro_em: datas[0] ?? null,
    ultimo_em: datas[datas.length - 1] ?? null,
    registros: c.registros.map((r) => ({
      origem_id: origem === "revenda_mais" && r.origemId ? `rm:${r.origemId}` : null,
      tipo: r.tipo,
      veiculo_id: correlacionarVeiculo(r, indice),
      marca: r.marca,
      modelo: r.modelo,
      placa: r.placa,
      canal: r.canal,
      marcador: r.marcador,
      // O banco poria "agora" num registro sem data, e um carro olhado não se sabe quando
      // passaria por interesse de hoje. Sem data, vai a marca de "data desconhecida".
      ocorreu_em: r.ocorreuEm ?? DATA_DESCONHECIDA,
    })),
  };
}

/**
 * O estoque para a correlação: id, marca, modelo e placa. Placa é coluna da
 * equipe: vem da view `estoque_motors_equipe`, pela SESSÃO de quem importa
 * (Administrador ou Marketing, ambos da equipe), por `lerComoEquipe`.
 *
 * Duas portas erradas que já foram tentadas (07/10/2026):
 *  - a view pela chave de serviço: ela filtra por `is_staff(auth.uid())`, e a
 *    chave de serviço não tem `auth.uid()` — volta vazia (`getEstoque` lançava
 *    "estoque indisponível" e derrubou o primeiro lote em produção);
 *  - a tabela pela chave de serviço: funciona, mas fura o invariante de que
 *    toda leitura literal de `estoque_motors` pede só coluna pública
 *    (`tests/documento-e-custo-so-para-a-equipe.test.ts`).
 *
 * Falha aqui não derruba a importação: sem o índice a pessoa entra do mesmo
 * jeito, com marca e modelo, e só fica sem a ligação com o carro do estoque.
 */
export async function lerIndiceDoEstoque(sessao: SupabaseClient): Promise<IndiceDoEstoque> {
  const { data, error } = await lerComoEquipe((origem) => sessao.from(origem).select("id, marca, modelo, placa").limit(5000));
  if (error || !data || data.length === 0) {
    console.error("[base de marketing] estoque não lido; o lote segue sem ligar carro ao estoque:", error?.code ?? "0 linhas", error?.message ?? "");
    return indexarEstoque([]);
  }
  return indexarEstoque(
    (data as Array<{ id: number | string; marca: string | null; modelo: string | null; placa: string | null }>).map((c) => ({ id: String(c.id), marca: c.marca ?? "", modelo: c.modelo ?? "", placa: c.placa })),
  );
}

export async function importarLote(admin: SupabaseClient, id: string, corpo: unknown, sessao: SupabaseClient): Promise<({ ok: true } & RespostaDoLoteDeImportacao) | Falha> {
  if (!ehUuid(id)) return { ok: false, status: 404, motivo: "Importação não encontrada." };
  const brutos = (corpo && typeof corpo === "object" ? (corpo as { contatos?: unknown }).contatos : null) as unknown;
  if (!Array.isArray(brutos) || brutos.length === 0) return { ok: false, status: 400, motivo: "O lote veio vazio." };
  if (brutos.length > CONTATOS_POR_LOTE) return { ok: false, status: 400, motivo: `Cada lote leva no máximo ${CONTATOS_POR_LOTE} pessoas.` };

  const { data: importacao, error } = await admin.from("marketing_importacoes").select("id, origem").eq("id", id).maybeSingle();
  if (error) return { ok: false, status: 502, motivo: "Não deu para ler a importação." };
  if (!importacao) return { ok: false, status: 404, motivo: "Importação não encontrada." };

  // Cada contato é conferido de novo aqui: o que a tela mandou é pedido, e não verdade.
  const contatos = brutos.flatMap((b) => lerContatoImportado(b) ?? []);
  const recusados = brutos.length - contatos.length;
  if (contatos.length === 0) return { ok: true, contatosNovos: 0, contatosAtualizados: 0, registrosNovos: 0, recusados };

  const indice = await lerIndiceDoEstoque(sessao);
  const { data, error: erroDoLote } = await admin.rpc("marketing_importar_lote", {
    p_importacao: id,
    p_contatos: contatos.map((c) => contatoParaOBanco(c, importacao.origem as OrigemDeImportacao, indice)),
  });
  if (erroDoLote) {
    // Só código e mensagem: o `details` do Postgres pode trazer o telefone da linha recusada.
    console.error("[base de marketing] marketing_importar_lote recusou o lote:", erroDoLote.code, erroDoLote.message);
    return { ok: false, status: 502, motivo: "O banco recusou este lote; nada dele foi gravado." };
  }
  const linha = ((Array.isArray(data) ? data[0] : data) ?? {}) as Record<string, unknown>;
  return { ok: true, contatosNovos: numero(linha.contatos_novos), contatosAtualizados: numero(linha.contatos_atualizados), registrosNovos: numero(linha.registros_novos), recusados };
}

export async function desfazerImportacao(admin: SupabaseClient, id: string): Promise<{ ok: true; contatosRemovidos: number; registrosRemovidos: number } | Falha> {
  if (!ehUuid(id)) return { ok: false, status: 404, motivo: "Importação não encontrada." };
  const { data: existe } = await admin.from("marketing_importacoes").select("id").eq("id", id).maybeSingle();
  if (!existe) return { ok: false, status: 404, motivo: "Importação não encontrada." };
  const { data, error } = await admin.rpc("marketing_desfazer_importacao", { p_importacao: id });
  if (error) return { ok: false, status: 502, motivo: "Não deu para desfazer a importação." };
  const linha = ((Array.isArray(data) ? data[0] : data) ?? {}) as Record<string, unknown>;
  return { ok: true, contatosRemovidos: numero(linha.contatos_removidos), registrosRemovidos: numero(linha.registros_removidos) };
}
