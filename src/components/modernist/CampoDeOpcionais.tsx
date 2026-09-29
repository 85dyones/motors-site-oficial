"use client";

import { useRef, useState } from "react";
import { sugestoesDeOpcionais, type OpcaoDeOpcional } from "../../lib/filtrosDoEstoque";

/**
 * O filtro de OPCIONAIS: uma caixa que sugere enquanto a pessoa digita.
 *
 * Pedido do dono em 28/09/2026 — "pra não tornar o menu gigantesco, colocar um
 * dropdown ou caixa de digitação". Com 81 opcionais distintos no ar naquele
 * dia, um grupo de caixas de marcar seria o painel inteiro. Aqui é uma linha, e
 * cada escolha vira uma etiqueta embaixo dela.
 *
 * É o padrão combobox do ARIA: o foco fica sempre na caixa, as setas andam na
 * lista por `aria-activedescendant`, Enter escolhe, Esc fecha. Com a caixa
 * vazia, a lista mostra os mais comuns — é o que ensina o que existe para
 * buscar.
 *
 * A contagem ao lado de cada sugestão é de quantos carros SOBRAM se ela for
 * escolhida, porque escolher dois opcionais pede os dois no mesmo carro.
 */
export default function CampoDeOpcionais({
  catalogo,
  escolhidos,
  rotuloDe,
  onEscolher,
  onRemover,
}: {
  /** Os opcionais do que está na tela agora, com a contagem. */
  catalogo: OpcaoDeOpcional[];
  /** Chaves escolhidas, na ordem da escolha. */
  escolhidos: string[];
  rotuloDe: (chave: string) => string;
  onEscolher: (chave: string) => void;
  onRemover: (chave: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const campo = useRef<HTMLInputElement>(null);

  const sugestoes = sugestoesDeOpcionais(catalogo, texto, escolhidos);
  const listaAberta = aberto && sugestoes.length > 0;
  // A lista encolhe a cada tecla: o índice ativo vale só enquanto aponta para
  // alguém que ainda está nela.
  const ativoNaLista = ativo < sugestoes.length ? ativo : -1;

  const escolher = (chave: string) => {
    onEscolher(chave);
    setTexto("");
    setAtivo(-1);
  };

  return (
    <fieldset className="mt-grupo">
      <legend>
        <span>OPCIONAIS</span>
        {escolhidos.length > 0 && (
          <span aria-hidden="true" className="mt-grupo-conta">
            {escolhidos.length}
          </span>
        )}
      </legend>

      <div className="relative">
        <label htmlFor="busca-de-opcional" className="sr-only">
          Buscar opcional
        </label>
        <input
          ref={campo}
          id="busca-de-opcional"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listaAberta}
          aria-controls="sugestoes-de-opcional"
          aria-activedescendant={
            listaAberta && ativoNaLista >= 0 ? `sugestao-de-opcional-${ativoNaLista}` : undefined
          }
          autoComplete="off"
          value={texto}
          placeholder="Digite: teto, câmera, couro…"
          onFocus={() => setAberto(true)}
          onBlur={() => setAberto(false)}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
            setAtivo(e.target.value.trim() ? 0 : -1);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAberto(true);
              setAtivo((i) => Math.min(i + 1, sugestoes.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && listaAberta && ativoNaLista >= 0) {
              e.preventDefault();
              escolher(sugestoes[ativoNaLista].chave);
            } else if (e.key === "Escape") {
              // Com a lista aberta, o Esc é DELA: fecha as sugestões e para
              // aí. Sem o `preventDefault`, o mesmo Esc fechava também a folha
              // de filtros do celular, que escuta no `document` (padrão APG de
              // combobox: um Esc por camada).
              if (listaAberta) e.preventDefault();
              setAberto(false);
              setAtivo(-1);
            }
          }}
          className="mt-campo-caixa mt-foco px-2.5 text-[13px] placeholder:text-mt-neutral-600"
        />

        {listaAberta && (
          <ul
            id="sugestoes-de-opcional"
            role="listbox"
            aria-label="Opcionais sugeridos"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto border-2 border-mt-regua bg-mt-bg"
          >
            {sugestoes.map((sugestao, i) => (
              <li
                key={sugestao.chave}
                id={`sugestao-de-opcional-${i}`}
                role="option"
                aria-selected={i === ativoNaLista}
                // `mousedown` e não `click`: o clique chega DEPOIS do `blur`
                // da caixa, que já teria fechado a lista. O `preventDefault`
                // segura o foco na caixa para a próxima escolha.
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(sugestao.chave);
                }}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[13px] ${
                  i === ativoNaLista ? "bg-mt-surface" : ""
                }`}
              >
                <span>{sugestao.rotulo}</span>
                <span className="text-[11px] text-mt-neutral-600">{sugestao.total}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {aberto && texto.trim() !== "" && sugestoes.length === 0 && (
        <p className="mt-2 text-[12px] text-mt-neutral-600">
          Nenhum opcional com &ldquo;{texto.trim()}&rdquo; nos carros desta seleção.
        </p>
      )}

      {escolhidos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {escolhidos.map((chave) => (
            <button
              key={chave}
              type="button"
              // O botão sai do DOM com o clique: sem devolver o foco à caixa,
              // ele cai no `<body>` (WCAG 2.4.3) — o defeito que o `Catalogo`
              // documenta em `limparTudoComFocoNosResultados`.
              onClick={() => {
                onRemover(chave);
                campo.current?.focus();
              }}
              aria-label={`Remover opcional ${rotuloDe(chave)}`}
              className="mt-foco flex items-center gap-1.5 border border-mt-regua px-2.5 py-1 text-[11px] font-semibold"
            >
              {rotuloDe(chave).toUpperCase()}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="h-2.5 w-2.5 text-mt-accent"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
