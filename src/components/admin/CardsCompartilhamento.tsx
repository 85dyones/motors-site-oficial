"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PAGINAS_COMPARTILHAVEIS,
  urlDoCardGerado,
  type IdPaginaCompartilhavel,
} from "../../lib/compartilhamento";
import type { CardCompartilhamento, CompartilhamentoSettings } from "../../types";

/**
 * O card que aparece quando alguém cola um link do site no WhatsApp.
 *
 * Uma página por vez, e não oito formulários abertos: o que a loja faz aqui é
 * "vou arrumar o link da avaliação", não "vou revisar o site". A prévia ao
 * lado mostra o card real — inclusive o gerado, que é buscado do mesmo
 * `/api/og` que o site publica. Preview desenhado à mão mentiria na primeira
 * vez que o gerador mudasse.
 *
 * Campo em branco não publica em branco: cai no texto de fábrica da página
 * (`lib/compartilhamento.ts`) e, na falta de arte, no card gerado.
 */

interface CardsCompartilhamentoProps {
  valor: CompartilhamentoSettings;
  nomeLoja: string;
  /** Devolve a URL pública da arte já recortada em 1200×630. */
  aoEnviarImagem: (arquivo: File) => Promise<string>;
  aoSalvar: (valor: CompartilhamentoSettings) => Promise<void>;
}

// O WhatsApp corta o título por volta de 65 caracteres e a descrição por volta
// de 130. Os limites são do app, não nossos — passar disso só produz reticências.
const LIMITE_TITULO = 65;
const LIMITE_DESCRICAO = 130;

