import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../../../lib/auditoria";
import { decidirEdicao } from "../../../../../lib/edicaoDoRepasse";
import { situacaoNoEstoque } from "../../../../../lib/estoqueParaORepasse";
import {
  ANUNCIO_FORA_DO_AR,
  decidirImportacaoDoFeed,
  planejarImportacaoDoFeed,
  porQueNaoImporta,
  type RespostaDoFeed,
} from "../../../../../lib/feedParaORepasse";
import { buscarFotosNoFeed } from "../../../../../lib/feedRevendaMais";
import { BUCKET_DE_FOTOS, caminhoDaUrlPublica, novoLote } from "../../../../../lib/fotosDoVeiculo";
import { registrarFalha } from "../../../../../lib/observabilidade";
import { repasseDoPainelDaLinha } from "../../../../../lib/repasseDoPainel";
import { falhaDoBanco, lerRepasseParaEscrita, recusar, sessaoDoRepasse } from "../../../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient, createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { emFila, trazerPar, type ParTrazido } from "../../../../../lib/trazerFotosParaORepasse";

export const dynamic = "force-dynamic";
/** Ler o feed (até 15 s) e baixar até 40 fotos em duas versões: o mesmo teto da cópia do estoque. */
export const maxDuration = 60;

const ROTA = "/api/repasses/[id]/fotos-do-feed";
/** Quantas fotos andam ao mesmo tempo, as duas versões de cada uma em fila. */
const PARES_AO_MESMO_TEMPO = 4;
/**
 * O prazo de todos os downloads juntos. Menor que o da cópia do estoque
 * (40 s) porque aqui a leitura do feed vem antes e pode levar 15 s. A conta
 * do pior caso: 15 s de feed + 28 s de downloads = 43 s, e sobram 17 s dos 60
 * da função para os uploads em voo, a gravação e a auditoria. Quem ainda
 * baixa quando ele vence conta como falha; a rota grava o que veio, e a tela
 * diz quantas vieram e que o resto se importa de novo.
 */
const PRAZO_DOS_DOWNLOADS_MS = 28_000;

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
 * estoque. Carro cadastrado no painel, vendido ou arquivado é recusado com a
 * frase própria, antes de o feed ser lido. Lista de endereços nenhuma vem do navegador: a rota lê o feed
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

    // O carro escolhido, antes de ir ao feed (como a rota do estoque faz com
    // `origem`): o que nasceu no painel nunca esteve no RevendaMais, e o
    // vendido e o arquivado saíram de lá. Sem isto os três leriam "não está
    // no feed", que manda conferir um anúncio que não existe. Lido com a
    // sessão: só o id e o que decide.
    const supabase = await createServerSupabaseClient();
    const { data: carro, error: erroDoEstoque } = await supabase
      .from("estoque_motors")
      .select("id, origem, vendido, estado_cadastro")
      .eq("id", estoqueId)
      .maybeSingle();
    if (erroDoEstoque) return NextResponse.json({ error: "Não deu para ler o carro do estoque." }, { status: 502 });
    if (!carro) return NextResponse.json({ error: "Carro do estoque não encontrado." }, { status: 404 });
    const linhaDoCarro = carro as Record<string, unknown>;
    const motivo = porQueNaoImporta({ doPainel: linhaDoCarro.origem === "painel", situacao: situacaoNoEstoque(linhaDoCarro) });
    if (motivo) return NextResponse.json({ error: motivo }, { status: 422 });

    const achado = await buscarFotosNoFeed(estoqueId);
    if (achado.tipo === "fora-do-feed") {
      return NextResponse.json(
        { error: `${ANUNCIO_FORA_DO_AR} Envie as fotos pela galeria. Nada mudou aqui.` },
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
