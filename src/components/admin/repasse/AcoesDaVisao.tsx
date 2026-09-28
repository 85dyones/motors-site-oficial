"use client";

import { useRouter } from "next/navigation";
import AcoesDoRepasse from "./AcoesDoRepasse";
import type { Perfil } from "../../../lib/permissoes";
import type { Repasse } from "../../../lib/repasse";

/**
 * Os atos da situação na visão do carro: o mesmo `AcoesDoRepasse` do editor,
 * com as mesmas portas (`atosPossiveis`; a rota decide de novo). Na visão não
 * há edição pendente para proteger, e o carro que a rota devolve chega pela
 * própria página, lida de novo no servidor.
 */
export default function AcoesDaVisao({
  repasse,
  perfis,
}: {
  repasse: Pick<Repasse, "id" | "situacao" | "aberto_ao_publico_em">;
  perfis: Perfil[];
}) {
  const router = useRouter();
  return <AcoesDoRepasse repasse={repasse} perfis={perfis} alterado={false} aoMudar={() => router.refresh()} />;
}