export default function CardsCompartilhamento({
  valor,
  nomeLoja,
  aoEnviarImagem,
  aoSalvar,
}: CardsCompartilhamentoProps) {
  const [rascunho, setRascunho] = useState<CompartilhamentoSettings>(valor);
  const [selecionada, setSelecionada] = useState<IdPaginaCompartilhavel>("home");
  const [estado, setEstado] = useState<"idle" | "salvando" | "salvo">("idle");
  const [enviando, setEnviando] = useState(false);

  // O contexto carrega as settings depois da primeira renderização; sem isto o
  // formulário ficaria preso no padrão e salvaria por cima do que está no ar.
  useEffect(() => {
    setRascunho(valor);
  }, [valor]);

  const alterado = JSON.stringify(rascunho) !== JSON.stringify(valor);
  const pagina = PAGINAS_COMPARTILHAVEIS.find((p) => p.id === selecionada)!;
  const card: CardCompartilhamento = rascunho[selecionada] ?? {};
  const artePadrao = rascunho.padrao?.imagemUrl?.trim() || "";

  const tituloExibido = card.titulo?.trim() || pagina.tituloPadrao;
  const descricaoExibida = card.descricao?.trim() || pagina.descricaoPadrao;

  // Qual imagem o site vai publicar para esta página, na mesma ordem da
  // cascata de `montarCompartilhamento`.
  const imagemExibida = useMemo(() => {
    const propria = card.imagemUrl?.trim();
    if (propria) return { url: propria, origem: "própria desta página" };
    if (artePadrao) return { url: artePadrao, origem: "arte padrão do site" };
    return {
      url: urlDoCardGerado(tituloExibido, pagina.rotuloCard),
      origem: "card gerado automaticamente",
    };
  }, [card.imagemUrl, artePadrao, tituloExibido, pagina.rotuloCard]);

  const alterar = (
    id: IdPaginaCompartilhavel | "padrao",
    campo: keyof CardCompartilhamento,
    conteudo: string
  ) => {
    setRascunho((anterior) => ({
      ...anterior,
      [id]: { ...(anterior[id] ?? {}), [campo]: conteudo },
    }));
    setEstado("idle");
  };

  const enviarArte = async (
    arquivo: File | undefined,
    destino: IdPaginaCompartilhavel | "padrao"
  ) => {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const url = await aoEnviarImagem(arquivo);
      alterar(destino, "imagemUrl", url);
    } catch (err: any) {
      console.error("[Compartilhamento] Falha no upload:", err);
      alert(err?.message || "Não foi possível enviar a imagem.");
    } finally {
      setEnviando(false);
    }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado("salvando");
    try {
      await aoSalvar(rascunho);
      setEstado("salvo");
      setTimeout(() => setEstado("idle"), 2500);
    } catch (err) {
      console.error("[Compartilhamento] Falha ao salvar:", err);
      alert("Não foi possível salvar os cards de compartilhamento. Tente novamente.");
      setEstado("idle");
    }
  };

  const paginasComCard = PAGINAS_COMPARTILHAVEIS.filter((p) => {
    const c = rascunho[p.id];
    return !!(c?.titulo?.trim() || c?.descricao?.trim() || c?.imagemUrl?.trim());
  }).length;

  return (
    <form onSubmit={salvar} className="flex flex-col items-stretch xl:flex-row">
      {/* ─── Coluna de edição ─── */}
      <div className="min-w-0 flex-1 pb-10 xl:border-r-2 xl:border-mt-regua xl:pr-7">
        <h1 className="mt-titulo text-[36px]">Compartilhamento</h1>
        <p className="mt-2 max-w-[560px] text-sm text-mt-neutral-800">
          O card que o WhatsApp, o Facebook e o Instagram mostram quando alguém cola um
          link do site. Deixe em branco o que não quiser mudar: o campo vazio usa o texto
          de fábrica da página, e a página sem arte recebe um card gerado com o logo — não
          fica em branco nem repete a home.
        </p>
        <p className="mt-3 max-w-[560px] text-[11px] font-semibold text-mt-neutral-700">
          A página de cada veículo não está na lista: ela compartilha a foto, o modelo e o
          preço do próprio carro, que vende melhor do que qualquer arte fixa.
        </p>

        {/* Seletor de página */}
        <div className="mt-regua mt-8 flex flex-wrap gap-2 pt-5">
          {PAGINAS_COMPARTILHAVEIS.map((p) => {
            const c = rascunho[p.id];
            const customizada = !!(
              c?.titulo?.trim() ||
              c?.descricao?.trim() ||
              c?.imagemUrl?.trim()
            );
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelecionada(p.id)}
                className={`mt-foco border px-3 py-2 text-[11px] font-bold tracking-[.06em] transition-all ${
                  selecionada === p.id
                    ? "border-mt-accent bg-mt-accent-100 text-mt-accent"
                    : "border-mt-regua-fina text-mt-neutral-800 hover:border-mt-accent"
                }`}
              >
                {p.nome.toUpperCase()}
                {customizada && <span className="ml-1.5 text-mt-accent">•</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-cartao mt-5 p-5">
          <div className="mt-rotulo mt-rotulo-accent">{pagina.nome}</div>
          <div className="mt-1 font-mono text-[11px] text-mt-neutral-700">
            {pagina.caminho}
          </div>

          <label
            className="mt-5 block text-[11px] font-semibold text-mt-neutral-700"
            htmlFor="compartilhar-titulo"
          >
            Título do card
          </label>
          <input
            id="compartilhar-titulo"
            className="mt-campo-caixa mt-1"
            value={card.titulo ?? ""}
            maxLength={LIMITE_TITULO}
            placeholder={pagina.tituloPadrao}
            onChange={(e) => alterar(selecionada, "titulo", e.target.value)}
          />
          <div className="mt-1 text-right text-[10px] text-mt-neutral-700">
            <span className="mt-num">{(card.titulo ?? "").length}</span>/{LIMITE_TITULO}
          </div>

          <label
            className="mt-3 block text-[11px] font-semibold text-mt-neutral-700"
            htmlFor="compartilhar-descricao"
          >
            Descrição
          </label>
          <textarea
            id="compartilhar-descricao"
            className="mt-campo-caixa mt-1 resize-y"
            rows={3}
            value={card.descricao ?? ""}
            maxLength={LIMITE_DESCRICAO}
            placeholder={pagina.descricaoPadrao}
            onChange={(e) => alterar(selecionada, "descricao", e.target.value)}
          />
          <div className="mt-1 text-right text-[10px] text-mt-neutral-700">
            <span className="mt-num">{(card.descricao ?? "").length}</span>/
            {LIMITE_DESCRICAO}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label
              className={`mt-btn mt-btn-contorno mt-foco cursor-pointer ${
                enviando ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {enviando ? "ENVIANDO..." : "ENVIAR ARTE DESTA PÁGINA"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={enviando}
                onChange={(e) => {
                  enviarArte(e.target.files?.[0], selecionada);
                  e.target.value = "";
                }}
              />
            </label>
            {card.imagemUrl?.trim() && (
              <button
                type="button"
                onClick={() => alterar(selecionada, "imagemUrl", "")}
                className="mt-foco text-[11px] font-semibold text-mt-accent-800 hover:text-mt-accent"
              >
                Remover arte
              </button>
            )}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-mt-neutral-700">
            Qualquer imagem serve — o painel recorta em 1200×630 e grava em JPEG, que é o
            único formato que o WhatsApp exibe na prévia. O corte é central, então deixe o
            que importa no meio da arte.
          </p>
        </div>

        {/* Arte padrão do site */}
        <div className="mt-cartao mt-4 p-5">
          <div className="mt-rotulo">Arte padrão do site</div>
          <p className="mt-2 text-[11px] leading-relaxed text-mt-neutral-800">
            Vale para toda página que não tiver arte própria. Só a imagem — título e
            descrição continuam sendo de cada página, para que a avaliação não volte a se
            anunciar como se fosse a home.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {artePadrao && (
              <div className="h-[63px] w-[120px] shrink-0 overflow-hidden border border-mt-regua-fina">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={artePadrao}
                  alt="Arte padrão"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <label
              className={`mt-btn mt-btn-contorno mt-foco cursor-pointer ${
                enviando ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {artePadrao ? "TROCAR ARTE PADRÃO" : "ENVIAR ARTE PADRÃO"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={enviando}
                onChange={(e) => {
                  enviarArte(e.target.files?.[0], "padrao");
                  e.target.value = "";
                }}
              />
            </label>
            {artePadrao && (
              <button
                type="button"
                onClick={() => alterar("padrao", "imagemUrl", "")}
                className="mt-foco text-[11px] font-semibold text-mt-accent-800 hover:text-mt-accent"
              >
                Remover
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="mt-btn mt-btn-primario mt-foco"
            disabled={!alterado || estado === "salvando"}
          >
            {estado === "salvando" ? "SALVANDO..." : estado === "salvo" ? "SALVO ✓" : "SALVAR"}
          </button>
          <span className="text-[11px] font-semibold text-mt-neutral-700">
            {alterado
              ? "Alteração ainda não salva."
              : `${paginasComCard} de ${PAGINAS_COMPARTILHAVEIS.length} páginas customizadas.`}
          </span>
        </div>

        <p className="mt-4 max-w-[560px] text-[10px] leading-relaxed text-mt-neutral-700">
          O WhatsApp guarda a prévia de cada link por semanas. Depois de salvar, um link
          que já circulou continua mostrando o card antigo até o cache do app expirar — a
          conferência precisa ser feita num link que ainda não foi compartilhado.
        </p>
      </div>

      {/* ─── Prévia ─── */}
      <aside className="mt-8 w-full shrink-0 bg-mt-surface p-6 xl:mt-0 xl:w-[452px]">
        <div className="mt-rotulo mb-4">Como aparece no WhatsApp</div>

        <div className="flex flex-col border border-mt-regua-fina bg-mt-bg">
          <div className="aspect-[1200/630] w-full overflow-hidden bg-mt-neutral-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagemExibida.url}
              alt="Prévia do card"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex flex-col gap-1 px-3 py-3">
            <div className="text-[13px] font-extrabold leading-tight tracking-[-.01em] text-mt-ink">
              {tituloExibido}
            </div>
            <div className="text-[11px] leading-snug text-mt-neutral-800">
              {descricaoExibida}
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase text-mt-neutral-700">
              {nomeLoja}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-mt-regua-fina pt-3 text-[10px] leading-relaxed text-mt-neutral-700">
          Imagem em uso: <strong className="text-mt-ink">{imagemExibida.origem}</strong>.
        </div>
      </aside>
    </form>
  );
}
