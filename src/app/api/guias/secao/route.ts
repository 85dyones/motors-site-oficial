import { NextResponse, type NextRequest } from "next/server";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";
import { autorizarConteudo, revalidarCluster } from "../../../../lib/portaDeGuias";

export const dynamic = "force-dynamic";

/**
 * O cabeçalho da seção `/guias` — gravar.
 *
 * Só PUT, e a razão é a mesma que faz `/api/hubs/textos` não ter POST nem
 * DELETE: aqui o banco é OVERRIDE. A linha ou existe ou não, o texto do código
 * é o padrão, e não há o que criar nem o que apagar — só o que sobrescrever.
 * Limpar os dois campos devolve a seção ao automático, e é por isso que a rota
 * ACEITA string vazia em vez de recusá-la como o publicador de guia faz.
 *
 * A leitura não mora aqui: a página pública lê direto do banco por
 * `lib/secaoDeGuias.ts`, e a tela do painel recebe o gravado junto da listagem
 * em `GET /api/guias` — uma chamada, não duas.
 */

/** O teto do banco. Cortar aqui evita erro cru do Postgres na cara de quem digita. */
const TETO = 300;

/**
 * A régua da meta description da casa.
 *
 * Não é trava: quem decide o texto é o dono, e recusar por 3 caracteres seria
 * pior que uma description truncada no SERP. Sai como AVISO junto do 200, e a
 * tela mostra o contador ao lado do campo. Mesmo raciocínio do CHECK de 300 na
 * migração, que existe para impedir abuso e não para vigiar estilo.
 */
const REGUA_DESCRIPTION = 155;

function texto(bruto: unknown): string {
  return typeof bruto === "string" ? bruto.trim().slice(0, TETO) : "";
}

export async function PUT(request: NextRequest) {
  const auth = await autorizarConteudo();
  if (auth.erro) return auth.erro;

  const corpo = await request.json().catch(() => null);
  const tituloSeo = texto((corpo as Record<string, unknown>)?.tituloSeo);
  const resumo = texto((corpo as Record<string, unknown>)?.resumo);

  // `upsert` e não `update`: a migração entrega a tabela VAZIA de propósito —
  // semear as constantes criaria uma segunda cópia do mesmo texto, que
  // divergiria no primeiro PR sem nada acusar. Então a primeira gravação é um
  // insert, e as seguintes são updates, sem a tela precisar saber a diferença.
  const { data, error } = await auth
    .supabase!.from("cabecalho_dos_guias")
    .upsert(
      {
        secao: "guias",
        // String vazia chega ao banco e o gatilho a normaliza para NULO. Mandar
        // `null` daqui daria no mesmo, e mandar `""` prova o caminho que a tela
        // realmente exercita quando alguém limpa o campo.
        titulo_seo: tituloSeo,
        resumo,
        atualizado_por: auth.user!.id,
      },
      { onConflict: "secao" },
    )
    .select("titulo_seo, resumo")
    .single();

  if (error) {
    if (ehTabelaOuColunaAusente(error)) {
      return NextResponse.json(
        { error: "A tabela do cabeçalho ainda não existe neste ambiente." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // O índice sai do cache na hora. Sem isto o texto novo esperaria a janela de
  // uma hora do ISR — e quem acabou de salvar veria a página velha e concluiria
  // que não salvou.
  revalidarCluster();

  const avisos: string[] = [];
  if (resumo && resumo.length > REGUA_DESCRIPTION) {
    avisos.push(
      `O resumo tem ${resumo.length} caracteres. A busca costuma cortar em ${REGUA_DESCRIPTION} — o fim da frase pode não aparecer.`,
    );
  }

  return NextResponse.json({ cabecalho: data, avisos });
}
