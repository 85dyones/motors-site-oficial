import { unstable_cache } from "next/cache";
import { catalogoParaOAgente } from "./agenteDeAtendimento";
import { fotosDoCarro, resumoDasFotos, type FotoClassificada } from "./fotosDoAtendimento";
import { lerFotosClassificadas } from "./fotosDoAtendimento-servidor";
import { recortesDoEstoque } from "./hubsDeEstoque";
import { montarLoja } from "./lojaParaOAssistente";
import { nomeComAno } from "./nomeDoVeiculo";
import { parametrosDoFinanciamento } from "./parametrosDoFinanciamento-servidor";
import { getCachedSettings } from "./settings";
import { urlDoSite } from "./site";
import { getVeiculoPdpUrl } from "./supabase";
import { createAdminSupabaseClient } from "./supabase-server";

/**
 * A base que o agente lê: o texto da loja e o catálogo do pátio.
 *
 * Módulo de servidor. É o sucessor vivo dos documentos que o site gerava
 * para o Ney do Chatwoot (`/api/ney` e `/api/ney/loja`, que saíram com ele
 * em 21/10/2026), com duas diferenças: o catálogo entra INTEIRO (o Captain
 * cortava em 15.000 bytes) e com o link da ficha de cada carro, para o
 * assistente mandar ao cliente.
 *
 * Cinco minutos de cache, com a etiqueta `inventory`: o sincronizador do
 * RevendaMais e o cadastro do painel já revalidam essa etiqueta quando o
 * estoque muda, então o carro vendido sai do prompt na mensagem seguinte à
 * revalidação, e não em uma hora como o documento do Captain. Duas entradas
 * no cache — com e sem preço —, porque `informar_preco` muda o catálogo.
 *
 * As fotos (2026-10-20): cada linha do catálogo diz quantas fotos o carro tem
 * de cada camada (`resumoDasFotos`), e a base leva a galeria de cada carro
 * para o envio. A etiqueta `atendimento-fotos` é revalidada pela rodada das
 * fotos quando classifica algo novo, para o catálogo do prompt saber na hora.
 */
export interface BaseDaLoja {
  nomeDaLoja: string;
  loja: string;
  catalogo: string;
  totalDoCatalogo: number;
  geradoEm: string;
  /** A galeria de cada carro à venda, pelo id do estoque. Ausente nas bases de teste antigas. */
  fotos?: Record<string, { nome: string; urls: string[] }>;
}

export const ETIQUETA_DAS_FOTOS = "atendimento-fotos";

/**
 * As fotos já classificadas do estoque, para o resumo do catálogo. Sem a
 * chave de serviço ou sem a migração, o catálogo sai sem as camadas — e o
 * atendimento ainda manda a galeria em ordem.
 */
async function classificadasDoEstoque(ids: readonly string[]): Promise<Map<string, FotoClassificada[]>> {
  try {
    const admin = createAdminSupabaseClient();
    const { data: loja } = await admin.rpc("org_padrao");
    // Sem a loja, `lerFotosClassificadas` não lê nada (falha fechada).
    return await lerFotosClassificadas(admin, typeof loja === "string" ? loja : null, ids);
  } catch (erro) {
    console.warn("[Atendimento] Catálogo sem as camadas das fotos:", erro instanceof Error ? erro.message : erro);
    return new Map();
  }
}

const montarBase = unstable_cache(
  async (comPreco: boolean): Promise<BaseDaLoja> => {
    const [{ disponiveis }, { companySettings }, financiamento] = await Promise.all([
      recortesDoEstoque(),
      getCachedSettings(),
      parametrosDoFinanciamento(),
    ]);
    const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const fotos: Record<string, { nome: string; urls: string[] }> = {};
    for (const v of disponiveis) fotos[String(v.id)] = { nome: nomeComAno(v), urls: fotosDoCarro(v.whatsapp_images) };
    const classificadas = await classificadasDoEstoque(Object.keys(fotos));
    return {
      nomeDaLoja: String(companySettings?.name ?? "").trim() || "loja",
      loja: montarLoja(companySettings, geradoEm, financiamento),
      catalogo: catalogoParaOAgente(disponiveis, {
        comPreco,
        urlDoCarro: (v) => urlDoSite(getVeiculoPdpUrl(v)),
        fotos: (v) => resumoDasFotos(classificadas.get(String(v.id)) ?? [], fotos[String(v.id)]?.urls.length ?? 0),
      }),
      totalDoCatalogo: disponiveis.length,
      geradoEm,
      fotos,
    };
  },
  ["base-do-atendimento"],
  { tags: ["inventory", ETIQUETA_DAS_FOTOS], revalidate: 300 },
);

export function baseDaLoja(comPreco: boolean): Promise<BaseDaLoja> {
  return montarBase(comPreco);
}
