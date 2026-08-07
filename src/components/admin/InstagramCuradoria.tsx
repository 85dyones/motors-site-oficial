"use client";

import { useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { MAX_PUBLICACOES, type PublicacaoInstagram } from "../../lib/instagramCuradoria";

/**
 * Curadoria da faixa do Instagram na home.
 *
 * Substitui o campo onde se colava o ID de um widget de terceiro. A troca não é
 * só de fornecedor: o widget espelhava o perfil inteiro em ordem cronológica, e
 * aqui a loja escolhe. A foto que vende carro raramente é a última postada.
 *
 * O que este editor NÃO faz, de propósito: buscar posts do Instagram. Isso
 * exigiria app no Meta Developers, token que expira em 60 dias e um cron só
 * para renovar credencial — manutenção permanente para publicar fotos que
 * alguém precisaria escolher de qualquer jeito.
 */

interface InstagramCuradoriaProps {
  publicacoes: PublicacaoInstagram[];
  aoSalvar: (publicacoes: PublicacaoInstagram[]) => Promise<void>;
}

const LIMITE_LEGENDA = 90;

function novaPublicacao(): PublicacaoInstagram {
  return {
    id: `ig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    imagemUrl: "",
    permalink: null,
    legenda: null,
  };
}

export default function InstagramCuradoria({ publicacoes, aoSalvar }: InstagramCuradoriaProps) {
  const [rascunho, setRascunho] = useState<PublicacaoInstagram[]>(publicacoes);
  const [estado, setEstado] = useState<"idle" | "salvando" | "salvo">("idle");
  const [enviando, setEnviando] = useState<string | null>(null);
  const inputsDeArquivo = useRef<Record<string, HTMLInputElement | null>>({});

  // As settings chegam do contexto depois da primeira renderização; sem
  // resincronizar, o formulário ficaria preso na lista vazia que tinha ao
  // montar e salvaria por cima do que está no ar.
  //
  // Ajuste durante a renderização, e não `useEffect`, porque a regra
  // `react-hooks/set-state-in-effect` reprova a segunda forma — é o padrão que
  // a própria documentação do React indica para redefinir estado quando uma
  // prop muda. `FaixaProcedenciaTextos` faz o mesmo com efeito e por isso
  // acusa erro de lint; vale alinhar aquele arquivo a este quando ele for
  // tocado de novo.
  const [ultimasRecebidas, setUltimasRecebidas] = useState<PublicacaoInstagram[]>(publicacoes);
  if (publicacoes !== ultimasRecebidas) {
    setUltimasRecebidas(publicacoes);
    setRascunho(publicacoes);
  }

  const alterado = JSON.stringify(rascunho) !== JSON.stringify(publicacoes);
  // O que a home vai renderizar de fato — `normalizarCuradoria` descarta
  // entrada sem imagem, e o preview precisa contar a mesma história.
  const publicaveis = rascunho.filter((p) => p.imagemUrl.trim().length > 0);

  const alterar = (id: string, campo: keyof PublicacaoInstagram, valor: string) => {
    setRascunho((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [campo]: valor.trim() === "" ? null : valor } : p))
    );
    setEstado("idle");
  };

  const adicionar = () => {
    if (rascunho.length >= MAX_PUBLICACOES) return;
    setRascunho((prev) => [...prev, novaPublicacao()]);
    setEstado("idle");
  };

  const remover = (id: string) => {
    setRascunho((prev) => prev.filter((p) => p.id !== id));
    setEstado("idle");
  };

  const mover = (id: string, direcao: -1 | 1) => {
    setRascunho((prev) => {
      const i = prev.findIndex((p) => p.id === id);
      const destino = i + direcao;
      if (i < 0 || destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      [copia[i], copia[destino]] = [copia[destino], copia[i]];
      return copia;
    });
    setEstado("idle");
  };

  /**
   * Sobe a imagem para o Storage do projeto — a mesma rota do logo e das tags.
   *
   * A imagem precisa ser NOSSA. Referenciar o CDN do Instagram parece atalho e
   * é a armadilha: aquelas URLs são assinadas e expiram, e a faixa amanheceria
   * com seis quadrados quebrados sem ninguém ter mexido em nada.
   */
  const enviarImagem = async (id: string, arquivo: File) => {
    setEnviando(id);
    try {
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;

      const formData = new FormData();
      formData.append("file", arquivo);
      formData.append("type", "instagram");

      const res = await fetch("/api/upload-branding", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar a imagem.");

      const url = data.url || data.publicUrl;
      if (!url) throw new Error("O servidor não devolveu o endereço da imagem.");

      setRascunho((prev) => prev.map((p) => (p.id === id ? { ...p, imagemUrl: url } : p)));
      setEstado("idle");
    } catch (err) {
      console.error("[Instagram] Falha no upload:", err);
      alert(err instanceof Error ? err.message : "Falha inesperada ao enviar a imagem.");
    } finally {
      setEnviando(null);
      const input = inputsDeArquivo.current[id];
      if (input) input.value = "";
    }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado("salvando");
    try {
      // Salva só o que tem imagem: quadro em branco esquecido no editor não
      // pode virar buraco na grade da home.
      await aoSalvar(publicaveis);
      setEstado("salvo");
      setTimeout(() => setEstado("idle"), 2500);
    } catch (err) {
      console.error("[Instagram] Falha ao salvar:", err);
      alert("Não foi possível salvar a faixa do Instagram. Tente novamente.");
      setEstado("idle");
    }
  };

  return (
    <form onSubmit={salvar} className="flex flex-col items-stretch xl:flex-row">
      {/* ─── Coluna de edição ─── */}
      <div className="min-w-0 flex-1 pb-10 xl:border-r-2 xl:border-mt-regua xl:pr-7">
        <h1 className="mt-titulo text-[36px]">Faixa do Instagram</h1>
        <p className="mt-2 max-w-[560px] text-sm text-mt-neutral-800">
          A grade de fotos no fim da home. São as publicações que a loja escolhe mostrar —
          não um espelho do perfil. Suba a foto, cole o link do post e escreva uma linha
          curta. Até {MAX_PUBLICACOES} quadros; sem nenhum, a seção não aparece no site.
        </p>

        <div className="mt-regua mt-8 flex flex-col gap-0.5 pt-5">
          {rascunho.map((publicacao, i) => (
            <div key={publicacao.id} className="mt-cartao p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[11px] font-extrabold tracking-[.1em] text-mt-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => mover(publicacao.id, -1)}
                    disabled={i === 0}
                    aria-label={`Mover a publicação ${i + 1} para cima`}
                    className="mt-foco px-2 py-1 text-[11px] font-bold text-mt-neutral-700 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(publicacao.id, 1)}
                    disabled={i === rascunho.length - 1}
                    aria-label={`Mover a publicação ${i + 1} para baixo`}
                    className="mt-foco px-2 py-1 text-[11px] font-bold text-mt-neutral-700 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remover(publicacao.id)}
                    className="mt-foco px-2 py-1 text-[11px] font-bold text-mt-accent"
                  >
                    REMOVER
                  </button>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="h-20 w-20 shrink-0 bg-mt-surface">
                  {publicacao.imagemUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={publicacao.imagemUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-mt-neutral-600">
                      SEM FOTO
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <label
                    className="block text-[11px] font-semibold text-mt-neutral-700"
                    htmlFor={`imagem-${publicacao.id}`}
                  >
                    Foto
                  </label>
                  <input
                    id={`imagem-${publicacao.id}`}
                    ref={(el) => {
                      inputsDeArquivo.current[publicacao.id] = el;
                    }}
                    type="file"
                    accept="image/*"
                    disabled={enviando === publicacao.id}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0];
                      if (arquivo) enviarImagem(publicacao.id, arquivo);
                    }}
                    className="mt-1 block w-full text-[11px] text-mt-neutral-700 file:mr-3 file:border-0 file:bg-mt-ink file:px-3 file:py-1.5 file:text-[10px] file:font-bold file:uppercase file:tracking-[.1em] file:text-mt-inverso"
                  />
                  {enviando === publicacao.id && (
                    <div className="mt-1 text-[10px] font-semibold text-mt-accent">
                      Enviando a imagem...
                    </div>
                  )}
                </div>
              </div>

              <label
                className="mt-3 block text-[11px] font-semibold text-mt-neutral-700"
                htmlFor={`permalink-${publicacao.id}`}
              >
                Link do post (opcional)
              </label>
              <input
                id={`permalink-${publicacao.id}`}
                className="mt-campo-caixa mt-1"
                placeholder="https://www.instagram.com/p/..."
                value={publicacao.permalink ?? ""}
                onChange={(e) => alterar(publicacao.id, "permalink", e.target.value)}
              />

              <label
                className="mt-3 block text-[11px] font-semibold text-mt-neutral-700"
                htmlFor={`legenda-${publicacao.id}`}
              >
                Legenda na vitrine
              </label>
              <input
                id={`legenda-${publicacao.id}`}
                className="mt-campo-caixa mt-1"
                maxLength={LIMITE_LEGENDA}
                placeholder="Entrega do Corolla do Rafael"
                value={publicacao.legenda ?? ""}
                onChange={(e) => alterar(publicacao.id, "legenda", e.target.value)}
              />
              <div className="mt-1 text-right text-[10px] text-mt-neutral-700">
                <span className="mt-num">{(publicacao.legenda ?? "").length}</span>/{LIMITE_LEGENDA}
              </div>
            </div>
          ))}
        </div>

        {rascunho.length === 0 && (
          <p className="mt-4 text-[11px] font-semibold text-mt-accent">
            Sem publicações, a faixa do Instagram não é renderizada na home.
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="mt-btn mt-btn-primario mt-foco"
            disabled={!alterado || estado === "salvando" || !!enviando}
          >
            {estado === "salvando" ? "SALVANDO..." : estado === "salvo" ? "SALVO ✓" : "SALVAR"}
          </button>
          <button
            type="button"
            onClick={adicionar}
            disabled={rascunho.length >= MAX_PUBLICACOES}
            className="mt-btn mt-btn-contorno mt-foco"
          >
            ADICIONAR PUBLICAÇÃO
          </button>
          {alterado && (
            <span className="text-[11px] font-semibold text-mt-neutral-700">
              Alteração ainda não salva.
            </span>
          )}
        </div>
      </div>

      {/* ─── Preview ─── */}
      <aside className="mt-8 w-full shrink-0 bg-mt-surface p-6 xl:mt-0 xl:w-[452px]">
        <div className="mt-rotulo mb-4">Como aparece na home</div>

        {publicaveis.length === 0 ? (
          <div className="border border-mt-regua-fina p-6 text-center text-[11px] text-mt-neutral-700">
            Nenhuma publicação com foto — a seção não é renderizada.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {publicaveis.map((publicacao) => (
              <div key={publicacao.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicacao.imagemUrl}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
                {publicacao.legenda && (
                  <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-mt-neutral-700">
                    {publicacao.legenda}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-mt-neutral-700">
          No site a grade é de seis colunas no desktop e duas no celular; aqui são três para
          caber na coluna. Quadro sem link do post aparece igual, só não é clicável.
        </p>
      </aside>
    </form>
  );
}
