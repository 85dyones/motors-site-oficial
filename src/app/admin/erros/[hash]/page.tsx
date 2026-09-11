import { notFound, redirect } from "next/navigation";
import DetalheDoGrupoDeErros from "../../../../components/admin/DetalheDoGrupoDeErros";
import { ehHashDeAgrupamento } from "../../../../lib/filaDeErros";
import {
  autorizarTriagemDeErros,
  lerGrupoDeErros,
} from "../../../../lib/filaDeErros-servidor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ocorrências do erro — Motors Store",
  description: "As ocorrências de um grupo de erro, com stack, digest e release.",
};

/**
 * `/admin/erros/[hash]` — as ocorrências de um grupo.
 *
 * É a segunda metade da decisão: a fila diz O QUE está quebrado, esta tela diz o
 * bastante para consertar — stack, `release` (o SHA do deploy, que responde "foi
 * o de ontem?"), `url`, `navegador`, `ag_uid` e, em destaque, o `digest`.
 *
 * O `[hash]` é o `hash_agrupamento`, e ele é conferido contra a mesma forma do
 * CHECK do banco antes de virar consulta: um segmento de URL com lixo dentro não
 * pode virar filtro, e um `.eq()` com lixo não erra — devolve vazio, que na tela
 * seria indistinguível de "este grupo não existe mais".
 */
export default async function GrupoDeErrosPage({
  params,
  searchParams,
}: {
  params: Promise<{ hash: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const porta = await autorizarTriagemDeErros();
  if (!porta.ok) redirect(porta.status === 401 ? "/login" : "/admin");

  const { hash } = await params;
  if (!ehHashDeAgrupamento(hash)) notFound();

  const busca = await searchParams;
  const um = (chave: string): string => {
    const v = busca[chave];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };

  const pagina = Math.max(1, Number(um("pagina")) || 1);
  const digestBruto = um("digest");
  // O digest do Next é hexadecimal, como o hash de agrupamento — a mesma forma
  // serve de validação, e nada além dela entra num filtro.
  const digest = ehHashDeAgrupamento(digestBruto) ? digestBruto : undefined;

  const resultado = await lerGrupoDeErros(porta.supabase, hash, { pagina, digest });

  return (
    <DetalheDoGrupoDeErros
      hash={hash}
      resultado={resultado}
      digest={digest}
      voltarPara="/admin/erros"
    />
  );
}
