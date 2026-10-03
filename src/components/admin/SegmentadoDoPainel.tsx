"use client";

/**
 * O segmentado e o chip de filtro das telas de lead.
 *
 * Botões com `aria-pressed`, e não os radios do `.mt-seg`: aqui cada opção é
 * um gesto (trocar a vista, mover o lead de etapa), e várias delas gravam no
 * clique. Radio promete escolha sem efeito até confirmar.
 *
 * No toque (tablet de balcão), cada alvo cresce para 44px; com mouse, fica do
 * tamanho do desenho.
 */

export interface OpcaoDoSegmentado<T extends string> {
  valor: T;
  rotulo: string;
  /** A contagem entre parênteses, quando houver. */
  conta?: number;
  /** Texto para leitor de tela, quando o rótulo sozinho não diz o gesto. */
  descricao?: string;
}

export function Segmentado<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoEscolher,
  desabilitado = false,
}: {
  /** O nome do grupo, para leitor de tela. */
  rotulo: string;
  opcoes: readonly OpcaoDoSegmentado<T>[];
  valor: T | null;
  aoEscolher: (valor: T) => void;
  desabilitado?: boolean;
}) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex flex-wrap border border-mt-regua">
      {opcoes.map((o) => {
        const ativa = valor === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativa}
            aria-label={o.descricao}
            disabled={desabilitado}
            onClick={() => aoEscolher(o.valor)}
            className={`mt-foco cursor-pointer border-l border-mt-regua-fina px-3 py-2 text-[11px] font-semibold tracking-[.06em] first:border-l-0 disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11 ${
              ativa ? "bg-mt-ink text-mt-bg" : "text-mt-neutral-700 hover:bg-mt-surface hover:text-mt-ink"
            }`}
          >
            {o.rotulo}
            {o.conta !== undefined && <span className="tabular-nums"> ({o.conta})</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ChipDeFiltro({
  ativo,
  aoAlternar,
  children,
}: {
  ativo: boolean;
  aoAlternar: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoAlternar}
      className={`mt-foco cursor-pointer border px-3 py-2 text-[11px] tabular-nums pointer-coarse:min-h-11 ${
        ativo
          ? "border-mt-accent bg-mt-accent-100 text-mt-accent-800"
          : "border-mt-regua-fina text-mt-neutral-700 hover:border-mt-accent"
      }`}
    >
      {children}
    </button>
  );
}
