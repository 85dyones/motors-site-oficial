import NaoEncontradoNoEstoque from "../../../components/NaoEncontradoNoEstoque";
import ListaDoRepasse from "../../../components/repasse/ListaDoRepasse";
import { CAMINHO_DO_REPASSE, NAO_ENCONTRADO_NO_REPASSE, TRILHA_DO_REPASSE } from "../../../lib/paginaDoRepasse";

/**
 * O carro de repasse que não abre — arquivado, vendido depois da carência,
 * slug que nunca existiu (spec §7.2; regra do dono de 20/09: nenhum endereço
 * termina em beco). Status e metadata continuam 404 (`generateMetadata` da
 * rota); o corpo é o da casa, `NaoEncontradoNoEstoque` — amostra do pátio e
 * trilhas —, com a lista do repasse no lugar da encomenda: quem chegou atrás
 * de um repasse quer o próximo, não um carro encomendado.
 */
export default async function RepasseNaoEncontrado() {
  return NaoEncontradoNoEstoque({
    titulo: NAO_ENCONTRADO_NO_REPASSE.titulo,
    texto: NAO_ENCONTRADO_NO_REPASSE.texto,
    textoDaAmostra: NAO_ENCONTRADO_NO_REPASSE.textoDaAmostra,
    trilha: [
      { rotulo: TRILHA_DO_REPASSE.inicio, href: "/" },
      { rotulo: TRILHA_DO_REPASSE.repasse, href: CAMINHO_DO_REPASSE },
    ],
    encomenda: () => <ListaDoRepasse contexto="nao-encontrado" />,
  });
}
