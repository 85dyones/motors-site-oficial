import { permanentRedirect, notFound } from "next/navigation";
import { getVeiculoById, getVeiculoPdpUrl } from "../../../../../../lib/supabase";

/**
 * A URL antiga da ficha — cinco segmentos — respondendo com 301.
 *
 * ---------------------------------------------------------------------------
 * O que ela era, e por que deixou de ser
 * ---------------------------------------------------------------------------
 * Até 2026-08-31 a ficha morava em cinco segmentos:
 *
 *   /carros/fiat/titano/volcano-22-16v-4x4-tb-die-aut
 *          /fiat-titano-volcano-22-16v-4x4-tb-die-aut-8171616
 *
 * O último era, por construção, a concatenação dos três anteriores mais o id —
 * `${marca}-${modelo}-${versao}-${id}`. A única informação nova nele era o
 * número. O dono olhou e perguntou: *"esta url faz sentido? informações
 * truncadas e repetidas"*.
 *
 * Junto veio a correção do `2.2` que saía `22`: o ponto era APAGADO pela
 * slugificação, e um motor 2.2 aparecia no endereço como "vinte e dois".
 *
 * ---------------------------------------------------------------------------
 * Por que 301 e não `notFound`
 * ---------------------------------------------------------------------------
 * *"O site não anuncia nada ainda, não indexou quase nada"* — a janela foi
 * escolhida exatamente por isso. Mas "quase nada" não é "nada": link colado em
 * conversa de WhatsApp, aba aberta, o que o robô já visitou. Quem chegar pelo
 * endereço velho vai para o novo, e o buscador transfere o sinal em vez de
 * registrar um 404.
 *
 * `permanentRedirect` (308) e não `redirect` (307): o 3xx permanente é o que
 * diz ao buscador para SUBSTITUIR o endereço no índice. O temporário mandaria
 * ele manter o antigo e revisitar para sempre.
 *
 * O destino sai de `getVeiculoPdpUrl`, nunca montado à mão aqui: no dia em que
 * a URL mudar de novo, este arquivo acompanha sozinho.
 */

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    categoria: string;
    marca: string;
    modelo: string;
    ficha: string;
    legado: string;
  }>;
}

/**
 * O id é o que vem depois do último hífen — a mesma leitura que a ficha faz.
 *
 * Não se tenta interpretar o resto do slug: ele é justamente a parte redundante
 * que esta migração eliminou, e reconstituir marca/modelo/versão a partir dele
 * seria refazer o erro para conferir o erro.
 */
function idDoSlugAntigo(slug: string): string {
  const limpo = slug.replace(/\.html$/, "");
  const partes = limpo.split("-");
  return partes[partes.length - 1] ?? "";
}

export default async function FichaNoEnderecoAntigo({ params }: PageProps) {
  const { legado } = await params;

  const id = idDoSlugAntigo(legado);
  // Sem id plausível não há para onde mandar. 404 é melhor que redirecionar
  // para a vitrine: quem pediu um carro específico e cai numa lista não sabe
  // se o carro sumiu ou se o site quebrou.
  if (!/^\d+$/.test(id)) notFound();

  const veiculo = await getVeiculoById(id);
  if (!veiculo) notFound();

  permanentRedirect(getVeiculoPdpUrl(veiculo));
}
