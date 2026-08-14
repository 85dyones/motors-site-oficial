"use client";

import { useState } from "react";
import { loginAction } from "../app/actions/auth";
import { Seta } from "./modernist/primitivos";

/**
 * Formulário de acesso ao painel, na linguagem Modernist.
 *
 * Não desenha mais o próprio cartão: quem dá a moldura é a página `/login`,
 * que já traz a marca e o título. O cabeçalho duplicado ("ÁREA RESTRITA /
 * Acesso ao Painel") saiu por isso — a página inteira dizia a mesma coisa
 * duas vezes.
 *
 * A lógica de autenticação não mudou.
 */
export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError("");

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);

      const result = await loginAction(formData);

      if (result.error) {
        // Havia aqui uma checagem de e-mail e senha de desenvolvimento, só
        // para trocar a mensagem quando alguém tentava o antigo fallback
        // local. Não concedia acesso — mas guardava credencial no bundle do
        // navegador, e o endereço citado deixou de existir com a troca de
        // domínio (2026-08-14). Quem não tem conta cadastrada vê o erro real.
        setAuthError(result.error);
      } else {
        // Use full page load to ensure cookies are sent with the next request
        window.location.href = "/admin";
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Conexão com servidor falhou.");
    } finally {
      setIsLoading(false);
    }
  };

  const campoClasses = (preenchido: boolean) =>
    `mt-campo mt-foco border-b-2 pb-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      preenchido ? "border-mt-accent" : "border-mt-regua-fina"
    }`;

  return (
    <form onSubmit={handleLogin} className="flex w-full flex-col gap-6">
      {authError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 border-l-2 border-mt-accent bg-mt-accent-100 px-3.5 py-3 text-xs leading-snug text-mt-accent-800"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="mt-px h-4 w-4 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
          <span>{authError}</span>
        </div>
      )}

      <div>
        <label
          htmlFor="auth-email"
          className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]"
        >
          E-MAIL
        </label>
        <input
          id="auth-email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@dominio.com.br"
          disabled={isLoading}
          className={campoClasses(Boolean(email))}
        />
      </div>

      <div>
        <label
          htmlFor="auth-password"
          className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]"
        >
          SENHA
        </label>
        <input
          id="auth-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          disabled={isLoading}
          className={campoClasses(Boolean(password))}
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="mt-btn mt-btn-primario mt-btn-bloco mt-foco mt-2"
      >
        {isLoading ? "ACESSANDO…" : "ACESSAR PAINEL"}
        {!isLoading && <Seta size={15} />}
      </button>
    </form>
  );
}
