"use client";

import type { EstadoMusica } from "../../lib/musicaShowroom";

/**
 * Faixa "tocando agora" da barra superior da TV — tela 08 A do design doc.
 *
 * É mostrador, não controle: a TV não tem quem toque nela. Quem comanda é o
 * painel do balcão (08 C, `ControleMusica`), e as duas telas olham o mesmo
 * player pela mesma rota.
 *
 * Dimensiona em `vw`/`vh` como o resto da `VitrineTV`, pelo mesmo motivo: o
 * desenho é 1920×1080, mas a TV da loja pode ser 4K.
 */

/** Durações do design doc — sem múltiplo comum, para as barras não sincronizarem. */
const BARRAS = ["0.62s", "0.86s", "0.48s", "0.74s"];

export function Equalizador({
  tocando,
  className = "",
}: {
  tocando: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-end gap-[2px] ${className}`} aria-hidden="true">
      {BARRAS.map((dur, i) => (
        <div
          key={dur}
          className="mt-eq-barra h-full flex-1 bg-mt-spotify"
          style={
            {
              "--mt-eq-dur": dur,
              "--mt-eq-atraso": `${i * 0.13}s`,
              animationPlayState: tocando ? "running" : "paused",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export default function FaixaMusica({ estado }: { estado: EstadoMusica }) {
  // Sem credencial, sem dispositivo ou sem faixa, a célula inteira sai da
  // barra. Uma TV de showroom exibindo "—" no lugar do nome da música é pior
  // do que uma barra sem música nenhuma.
  if (!estado.configurado || !estado.faixa) return null;

  const rotulo = estado.tocando ? "TOCANDO AGORA" : "PAUSADO";

  return (
    <div className="flex h-[5.2vh] flex-none items-center gap-[0.73vw] border border-[rgba(243,242,242,.25)] px-[1.04vw]">
      <Equalizador tocando={estado.tocando} className="h-[2vh] w-[1.04vw]" />
      <div className="min-w-[14.6vw] max-w-[20vw]">
        <div className="text-[0.57vw] font-semibold tracking-[.18em] text-mt-neutral-600">
          {rotulo}
        </div>
        <div className="mt-[0.3vh] truncate text-[0.89vw] font-extrabold tracking-[-.01em] text-mt-inverso">
          {estado.faixa.nome}
          {estado.faixa.artista && (
            <span className="font-normal text-mt-inverso-suave">
              {" "}
              — {estado.faixa.artista}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
