/**
 * Trazer fotos de fora para a pasta de um carro de repasse, só no servidor.
 *
 * Nasceu dentro de `POST /api/repasses/[id]/fotos-do-estoque` (01/10) e veio
 * para cá em 06/10, quando a importação do feed do RevendaMais
 * (`POST /api/repasses/[id]/fotos-do-feed`) passou a precisar do mesmo passo:
 * as duas rotas terminam com arquivo novo em `repasse/<id>/`, no NOSSO bucket,
 * que é a única foto que o checklist do repasse deixa publicar.
 */
import { baixarDoCarro57 } from "./baixarDoCarro57";
import type { ParDaCopia } from "./estoqueParaORepasse";
import { BUCKET_DE_FOTOS, type VarianteDaFoto } from "./fotosDoVeiculo";
import type { createAdminSupabaseClient } from "./supabase-server";

const VARIANTES: readonly VarianteDaFoto[] = ["web", "zap"];

export type ArmazenamentoDoRepasse = ReturnType<typeof createAdminSupabaseClient>["storage"];
export type ParTrazido = { ok: true; web: string; zap: string; baixou: boolean } | { ok: false; erro: string };
type Gravacao = () => Promise<{ error: { message: string } | null }>;

/**
 * Traz as duas versões de um par, como unidade. Nunca lança: a falha de um par
 * volta como resultado, para não derrubar os outros.
 *
 * Primeiro BAIXA o que é do carro57 (web e depois zap, um pedido por vez), e
 * só então grava as duas — cópia dentro do bucket para o lado nosso, upload
 * dos bytes como vieram para o lado baixado. Um download que falha derruba o
 * par antes de qualquer gravação, então não deixa arquivo sem dono; e se uma
 * versão grava e a outra falha, a que gravou é removida. O upload
 * leva o tipo da resposta (o arquivo `-web.webp` guarda o JPEG que o carro57
 * serviu, se foi o caso) e o carimbo de 1 ano da galeria, sem `upsert`.
 */
export async function trazerPar(armazenamento: ArmazenamentoDoRepasse, par: ParDaCopia, prazo: AbortSignal): Promise<ParTrazido> {
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
      if (error) {
        // A versão que já foi gravada fica sem par e sem dono: sai do bucket.
        // Só o DESTINO, na pasta do repasse; a origem nunca é tocada.
        await desfazerGravadas(balde, VARIANTES.slice(0, i).map((v) => par.destino[v]));
        return { ok: false, erro: `${par.destino[VARIANTES[i]]}: ${error.message}` };
      }
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

/** Tira do bucket o que um par deixou pela metade. Nunca lança: sobrar arquivo não derruba a importação. */
async function desfazerGravadas(balde: ReturnType<ArmazenamentoDoRepasse["from"]>, caminhos: string[]): Promise<void> {
  if (caminhos.length === 0) return;
  try {
    const { error } = await balde.remove(caminhos);
    if (error) console.warn("[Repasse/Fotos] arquivo sem par no bucket:", error.message);
  } catch (e: unknown) {
    console.warn("[Repasse/Fotos] arquivo sem par no bucket:", e instanceof Error ? e.message : String(e));
  }
}

/** `tarefa` sobre cada item, no máximo `limite` de cada vez; o resultado sai na ordem dos itens. */
export async function emFila<T, R>(itens: readonly T[], limite: number, tarefa: (item: T) => Promise<R>): Promise<R[]> {
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
