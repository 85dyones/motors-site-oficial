"use client";

import { useEffect, useState } from "react";
import {
  VAGAS,
  limparForaDoAr,
  montarPainelDeDestaques,
  moverDestaque,
  removerDestaque,
  voltaCompletaEmSegundos,
  type ItemDestacado,
  type Vitrine,
} from "../../lib/destaquesDoPainel";
import type { LinhaDeEstoque } from "../../lib/estoqueTabela";

/**
 * A curadoria dos destaques — as três listas, com ordem.
 *
 * ---------------------------------------------------------------------------
 * Por que esta tela existe
 * ---------------------------------------------------------------------------
 * Marcar destaque era append-only e o site cortava em silêncio. Medido em
 * 2026-09-21: 9 ids no banner, 5 deles de carros arquivados ou vendidos, e o
 * carro marcado por último nunca chegava à home — sem erro, sem aviso, com o
 * painel pintando "salvo" em verde.
 *
 * Três decisões de desenho, todas contra esse silêncio:
 *
 * 1. **As três listas juntas, e rotuladas.** Elas ficam lado a lado porque são
 *    SEPARADAS: a confusão entre "destacar na home" e "pôr nos destaques da
 *    semana" é metade do defeito.
 * 2. **A linha de corte é desenhada.** O que o site descarta passa a ter régua
 *    escrita em cima, com o rótulo verdadeiro daquela vitrine.
 * 3. **Os mortos aparecem.** Eram invisíveis no painel e entupiam a lista.
 *
 * Setas em vez de arrastar, como em `AreasDoSite`: funciona no toque e no
 * teclado, sem biblioteca.
 */
interface Props {
  bannerInicial: string[];
  gradeInicial: string[];
  tvInicial: string[];
  linhas: LinhaDeEstoque[];
}

interface Listas {
  banner: string[];
  grade: string[];
  tv: string[];
}

const TITULO: Record<Vitrine, string> = {
  banner: "Banner da home",
  grade: "Grade da semana",
  tv: "TV do showroom",
};

const VAZIO: Record<Vitrine, string> = {
  banner: "Nenhum carro curado. O banner está mostrando os primeiros do estoque.",
  grade: "Nenhum carro curado. As 6 vagas estão sendo sorteadas.",
  tv: "Nenhum carro curado. A TV está mostrando uma página do estoque.",
};

