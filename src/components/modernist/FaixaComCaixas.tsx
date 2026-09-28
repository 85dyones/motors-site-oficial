"use client";

import { useState } from "react";
import {
  ajustarFaixa,
  lerValorDigitado,
  type Faixa,
  type Limites,
} from "../../lib/filtrosDoEstoque";

/**
 * Régua de duas pontas com uma caixa de digitar embaixo de cada ponta.
 *
 * Pedido do dono em 28/09/2026 para o preço do `/estoque`; a quilometragem usa
 * o mesmo componente. A régua é para ver a faixa e ajustar de leve; a caixa é
 * para quem já sabe o número — arrastar até "R$ 37.500" num trilho de 290px não
 * é algo que alguém consiga fazer.
 *
 * São dois `input[type=range]` empilhados, um por ponta. Cada um é um controle
 * de verdade, com nome e valor para o leitor de tela e setas no teclado. Um
 * pegador não passa o outro; se a caixa receber as pontas invertidas, elas
 * trocam de lugar (`ajustarFaixa`).
 */
export default function FaixaComCaixas({
  titulo,
  limites,
  passo,
  faixa,
  onChange,
  formatar,
  nomes,
}: {
  titulo: string;
  limites: Limites;
  passo: number;
  faixa: Faixa;
  /** Recebe a faixa já ajustada: pontas em ordem, borda da régua como `null`. */
  onChange: (faixa: Faixa) => void;
  /** Como o valor aparece na caixa e para o leitor de tela: "R$ 45.000". */
  formatar: (valor: number) => string;
  /** Nomes acessíveis: da ponta da régua e da caixa, dos dois lados. */
  nomes: { min: string; max: string; digiteMin: string; digiteMax: string };
}) {
  const valorMin = faixa.min ?? limites.min;
  const valorMax = faixa.max ?? limites.max;
  const largura = limites.max - limites.min;
  const fracao = (v: number) => Math.min(1, Math.max(0, (v - limites.min) / largura));

  const mudar = (proxima: Faixa) => onChange(ajustarFaixa(proxima, limites));

  return (
    <fieldset className="border-b border-mt-regua-fina pb-5 pt-5">
      <legend className="mb-3.5 text-[10px] font-semibold tracking-[.16em] text-mt-neutral-600">
        {titulo}
      </legend>

      <div className="mt-range-duplo">
        {/* O trecho escolhido, na cor de destaque. O centro do pegador anda
            10px para dentro de cada borda (o pegador tem 20px), e o trecho
            acompanha o centro, não a borda do trilho. */}
        <span
          aria-hidden="true"
          className="mt-range-trecho"
          style={{
            left: `calc(10px + (100% - 20px) * ${fracao(valorMin)})`,
            right: `calc(10px + (100% - 20px) * ${1 - fracao(valorMax)})`,
          }}
        />
        <input
          type="range"
          aria-label={nomes.min}
          aria-valuetext={formatar(valorMin)}
          min={limites.min}
          max={limites.max}
          step={passo}
          value={valorMin}
          onChange={(e) => mudar({ min: Math.min(Number(e.target.value), valorMax), max: faixa.max })}
          // Com os dois pegadores no mesmo ponto, o de cima é o único que se
          // alcança. Na metade direita da régua quem precisa sair é o mínimo
          // (o máximo não tem para onde ir); na esquerda, o máximo.
          style={{ zIndex: fracao(valorMin) > 0.5 ? 3 : 2 }}
          className="mt-range mt-foco"
        />
        <input
          type="range"
          aria-label={nomes.max}
          aria-valuetext={formatar(valorMax)}
          min={limites.min}
          max={limites.max}
          step={passo}
          value={valorMax}
          onChange={(e) => mudar({ min: faixa.min, max: Math.max(Number(e.target.value), valorMin) })}
          style={{ zIndex: 2 }}
          className="mt-range mt-foco"
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <CaixaDeValor
          nome={nomes.digiteMin}
          valor={faixa.min}
          exemplo={formatar(limites.min)}
          formatar={formatar}
          onConfirmar={(min) => mudar({ min, max: faixa.max })}
        />
        <span aria-hidden="true" className="text-[11px] text-mt-neutral-600">
          até
        </span>
        <CaixaDeValor
          nome={nomes.digiteMax}
          valor={faixa.max}
          exemplo={formatar(limites.max)}
          formatar={formatar}
          onConfirmar={(max) => mudar({ min: faixa.min, max })}
        />
      </div>
    </fieldset>
  );
}

/**
 * Uma caixa de valor que só filtra quando a pessoa termina de digitar.
 *
 * Filtrar a cada tecla seria a vitrine zerando no meio do número: quem digita
 * "30000" passa por "3", e "até R$ 3" não tem carro. Confirma ao sair da caixa
 * ou no Enter — e o Enter NÃO tira o foco: `blur()` mandaria o foco para o
 * `<body>` (WCAG 2.4.3), o defeito que este painel já consertou três vezes.
 *
 * Enquanto a pessoa digita, a caixa mostra o rascunho; fora disso, o valor
 * confirmado já formatado. Vazia, mostra a borda da régua como exemplo.
 */
function CaixaDeValor({
  nome,
  valor,
  exemplo,
  formatar,
  onConfirmar,
}: {
  nome: string;
  valor: number | null;
  exemplo: string;
  formatar: (valor: number) => string;
  onConfirmar: (valor: number | null) => void;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);

  const confirmar = () => {
    if (rascunho === null) return;
    onConfirmar(lerValorDigitado(rascunho));
    setRascunho(null);
  };

  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{nome}</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={rascunho ?? (valor === null ? "" : formatar(valor))}
        placeholder={exemplo}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            confirmar();
          }
        }}
        className="mt-campo-caixa mt-foco px-2 text-[13px] font-semibold tabular-nums placeholder:font-normal"
      />
    </label>
  );
}
