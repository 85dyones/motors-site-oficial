/**
 * Leitura pública dos carros de repasse, com a chave anon.
 *
 * O banco já recorta duas vezes (migração `20260924180000_repasse_fundacao`):
 * a policy só entrega publicado/reservado/vendido, e o GRANT por coluna só
 * entrega as colunas de `COLUNAS_PUBLICAS_DO_REPASSE`. Pedir uma coluna fora
 * da lista faz o PostgREST recusar a consulta inteira — por isso a seleção
 * sai desta constante e o teste `migracao-do-repasse` a compara com o GRANT.
 *
 * A carência do vendido é regra de código, como no estoque: a lista já sai
 * filtrada; a leitura por slug devolve o carro e a página decide o 404.
 *
 * ⚠️ A policy é `to anon`: esta leitura só entrega linha para quem consulta
 * SEM SESSÃO. É por isso que ela só serve o servidor — um cliente logado da
 * Garagem ou de um investidor que chamasse estas funções pelo NAVEGADOR (com
 * a sessão do usuário) veria zero linhas, porque a role ali é `authenticated`,
 * não `anon`, e `authenticated` tem sua própria policy (staff, por `org_id`).
 */
import { supabase } from "./supabase";
import { registrarFalha } from "./observabilidade";
import {
  CARROCERIAS_DO_REPASSE,
  LAUDOS_DO_REPASSE,
  SITUACOES_DO_REPASSE,
  aparecePublicamente,
  type ItemDeEstado,
  type Repasse,
} from "./repasse";

export const COLUNAS_PUBLICAS_DO_REPASSE = [
  "id",
  "slug",
  "marca",
  "modelo",
  "versao",
  "ano_modelo",
  "ano_fabricacao",
  "quilometragem",
  "cambio",
  "combustivel",
  "cor",
  "carroceria",
  "preco",
  "fipe_valor",
  "fipe_codigo",
  "fipe_mes_referencia",
  "laudo",
  "laudo_apontamento",
  "leilao_consta",
  "leilao_detalhe",
  "sinistro_consta",
  "sinistro_detalhe",
  "historico_consultado_em",
  "resumo",
  "motivo",
  "itens_de_estado",
  "sem_defeitos_conhecidos",
  "oficina_do_orcamento",
  "orcamento_em",
  "web_full_images",
  "whatsapp_images",
  "situacao",
  "lojistas_desde",
  "aberto_ao_publico_em",
  "reservado_em",
  "vendido_em",
  "created_at",
] as const;

const SELECAO = COLUNAS_PUBLICAS_DO_REPASSE.join(",");
const SITUACOES_PUBLICAS = ["publicado", "reservado", "vendido"] as const;

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

function numero(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

const booleano = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

function umDe<T extends string>(lista: readonly T[], v: unknown): T | null {
  return typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : null;
}

const urls = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : [];

function itens(v: unknown): ItemDeEstado[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const descricao = texto(o.descricao);
    if (!descricao) return [];
    return [
      {
        descricao,
        local: texto(o.local) ?? "",
        foto: texto(o.foto),
        orcamento: numero(o.orcamento),
        estetico: o.estetico === true,
      },
    ];
  });
}

