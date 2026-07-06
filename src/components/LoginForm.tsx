"use client";

import { useState } from "react";
import { loginAction } from "../app/actions/auth";

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
        if (email === "motors@motorsstoreoficial.com.br" && password === "test123456") {
          setAuthError("O fallback local foi descontinuado. Cadastre este usuário no painel do Supabase Auth.");
        } else {
          setAuthError(result.error);
        }
      } else {
        // Use full page load to ensure cookies are sent with the next request
        window.location.href = "/admin/configuracoes";
      }
    } catch (err: any) {
      setAuthError(err.message || "Conexão com servidor falhou.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-[420px] rounded-3xl bg-brand-card/75 border border-brand-border/60 p-8 shadow-[0_12px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl animate-slideUpPopup overflow-hidden select-none">
      {/* Accent Glows */}
      <div className="absolute -left-16 -top-16 h-36 w-36 rounded-full bg-brand-primary/5 blur-[50px] pointer-events-none" />
      <div className="absolute -right-16 -bottom-16 h-36 w-36 rounded-full bg-brand-primary/5 blur-[50px] pointer-events-none" />
      
      <div className="flex flex-col items-center text-center gap-1.5 mb-8">
        <span className="text-[9px] font-bold text-brand-gold uppercase tracking-[0.2em]">
          ÁREA RESTRITA
        </span>
        <h2 className="text-xl font-extrabold text-brand-text tracking-tight uppercase">
          Acesso ao Painel
        </h2>
        <p className="text-xs text-brand-text/50">
          Insira suas credenciais administrativas para gerenciar o site.
        </p>
      </div>

      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        {authError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] px-3.5 py-2.5 rounded-xl flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
            <span>{authError}</span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="auth-email" className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">E-mail</label>
          <input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@dominio.com.br"
            disabled={isLoading}
            className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            style={{ minHeight: "48px" }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="auth-password" className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Senha</label>
          <input
            id="auth-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={isLoading}
            className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            style={{ minHeight: "48px" }}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-12 bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white font-extrabold text-xs uppercase tracking-widest rounded-xl shadow-lg hover:opacity-95 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ minHeight: "48px" }}
        >
          {isLoading ? "Acessando..." : "Acessar Painel"}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
          </svg>
        </button>
      </form>
    </div>
  );
}
