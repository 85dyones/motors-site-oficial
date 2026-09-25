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
import { caminhoDaFotoDoRepasse, type VarianteDaFoto } from "./fotosDoVeiculo";

export interface DestinoDasFotos {
  caminho: (lote: string, variante: VarianteDaFoto) => string;
  /** URL que recebe o PATCH com as colunas das fotos. */
  gravarEm: string;
  /** O que a galeria diz a quem só vê. */
  avisoSemEdicao: string;
  /** Mostrar a régua "Faltam N para aparecer na vitrine"? Só no estoque. */
  reguaDoEstoque: boolean;
}

export function destinoDoRepasse(repasseId: string): DestinoDasFotos {
  return {
    caminho: (lote, variante) => caminhoDaFotoDoRepasse(repasseId, lote, variante),
    gravarEm: `/api/repasses/${repasseId}`,
    avisoSemEdicao:
      "Seu perfil vê as fotos e não as altera: fora do rascunho, só quem valida muda as fotos de um carro de repasse.",
    reguaDoEstoque: false,
  };
}
