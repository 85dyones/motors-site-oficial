/**
 * Para onde a `GaleriaDeFotos` manda os arquivos e a lista gravada.
 *
 * A galeria nasceu do estoque (caminho por id numérico, PATCH em
 * `/api/estoque/<id>`, régua de publicação da vitrine). O repasse reusa o
 * envio, a ordem e a faxina do bucket, mas grava na própria pasta, na
 * própria rota, e não mostra a régua da vitrine — o editor do repasse tem o
 * checklist dele. O destino do estoque mora dentro da galeria, que é quem o
 * conhece; este arquivo só traz o do repasse.
 */
import type { CarroDaBusca } from "./carrosDeInteresseNaTela";
import type { CarroDoEstoqueParaORepasse } from "./estoqueParaORepasse";
import { carroDoRepasseNaBusca } from "./feedParaORepasse";
import { caminhoDaFotoDoRepasse, type VarianteDaFoto } from "./fotosDoVeiculo";

/**
 * "Importar fotos do feed" num destino que não tem anúncio próprio no
 * RevendaMais: a pessoa escolhe o carro do estoque, e a rota traz as fotos do
 * anúncio dele (`lib/feedParaORepasse.ts`).
 */
export interface ImportacaoDoFeed {
  /** Recebe `POST { estoqueId }` e responde `RespostaDoFeed`. */
  rota: string;
  /** A busca do seletor de carro. A mesma função a cada desenho. */
  buscar: (termo: string) => Promise<CarroDaBusca[]>;
  /** O que a busca já traz escrito: o modelo do carro. */
  termoInicial: string;
}

export interface DestinoDasFotos {
  caminho: (lote: string, variante: VarianteDaFoto) => string;
  /** URL que recebe o PATCH com as colunas das fotos. */
  gravarEm: string;
  /** O que a galeria diz a quem só vê. */
  avisoSemEdicao: string;
  /** Mostrar a régua "Faltam N para aparecer na vitrine"? Só no estoque. */
  reguaDoEstoque: boolean;
  /** Só no repasse. No estoque o botão é o do carro do feed, com rota própria. */
  importacaoDoFeed?: ImportacaoDoFeed;
  /**
   * As duas listas como estão gravadas agora. A galeria chama antes de gravar
   * quando uma importação ficou sem resposta e a lista da tela pode estar
   * velha. Falha vira exceção.
   */
  reler?: () => Promise<{ web_full_images: string[]; whatsapp_images: string[] }>;
}

/**
 * A busca do estoque do repasse (`GET /api/repasses/estoque`), e não a do lead
 * (`/api/estoque/busca`): o portão dela é o de quem cadastra repasse, que é
 * todo perfil da equipe. A do lead recusa quem não vê lead (Marketing e
 * Financeiro), e Marketing é quem mais mexe em foto.
 */
export async function buscarNoEstoqueDoRepasse(termo: string): Promise<CarroDaBusca[]> {
  const res = await fetch(`/api/repasses/estoque?q=${encodeURIComponent(termo)}`);
  const d = (await res.json().catch(() => ({}))) as { error?: string; veiculos?: CarroDoEstoqueParaORepasse[] };
  if (!res.ok) throw new Error(d.error || "Não deu para buscar no estoque.");
  return Array.isArray(d.veiculos) ? d.veiculos.map(carroDoRepasseNaBusca) : [];
}

/** `buscaInicial`: o modelo do carro, para a busca do feed já abrir nele. */
export function destinoDoRepasse(repasseId: string, buscaInicial = ""): DestinoDasFotos {
  return {
    caminho: (lote, variante) => caminhoDaFotoDoRepasse(repasseId, lote, variante),
    gravarEm: `/api/repasses/${repasseId}`,
    avisoSemEdicao:
      "Seu perfil vê as fotos e não as altera: fora do rascunho, só quem valida muda as fotos de um carro de repasse.",
    reguaDoEstoque: false,
    importacaoDoFeed: {
      rota: `/api/repasses/${repasseId}/fotos-do-feed`,
      buscar: buscarNoEstoqueDoRepasse,
      termoInicial: buscaInicial.trim(),
    },
    reler: async () => {
      const res = await fetch(`/api/repasses/${repasseId}`, { cache: "no-store" });
      const d = (await res.json().catch(() => ({}))) as { repasse?: { web_full_images?: unknown; whatsapp_images?: unknown } };
      const web = d.repasse?.web_full_images;
      const zap = d.repasse?.whatsapp_images;
      if (!res.ok || !Array.isArray(web) || !Array.isArray(zap)) throw new Error("Não deu para ler as fotos gravadas.");
      return { web_full_images: web as string[], whatsapp_images: zap as string[] };
    },
  };
}
