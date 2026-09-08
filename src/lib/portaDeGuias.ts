import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "./supabase-server";
import { ehStaff, perfisDe, podeFazer } from "./permissoes";

/**
 * A porta das rotas de guias: quem entra, e o que sai do cache quando algo muda.
 *
 * Nasceu de uma duplicação prestes a acontecer. `autorizar()` e
 * `revalidarCluster()` viviam dentro de `app/api/guias/route.ts`, e em 07/09 o
 * cabeçalho da seção ganhou rota própria (`/api/guias/secao`) — que precisa
 * exatamente da mesma régua de permissão e do mesmo descarte de cache.
 *
 * Copiar as duas seria o começo de um jeito conhecido de errar: a régua diverge
 * numa das cópias e ninguém percebe, porque as duas continuam respondendo 200.
 * A revisão do PR #55 já tinha mostrado essa forma exata — a validação de
 * `href` que a escrita apertou e a leitura não.
 */

/**
 * A linha da A17 que governa quem escreve cópia de site.
 *
 * A mesma de `descricao_seo` e do texto dos hubs: Admin, Marketing e Comercial.
 * Escrever cópia de site é trabalho de quem escreve anúncio.
 */
export const ACAO_DE_CONTEUDO = "Editar opcionais e destaques rápidos";

export async function autorizarConteudo() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();

  // A primeira versão deste comentário dizia "`ehStaff` ANTES de `perfisDe`,
  // senão `normalizarPerfil` promoveria um cliente a comercial". A ordem no
  // código é a inversa, e `normalizarPerfil` não é chamado aqui — o comentário
  // descrevia a régua do CLAUDE.md, não este arquivo.
  //
  // Aqui as duas metades são independentes e a ordem não importa: `perfisDe`
  // devolve `[]` para quem não é staff, e `podeFazer([], …)` já responde
  // `nao_ve`. Medido: tirar `!ehStaff(profile) ||` deixa a suíte verde — é
  // mutante equivalente, não brecha. `ehStaff` fica porque diz a intenção em
  // voz alta, e porque a segunda metade depende da tabela de papéis continuar
  // negando o que hoje nega.
  const perfil = perfisDe(profile);
  if (!ehStaff(profile) || podeFazer(perfil, ACAO_DE_CONTEUDO) !== "faz") {
    return { erro: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { supabase, user };
}

/**
 * Descarta do cache tudo que muda quando o cluster muda.
 *
 * O sitemap entra porque ele lista os guias publicados e declara
 * `revalidate = 3600`: sem esta linha, um guia recém-publicado demora até uma
 * hora para ser anunciado. É a única rota do repositório que o revalida —
 * `/api/hubs/textos` não precisa, porque hub já está lá com ou sem texto
 * próprio.
 *
 * O índice `/guias` entra SEMPRE, e é isso que faz a edição do cabeçalho
 * aparecer na hora: sem ele, o texto novo esperaria a janela de uma hora do
 * ISR — que foi como o hub nasceu vazio em 07/09 e ficou assim por 24 horas.
 */
export function revalidarCluster(slug?: string) {
  revalidatePath("/guias");
  if (slug) revalidatePath(`/guias/${slug}`);
  revalidatePath("/sitemap.xml");
}
