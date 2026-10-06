import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../../../lib/auditoria";
import { decidirEdicao } from "../../../../../lib/edicaoDoRepasse";
import { decidirImportacaoDoFeed, planejarImportacaoDoFeed, type RespostaDoFeed } from "../../../../../lib/feedParaORepasse";
import { buscarFotosNoFeed } from "../../../../../lib/feedRevendaMais";
import { BUCKET_DE_FOTOS, caminhoDaUrlPublica, novoLote } from "../../../../../lib/fotosDoVeiculo";
import { registrarFalha } from "../../../../../lib/observabilidade";
import { repasseDoPainelDaLinha } from "../../../../../lib/repasseDoPainel";
import { falhaDoBanco, lerRepasseParaEscrita, recusar, sessaoDoRepasse } from "../../../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";
import { emFila, trazerPar, type ParTrazido } from "../../../../../lib/trazerFotosParaORepasse";

export const dynamic = "force-dynamic";
/** Ler o feed (até 15 s) e baixar até 40 fotos em duas versões: o mesmo teto da cópia do estoque. */
export const maxDuration = 60;

const ROTA = "/api/repasses/[id]/fotos-do-feed";
/** Quantas fotos andam ao mesmo tempo, as duas versões de cada uma em fila. */
const PARES_AO_MESMO_TEMPO = 4;
/**
 * O prazo de todos os downloads juntos. Menor que o da cópia do estoque
 * (40 s) porque aqui a leitura do feed vem antes e pode levar 15 s: quem
 * ainda baixa quando ele vence conta como falha, e a rota grava o que veio.
 */
const PRAZO_DOS_DOWNLOADS_MS = 35_000;

/** A marca de um endereço de origem, para o nome do arquivo: a mesma foto do anúncio tem sempre a mesma. */
const marcaDe = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 16);

type Trazido = Extract<ParTrazido, { ok: true }>;

/** Os caminhos no bucket do que acabou de subir, a partir das URLs públicas. */
const caminhosDe = (trazidos: readonly Trazido[]) =>
  trazidos.flatMap((t) => [caminhoDaUrlPublica(t.web), caminhoDaUrlPublica(t.zap)]).filter((c): c is string => c !== null);

