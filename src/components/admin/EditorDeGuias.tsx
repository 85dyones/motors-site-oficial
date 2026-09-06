"use client";

import { useCallback, useEffect, useState } from "react";
import type { EstadoDoGuia } from "../../lib/guias";

/**
 * O editor de guias.
 *
 * ---------------------------------------------------------------------------
 * Parágrafos separados por linha em branco
 * ---------------------------------------------------------------------------
 * Mesma escolha de `TextosDosHubs`, pelo mesmo motivo: é como as pessoas já
 * escrevem, e faz o NÚMERO de parágrafos ser decisão de quem escreve em vez de
 * decisão da tela. Um campo por parágrafo obrigaria a clicar em "adicionar"
 * antes de cada ideia.
 *
 * O mesmo vale para as seções e o FAQ, com uma diferença: ali a estrutura
 * importa (cada seção é um `<h2>`, cada pergunta é um par no `FAQPage`), então
 * são blocos de verdade — mas o corpo de cada um continua sendo texto corrido.
 *
 * ---------------------------------------------------------------------------
 * Publicar é um botão separado
 * ---------------------------------------------------------------------------
 * "Salvar" nunca muda o estado. Guia longo se escreve em várias sessões, e um
 * salvar que publicasse poria meio texto no ar e no sitemap. Quando o guia não
 * está pronto, a API devolve 422 com a lista do que falta — e a tela mostra a
 * lista, não um "erro ao salvar" opaco.
 */

interface GuiaDoPainel {
  slug: string;
  titulo: string;
  titulo_seo: string | null;
  descricao: string;
  corpo: { titulo: string; paragrafos: string[] }[];
  faq: { pergunta: string; resposta: string }[];
  saida: { rotulo: string; href: string; apoio: string } | null;
  sobre: string[] | null;
  estado: EstadoDoGuia;
  publicado_em: string | null;
  atualizado_em: string;
}

const CAMPO =
  "w-full border border-mt-regua-fina bg-mt-bg px-3 py-2 text-[13px] text-mt-ink outline-none focus:border-mt-accent";
const BOTAO =
  "border border-mt-regua px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink hover:border-mt-accent disabled:opacity-40";

