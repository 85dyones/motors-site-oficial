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
 * A câmera do quadro vazio — mesmo traço (stroke, 24×24) dos outros ícones do
 * painel (`AdminLayoutClientWrapper.tsx`, `ConfirmDialog.tsx`). Não é
 * `lucide-react`: o pacote não está no `package.json` deste repo.
 */
function IconeCamera() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.379a1.5 1.5 0 0 0 1.06-.44l1.122-1.12A1.5 1.5 0 0 1 11.12 5h1.76a1.5 1.5 0 0 1 1.06.44l1.122 1.12a1.5 1.5 0 0 0 1.06.44H18.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z"
      />
      <circle cx="12" cy="13" r="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A ficha de estado no editor (spec §4.1 e §5): os defeitos conhecidos, com
 * foto e orçamento. É o documento que o comprador assina junto do contrato,
 * então todo defeito tem foto, e a foto sobe para a pasta do próprio carro
 * (`repasse/<id>/`), só na versão web — é ela que a ficha pública mostra.
 *
 * O quadro da foto (28/09, "quadro da foto à esquerda"): antes cada linha
 * mostrava o `<input type="file">` cru, espremido numa coluna estreita, com
 * "Sem foto" escrito em cima — ninguém reconhecia ali "é aqui que eu boto a
 * foto". Agora é um quadro grande (~160×120) à esquerda de cada linha: clica
 * ou arrasta a imagem, com "Trocar"/"Tirar" quando já tem foto. O padrão —
 * input escondido + `<label htmlFor>` estilizado — é o mesmo de
 * `GaleriaDeFotos.tsx`; o status e o erro do envio moram DENTRO do quadro do
 * próprio item, nunca só no rodapé da ficha, que misturaria o item 1 com o 2.
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
  const [arrastandoSobre, setArrastandoSobre] = useState<number | null>(null);
  // Por índice, não uma mensagem solta: dois quadros nunca mostram o erro
  // um do outro, e o card que não falhou continua limpo.
  const [erro, setErro] = useState<{ indice: number; mensagem: string } | null>(null);
  const reparo = contaDoRepasse({ preco: 0, fipe_valor: null, itens_de_estado: itens }).reparoOrcado;

  async function enviarFoto(indice: number, arquivo: File) {
    const problema = validarFoto(arquivo);
    if (problema) {
      setErro({ indice, mensagem: problema.mensagem });
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
      setErro({ indice, mensagem: e instanceof Error ? e.message : "Não deu para enviar a foto." });
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
          {itens.map((item, i) => {
            const idFoto = `foto-defeito-${i}`;
            const erroDoItem = erro?.indice === i ? erro.mensagem : null;
            return (
              <div key={i} className="flex flex-col gap-3 border-l-[3px] border-mt-regua-fina p-3 md:flex-row">
                <div className="flex w-full flex-col gap-1.5 md:w-40 md:flex-none">
                  {podeEditar && (
                    <input
                      id={idFoto}
                      type="file"
                      accept="image/*"
                      aria-label={`Foto do defeito ${i + 1}`}
                      disabled={enviando !== null}
                      className="hidden"
                      onChange={(e) => {
                        const arquivo = e.target.files?.[0];
                        e.target.value = "";
                        if (arquivo) void enviarFoto(i, arquivo);
                      }}
                    />
                  )}

                  {item.foto ? (
                    <div className="flex flex-col gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do painel, foto do nosso bucket */}
                      <img
                        src={item.foto}
                        alt={`Foto do defeito ${i + 1}`}
                        className="h-[120px] w-full object-cover md:w-40"
                      />
                      {podeEditar && (
                        <div className="flex gap-3 text-[10px] font-semibold uppercase tracking-[.06em]">
                          <label
                            htmlFor={idFoto}
                            className={`mt-foco cursor-pointer text-mt-neutral-800 underline hover:text-mt-ink ${
                              enviando !== null ? "pointer-events-none opacity-40" : ""
                            }`}
                          >
                            Trocar
                          </label>
                          <button
                            type="button"
                            disabled={enviando !== null}
                            onClick={() => aoMudarItem(i, { foto: null })}
                            className="mt-foco text-mt-accent-800 underline hover:text-mt-accent disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Tirar
                          </button>
                        </div>
                      )}
                    </div>
                  ) : podeEditar ? (
                    <label
                      htmlFor={idFoto}
                      onDragOver={(e) => {
                        if (enviando !== null) return;
                        e.preventDefault();
                        setArrastandoSobre(i);
                      }}
                      onDragLeave={() => setArrastandoSobre((a) => (a === i ? null : a))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setArrastandoSobre(null);
                        if (enviando !== null) return;
                        const arquivo = e.dataTransfer.files?.[0];
                        if (arquivo) void enviarFoto(i, arquivo);
                      }}
                      className={`mt-foco flex h-[120px] w-full flex-col items-center justify-center gap-0.5 border border-dashed px-2 text-center md:w-40 ${
                        arrastandoSobre === i ? "border-mt-accent bg-mt-accent-100" : "border-mt-regua-fina bg-mt-surface"
                      } ${enviando !== null ? "pointer-events-none opacity-40" : "cursor-pointer"}`}
                    >
                      <IconeCamera />
                      <span className="text-[11px] font-semibold text-mt-neutral-800">Adicionar foto</span>
                      <span className="text-[10px] text-mt-neutral-600">ou arraste a imagem</span>
                    </label>
                  ) : (
                    <span className="text-[11px] text-mt-accent-800">Sem foto</span>
                  )}

                  {enviando === i && (
                    <span role="status" className="text-[11px] text-mt-neutral-700">
                      Enviando foto…
                    </span>
                  )}
                  {erroDoItem && (
                    <p role="alert" className="text-[11px] text-mt-accent-800">
                      {erroDoItem}
                    </p>
                  )}
                </div>

                <div className="grid flex-1 gap-2 md:grid-cols-[2fr_1fr_1fr]">
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
                  <div className="flex items-center justify-between gap-2 md:col-span-3">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={item.estetico} disabled={!podeEditar} onChange={(e) => aoMudar({ itens_de_estado: comItem(itens, i, { estetico: e.target.checked }) })} />
                      Só estético
                    </label>
                    {podeEditar && (
                      <button type="button" aria-label={`Remover o defeito ${i + 1}`} disabled={enviando !== null} onClick={() => aoMudar({ itens_de_estado: semItem(itens, i) })} className="mt-btn mt-btn-contorno mt-foco px-3 py-1.5 text-[10px]">
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
    </section>
  );
}
