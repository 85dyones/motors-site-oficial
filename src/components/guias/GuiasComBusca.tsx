"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { filtrarGuias, type GrupoNaBusca, type GuiaNaBusca } from "../../lib/buscaDeGuias";

/**
 * O índice dos guias com busca (pedido do dono em 02/10/2026): o cliente
 * escolhe um tema ou digita a dúvida, e a lista mostra só o que responde.
 *
 * A lista inteira sai no HTML do servidor, agrupada como sempre: a busca só
 * esconde, no navegador, o que não interessa a quem digitou. Sem JavaScript, e
 * para o Google, a página é o índice completo de antes.
 *
 * O desenho é o de 02/10/2026 (aprovado pelo dono no mesmo dia): abertura
 * escura com a busca e um guia de entrada, os temas como atalho e filtro, e
 * cada tema com os guias em linhas.
 *
 * A regra de quem entra na lista mora em `lib/buscaDeGuias.ts`.
 */

/** Dois dígitos: 1 vira "01". É o número de ordem do tema e do guia na lista. */
const doisDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * Um guia como LINHA, e não como caixa (redesenho de 02/10/2026). Com 26 caixas
 * de mesmo peso a página não tinha por onde começar a ler; em linha, o título
 * manda e a descrição apoia.
 */
function LinhaDoGuia({ guia, ordem }: { guia: GuiaNaBusca; ordem: number }) {
  return (
    <li className="border-b border-mt-regua-fina">
      <Link
        href={`/guias/${guia.slug}`}
        className="mt-foco group flex items-start gap-4 py-5 no-underline lg:gap-6"
      >
        <span aria-hidden="true" className="w-7 shrink-0 pt-1 text-[12px] font-extrabold text-mt-neutral-600">
          {doisDigitos(ordem)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[18px] font-extrabold leading-tight text-mt-ink group-hover:text-mt-accent-hover lg:text-[22px]">
            {guia.titulo}
          </span>
          <span className="max-w-[640px] text-[14px] leading-relaxed text-mt-neutral-800 lg:text-[15px]">
            {guia.descricao}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 pt-0.5 text-[20px] font-bold text-mt-neutral-600 transition-transform group-hover:translate-x-1 group-hover:text-mt-accent motion-reduce:transition-none"
        >
          →
        </span>
      </Link>
    </li>
  );
}

export default function GuiasComBusca({
  grupos,
  abertura,
  entrada,
}: {
  grupos: GrupoNaBusca[];
  /** A trilha, o `<h1>` e o resumo, renderizados no servidor pela página. */
  abertura?: ReactNode;
  /** O guia de "Comece por aqui". Sem ele, a abertura fica só com a busca. */
  entrada?: GuiaNaBusca;
}) {
  const [consulta, setConsulta] = useState("");
  const [tema, setTema] = useState<string | null>(null);
  const idDoCampo = useId();
  const idDaAjuda = useId();
  const campo = useRef<HTMLInputElement>(null);

  const visto = useMemo(() => filtrarGuias(grupos, { consulta, tema }), [grupos, consulta, tema]);
  const filtrando = visto.resultados !== null || tema !== null;
  const totalDeGuias = grupos.reduce((soma, g) => soma + g.guias.length, 0);
  // O número do tema é o da ordem do índice inteiro: filtrar não renumera.
  const numeroDoTema = (titulo: string) => grupos.findIndex((g) => g.titulo === titulo) + 1;
  // O botão que chama isto some da tela ao ser usado: o foco volta ao campo,
  // em vez de cair no começo da página.
  const limpar = () => {
    setConsulta("");
    setTema(null);
    campo.current?.focus();
  };
  const tirarOTema = () => {
    setTema(null);
    campo.current?.focus();
  };

  const botaoDoTema = (rotulo: string, valor: string | null, apoio: string, numero?: number) => {
    const ativo = tema === valor;
    return (
      <button
        key={rotulo}
        type="button"
        aria-pressed={ativo}
        onClick={() => setTema(valor)}
        className={`mt-foco flex min-h-11 cursor-pointer flex-col items-start gap-1.5 border-0 border-b border-mt-regua-fina px-[18px] py-4 text-left lg:border-b-0 lg:border-l lg:px-5 lg:py-6 ${
          ativo ? "bg-mt-surface text-mt-ink shadow-[inset_0_3px_0_var(--mt-accent)]" : "bg-transparent text-mt-ink hover:bg-mt-surface"
        }`}
      >
        {numero !== undefined && (
          <span
            aria-hidden="true"
            className="text-[12px] font-extrabold tracking-[.08em] text-mt-cobre"
          >
            {doisDigitos(numero)}
          </span>
        )}
        <span className="text-[15px] font-extrabold leading-tight lg:text-[17px]">{rotulo}</span>
        <span className="text-[12px] text-mt-neutral-600">{apoio}</span>
      </button>
    );
  };

  return (
    <>
      {/* A abertura: título, busca e a porta de entrada. No papel da marca, e
          não em faixa escura (ajuste de 02/10, a pedido do dono): colada no
          cabeçalho do site, que já é grafite, a faixa virava um bloco preto. A
          cor fica com o cobre do logo, no card de entrada e nos números. */}
      <div className="px-[18px] pb-10 pt-8 lg:px-10 lg:pb-14 lg:pt-11">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:gap-12">
          <div className="flex min-w-0 flex-1 flex-col">
            {abertura}
            <div role="search" className="mt-7 max-w-[620px]">
              <label
                htmlFor={idDoCampo}
                className="mt-rotulo block"
              >
                Buscar nos guias
              </label>
              <p id={idDaAjuda} className="m-0 mt-1 text-[13px] text-mt-neutral-800">
                Digite a sua dúvida ou escolha um tema.
              </p>
              {/* 16px no campo: abaixo disso o iPhone dá zoom na página ao focar.
                  44px de altura: o alvo de toque do resto do site. */}
              <input
                ref={campo}
                id={idDoCampo}
                type="search"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Ex.: laudo, troca, financiamento"
                aria-describedby={idDaAjuda}
                autoComplete="off"
                enterKeyHint="search"
                className="mt-foco mt-2 min-h-14 w-full rounded-none border-0 border-b-2 border-mt-ink bg-mt-surface px-4 text-[16px] text-mt-ink placeholder:text-mt-neutral-600 lg:text-[17px]"
              />
            </div>
            <p className="m-0 mt-5 text-[13px] text-mt-neutral-800">
              <strong className="text-mt-cobre">{totalDeGuias}</strong> guias publicados em{" "}
              <strong className="text-mt-cobre">{grupos.length}</strong> temas
            </p>
          </div>

          {/* Some enquanto há busca digitada: no celular ele ficava entre o
              campo e os resultados, e quem digitava não via nada mudar. */}
          {entrada && visto.resultados === null && (
            <Link
              href={`/guias/${entrada.slug}`}
              className="mt-foco group flex w-full flex-col gap-3 bg-mt-cobre-marca p-6 text-mt-inverso-fundo no-underline lg:max-w-[440px] lg:p-7"
            >
              <span className="text-[11px] font-extrabold uppercase tracking-[.14em]">
                Comece por aqui
              </span>
              <span className="mt-titulo text-[24px] leading-[1.1] lg:text-[30px]">{entrada.titulo}</span>
              <span className="text-[14px] leading-relaxed lg:text-[15px]">{entrada.descricao}</span>
              <span className="mt-1 text-[12px] font-extrabold uppercase tracking-[.1em] underline-offset-4 group-hover:underline">
                Ler o guia <span aria-hidden="true">→</span>
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* Os temas: atalho e filtro ao mesmo tempo. */}
      {grupos.length > 1 && (
        <div
          role="group"
          aria-label="Filtrar por tema"
          className="grid grid-cols-2 border-y-2 border-mt-regua lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none"
        >
          {botaoDoTema("Todos os temas", null, `${totalDeGuias} guias`)}
          {grupos.map((g) =>
            botaoDoTema(g.titulo, g.titulo, g.guias.length === 1 ? "1 guia" : `${g.guias.length} guias`, numeroDoTema(g.titulo)),
          )}
        </div>
      )}
      {/* Só fala quando há filtro: sem ele, o leitor de tela não precisa
          ouvir a contagem do índice inteiro ao abrir a página. */}
      <p
        role="status"
        className={`m-0 px-[18px] text-[12px] text-mt-neutral-800 lg:px-10 ${filtrando ? "pt-5" : "sr-only"}`}
      >
        {filtrando ? (visto.total === 1 ? "1 guia encontrado" : `${visto.total} guias encontrados`) : ""}
      </p>

      {visto.resultados !== null && visto.resultados.length > 0 && (
        <section aria-label="Resultados da busca" className="px-[18px] pb-10 pt-4 lg:px-10">
          <ol role="list" className="m-0 max-w-[900px] list-none border-t-2 border-mt-cobre p-0">
            {visto.resultados.map((guia, i) => (
              <LinhaDoGuia key={guia.slug} guia={guia} ordem={i + 1} />
            ))}
          </ol>
        </section>
      )}

      {visto.total === 0 && (
        <section className="px-[18px] py-8 lg:px-10">
          <p className="m-0 max-w-[680px] text-[14px] leading-relaxed text-mt-neutral-800">
            {tema
              ? "Nenhum guia deste tema trata disso. Procure nos outros temas, ou mande a dúvida para a loja."
              : "Nenhum guia trata disso ainda. Tente outra palavra, ou mande a dúvida para a loja."}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tema && (
              <button
                type="button"
                onClick={tirarOTema}
                className="mt-foco min-h-11 cursor-pointer border border-mt-regua px-3 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink hover:border-mt-accent"
              >
                Buscar em todos os temas
              </button>
            )}
            <button
              type="button"
              onClick={limpar}
              className="mt-foco min-h-11 cursor-pointer border border-mt-regua px-3 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink hover:border-mt-accent"
            >
              Ver todos os guias
            </button>
            <Link
              href="/contato"
              className="mt-foco flex min-h-11 items-center border border-mt-regua px-3 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink no-underline hover:border-mt-accent"
            >
              Falar com a loja
            </Link>
          </div>
        </section>
      )}

      {/* Cada tema: número, título e resumo à esquerda; os guias em linhas à
          direita. No celular, um embaixo do outro. */}
      {visto.grupos.map((grupo) => (
        <section
          key={grupo.titulo}
          className="border-b-2 border-mt-regua px-[18px] py-10 lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-x-14 lg:px-10 lg:py-16"
        >
          <div className="lg:sticky lg:top-24 lg:self-start">
            {numeroDoTema(grupo.titulo) > 0 && (
              <p aria-hidden="true" className="mt-display m-0 text-[56px] text-mt-cobre-marca lg:text-[88px]">
                {doisDigitos(numeroDoTema(grupo.titulo))}
              </p>
            )}
            <h2 className="mt-titulo m-0 mt-3 text-[26px] leading-[1.05] lg:text-[34px]">{grupo.titulo}</h2>
            {grupo.resumo && (
              <p className="m-0 mt-3 text-[14px] leading-relaxed text-mt-neutral-800 lg:text-[15px]">{grupo.resumo}</p>
            )}
          </div>
          <ol role="list" className="m-0 mt-6 list-none border-t-2 border-mt-cobre p-0 lg:mt-0">
            {grupo.guias.map((guia, i) => (
              <LinhaDoGuia key={guia.slug} guia={guia} ordem={i + 1} />
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