/** Texto corrido ↔ parágrafos. Linha em branco separa. */
const paraTexto = (paragrafos: string[]) => paragrafos.join("\n\n");
const paraParagrafos = (texto: string) =>
  texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export default function EditorDeGuias() {
  const [guias, setGuias] = useState<GuiaDoPainel[]>([]);
  const [regua, setRegua] = useState<string[]>([]);
  const [aberto, setAberto] = useState<GuiaDoPainel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string; itens?: string[] } | null>(
    null,
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/guias", { cache: "no-store" });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.error || "Falha ao carregar");
      setGuias(dados.guias ?? []);
      setRegua(dados.regua ?? []);
      if (dados.error) setAviso({ tipo: "erro", texto: dados.error });
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function criar() {
    const titulo = window.prompt("Título do guia novo:");
    if (!titulo?.trim()) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/guias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: titulo.trim() }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.error || "Falha ao criar");
      await carregar();
      setAberto(dados.guia);
      setAviso({ tipo: "ok", texto: `Guia criado como rascunho em /guias/${dados.guia.slug}.` });
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  async function salvar(estado: EstadoDoGuia) {
    if (!aberto) return;
    setSalvando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/guias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: aberto.slug,
          titulo: aberto.titulo,
          tituloSeo: aberto.titulo_seo,
          descricao: aberto.descricao,
          corpo: aberto.corpo,
          faq: aberto.faq,
          saida: aberto.saida,
          sobre: aberto.sobre ?? [],
          estado,
        }),
      });
      const dados = await r.json();
      if (!r.ok) {
        // 422 traz a lista do que falta para publicar. Mostrar a lista é a
        // diferença entre "conserte isto" e "deu erro".
        setAviso({ tipo: "erro", texto: dados.error || "Falha ao salvar", itens: dados.problemas });
        return;
      }
      setAberto(dados.guia);
      await carregar();
      setAviso({
        tipo: "ok",
        texto:
          estado === "publicado"
            ? `Publicado. Já está no ar em /guias/${dados.guia.slug}.`
            : "Rascunho salvo. Não aparece no site nem no sitemap.",
      });
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(slug: string) {
    if (!window.confirm(`Apagar o guia /guias/${slug}? A página sai do ar.`)) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/guias?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.error || "Falha ao excluir");
      setAberto(null);
      await carregar();
      setAviso({ tipo: "ok", texto: "Guia apagado." });
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  function mexer(troca: Partial<GuiaDoPainel>) {
    setAberto((atual) => (atual ? { ...atual, ...troca } : atual));
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="mt-titulo m-0 text-[24px]">Guias</h1>
        <span className="text-[12px] text-mt-neutral-700">
          O conteúdo de <code>/guias</code>. Rascunho não aparece no site nem no sitemap.
        </span>
      </div>

      {regua.length > 0 && (
        <div className="border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">
          <strong>A régua de um guia:</strong>
          <ul className="m-0 mt-1.5 list-disc pl-4">
            {regua.map((linha) => (
              <li key={linha}>{linha}</li>
            ))}
          </ul>
        </div>
      )}

      {aviso && (
        <div
          className={
            aviso.tipo === "ok"
              ? "border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800"
              : "border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800"
          }
        >
          {aviso.texto}
          {aviso.itens && aviso.itens.length > 0 && (
            <ul className="m-0 mt-1.5 list-disc pl-4">
              {aviso.itens.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* ─── A lista ─── */}
        <div className="flex flex-col gap-4 border border-mt-regua-fina p-4">
          <button type="button" onClick={criar} disabled={salvando} className={BOTAO}>
            + Guia novo
          </button>

          {carregando && <p className="m-0 text-[12px] text-mt-neutral-700">Carregando…</p>}

          {!carregando && guias.length === 0 && (
            <div className="flex items-center justify-center border border-dashed border-mt-regua-fina p-8 text-center text-[12px] text-mt-neutral-700">
              Nenhum guia ainda. O primeiro define o tom dos outros.
            </div>
          )}

          {guias.map((g) => (
            <button
              key={g.slug}
              type="button"
              onClick={() => {
                setAberto(g);
                setAviso(null);
              }}
              className={`flex flex-col gap-1 border p-3 text-left ${
                aberto?.slug === g.slug ? "border-mt-accent" : "border-mt-regua-fina"
              }`}
            >
              <span className="flex items-center gap-2 text-[11px] text-mt-neutral-800">
                <span
                  className={
                    g.estado === "publicado"
                      ? "border border-mt-ink px-1.5 py-0.5 text-[10px] font-extrabold uppercase"
                      : "border border-mt-accent px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-mt-accent-800"
                  }
                >
                  {g.estado}
                </span>
                <code className="text-[10px]">/guias/{g.slug}</code>
              </span>
              <span className="text-[13px] font-extrabold text-mt-ink">{g.titulo}</span>
            </button>
          ))}
        </div>

        {/* ─── O editor ─── */}
        {!aberto ? (
          <div className="flex items-center justify-center border border-dashed border-mt-regua-fina p-8 text-center text-[12px] text-mt-neutral-700">
            Escolha um guia à esquerda, ou crie um novo.
          </div>
        ) : (
          <div className="flex flex-col gap-4 border border-mt-regua-fina p-4">
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-[11px] text-mt-neutral-700">/guias/{aberto.slug}</code>
              {aberto.estado === "publicado" && (
                <a
                  href={`/guias/${aberto.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] underline"
                >
                  ver no site
                </a>
              )}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">Título</span>
              <input
                className={CAMPO}
                value={aberto.titulo}
                onChange={(e) => mexer({ titulo: e.target.value })}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">
                Título da aba <span className="font-normal normal-case">(vazio = usa o título)</span>
              </span>
              <input
                className={CAMPO}
                value={aberto.titulo_seo ?? ""}
                onChange={(e) => mexer({ titulo_seo: e.target.value })}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">
                Descrição <span className="font-normal normal-case">(o resumo que aparece na busca)</span>
              </span>
              <textarea
                className={CAMPO}
                rows={2}
                value={aberto.descricao}
                onChange={(e) => mexer({ descricao: e.target.value })}
              />
            </label>

            {/* Seções */}
            <div className="flex flex-col gap-3 border-t border-mt-regua pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">Seções</span>
                <button
                  type="button"
                  className={BOTAO}
                  onClick={() =>
                    mexer({ corpo: [...aberto.corpo, { titulo: "", paragrafos: [] }] })
                  }
                >
                  + seção
                </button>
              </div>

              {aberto.corpo.map((secao, i) => (
                <div key={i} className="flex flex-col gap-2 border border-mt-regua-fina p-3">
                  <div className="flex w-full items-baseline gap-2">
                    <input
                      className={CAMPO}
                      placeholder="Título da seção"
                      value={secao.titulo}
                      onChange={(e) => {
                        const corpo = [...aberto.corpo];
                        corpo[i] = { ...secao, titulo: e.target.value };
                        mexer({ corpo });
                      }}
                    />
                    <button
                      type="button"
                      className={BOTAO}
                      onClick={() => mexer({ corpo: aberto.corpo.filter((_, j) => j !== i) })}
                    >
                      remover
                    </button>
                  </div>
                  <textarea
                    className={CAMPO}
                    rows={6}
                    placeholder="Os parágrafos, separados por uma linha em branco."
                    value={paraTexto(secao.paragrafos)}
                    onChange={(e) => {
                      const corpo = [...aberto.corpo];
                      corpo[i] = { ...secao, paragrafos: paraParagrafos(e.target.value) };
                      mexer({ corpo });
                    }}
                  />
                </div>
              ))}
            </div>

            {/* FAQ */}
            <div className="flex flex-col gap-3 border-t border-mt-regua pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">
                  Perguntas frequentes
                </span>
                <button
                  type="button"
                  className={BOTAO}
                  onClick={() => mexer({ faq: [...aberto.faq, { pergunta: "", resposta: "" }] })}
                >
                  + pergunta
                </button>
              </div>
              <p className="m-0 text-[11px] text-mt-neutral-700">
                Estas perguntas também viram dado estruturado. O texto marcado precisa ser idêntico
                ao visível — por isso não use HTML aqui.
              </p>

              {aberto.faq.map((item, i) => (
                <div key={i} className="flex flex-col gap-2 border border-mt-regua-fina p-3">
                  <div className="flex w-full items-baseline gap-2">
                    <input
                      className={CAMPO}
                      placeholder="A pergunta"
                      value={item.pergunta}
                      onChange={(e) => {
                        const faq = [...aberto.faq];
                        faq[i] = { ...item, pergunta: e.target.value };
                        mexer({ faq });
                      }}
                    />
                    <button
                      type="button"
                      className={BOTAO}
                      onClick={() => mexer({ faq: aberto.faq.filter((_, j) => j !== i) })}
                    >
                      remover
                    </button>
                  </div>
                  <textarea
                    className={CAMPO}
                    rows={3}
                    placeholder="A resposta"
                    value={item.resposta}
                    onChange={(e) => {
                      const faq = [...aberto.faq];
                      faq[i] = { ...item, resposta: e.target.value };
                      mexer({ faq });
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Saída comercial */}
            <div className="flex flex-col gap-2 border-t border-mt-regua pt-3">
              <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">
                Saída comercial
              </span>
              <p className="m-0 text-[11px] text-mt-neutral-700">
                Para onde o leitor vai depois. Caminho interno, começando com barra.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={CAMPO}
                  placeholder="Rótulo do botão"
                  value={aberto.saida?.rotulo ?? ""}
                  onChange={(e) =>
                    mexer({
                      saida: { rotulo: e.target.value, href: aberto.saida?.href ?? "", apoio: aberto.saida?.apoio ?? "" },
                    })
                  }
                />
                <input
                  className={CAMPO}
                  placeholder="/garantia"
                  value={aberto.saida?.href ?? ""}
                  onChange={(e) =>
                    mexer({
                      saida: { rotulo: aberto.saida?.rotulo ?? "", href: e.target.value, apoio: aberto.saida?.apoio ?? "" },
                    })
                  }
                />
              </div>
              <input
                className={CAMPO}
                placeholder="A frase de apoio"
                value={aberto.saida?.apoio ?? ""}
                onChange={(e) =>
                  mexer({
                    saida: { rotulo: aberto.saida?.rotulo ?? "", href: aberto.saida?.href ?? "", apoio: e.target.value },
                  })
                }
              />
            </div>

            {/* Ações */}
            <div className="flex flex-wrap items-center gap-2 border-t border-mt-regua pt-3">
              <button
                type="button"
                className={BOTAO}
                disabled={salvando}
                onClick={() => salvar("rascunho")}
              >
                Salvar rascunho
              </button>
              <button
                type="button"
                className={`${BOTAO} border-mt-accent text-mt-accent-800`}
                disabled={salvando}
                onClick={() => salvar("publicado")}
              >
                {aberto.estado === "publicado" ? "Republicar" : "Publicar"}
              </button>
              <button
                type="button"
                className={BOTAO}
                disabled={salvando}
                onClick={() => excluir(aberto.slug)}
              >
                Apagar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
