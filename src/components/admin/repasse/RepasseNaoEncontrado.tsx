import Link from "next/link";
import { CAMINHO_DO_PAINEL_DO_REPASSE } from "../../../lib/painelDoRepasse";

/**
 * O carro de repasse que o painel não acha: id que não é uuid, carro que não
 * existe. Regra do dono de 20/09, nenhum endereço termina em beco: o status
 * continua 404, e o corpo leva de volta à lista e ao cadastro.
 *
 * É a saída do PAINEL, e não a da casa (`NaoEncontradoNoEstoque`): quem chega
 * aqui é a equipe, dentro do /admin, atrás de um carro do repasse; a vitrine
 * e a encomenda são para quem visita o site.
 */
export default function RepasseNaoEncontrado() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <div className="border-b-2 border-mt-regua pb-5">
        <div className="mt-rotulo">Painel / Repasse</div>
        <h1 className="mt-titulo mt-1 text-2xl md:text-3xl">Carro de repasse não encontrado</h1>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-mt-neutral-800">
          Este endereço não abre nenhum carro do repasse. O link pode estar incompleto, ou o carro não existe mais.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={CAMINHO_DO_PAINEL_DO_REPASSE} className="mt-btn mt-btn-primario mt-foco px-4 py-2.5 text-[11px]">
          Ver os carros de repasse
        </Link>
        <Link href={`${CAMINHO_DO_PAINEL_DO_REPASSE}/novo`} className="mt-btn mt-btn-contorno mt-foco px-4 py-2.5 text-[11px]">
          Cadastrar carro
        </Link>
      </div>
    </div>
  );
}
