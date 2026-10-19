import { unstable_cache } from "next/cache";
import { catalogoParaOAgente } from "./agenteDeAtendimento";
import { recortesDoEstoque } from "./hubsDeEstoque";
import { montarLoja } from "./lojaParaOAssistente";
import { parametrosDoFinanciamento } from "./parametrosDoFinanciamento-servidor";
import { getCachedSettings } from "./settings";
import { urlDoSite } from "./site";
import { getVeiculoPdpUrl } from "./supabase";

/**
 * A base que o agente lê: o texto da loja e o catálogo do pátio.
 *
 * Módulo de servidor. É o equivalente vivo dos documentos que o site gera
 * para o Ney do Chatwoot (`/api/ney` e `/api/ney/loja`), com duas diferenças:
 * o catálogo entra INTEIRO (o Captain cortava em 15.000 bytes) e com o link
 * da ficha de cada carro, para o assistente mandar ao cliente.
 *
 * Cinco minutos de cache, com a etiqueta `inventory`: o sincronizador do
 * RevendaMais e o cadastro do painel já revalidam essa etiqueta quando o
 * estoque muda, então o carro vendido sai do prompt na mensagem seguinte à
 * revalidação, e não em uma hora como o documento do Captain. Duas entradas
 * no cache — com e sem preço —, porque `informar_preco` muda o catálogo.
 */
export interface BaseDaLoja {
  nomeDaLoja: string;
  loja: string;
  catalogo: string;
  totalDoCatalogo: number;
  geradoEm: string;
}

const montarBase = unstable_cache(
  async (comPreco: boolean): Promise<BaseDaLoja> => {
    const [{ disponiveis }, { companySettings }, financiamento] = await Promise.all([
      recortesDoEstoque(),
      getCachedSettings(),
      parametrosDoFinanciamento(),
    ]);
    const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    return {
      nomeDaLoja: String(companySettings?.name ?? "").trim() || "loja",
      loja: montarLoja(companySettings, geradoEm, financiamento),
      catalogo: catalogoParaOAgente(disponiveis, {
        comPreco,
        urlDoCarro: (v) => urlDoSite(getVeiculoPdpUrl(v)),
      }),
      totalDoCatalogo: disponiveis.length,
      geradoEm,
    };
  },
  ["base-do-atendimento"],
  { tags: ["inventory"], revalidate: 300 },
);

export function baseDaLoja(comPreco: boolean): Promise<BaseDaLoja> {
  return montarBase(comPreco);
}
