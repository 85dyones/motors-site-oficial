"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { Rotulo } from "../modernist/primitivos";

/**
 * A porta da Garagem: e-mail, link, caixa de entrada.
 *
 * A resposta é NEUTRA de propósito (docs/AREA_DO_CLIENTE_AUTH.md §2-a): o
 * formulário responde a mesma coisa para e-mail cadastrado e desconhecido.
 * Diferenciar seria entregar a um estranho a lista de quem é cliente da loja
 * — com `shouldCreateUser: false` e o cadastro público fechado, e-mail
 * desconhecido simplesmente não recebe nada, e quem digitou não descobre.
 */
export default function GaragemEntrada({ linkVencido = false }: { linkVencido?: boolean }) {
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

    // Sucesso e "e-mail não existe" terminam no MESMO lugar. Só falha de rede
    // difere — e mesmo ela mostra a tela neutra: o pior caso é pedir de novo.
    setEnviando(false);
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="flex flex-col gap-4 border-t-2 border-mt-regua pt-6">
        <Rotulo accent className="text-[11px] tracking-[.18em]">
          GARAGEM MOTORS
        </Rotulo>
        <h1 className="mt-titulo m-0 text-[28px]">Confira seu e-mail</h1>
        <p className="m-0 text-[14px] leading-relaxed text-mt-neutral-700">
          Se <strong>{email.trim()}</strong> estiver no cadastro da Motors, o link de
          acesso chegou aí. Ele vale por 1 hora e entra direto — sem senha.
        </p>
        <p className="m-0 text-[13px] leading-relaxed text-mt-neutral-600">
          Não chegou? Veja a caixa de spam, ou confirme com a loja qual e-mail está no
          seu cadastro.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-t-2 border-mt-regua pt-6">
        <Rotulo accent className="text-[11px] tracking-[.18em]">
          GARAGEM MOTORS
        </Rotulo>
        <h1 className="mt-titulo m-0 mt-3 text-[30px]">A garagem do seu carro</h1>
        <p className="m-0 mt-3 text-[14px] leading-relaxed text-mt-neutral-700">
          O diário de bordo das revisões, a janela da próxima e a procedência que o seu
          veículo acumula. Digite o e-mail da sua compra e receba o link de acesso.
        </p>
      </div>

      {linkVencido && (
        <p
          role="alert"
          className="m-0 border-l-2 border-mt-accent bg-mt-surface p-3 text-[13px] text-mt-ink"
        >
          Esse link já foi usado ou passou de 1 hora. Peça outro aqui embaixo.
        </p>
      )}

      <form onSubmit={pedirLink} className="flex flex-col gap-3">
        <label
          htmlFor="garagem-email"
          className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700"
        >
          E-mail da compra
        </label>
        <input
          id="garagem-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com.br"
          className="w-full border border-mt-regua-fina bg-mt-bg p-3 text-[14px] text-mt-ink outline-none transition-colors placeholder-mt-neutral-500 focus:border-mt-accent"
        />
        <button
          type="submit"
          disabled={enviando}
          className="mt-foco mt-1 bg-mt-accent px-5 py-3 text-[12px] font-bold uppercase tracking-[.08em] text-mt-inverso disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "Receber link de acesso"}
        </button>
      </form>

      <p className="m-0 text-[12px] leading-relaxed text-mt-neutral-600">
        Sua conta nasce junto com a compra do veículo — não há cadastro por aqui. É
        cliente e não recebe o link? A loja confere o e-mail do seu registro.
      </p>
    </div>
  );
}
