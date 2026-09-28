"use client";

import { useState } from "react";
import { ITEM_VAZIO, comItem, semItem } from "../../../lib/fichaDeEstado";
import { BUCKET_DE_FOTOS, caminhoDaFotoDoRepasse, novoLote, validarFoto } from "../../../lib/fotosDoVeiculo";
import { processarFotoDeVeiculo } from "../../../lib/imageProcessor";
import { contaDoRepasse, emReais, type ItemDeEstado, type Repasse } from "../../../lib/repasse";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";

type ParteDaFicha = Pick<Repasse, "itens_de_estado" | "sem_defeitos_conhecidos" | "oficina_do_orcamento" | "orcamento_em">;

const rotuloCampo = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700";
const caixa = "mt-campo-caixa mt-foco";

/**
 * A ficha de estado no editor (spec §4.1 e §5): os defeitos conhecidos, com
 * foto e orçamento. É o documento que o comprador assina junto do contrato,
 * então todo defeito tem foto, e a foto sobe para a pasta do próprio carro
 * (`repasse/<id>/`), só na versão web — é ela que a ficha pública mostra.
 */
export default function FichaDeEstadoNoEditor({
  repasseId,
  itens,
  semDefeitos,
  oficina,
  orcamentoEm,
  podeEditar,
  aoMudar,
  aoMudarItem,
}: {
  repasseId: string;
  itens: ItemDeEstado[];
  semDefeitos: boolean;
  oficina: string | null;
  orcamentoEm: string | null;
  podeEditar: boolean;
  aoMudar: (parcial: Partial<ParteDaFicha>) => void;
  /**
   * Muda um item sobre a lista ATUAL do dono do estado, não sobre o `itens`
   * deste render. É por onde a foto entra: o envio leva segundos, e o que se
   * digitou nesse meio-tempo não pode ser apagado por um retrato velho.
   */
  aoMudarItem: (indice: number, parcial: Partial<ItemDeEstado>) => void;
}) {
  const [enviando, setEnviando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const reparo = contaDoRepasse({ preco: 0, fipe_valor: null, itens_de_estado: itens }).reparoOrcado;

  async function enviarFoto(indice: number, arquivo: File) {
    const problema = validarFoto(arquivo);
    if (problema) {
      setErro(problema.mensagem);
      return;
    }
    setErro(null);
    setEnviando(indice);
    try {
      const lote = novoLote();
      const versoes = await processarFotoDeVeiculo(arquivo, lote);
      const caminho = caminhoDaFotoDoRepasse(repasseId, lote, "web");
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.storage
        .from(BUCKET_DE_FOTOS)
        .upload(caminho, versoes.web, { contentType: versoes.web.type, upsert: false, cacheControl: "31536000" });
      if (error) throw new Error(error.message);
      const url = supabase.storage.from(BUCKET_DE_FOTOS).getPublicUrl(caminho).data.publicUrl;
      aoMudarItem(indice, { foto: url });
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Não deu para enviar a foto.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="mt-rotulo">Ficha de estado</div>
      <p className="max-w-[62ch] text-xs leading-relaxed text-mt-neutral-800">
        Os defeitos conhecidos, com foto e, quando houver, o orçamento do conserto. Esta é a lista que o comprador assina
        junto com o contrato.
      </p>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={semDefeitos}
          disabled={!podeEditar || itens.length > 0}
          onChange={(e) => aoMudar({ sem_defeitos_conhecidos: e.target.checked })}
        />
        Nenhum defeito conhecido
      </label>

      {!semDefeitos && (
        <>
          {itens.map((item, i) => (
            <div key={i} className="grid gap-2 border-l-[3px] border-mt-regua-fina pl-3 md:grid-cols-[2fr_1fr_1fr_auto]">
              <label className="flex flex-col gap-1">
                <span className={rotuloCampo}>Defeito</span>
                <input className={caixa} value={item.descricao} disabled={!podeEditar} onChange={(e) => aoMudar({ itens_de_estado: comItem(itens, i, { descricao: e.target.value }) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={rotuloCampo}>Onde</span>
                <input className={caixa} value={item.local} disabled={!podeEditar} onChange={(e) => aoMudar({ itens_de_estado: comItem(itens, i, { local: e.target.value }) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={rotuloCampo}>Orçamento (R$)</span>
                <input
                  className={caixa}
                  type="number"
                  min={1}
                  step={1}
                  value={item.orcamento ?? ""}
                  disabled={!podeEditar}
                  onChange={(e) => aoMudar({ itens_de_estado: comItem(itens, i, { orcamento: e.target.value === "" ? null : Number(e.target.value) }) })}
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className={rotuloCampo}>Foto</span>
                {item.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura do painel, foto do nosso bucket
                  <img src={item.foto} alt={`Foto do defeito ${i + 1}`} className="h-16 w-24 object-cover" />
                ) : (
                  <span className="text-[11px] text-mt-accent-800">Sem foto</span>
                )}
                {podeEditar && (
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label={`Foto do defeito ${i + 1}`}
                    disabled={enviando !== null}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0];
                      e.target.value = "";
                      if (arquivo) void enviarFoto(i, arquivo);
                    }}
                  />
                )}
                {enviando === i && <span role="status" className="text-[11px] text-mt-neutral-700">Enviando foto…</span>}
              </div>
              <label className="flex items-center gap-2 text-xs md:col-span-3">
                <input type="checkbox" checked={item.estetico} disabled={!podeEditar} onChange={(e) => aoMudar({ itens_de_estado: comItem(itens, i, { estetico: e.target.checked }) })} />
                Só estético
              </label>
              {podeEditar && (
                <button type="button" aria-label={`Remover o defeito ${i + 1}`} disabled={enviando !== null} onClick={() => aoMudar({ itens_de_estado: semItem(itens, i) })} className="mt-btn mt-btn-contorno mt-foco px-3 py-1.5 text-[10px]">
                  Remover
                </button>
              )}
            </div>
          ))}
          {podeEditar && (
            <button type="button" disabled={enviando !== null} onClick={() => aoMudar({ itens_de_estado: [...itens, ITEM_VAZIO] })} className="mt-btn mt-btn-contorno mt-foco self-start px-4 py-2 text-[11px]">
              Adicionar defeito
            </button>
          )}
        </>
      )}

      {reparo > 0 && (
        <div className="grid gap-2 md:grid-cols-3">
          <p className="text-xs md:col-span-3">
            Reparo orçado: <strong className="tabular-nums">{emReais(reparo)}</strong>
          </p>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className={rotuloCampo}>Oficina do orçamento</span>
            <input className={caixa} value={oficina ?? ""} disabled={!podeEditar} onChange={(e) => aoMudar({ oficina_do_orcamento: e.target.value || null })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotuloCampo}>Data do orçamento</span>
            <input className={caixa} type="date" value={orcamentoEm ?? ""} disabled={!podeEditar} onChange={(e) => aoMudar({ orcamento_em: e.target.value || null })} />
          </label>
        </div>
      )}

      {erro && <p role="alert" className="text-[11px] text-mt-accent-800">{erro}</p>}
    </section>
  );
}