/**
 * Traz para a galeria de um carro de repasse as fotos que o anúncio escolhido
 * tem HOJE no RevendaMais (dono, 06/10): o "Importar fotos do feed" do
 * estoque, do jeito que o repasse aceita foto.
 *
 * O corpo leva só `estoqueId`, o carro que a pessoa escolheu na busca do
 * estoque. Lista de endereços nenhuma vem do navegador: a rota lê o feed
 * (`buscarFotosNoFeed`, o mesmo do estoque) e só pede o que está na pasta da
 * loja no carro57 (`urlDaLojaNoCarro57`, sem redirecionamento, 15 s e 15 MB
 * por foto, tipo de imagem). Cada foto vira arquivo novo em `repasse/<id>/`,
 * no nosso bucket, e é o endereço NOSSO que entra na lista.
 *
 * Quem pode é quem envia foto pela galeria: o portão é `decidirEdicao`,
 * rodado antes de qualquer pedido à rede e de novo na gravação, que fica
 * presa à situação e ao `updated_at` lidos.
 *
 * SOMA, não substitui: as fotos entram depois das que já estão, a capa não
 * muda, e a foto do anúncio que já veio por aqui não entra de novo. As fotos
 * de defeito da ficha de estado moram em `itens_de_estado` e não são tocadas.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await params;
    const admin = createAdminSupabaseClient();
    const lido = await lerRepasseParaEscrita(admin, id);
    if (!lido.ok) return lido.resposta;
    const { repasse } = lido;

    const corpo: unknown = await request.json().catch(() => null);
    const agora = new Date();
    const decisao = decidirImportacaoDoFeed({ repasse, perfis: sessao.perfis, corpo, agora });
    if (!decisao.ok) return recusar(decisao);
    const { estoqueId } = decisao;

    const achado = await buscarFotosNoFeed(estoqueId);
    if (achado.tipo === "fora-do-feed") {
      return NextResponse.json(
        {
          error:
            "Este carro não está no feed do RevendaMais de agora. Confira se o anúncio está ativo lá, " +
            "ou envie as fotos pela galeria. Nada mudou aqui.",
        },
        { status: 404 },
      );
    }
    if (achado.tipo === "sem-fotos") {
      return NextResponse.json(
        { error: "O anúncio está no feed, e sem nenhuma foto lá também. Nada mudou aqui." },
        { status: 422 },
      );
    }

    const plano = planejarImportacaoDoFeed({
      repasseId: repasse.id,
      fotos: achado.fotos,
      jaNoRepasse: repasse.web_full_images,
      marcaDe,
      novoLote,
    });
    const contagem = { jaEstavam: plano.jaEstavam, ficaramDeFora: plano.ficaramDeFora, acimaDoLimite: plano.acimaDoLimite };
    const semMudanca = (falharam: number): RespostaDoFeed => ({
      vieram: 0,
      ...contagem,
      falharam,
      web_full_images: repasse.web_full_images,
      whatsapp_images: repasse.whatsapp_images,
    });
    if (plano.pares.length === 0) return NextResponse.json(semMudanca(0));

    const prazo = new AbortController();
    const relogio = setTimeout(() => prazo.abort(), PRAZO_DOS_DOWNLOADS_MS);
    let resultados: ParTrazido[];
    try {
      resultados = await emFila(plano.pares, PARES_AO_MESMO_TEMPO, (par) => trazerPar(admin.storage, par, prazo.signal));
    } finally {
      clearTimeout(relogio);
    }
    // Na ordem do anúncio, e o par inteiro ou nada: as duas listas andam juntas.
    const trazidos = resultados.filter((r): r is Trazido => r.ok);
    const erros = resultados.flatMap((r) => (r.ok ? [] : [r.erro]));
    if (erros.length > 0) {
      await registrarFalha(
        "quebra",
        "repasse-fotos-do-feed",
        `${erros.length} de ${plano.pares.length} fotos do anúncio #${estoqueId} não vieram para o repasse ${id}: ${erros.slice(0, 3).join("; ")}`,
        { rota: ROTA, origem: "servidor" },
      );
    }
    if (trazidos.length === 0) return NextResponse.json(semMudanca(erros.length));

    /** O que subiu e não foi gravado na lista sai do bucket: ninguém mais o acharia. */
    const desfazer = async () => {
      const { error } = await admin.storage.from(BUCKET_DE_FOTOS).remove(caminhosDe(trazidos));
      if (error) console.warn("[Repasse/Feed] arquivo sem dono no bucket:", error.message);
    };

    const edicao = decidirEdicao({
      repasse,
      corpo: {
        web_full_images: [...repasse.web_full_images, ...trazidos.map((t) => t.web)],
        whatsapp_images: [...repasse.whatsapp_images, ...trazidos.map((t) => t.zap)],
      },
      perfis: sessao.perfis,
      agora,
    });
    if (!edicao.ok) {
      await desfazer();
      return recusar(edicao);
    }

    // Presa ao carro LIDO: a situação e o `updated_at`. Um envio pela galeria
    // ou outra importação no meio do caminho mudam o `updated_at`, e a lista
    // "lida + importadas" não passa por cima deles: vira 409.
    const { data, error } = await admin
      .from("repasses")
      .update(edicao.colunas)
      .eq("id", id)
      .eq("situacao", repasse.situacao)
      .eq("updated_at", repasse.updated_at)
      .select("*")
      .maybeSingle();
    if (error) {
      await desfazer();
      return falhaDoBanco(error);
    }
    const gravado = data ? repasseDoPainelDaLinha(data as Record<string, unknown>) : null;
    if (!gravado) {
      await desfazer();
      return NextResponse.json(
        { error: "O carro mudou enquanto as fotos vinham do RevendaMais. Nada foi gravado: abra esta tela de novo e importe outra vez." },
        { status: 409 },
      );
    }
    await registrarAcaoSensivel(
      admin,
      "repasse.fotos-do-feed",
      `${id}: ${trazidos.length} de ${achado.fotos.length} fotos do anúncio #${estoqueId} no RevendaMais`,
      sessao.autor,
    );
    const resposta: RespostaDoFeed = {
      vieram: trazidos.length,
      ...contagem,
      falharam: erros.length,
      web_full_images: gravado.web_full_images,
      whatsapp_images: gravado.whatsapp_images,
    };
    return NextResponse.json(resposta);
  } catch (e: unknown) {
    // O `AbortSignal.timeout` do feed chega aqui como `TimeoutError`, e a
    // falta da variável de ambiente também: nos dois, nada foi baixado ainda.
    const falha = e instanceof Error ? e : null;
    const mensagem =
      falha?.name === "TimeoutError"
        ? "O RevendaMais não respondeu a tempo. Nada mudou neste carro. Tente de novo."
        : falha?.message || "Falha ao importar as fotos do feed.";
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }
}
