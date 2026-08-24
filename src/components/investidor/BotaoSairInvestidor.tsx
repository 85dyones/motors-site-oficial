"use client";

import { createBrowserSupabaseClient } from "../../lib/supabase-browser";

export default function BotaoSairInvestidor() {
  async function sair() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    // Volta para a própria porta: não há /login de investidor, a página sem
    // sessão É a entrada — o mesmo desenho da Garagem.
    window.location.href = "/investidor";
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
