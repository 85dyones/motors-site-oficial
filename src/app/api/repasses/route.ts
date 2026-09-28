import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../lib/auditoria";
import { decidirCriacao } from "../../../lib/edicaoDoRepasse";
import { falhaDoBanco, recusar, sessaoDoRepasse } from "../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Cria o rascunho de um carro de repasse (spec §5, "Criar e editar rascunho":
 * qualquer perfil). O id nasce aqui para o slug e a pasta das fotos
 * (`repasse/<id>/`) existirem desde o primeiro gravar.
 */
export async function POST(request: Request) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const corpo: unknown = await request.json().catch(() => null);
    const decisao = decidirCriacao({
      corpo,
      perfis: sessao.perfis,
      id: crypto.randomUUID(),
      autorId: sessao.autor.id,
      agora: new Date(),
    });
    if (!decisao.ok) return recusar(decisao);

    const admin = createAdminSupabaseClient();
    const { error } = await admin.from("repasses").insert(decisao.linha);
    if (error) return falhaDoBanco(error);

    const { linha } = decisao;
    await registrarAcaoSensivel(admin, "repasse.criar", `${linha.marca} ${linha.modelo} ${linha.ano_modelo} (${linha.id})`, sessao.autor);
    return NextResponse.json({ id: linha.id, slug: linha.slug }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao criar o rascunho." }, { status: 500 });
  }
}
