"use client";

import Link from "next/link";

import { useTheme } from "../app/ThemeContext";
import { linkWhatsApp } from "../lib/whatsapp";
import { IconeWhatsApp } from "./modernist/primitivos";

/**
 * A saída para quando o captcha não deixa passar.
 *
 * ---------------------------------------------------------------------------
 * Por que existe
 * ---------------------------------------------------------------------------
 * O desafio do Turnstile pode não se completar por motivos que não são culpa
 * de ninguém: extensão de privacidade bloqueando `challenges.cloudflare.com`,
 * rede corporativa filtrando o script, ou a aba aberta desde antes de um deploy
 * — o token dela nasceu sem a `action` que o servidor passou a exigir, e leva
 * 403 por mais que a pessoa clique.
 *
 * Em todos esses casos o formulário ficava num beco: o botão de enviar
 * `disabled` para sempre, ou uma caixa vermelha dizendo "tente novamente" para
 * quem já tentou. Quem chegou até aqui digitou nome, telefone e mensagem — é a
 * última pessoa que merece uma porta fechada.
 *
 * ---------------------------------------------------------------------------
 * Por que oferecer WhatsApp não fura o captcha
 * ---------------------------------------------------------------------------
 * O que o captcha protege é o REGISTRO do lead: a gravação no banco, o disparo
 * para o n8n e a conversão que vai para o Ads. Nada disso acontece aqui — este
 * link é `wa.me`, resolvido no navegador da pessoa, e não cria lead nenhum.
 *
 * Um bot que chegue nesta tela ganha um link para o WhatsApp da loja, que é
 * público e está no rodapé de todas as páginas. Não ganha uma conversão falsa,
 * que é o que custa caro. O gate do servidor continua exatamente onde estava.
 *
 * A mensagem que a pessoa digitou viaja junto no `?text=`, então ela não
 * reescreve nada — só continua a conversa em outro canal.
 */
interface SaidaDoCaptchaProps {
  /** O que a pessoa escreveu, para seguir junto no WhatsApp. */
  mensagem?: string;
  /** Quando existe, mostra o botão de refazer o desafio sem sair da página. */
  onTentarNovamente?: () => void;
}

const MENSAGEM_PADRAO =
  "Olá! Tentei falar com vocês pelo site, mas a verificação de segurança não passou.";

export default function SaidaDoCaptcha({ mensagem, onTentarNovamente }: SaidaDoCaptchaProps) {
  const { companySettings } = useTheme();

  const texto = mensagem?.trim() || MENSAGEM_PADRAO;
  const whatsapp = linkWhatsApp(companySettings, texto);

  return (
    <div
      role="alert"
      className="mb-5 border-2 border-mt-accent bg-mt-accent-100 px-4 py-4 text-[13px] leading-relaxed text-mt-accent-800"
    >
      <p className="m-0 font-semibold">Não conseguimos concluir a verificação de segurança.</p>
      <p className="m-0 mt-1.5">
        Costuma ser uma extensão do navegador ou a rede bloqueando o desafio. Fale
        com a gente direto — leva o mesmo tempo e ninguém perde o que escreveu.
      </p>

      <div className="mt-3.5 flex flex-col gap-2 sm:flex-row">
        {/* Sem número configurado, a home é melhor do que um link morto. */}
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-btn mt-btn-primario mt-foco inline-flex items-center justify-center gap-2 text-xs uppercase"
          >
            <IconeWhatsApp />
            Falar no WhatsApp
          </a>
        ) : (
          <Link
            href="/"
            className="mt-btn mt-btn-primario mt-foco inline-flex items-center justify-center gap-2 text-xs uppercase"
          >
            Voltar para a home
          </Link>
        )}

        {onTentarNovamente && (
          <button
            type="button"
            onClick={onTentarNovamente}
            className="mt-btn mt-foco inline-flex items-center justify-center border-2 border-mt-accent text-xs uppercase"
          >
            Tentar de novo
          </button>
        )}
      </div>
    </div>
  );
}
