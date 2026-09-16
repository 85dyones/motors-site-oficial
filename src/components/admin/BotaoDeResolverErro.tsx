"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * A saída da fila em um clique: "resolvido" — e a volta atrás.
 *
 * É a única ilha de cliente da `/admin/erros`. O resto da tela é servidor: a
 * lista é HTML renderizado do lado de lá, e passar as ocorrências como prop
 * para um componente cliente as serializaria uma segunda vez dentro do payload
 * do RSC — com `mensagem` e `stack` dentro, que é o que menos convém duplicar.
 *
 * Depois de gravar, `router.refresh()` manda o SERVIDOR redesenhar a página. O
 * estado da tela passa a vir de uma consulta nova, não de um palpite otimista
 * daqui: se a RLS recusou, a linha continua aberta na tela — como deve.
 */
export default function BotaoDeResolverErro({
  hash,
  resolvido,
  tamanho = "pequeno",
}: {
  hash: string;
  resolvido: boolean;
  tamanho?: "pequeno" | "grande";
}) {
  const router = useRouter();
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [recarregando, iniciarRecarga] = useTransition();

  const ocupado = gravando || recarregando;

  const alternar = async () => {
    setErro("");
    setAviso("");
    setGravando(true);
    try {
      const res = await fetch(`/api/erros/${hash}/resolver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolver: !resolvido }),
      });
      const dados = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErro(dados.error || "Não foi possível gravar a triagem.");
        return;
      }
      // 200 com zero linha: a rota não mente sobre isso, e a tela também não.
      if (dados.aviso) setAviso(dados.aviso);

      iniciarRecarga(() => router.refresh());
    } catch (e: unknown) {
      setErro(`Erro de rede: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGravando(false);
    }
  };

  const base =
    tamanho === "grande"
      ? "px-4 py-2 text-xs font-extrabold uppercase tracking-wider"
      : "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider";

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={alternar}
        disabled={ocupado}
        aria-busy={ocupado}
        title={
          resolvido
            ? "Volta o grupo para a fila — o carimbo de quem resolveu é apagado"
            : "Tira o grupo da fila. Se o erro acontecer de novo, ele volta sozinho"
        }
        className={`mt-foco border ${base} transition-colors disabled:opacity-40 ${
          resolvido
            ? "border-mt-regua-fina text-mt-neutral-700 enabled:cursor-pointer enabled:hover:border-mt-accent enabled:hover:text-mt-accent"
            : "border-mt-accent bg-mt-accent text-mt-inverso enabled:cursor-pointer enabled:hover:bg-mt-accent-hover"
        }`}
      >
        {ocupado ? "Gravando…" : resolvido ? "Reabrir" : "Marcar resolvido"}
      </button>

      {erro && (
        <span className="max-w-[280px] border border-mt-accent-300 bg-mt-accent-100 px-2 py-1 text-[10px] text-mt-accent">
          {erro}
        </span>
      )}
      {aviso && !erro && (
        <span className="max-w-[280px] border border-mt-regua-fina bg-mt-bg px-2 py-1 text-[10px] text-mt-neutral-700">
          {aviso}
        </span>
      )}
    </div>
  );
}
