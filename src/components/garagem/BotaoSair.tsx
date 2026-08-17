"use client";

import { createBrowserSupabaseClient } from "../../lib/supabase-browser";

export default function BotaoSair() {
  async function sair() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    // Recarregar pela raiz da Garagem: a página sem sessão é a porta de
    // entrada — não há /login de cliente para onde mandar.
    window.location.href = "/garagem";
  }

  return (
    <button
      type="button"
      onClick={sair}
      className="mt-foco border border-mt-regua-fina px-4 py-2 text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700 transition-colors hover:border-mt-accent hover:text-mt-ink"
    >
      Sair
    </button>
  );
}
