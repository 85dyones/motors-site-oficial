"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import { Seta } from "./modernist/primitivos";

/**
 * A escolha da senha — o segundo passo do convite (e, quando existir, da
 * recuperação).
 *
 * Quem chega aqui já está com sessão aberta: `/api/auth/confirm` verificou o
 * `token_hash` do convite antes de redirecionar. O que falta é a senha, e ela
 * é gravada pelo NAVEGADOR de quem escolheu — nenhuma rota do projeto recebe
 * senha em corpo de requisição, e ninguém da loja a conhece. Era esse o
 * problema do fluxo antigo, em que o admin digitava uma "senha provisória" e
 * a repassava por fora.
 */
const MINIMO = 8;

export default function DefinirSenhaForm({
  destino,
  email,
}: {
  destino: string;
  email: string;
}) {
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function definir(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setErro("");

    if (senha.length < MINIMO) {
      setErro(`A senha precisa de pelo menos ${MINIMO} caracteres.`);
      return;
    }
    if (senha !== confirmacao) {
      setErro("As duas senhas não são iguais.");
      return;
    }

    setSalvando(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password: senha });

    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }

    // Recarga inteira, como no login: garante que o cookie de sessão viaje na
    // próxima requisição de servidor.
    window.location.href = destino;
  }

  const campoClasses = (preenchido: boolean) =>
    `mt-campo mt-foco border-b-2 pb-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      preenchido ? "border-mt-accent" : "border-mt-regua-fina"
    }`;

  return (
    <form onSubmit={definir} className="flex w-full flex-col gap-6">
      {erro && (
        <div
          role="alert"
          className="flex items-start gap-2.5 border-l-2 border-mt-accent bg-mt-accent-100 px-3.5 py-3 text-xs leading-snug text-mt-accent-800"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="mt-px h-4 w-4 shrink-0">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
          <span>{erro}</span>
        </div>
      )}

      <p className="m-0 text-[13px] leading-relaxed text-mt-neutral-700">
        Você entrou como <strong className="text-mt-ink">{email}</strong>. Escolha
        uma senha para as próximas entradas.
      </p>

      {/* O campo de e-mail escondido é o que faz o gerenciador de senhas do
          navegador saber A QUEM associar a senha nova — sem ele, ele salva sem
          usuário e não oferece o preenchimento no login. */}
      <input type="email" value={email} autoComplete="username" readOnly hidden />

      <div>
        <label htmlFor="senha-nova" className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]">
          NOVA SENHA
        </label>
        <input
          id="senha-nova"
          type="password"
          required
          minLength={MINIMO}
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Mínimo de 8 caracteres"
          disabled={salvando}
          className={campoClasses(Boolean(senha))}
        />
      </div>

      <div>
        <label htmlFor="senha-confirmacao" className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]">
          REPITA A SENHA
        </label>
        <input
          id="senha-confirmacao"
          type="password"
          required
          minLength={MINIMO}
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          placeholder="••••••••"
          disabled={salvando}
          className={campoClasses(Boolean(confirmacao))}
        />
      </div>

      <button type="submit" disabled={salvando} className="mt-btn mt-btn-primario mt-btn-bloco mt-foco mt-2">
        {salvando ? "SALVANDO…" : "SALVAR E ENTRAR"}
        {!salvando && <Seta size={15} />}
      </button>
    </form>
  );
}
