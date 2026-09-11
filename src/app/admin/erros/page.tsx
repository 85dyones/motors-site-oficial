import { redirect } from "next/navigation";
import FilaDeErros from "../../../components/admin/FilaDeErros";
import { coletaDeErrosLigada, filtrosDaBusca } from "../../../lib/filaDeErros";
import {
  autorizarTriagemDeErros,
  lerFilaDeErros,
} from "../../../lib/filaDeErros-servidor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Erros do site — Motors Store",
  description: "Fila de triagem das exceções do site, agrupadas por defeito.",
};

/**
 * `/admin/erros` — a fila de triagem.
 *
 * Quem abre: o **dono**. Quando: depois de o WhatsApp avisar de uma falha, ou na
 * rotina de olhar o dia. Que decisão sai: **corrigir agora** (abrir o grupo e ler
 * o stack, o release e o digest) ou **marcar como resolvido**.
 *
 * Página fina, como as vizinhas do painel: ela autoriza, lê e entrega. A leitura
 * usa o cliente de SESSÃO — a RLS (`is_staff(auth.uid()) and org_id =
 * org_padrao()`) é a régua, e a chave de serviço passaria por cima dela.
 *
 * O gate é mais estreito que o do banco (só Admin, ver `PERFIS_QUE_TRIAM_ERROS`)
 * e igual ao do trilho, para as duas camadas não discordarem — quem não tria não
 * vê o item no menu e, chegando pela URL, volta ao painel em vez de tomar uma
 * tela vazia.
 */
export default async function ErrosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const porta = await autorizarTriagemDeErros();
  if (!porta.ok) redirect(porta.status === 401 ? "/login" : "/admin");

  const filtros = filtrosDaBusca(await searchParams);
  const resultado = await lerFilaDeErros(porta.supabase, filtros);

  return (
    <FilaDeErros
      filtros={filtros}
      resultado={resultado}
      coletaLigada={coletaDeErrosLigada()}
    />
  );
}
