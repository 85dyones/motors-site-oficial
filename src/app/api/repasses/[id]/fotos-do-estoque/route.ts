import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../../../lib/auditoria";
import { baixarDoCarro57 } from "../../../../../lib/baixarDoCarro57";
import { decidirEdicao } from "../../../../../lib/edicaoDoRepasse";
import {
  decidirCopiaDoEstoque,
  planejarCopiaDasFotos,
  type ParDaCopia,
  type RespostaDaCopia,
} from "../../../../../lib/estoqueParaORepasse";
import { BUCKET_DE_FOTOS, novoLote, type VarianteDaFoto } from "../../../../../lib/fotosDoVeiculo";
import { registrarFalha } from "../../../../../lib/observabilidade";
import { repasseDoPainelDaLinha } from "../../../../../lib/repasseDoPainel";
import { falhaDoBanco, lerRepasseParaEscrita, recusar, sessaoDoRepasse } from "../../../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient, createServerSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
/**
 * Baixar do carro57 leva mais que copiar dentro do bucket: até 40 pares, 15 s
 * por foto no pior caso. O prazo dos downloads (`PRAZO_DOS_DOWNLOADS_MS`) deixa
 * folga para gravar antes de a função ser cortada.
 */
export const maxDuration = 60;

const ROTA = "/api/repasses/[id]/fotos-do-estoque";

/** Quantos pares andam ao mesmo tempo — e, com as versões de um par em fila, quantos pedidos ao carro57. */
const PARES_AO_MESMO_TEMPO = 4;
/**
 * O prazo de todos os downloads juntos. Quem ainda baixa quando ele vence é
 * cortado e o par conta como falha: a rota grava o que veio e responde dentro
 * dos 60 s, em vez de a função morrer sem gravar nada.
 */
const PRAZO_DOS_DOWNLOADS_MS = 40_000;
const VARIANTES: readonly VarianteDaFoto[] = ["web", "zap"];

type Armazenamento = ReturnType<typeof createAdminSupabaseClient>["storage"];
type ParTrazido = { ok: true; web: string; zap: string; baixou: boolean } | { ok: false; erro: string };
type Gravacao = () => Promise<{ error: { message: string } | null }>;

/**
 * Traz as duas versões de um par, como unidade. Nunca lança: a falha de um par
 * volta como resultado, para não derrubar os outros.
 *
 * Primeiro BAIXA o que é do carro57 (web e depois zap, um pedido por vez), e
 * só então grava as duas — cópia dentro do bucket para o lado nosso, upload
 * dos bytes como vieram para o lado baixado. Um download que falha derruba o
 * par antes de qualquer gravação, então não deixa arquivo sem dono. O upload
 * leva o tipo da resposta (o arquivo `-web.webp` guarda o JPEG que o carro57
 * serviu, se foi o caso) e o carimbo de 1 ano da galeria, sem `upsert`.
 */
