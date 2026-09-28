import RepasseNaoEncontrado from "../../../../../components/admin/repasse/RepasseNaoEncontrado";

/**
 * O editor de um carro que não abre. O `not-found` da visão, um nível acima,
 * já seguraria; este existe para a rota nascer com a sua saída, e para ela
 * não depender de onde o editor mora.
 */
export default function EditorNaoEncontrado() {
  return <RepasseNaoEncontrado />;
}