export function repasseDaLinha(linha: Record<string, unknown>): Repasse | null {
  const id = texto(linha.id);
  const slug = texto(linha.slug);
  const marca = texto(linha.marca);
  const modelo = texto(linha.modelo);
  const anoModelo = numero(linha.ano_modelo);
  const quilometragem = numero(linha.quilometragem);
  const preco = numero(linha.preco);
  const situacao = umDe(SITUACOES_DO_REPASSE, linha.situacao);
  if (!id || !slug || !marca || !modelo || anoModelo === null || quilometragem === null || preco === null || !situacao) {
    return null;
  }
  return {
    id,
    slug,
    marca,
    modelo,
    versao: texto(linha.versao),
    ano_modelo: anoModelo,
    ano_fabricacao: numero(linha.ano_fabricacao),
    quilometragem,
    cambio: texto(linha.cambio),
    combustivel: texto(linha.combustivel),
    cor: texto(linha.cor),
    carroceria: umDe(CARROCERIAS_DO_REPASSE, linha.carroceria),
    preco,
    fipe_valor: numero(linha.fipe_valor),
    fipe_codigo: texto(linha.fipe_codigo),
    fipe_mes_referencia: texto(linha.fipe_mes_referencia),
    laudo: umDe(LAUDOS_DO_REPASSE, linha.laudo),
    laudo_apontamento: texto(linha.laudo_apontamento),
    leilao_consta: booleano(linha.leilao_consta),
    leilao_detalhe: texto(linha.leilao_detalhe),
    sinistro_consta: booleano(linha.sinistro_consta),
    sinistro_detalhe: texto(linha.sinistro_detalhe),
    historico_consultado_em: texto(linha.historico_consultado_em),
    resumo: texto(linha.resumo),
    motivo: texto(linha.motivo),
    itens_de_estado: itens(linha.itens_de_estado),
    sem_defeitos_conhecidos: linha.sem_defeitos_conhecidos === true,
    oficina_do_orcamento: texto(linha.oficina_do_orcamento),
    orcamento_em: texto(linha.orcamento_em),
    web_full_images: urls(linha.web_full_images),
    whatsapp_images: urls(linha.whatsapp_images),
    situacao,
    lojistas_desde: texto(linha.lojistas_desde),
    aberto_ao_publico_em: texto(linha.aberto_ao_publico_em),
    reservado_em: texto(linha.reservado_em),
    vendido_em: texto(linha.vendido_em),
    arquivado_em: texto(linha.arquivado_em),
    created_at: texto(linha.created_at) ?? "",
  };
}

/**
 * `rota` só identifica quem leu, para o aviso da linha malformada: a mesma
 * leitura serve `/repasse`, a ficha (`generateStaticParams`) e o sitemap.
 */
export async function lerRepassesPublicos(agora: Date = new Date(), rota = "/repasse"): Promise<Repasse[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("repasses")
    .select(SELECAO)
    .in("situacao", [...SITUACOES_PUBLICAS])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Leitura dos repasses falhou: ${error.message}`);
  // SELECAO é construída em tempo de execução, então supabase-js não infere o tipo da linha
  return (data ?? []).flatMap((linha) => {
    const bruta = linha as unknown as Record<string, unknown>;
    const r = repasseDaLinha(bruta);
    if (!r) {
      // Linha que o banco entrega e o código não entende (preço nulo,
      // situação nova no enum…) sumia da vitrine em silêncio. Agora some E
      // avisa (decisão 15 do PR 3). `registrarFalha` não lança nem bloqueia.
      void registrarFalha("quebra", "repasse-linha-malformada", { id: bruta.id ?? null }, { rota, origem: "servidor" });
      return [];
    }
    return aparecePublicamente(r, agora) ? [r] : [];
  });
}

export async function lerRepassePorSlug(slug: string): Promise<Repasse | null> {
  if (!supabase || !/^[a-z0-9-]{1,160}$/.test(slug)) return null;
  const { data, error } = await supabase.from("repasses").select(SELECAO).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`Leitura do repasse ${slug} falhou: ${error.message}`);
  return data ? repasseDaLinha(data as unknown as Record<string, unknown>) : null;
}

/**
 * Os carros cujo slug termina no sufixo pedido (decisão 13 do PR 3): o slug
 * muda quando alguém corrige marca, modelo ou ano, e o sufixo — os 6
 * primeiros do uuid — não. A ficha pede no máximo dois e só redireciona
 * quando acha exatamente um. Sufixo que não tem forma de uuid nem chega ao
 * banco.
 */
export async function lerRepassePorSufixo(sufixo: string): Promise<Repasse[]> {
  if (!supabase || !/^[0-9a-f]{6}$/.test(sufixo)) return [];
  const { data, error } = await supabase.from("repasses").select(SELECAO).like("slug", `%-${sufixo}`).limit(2);
  if (error) throw new Error(`Leitura do repasse pelo sufixo ${sufixo} falhou: ${error.message}`);
  return (data ?? []).flatMap((linha) => {
    const r = repasseDaLinha(linha as unknown as Record<string, unknown>);
    return r ? [r] : [];
  });
}
