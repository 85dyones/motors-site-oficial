"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { Rotulo } from "../modernist/primitivos";

/**
 * A porta de `/investidor` — link mágico, como na Garagem.
 *
 * `shouldCreateUser: false` e a tela neutra pelo mesmo motivo de lá: sucesso e
 * "esse e-mail não existe" terminam no MESMO lugar, senão a porta vira um
 * oráculo que confirma quem é sócio da loja para qualquer um que digite um
 * endereço.
 */
export default function InvestidorEntrada({ linkVencido = false }: { linkVencido?: boolean }) {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function pedirLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || enviando) return;
    setEnviando(true);

    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });

    setEnviando(false);
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="flex flex-col gap-4 border-t-2 border-mt-regua pt-6">
        <Rotulo accent className="text-[11px] tracking-[.18em]">
          VERIFIQUE O SEU E-MAIL
        </Rotulo>
        <p className="m-0 text-[14px] leading-relaxed text-mt-neutral-700">
          Se <strong>{email}</strong> estiver cadastrado, o link de acesso chega em
          instantes. Ele vale por uma hora e abre direto o seu extrato.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 border-t-2 border-mt-regua pt-6">
      <div className="flex flex-col gap-2">
        <Rotulo accent className="text-[11px] tracking-[.18em]">
          ÁREA DO INVESTIDOR
        </Rotulo>
        <h1 className="mt-titulo m-0 text-[28px]">Seus aportes e retiradas</h1>
        <p className="m-0 text-[14px] leading-relaxed text-mt-neutral-700">
          {linkVencido
            ? "Esse link expirou. Peça outro abaixo — leva um minuto."
            : "Entre com o e-mail cadastrado e receba um link de acesso."}
        </p>
      </div>

      <form onSubmit={pedirLink} className="flex flex-col gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          className="mt-foco h-12 w-full border border-mt-regua-fina bg-mt-bg px-4 text-[14px] text-mt-ink focus:border-mt-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={enviando}
          className="mt-foco h-12 w-full cursor-pointer bg-mt-ink text-[11px] font-bold uppercase tracking-[.1em] text-mt-inverso transition-colors hover:bg-mt-neutral-800 disabled:opacity-60"
        >
          {enviando ? "Enviando..." : "Receber link de acesso"}
        </button>
      </form>
    </div>
  );
}
