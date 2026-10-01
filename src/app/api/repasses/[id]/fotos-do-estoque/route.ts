import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../../../lib/auditoria";
import { decidirEdicao } from "../../../../../lib/edicaoDoRepasse";
import { decidirCopiaDoEstoque, planejarCopiaDasFotos, type ParDaCopia } from "../../../../../lib/estoqueParaORepasse";
import { BUCKET_DE_FOTOS, novoLote } from "../../../../../lib/fotosDoVeiculo";
import { registrarFalha } from "../../../../../lib/observabilidade";
import { repasseDoPainelDaLinha } from "../../../../../lib/repasseDoPainel";
import { falhaDoBanco, lerRepasseParaEscrita, recusar, sessaoDoRepasse } from "../../../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient, createServerSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

const ROTA = "/api/repasses/[id]/fotos-do-estoque";

type Balde = ReturnType<ReturnType<typeof createAdminSupabaseClient>["storage"]["from"]>;
type ParCopiado = { ok: true; web: string; zap: string } | { ok: false; erro: string };

/**
 * Copia as duas versões de um par, web e depois zap. Nunca lança: a falha de
 * um par volta como resultado, para não derrubar os outros.
 */
async function copiarPar(balde: Balde, par: ParDaCopia): Promise<ParCopiado> {
  try {
    for (const variante of ["web", "zap"] as const) {
      const { error } = await balde.copy(par.origem[variante], par.destino[variante]);
      if (error) return { ok: false, erro: `${par.origem[variante]}: ${error.message}` };
    }
    return {
      ok: true,
      web: balde.getPublicUrl(par.destino.web).data.publicUrl,
      zap: balde.getPublicUrl(par.destino.zap).data.publicUrl,
    };
  } catch (e: unknown) {
    return { ok: false, erro: `${par.origem.web}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Traz as fotos de um carro do estoque para o rascunho de repasse que acabou
 * de nascer em "Novo carro de repasse" (decisão do dono de 01/10).
 *
 * COPIA, nunca referencia nem move: cada par vira arquivo novo em
 * `repasse/<id>/`, com a chave de serviço (`storage.copy`, sem baixar e
 * subir). O arquivo do estoque não é apagado, movido nem regravado — e é por
 * isso que a cópia existe: a galeria do editor apaga o arquivo por caminho ao
 * remover uma foto, e uma URL do estoque na lista do repasse levaria a foto do
 * carro à venda junto.
 *
 * Só pares com as duas versões no nosso bucket (`planejarCopiaDasFotos`); o
 * carro57 dos vendidos antigos fica de fora e é contado. Um par que falha não
 * corta os outros: o que copiou entra, a falha volta na resposta e vai para a
 * triagem. A gravação passa pelo mesmo portão do PATCH (`decidirEdicao`, teto
 * de 40 incluso), presa à situação lida.
 *
 * Nada liga o repasse ao carro de origem (decisão do dono: "só copia, sem
 * ligação"); o id do estoque aparece só na trilha de auditoria.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await params;
    const admin = createAdminSupabaseClient();
    const lido = await lerRepasseParaEscrita(admin, id);
    if (!lido.ok) return lido.resposta;

    const corpo: unknown = await request.json().catch(() => null);
    const decisao = decidirCopiaDoEstoque({ repasse: lido.repasse, perfis: sessao.perfis, corpo });
    if (!decisao.ok) return recusar(decisao);
    const { estoqueId } = decisao;

    const supabase = await createServerSupabaseClient();
    const { data: carro, error: erroDoEstoque } = await supabase
      .from("estoque_motors")
      .select("id, web_full_images, whatsapp_images")
      .eq("id", estoqueId)
      .maybeSingle();
    if (erroDoEstoque) return NextResponse.json({ error: "Não deu para ler o carro do estoque." }, { status: 502 });
    if (!carro) return NextResponse.json({ error: "Carro do estoque não encontrado." }, { status: 404 });

    const linha = carro as Record<string, unknown>;
    const plano = planejarCopiaDasFotos({
      repasseId: lido.repasse.id,
      web: linha.web_full_images,
      zap: linha.whatsapp_images,
      jaTem: lido.repasse.web_full_images.length,
      novoLote,
    });
    const balde = admin.storage.from(BUCKET_DE_FOTOS);
    const resultados = await Promise.all(plano.pares.map((par) => copiarPar(balde, par)));
    const copiados = resultados.filter((r): r is Extract<ParCopiado, { ok: true }> => r.ok);
    const erros = resultados.flatMap((r) => (r.ok ? [] : [r.erro]));

    if (erros.length > 0) {
      await registrarFalha(
        "quebra",
        "repasse-fotos-do-estoque",
        `${erros.length} de ${plano.pares.length} fotos do estoque #${estoqueId} não copiaram para o repasse ${id}: ${erros.slice(0, 3).join("; ")}`,
        { rota: ROTA, origem: "servidor" },
      );
    }
    const resposta = {
      copiadas: copiados.length,
      ficaramDeFora: plano.ficaramDeFora,
      acimaDoLimite: plano.acimaDoLimite,
      falharam: erros.length,
    };
    if (copiados.length === 0) return NextResponse.json(resposta);

    const edicao = decidirEdicao({
      repasse: lido.repasse,
      corpo: {
        web_full_images: [...lido.repasse.web_full_images, ...copiados.map((c) => c.web)],
        whatsapp_images: [...lido.repasse.whatsapp_images, ...copiados.map((c) => c.zap)],
      },
      perfis: sessao.perfis,
      agora: new Date(),
    });
    if (!edicao.ok) return recusar(edicao);

    const { data, error } = await admin
      .from("repasses")
      .update(edicao.colunas)
      .eq("id", id)
      .eq("situacao", lido.repasse.situacao)
      .select("*")
      .maybeSingle();
    if (error) return falhaDoBanco(error);
    if (!data || !repasseDoPainelDaLinha(data as Record<string, unknown>)) {
      return NextResponse.json(
        { error: "O carro mudou de situação enquanto as fotos copiavam. Recarregue a página." },
        { status: 409 },
      );
    }
    await registrarAcaoSensivel(
      admin,
      "repasse.fotos-do-estoque",
      `${id}: ${copiados.length} foto(s) copiada(s) do estoque #${estoqueId}`,
      sessao.autor,
    );
    return NextResponse.json(resposta);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao copiar as fotos." }, { status: 500 });
  }
}
