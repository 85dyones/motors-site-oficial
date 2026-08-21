"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import { Seta } from "./modernist/primitivos";

/**
 * "Esqueci minha senha" — o pedido do link de troca.
 *
 * A resposta é NEUTRA, pela mesma razão da entrada da Garagem
 * (docs/AREA_DO_CLIENTE_AUTH.md §2-a): e-mail cadastrado e desconhecido
 * terminam na mesma tela. Diferenciar aqui entregaria a um estranho a lista de
 * quem trabalha na Motors — o formulário viraria um verificador de
 * funcionário, que é o mesmo problema, com outro público.
 *
 * O link vai por `token_hash` para `/api/auth/confirm` (template
 * `reset-password.html`), que verifica no servidor e manda para
 * `/definir-senha`. Nenhuma senha passa por aqui.
 */
export default function RecuperarSenhaForm() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function pedirLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || enviando) return;
    setEnviando(true);

    const supabase = createBrowserSupabaseClient();
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());

    // Sucesso e "e-mail não existe" terminam no MESMO lugar — nem o retorno é
    // lido, de propósito. Falha de rede também cai aqui: o pior caso é a
    // pessoa pedir de novo.
    setEnviando(false);
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[14px] leading-relaxed text-mt-neutral-700">
          Se <strong className="text-mt-ink">{email.trim().toLowerCase()}</strong> estiver
          cadastrado, o link para escolher uma senha nova acabou de sair. Ele vale
          por 1 hora e só funciona uma vez.
        </p>
        <p className="m-0 text-[13px] leading-relaxed text-mt-neutral-600">
          Não chegou em alguns minutos? Confira a caixa de spam antes de pedir
          outro — pedir de novo invalida o link anterior.
        </p>
      </div>
    );
  }

  const campoClasses = (preenchido: boolean) =>
    `mt-campo mt-foco border-b-2 pb-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      preenchido ? "border-mt-accent" : "border-mt-regua-fina"
    }`;

  return (
    <form onSubmit={pedirLink} className="flex w-full flex-col gap-6">
      <p className="m-0 text-[13px] leading-relaxed text-mt-neutral-700">
        Digite o e-mail do seu acesso. Mandamos um link para você escolher uma
        senha nova — a atual continua valendo até lá.
      </p>

      <div>
        <label htmlFor="recuperar-email" className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]">
          E-MAIL
        </label>
        <input
          id="recuperar-email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@dominio.com.br"
          disabled={enviando}
          className={campoClasses(Boolean(email))}
        />
      </div>

      <button type="submit" disabled={enviando} className="mt-btn mt-btn-primario mt-btn-bloco mt-foco mt-2">
        {enviando ? "ENVIANDO…" : "ENVIAR LINK"}
        {!enviando && <Seta size={15} />}
      </button>
    </form>
  );
}
