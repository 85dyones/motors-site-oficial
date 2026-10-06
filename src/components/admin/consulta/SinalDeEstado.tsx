import type { EstadoDaChecagem } from "../../../lib/consultaDePlaca";

/**
 * O sinal de um estado: forma E cor, nunca a cor sozinha.
 *
 *   ok ............. círculo com visto
 *   atencao ........ triângulo com exclamação
 *   impeditivo ..... octógono com xis
 *   nao_conferido .. círculo tracejado com interrogação
 *
 * Quatro formas diferentes para o quadro continuar legível impresso em preto e
 * branco e para quem não distingue verde de vermelho. O rótulo escrito vem
 * sempre ao lado, por conta de quem usa.
 */
export const ROTULO_DO_ESTADO: Record<EstadoDaChecagem, string> = {
  ok: "Ok",
  atencao: "Atenção",
  impeditivo: "Impeditivo",
  nao_conferido: "Não conferido",
};

export const COR_DO_ESTADO: Record<EstadoDaChecagem, string> = {
  ok: "var(--cp-ok)",
  atencao: "var(--cp-atencao)",
  impeditivo: "var(--cp-impeditivo)",
  nao_conferido: "var(--cp-neutro)",
};

export default function SinalDeEstado({ estado, tamanho = 20 }: { estado: EstadoDaChecagem; tamanho?: number }) {
  const cor = COR_DO_ESTADO[estado];
  const traco = { fill: "none", stroke: "#fff", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      role="img"
      aria-label={ROTULO_DO_ESTADO[estado]}
      className="shrink-0"
      data-estado={estado}
    >
      {estado === "ok" && (
        <>
          <circle cx="12" cy="12" r="11" fill={cor} />
          <path d="M7 12.5l3.2 3.2L17 9" {...traco} />
        </>
      )}
      {estado === "atencao" && (
        <>
          <path d="M12 1.8L23 21.5H1z" fill={cor} />
          {/* Tinta escura: branco sobre âmbar não se lê. */}
          <path d="M12 9v6" fill="none" stroke="#201e1d" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="12" cy="18.2" r="1.3" fill="#201e1d" />
        </>
      )}
      {estado === "impeditivo" && (
        <>
          <path d="M7.9 1h8.2L23 7.9v8.2L16.1 23H7.9L1 16.1V7.9z" fill={cor} />
          <path d="M8 8l8 8M16 8l-8 8" {...traco} />
        </>
      )}
      {estado === "nao_conferido" && (
        <>
          <circle cx="12" cy="12" r="10" fill="none" stroke={cor} strokeWidth="2" strokeDasharray="3.2 2.6" />
          <text x="12" y="16.6" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--mt-neutral-700)">
            ?
          </text>
        </>
      )}
    </svg>
  );
}