async function trazerPar(armazenamento: Armazenamento, par: ParDaCopia, prazo: AbortSignal): Promise<ParTrazido> {
  // O bucket aberto aqui, à vista do `upload`: é por ele que
  // `tests/cache-de-imagens.test.ts` acha a chamada e confere o carimbo.
  const balde = armazenamento.from(BUCKET_DE_FOTOS);
  try {
    const gravacoes: Gravacao[] = [];
    for (const variante of VARIANTES) {
      const origem = par.origem[variante];
      const destino = par.destino[variante];
      if (origem.de === "bucket") {
        gravacoes.push(() => balde.copy(origem.caminho, destino));
        continue;
      }
      const foto = await baixarDoCarro57(origem.url, { prazo });
      if (!foto.ok) return { ok: false, erro: `${origem.url}: ${foto.erro}` };
      // 1 ano, o carimbo da galeria (`GaleriaDeFotos`): o caminho nunca se
      // reescreve. Literal, para a trava de cache conseguir conferir o valor.
      gravacoes.push(() => balde.upload(destino, foto.bytes, { contentType: foto.tipo, upsert: false, cacheControl: "31536000" }));
    }
    for (const [i, gravar] of gravacoes.entries()) {
      const { error } = await gravar();
      if (error) return { ok: false, erro: `${par.destino[VARIANTES[i]]}: ${error.message}` };
    }
    return {
      ok: true,
      web: balde.getPublicUrl(par.destino.web).data.publicUrl,
      zap: balde.getPublicUrl(par.destino.zap).data.publicUrl,
      baixou: par.origem.web.de === "carro57" || par.origem.zap.de === "carro57",
    };
  } catch (e: unknown) {
    return { ok: false, erro: `${par.destino.web}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** `tarefa` sobre cada item, no máximo `limite` de cada vez; o resultado sai na ordem dos itens. */
async function emFila<T, R>(itens: readonly T[], limite: number, tarefa: (item: T) => Promise<R>): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  async function trabalhar() {
    while (proximo < itens.length) {
      const i = proximo;
      proximo += 1;
      resultados[i] = await tarefa(itens[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhar));
  return resultados;
}

/**
 * Traz as fotos de um carro do estoque para o rascunho de repasse que acabou
 * de nascer em "Novo carro de repasse" (decisão do dono de 01/10).
 *
 * COPIA, nunca referencia nem move: cada par vira arquivo novo em
 * `repasse/<id>/`, com a chave de serviço. O lado que mora no nosso bucket é
 * copiado dentro dele (`storage.copy`); o que mora na pasta da LOJA no carro57
 * é baixado pelo servidor e sobe com `upload` (dono, 01/10: há carros
 * publicados 100% no carro57). O arquivo do estoque não é apagado, movido nem
 * regravado — e é por isso que a cópia existe: a galeria do editor apaga o
 * arquivo por caminho ao remover uma foto, e uma URL do estoque na lista do
 * repasse levaria a foto do carro à venda junto.
 *
 * Só pares em que cada versão é nossa ou da pasta da loja no carro57
 * (`planejarCopiaDasFotos`); o resto fica de fora, nunca é pedido, e é
 * contado. O download tem suas travas em `baixarDoCarro57` (endereço, sem
 * redirecionamento, 15 s, 15 MB, tipo de imagem); aqui, no máximo 4 pares de
 * cada vez e um prazo total. Um par que falha não corta os outros: o que veio
 * entra, a falha volta na resposta e vai para a triagem. A gravação passa pelo
 * mesmo portão do PATCH (`decidirEdicao`, teto de 40 incluso), presa à
 * situação e ao `updated_at` lidos.
 *
 * Roda uma vez: só o rascunho ainda SEM foto recebe a cópia
 * (`decidirCopiaDoEstoque`); a segunda chamada é 409 e não copia nada.
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
    const prazo = new AbortController();
    const relogio = setTimeout(() => prazo.abort(), PRAZO_DOS_DOWNLOADS_MS);
    let resultados: ParTrazido[];
    try {
      resultados = await emFila(plano.pares, PARES_AO_MESMO_TEMPO, (par) => trazerPar(admin.storage, par, prazo.signal));
    } finally {
      clearTimeout(relogio);
    }
    // Na ordem do estoque, e o par inteiro ou nada: as duas listas andam juntas.
    const trazidos = resultados.filter((r): r is Extract<ParTrazido, { ok: true }> => r.ok);
    const erros = resultados.flatMap((r) => (r.ok ? [] : [r.erro]));

    if (erros.length > 0) {
      await registrarFalha(
        "quebra",
        "repasse-fotos-do-estoque",
        `${erros.length} de ${plano.pares.length} fotos do estoque #${estoqueId} não vieram para o repasse ${id}: ${erros.slice(0, 3).join("; ")}`,
        { rota: ROTA, origem: "servidor" },
      );
    }
    const baixadas = trazidos.filter((t) => t.baixou).length;
    const resposta: RespostaDaCopia = {
      copiadas: trazidos.length - baixadas,
      baixadas,
      ficaramDeFora: plano.ficaramDeFora,
      acimaDoLimite: plano.acimaDoLimite,
      falharam: erros.length,
    };
    if (trazidos.length === 0) return NextResponse.json(resposta);

    const edicao = decidirEdicao({
      repasse: lido.repasse,
      corpo: {
        web_full_images: [...lido.repasse.web_full_images, ...trazidos.map((t) => t.web)],
        whatsapp_images: [...lido.repasse.whatsapp_images, ...trazidos.map((t) => t.zap)],
      },
      perfis: sessao.perfis,
      agora: new Date(),
    });
    if (!edicao.ok) return recusar(edicao);

    // Presa ao rascunho LIDO: a situação e o `updated_at` (o gatilho
    // `repasses_updated_at` o renova a cada gravação). Outra cópia ou uma
    // gravação do editor no meio do caminho mudam o `updated_at`, e a lista
    // "lida + cópias" não passa por cima delas: vira 409.
    const { data, error } = await admin
      .from("repasses")
      .update(edicao.colunas)
      .eq("id", id)
      .eq("situacao", lido.repasse.situacao)
      .eq("updated_at", lido.repasse.updated_at)
      .select("*")
      .maybeSingle();
    if (error) return falhaDoBanco(error);
    if (!data || !repasseDoPainelDaLinha(data as Record<string, unknown>)) {
      return NextResponse.json(
        { error: "O carro mudou de situação enquanto as fotos copiavam. Abra esta tela de novo." },
        { status: 409 },
      );
    }
    await registrarAcaoSensivel(
      admin,
      "repasse.fotos-do-estoque",
      `${id}: ${trazidos.length} foto(s) do estoque #${estoqueId} (${resposta.copiadas} copiada(s), ${baixadas} baixada(s) do carro57)`,
      sessao.autor,
    );
    return NextResponse.json(resposta);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao copiar as fotos." }, { status: 500 });
  }
}
