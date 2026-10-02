"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { filtrarGuias, type GrupoNaBusca, type GuiaNaBusca } from "../../lib/buscaDeGuias";

/**
 * O índice dos guias com busca (pedido do dono em 02/10/2026): o cliente
 * escolhe um tema ou digita a dúvida, e a lista mostra só o que responde.
 *
 * A lista inteira sai no HTML do servidor, agrupada como sempre: a busca só
 * esconde, no navegador, o que não interessa a quem digitou. Sem JavaScript, e
 * para o Google, a página é o índice completo de antes.
 *
 * A regra de quem entra na lista mora em `lib/buscaDeGuias.ts`.
 */

function CartaoDoGuia({ guia }: { guia: GuiaNaBusca }) {
  return (
    <Link
      href={`/guias/${guia.slug}`}
      className="mt-foco flex flex-col gap-2 border border-mt-regua p-5 no-underline hover:border-mt-accent"
    >
      <span className="mt-titulo text-[18px] text-mt-ink lg:text-[20px]">{guia.titulo}</span>
      <span className="text-[13px] leading-relaxed text-mt-neutral-800">{guia.descricao}</span>
    </Link>
  );
}

export default function GuiasComBusca({ grupos }: { grupos: GrupoNaBusca[] }) {
  const [consulta, setConsulta] = useState("");
  const [tema, setTema] = useState<string | null>(null);
  const idDoCampo = useId();
  const idDaAjuda = useId();
  const campo = useRef<HTMLInputElement>(null);

  const visto = useMemo(() => filtrarGuias(grupos, { consulta, tema }), [grupos, consulta, tema]);
  const filtrando = visto.resultados !== null || tema !== null;
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

  const botaoDoTema = (rotulo: string, valor: string | null) => {
    const ativo = tema === valor;
    return (
      <button
        key={rotulo}
        type="button"
        aria-pressed={ativo}
        onClick={() => setTema(valor)}
        className={`mt-foco min-h-11 cursor-pointer border px-3 text-[11px] font-extrabold uppercase tracking-[.06em] ${
          ativo ? "border-mt-ink bg-mt-ink text-mt-bg" : "border-mt-regua text-mt-ink hover:border-mt-accent"
        }`}
      >
        {rotulo}
      </button>
    );
  };

  return (
    <>
      <div role="search" className="border-t-2 border-mt-regua px-[18px] py-6 lg:px-10">
        <label htmlFor={idDoCampo} className="mt-rotulo block">
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
          className="mt-campo-caixa mt-foco mt-2 min-h-11 w-full max-w-[680px] text-[16px]"
        />
        {grupos.length > 1 && (
          <div role="group" aria-label="Filtrar por tema" className="mt-4 flex flex-wrap gap-1.5">
            {botaoDoTema("Todos os temas", null)}
            {grupos.map((g) => botaoDoTema(g.titulo, g.titulo))}
          </div>
        )}
        {/* Só fala quando há filtro: sem ele, o leitor de tela não precisa
            ouvir a contagem do índice inteiro ao abrir a página. */}
        <p role="status" className="m-0 mt-3 min-h-[1.25rem] text-[12px] text-mt-neutral-800">
          {filtrando ? (visto.total === 1 ? "1 guia encontrado" : `${visto.total} guias encontrados`) : ""}
        </p>
      </div>

      {visto.resultados !== null && visto.resultados.length > 0 && (
        <section aria-label="Resultados da busca" className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-10">
          <div className="grid gap-4 md:grid-cols-2">
            {visto.resultados.map((guia) => (
              <CartaoDoGuia key={guia.slug} guia={guia} />
            ))}
          </div>
        </section>
      )}

      {visto.total === 0 && (
        <section className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-10">
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

      {visto.grupos.map((grupo) => (
        <section key={grupo.titulo} className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-10">
          <h2 className="mt-titulo m-0 text-[22px] lg:text-[28px]">{grupo.titulo}</h2>
          {grupo.resumo && (
            <p className="m-0 mt-2 max-w-[680px] text-[14px] leading-relaxed text-mt-neutral-800">{grupo.resumo}</p>
          )}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {grupo.guias.map((guia) => (
              <CartaoDoGuia key={guia.slug} guia={guia} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
