"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useTheme } from "../app/ThemeContext";
import LogoAnimado from "./modernist/LogoAnimado";
import type { NavegacaoDoRodape } from "../lib/navegacaoDoRodape";
import { colunasDoRodape } from "../lib/colunasDoRodape";
import { trackContactClick } from "../lib/telemetry";
import { razaoSocialAparte } from "../lib/identidadeLegal";

/**
 * Rodapé Modernist (redesign 2026).
 *
 * Bloco escuro, três colunas ruled e a barra legal embaixo. O bloco de
 * marcas e modelos não está no design doc, mas é link interno de SEO que já
 * estava em produção — fica, reescrito na linguagem do sistema.
 *
 * A lista vem PRONTA do servidor, por prop. Até 2026-08-25 ela era buscada aqui
 * mesmo, num `useEffect` — e por isso não existia no HTML servido: o link
 * interno mais repetido do site não era rastreável. A regra e a história estão
 * em `lib/navegacaoDoRodape.ts`.
 */

/**
 * Ano do copyright — só depois da hidratação (mesma causa do #418 na ficha,
 * ver comentário de `GeradoEm` em `PDPClientWrapper.tsx`).
 *
 * `new Date().getFullYear()` direto no render diverge entre servidor e
 * cliente perto da virada do ano: a partir das ~21h de 31/12 em fusos
 * adiantados sobre o UTC, o servidor ainda serve o ano velho e o cliente já
 * calcula o novo. Este rodapé está em TODA página do site — sem isto, o
 * réveillon derrubaria a hidratação site inteiro, não só a ficha.
 */
const semAssinatura = () => () => {};
function AnoAtual() {
  const ano = useSyncExternalStore(
    semAssinatura,
    () => new Date().getFullYear(),
    () => null,
  );
  return <>{ano}</>;
}