function formatarPreco(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function CuradoriaDeDestaques({
  bannerInicial,
  gradeInicial,
  tvInicial,
  linhas,
}: Props) {
  const inicial: Listas = { banner: bannerInicial, grade: gradeInicial, tv: tvInicial };
  const [listas, setListas] = useState<Listas>(inicial);
  const [salvo, setSalvo] = useState<Listas>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const sujo = JSON.stringify(listas) !== JSON.stringify(salvo);

  useEffect(() => {
    if (!sujo) return;
    const ao = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", ao);
    return () => window.removeEventListener("beforeunload", ao);
  }, [sujo]);

  const painel: Record<Vitrine, ItemDestacado[]> = {
    banner: montarPainelDeDestaques(listas.banner, linhas, "banner"),
    grade: montarPainelDeDestaques(listas.grade, linhas, "grade"),
    tv: montarPainelDeDestaques(listas.tv, linhas, "tv"),
  };

  const mortos = (["banner", "grade", "tv"] as Vitrine[]).flatMap((v) =>
    painel[v].filter((i) => i.destino === "fora_do_ar").map((i) => ({ ...i, vitrine: v })),
  );

  const publicar = async () => {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carouselVehicleIds: listas.banner,
          destaquesDaSemana: listas.grade,
          vitrineTv: listas.tv,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao publicar os destaques");
      setSalvo(listas);
      setAviso("Publicado — a home e a TV já refletem a nova ordem.");
      setTimeout(() => setAviso(""), 4000);
    } catch (e) {
      // `e` nunca é garantidamente um `Error` — o que se lança em JS pode ser
      // qualquer valor. Sem a guarda, um `throw` não-Error deixaria `e.message`
      // `undefined` e a tela mostraria um aviso de erro em branco.
      setErro(e instanceof Error ? e.message : "Falha ao publicar os destaques");
    } finally {
      setSalvando(false);
    }
  };

  const limparTodos = () => {
    setListas({
      banner: limparForaDoAr(listas.banner, linhas),
      grade: limparForaDoAr(listas.grade, linhas),
      tv: limparForaDoAr(listas.tv, linhas),
    });
  };

  const secao = (vitrine: Vitrine) => {
    const itens = painel[vitrine].filter((i) => i.destino !== "fora_do_ar");
    const teto = VAGAS[vitrine];

    return (
      <section key={vitrine} className="flex flex-col gap-3 border-b-2 border-mt-regua pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="mt-titulo text-xl">{TITULO[vitrine]}</h2>
          <span className="text-[11px] uppercase tracking-[.1em] text-mt-neutral-700">
            {teto === null
              ? `sem teto · volta completa: ${voltaCompletaEmSegundos(itens.length)} segundos`
              : `${teto} vagas`}
          </span>
        </div>

        {itens.length === 0 ? (
          <p className="text-sm text-mt-neutral-800">{VAZIO[vitrine]}</p>
        ) : (
          <ol className="flex flex-col">
            {itens.map((item) => (
              <li key={item.id}>
                {teto !== null && item.posicaoViva === teto + 1 && (
                  <div className="my-2 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[.1em] text-mt-accent">
                    <span className="h-px flex-1 bg-mt-accent" />
                    daqui para baixo NÃO aparece no {vitrine === "banner" ? "banner" : "grade"}
                    <span className="h-px flex-1 bg-mt-accent" />
                  </div>
                )}
                <div className="flex items-center gap-3 border-b border-mt-regua-fina py-2">
                  <span className="w-6 text-[11px] font-bold text-mt-neutral-700">
                    {item.posicaoViva}
                  </span>
                  <button
                    onClick={() => setListas({ ...listas, [vitrine]: moverDestaque(listas[vitrine], item.id, "cima") })}
                    aria-label={`Mover ${item.rotulo} para cima`}
                    className="mt-foco cursor-pointer px-1 text-mt-neutral-700 hover:text-mt-ink"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => setListas({ ...listas, [vitrine]: moverDestaque(listas[vitrine], item.id, "baixo") })}
                    aria-label={`Mover ${item.rotulo} para baixo`}
                    className="mt-foco cursor-pointer px-1 text-mt-neutral-700 hover:text-mt-ink"
                  >
                    ▼
                  </button>
                  <span className="flex-1 truncate text-sm text-mt-ink">{item.rotulo}</span>
                  <span className="text-sm text-mt-neutral-800">{formatarPreco(item.preco)}</span>
                  <button
                    onClick={() => setListas({ ...listas, [vitrine]: removerDestaque(listas[vitrine], item.id) })}
                    aria-label={`Tirar ${item.rotulo} de ${TITULO[vitrine]}`}
                    className="mt-foco cursor-pointer px-2 text-mt-neutral-700 hover:text-mt-accent"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  };

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Site</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Destaques</h1>
          <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
            Três listas, três destinos. Use as setas para ordenar — o que passa da última
            vaga fica marcado e não aparece. Carros entram por “Estoque”.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sujo && (
            <span className="text-[11px] font-semibold text-mt-accent-800">
              Alteração não publicada
            </span>
          )}
          <button
            onClick={() => setListas(salvo)}
            disabled={!sujo || salvando}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px] disabled:opacity-45"
          >
            Descartar
          </button>
          <button
            onClick={publicar}
            disabled={!sujo || salvando}
            className="mt-btn mt-btn-primario mt-foco cursor-pointer px-5 py-2.5 text-[11px] disabled:opacity-45"
          >
            {salvando ? "Publicando…" : "Publicar alterações"}
          </button>
        </div>
      </div>

      {erro && <p className="text-sm text-mt-accent-800">{erro}</p>}
      {aviso && <p className="text-sm text-mt-neutral-800">{aviso}</p>}

      {(["banner", "grade", "tv"] as Vitrine[]).map(secao)}

      {mortos.length > 0 && (
        <section className="flex flex-col gap-2 border border-mt-accent-300 bg-mt-accent-100 p-4">
          <h2 className="text-sm font-bold text-mt-accent-800">
            {mortos.length} marcados saíram do estoque
          </h2>
          <p className="text-[12px] text-mt-neutral-800">
            Eles não aparecem em lugar nenhum. Limpar <strong>não muda nada do que está no
            ar</strong> — o site já os descarta antes de montar qualquer vitrine.
          </p>
          <ul className="text-[12px] text-mt-neutral-800">
            {mortos.map((m) => (
              <li key={`${m.vitrine}-${m.id}`}>
                {m.rotulo} — {m.motivoForaDoAr} ({TITULO[m.vitrine]})
              </li>
            ))}
          </ul>
          <button
            onClick={limparTodos}
            className="mt-btn mt-btn-contorno mt-foco w-fit cursor-pointer px-4 py-2 text-[11px]"
          >
            Limpar os {mortos.length}
          </button>
        </section>
      )}
    </div>
  );
}