export default function Footer({ navegacao }: { navegacao?: NavegacaoDoRodape }) {
  const { companySettings } = useTheme();
  const razaoSocial = razaoSocialAparte(companySettings);
  const marcas = navegacao?.marcas ?? [];
  const modelos = navegacao?.modelos ?? [];

  const colunas = colunasDoRodape(companySettings);

  return (
    <footer className="w-full bg-mt-inverso-fundo px-6 pb-8 pt-14 text-mt-inverso-suave lg:px-10">
      <div className="mx-auto max-w-[1600px]">
        <div className="flex flex-col gap-10 border-b border-mt-inverso-regua-fina pb-10 md:flex-row md:gap-14">
          <div className="flex-[1.2]">
            {/* O logo inteiro, na versão para fundo escuro, no lugar do nome
                em texto com uma barra ferrugem que não faz parte da marca
                (revisão de UI de 29/09). O nome da loja segue no rótulo.
                Desde 09/10 ele acende como o do cabeçalho (`LogoAnimado`),
                no mesmo tamanho de antes, mas só quando o rodapé aparece na
                tela: tocar a abertura lá embaixo, na carga, seria tocar para
                ninguém. */}
            <div className="mb-5">
              <LogoAnimado
                variante="horizontal"
                rotulo={companySettings.name}
                inicio="visivel"
                className="h-8 w-auto"
              />
            </div>
            <p className="m-0 max-w-[300px] text-[13px] leading-relaxed">
              Compra, venda e troca de seminovos selecionados. De cada dez
              avaliados, três entram.
            </p>
          </div>

          {colunas.map((coluna) => (
            <div key={coluna.titulo} className="flex-1">
              <div className="mb-1 text-[11px] font-extrabold md:mb-3.5 tracking-[.16em] text-mt-inverso">
                {coluna.titulo}
              </div>
              <div className="flex flex-col text-[13px] leading-snug md:gap-2">
                {coluna.itens
                  .filter((item) => item.rotulo)
                  .map((item) =>
                    item.href ? (
                      <Link
                        key={item.rotulo}
                        href={item.href}
                        aria-label={item.rotuloAcessivel}
                        // Telefone e WhatsApp do rodapé aparecem em todas as
                        // páginas e são rota de contato como qualquer outra —
                        // até 2026-08-06 eram os únicos CTAs de contato do
                        // site que não disparavam `Contact`.
                        //
                        // O endereço, que desde 2026-09-04 abre o Perfil da
                        // Empresa no Google, NÃO dispara `click_directions`, e
                        // é decisão, não esquecimento: aquele evento é o "Como
                        // chegar" das páginas de bairro (`TRACKING_SPEC.md`) e
                        // entra como conversão SECUNDÁRIA no Google Ads. Este
                        // link abre a ficha, não uma rota — misturar os dois
                        // infla uma conversão com um gesto diferente, que é o
                        // erro de medição que a própria spec chama de pior
                        // tipo, porque parece boa notícia. Fica sem medida até
                        // existir evento próprio.
                        onClick={
                          item.contato
                            ? () =>
                                trackContactClick(
                                  item.contato!,
                                  `Rodapé - ${item.contato === "whatsapp" ? "WhatsApp" : "Telefone"}`,
                                )
                            : undefined
                        }
                        className="mt-foco whitespace-pre-line py-2.5 text-mt-inverso-suave no-underline hover:text-mt-inverso md:py-0"
                      >
                        {item.rotulo}
                      </Link>
                    ) : (
                      <span key={item.rotulo} className="whitespace-pre-line">
                        {item.rotulo}
                      </span>
                    ),
                  )}
              </div>
            </div>
          ))}
        </div>

        {/* Links internos de SEO — fora do design doc, mantidos de produção.
            Só aparece depois que o estoque responde: cabeçalho sem lista é
            ruído para o leitor e link morto para o rastreador.

            `h2`, e não `h4` (2026-09-25): o rodapé vem depois do conteúdo de
            qualquer página, e o título anterior costuma ser um `h2` — o `h4`
            pulava um nível em TODA página (auditoria axe, `heading-order`), e
            o leitor de tela que navega por títulos achava que tinha perdido
            uma seção. `h2` nunca pula: descer de nível é sempre permitido. O
            tamanho continua o das classes. */}
        {(marcas.length > 0 || modelos.length > 0) && (
          <div className="flex flex-col gap-5 border-b border-mt-inverso-regua-fina py-7">
            {marcas.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-[11px] font-extrabold tracking-[.16em] text-mt-inverso">
                  MARCAS DISPONÍVEIS
                </h2>
                <div className="flex flex-wrap items-center gap-x-5 text-xs md:gap-y-2">
                  {marcas.map((marca) => (
                    <Link
                      key={marca.href}
                      href={marca.href}
                      className="mt-foco py-2 font-medium uppercase tracking-wider no-underline hover:text-mt-accent-400 md:py-0"
                    >
                      {marca.rotulo}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {modelos.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-[11px] font-extrabold tracking-[.16em] text-mt-inverso">
                  MODELOS EM DESTAQUE
                </h2>
                <div className="flex flex-wrap items-center gap-x-5 text-xs md:gap-y-2">
                  {modelos.map((modelo) => (
                    <Link
                      key={modelo.href}
                      href={modelo.href}
                      className="mt-foco py-2 font-medium uppercase tracking-wider no-underline hover:text-mt-accent-400 md:py-0"
                    >
                      {modelo.rotulo}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-4 text-[11px] tracking-[.06em] md:flex-row md:justify-between">
          <span>
            © <AnoAtual /> {companySettings.name.toUpperCase()}
            {razaoSocial ? ` · ${razaoSocial.toLocaleUpperCase("pt-BR")}` : ""}
            {companySettings.cnpj ? ` · CNPJ ${companySettings.cnpj}` : ""}
          </span>
          <span className="md:text-right">
            PREÇOS E CONDIÇÕES SUJEITOS A ALTERAÇÃO · CRÉDITO SUJEITO A APROVAÇÃO
          </span>
        </div>
      </div>
    </footer>
  );
}
