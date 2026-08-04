"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "../app/ThemeContext";
import { getEstoque, getVeiculoPdpUrl, truncateString, type Veiculo } from "../lib/supabase";

const MAX_MARCAS = 8;
const MAX_MODELOS = 5;

/**
 * Marcas e modelos reais do estoque, não uma lista fixa.
 *
 * Até 2026-08-04 esta seção listava BMW/BYD/Land Rover/Porsche/Toyota e
 * 911 Carrera S/Defender 110/Dolphin/Hilux/X5 como constantes — nem sempre
 * correspondiam ao que estava à venda, e o link de modelo (`/?modelo=`) exige
 * igualdade exata com o campo `modelo` do banco (ver `filterModelo` em
 * HeroSection.tsx), que é a string completa do RevendaMais — nunca ia bater
 * com um nome de exibição inventado. Os links de marca funcionavam por
 * coincidência: o mecanismo é real, só os valores eram fictícios.
 *
 * O feed não tem um campo de "nome de modelo" limpo — `modelo` já vem com
 * versão e motorização embutidas (ex.: "corolla cross xre 2.0 16v flex aut").
 * Por isso os modelos linkam para a página do veículo (rota estável, sempre
 * resolve), e a marca continua linkando para o filtro (`?marca=`), que já é
 * exato por natureza — é a mesma lista usada no seletor de marca do Hero.
 */
function useVitrineDestaque() {
  const [marcas, setMarcas] = useState<string[]>([]);
  const [modelos, setModelos] = useState<{ label: string; href: string }[]>([]);

  useEffect(() => {
    let ativo = true;
    getEstoque()
      .then((estoque: Veiculo[]) => {
        if (!ativo) return;
        const disponiveis = estoque.filter((v) => !v.vendido);

        const contagem = new Map<string, number>();
        for (const v of disponiveis) {
          contagem.set(v.marca, (contagem.get(v.marca) || 0) + 1);
        }
        const marcasOrdenadas = [...contagem.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([marca]) => marca)
          .slice(0, MAX_MARCAS);

        const destaques = [...disponiveis]
          .sort((a, b) => (b.preco || 0) - (a.preco || 0))
          .slice(0, MAX_MODELOS)
          .map((v) => ({
            label: truncateString(`${v.marca} ${v.modelo}`, 26),
            href: getVeiculoPdpUrl(v),
          }));

        setMarcas(marcasOrdenadas);
        setModelos(destaques);
      })
      .catch((err) => console.warn("[Footer] Falha ao carregar vitrine:", err));
    return () => {
      ativo = false;
    };
  }, []);

  return { marcas, modelos };
}

export default function Footer() {
  const { companySettings } = useTheme();
  const { marcas: brands, modelos: models } = useVitrineDestaque();

  return (
    <footer className="w-full bg-brand-footer border-t border-brand-border text-brand-text/75 py-10 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="mx-auto max-w-[1600px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          
          {/* Institutional Brand */}
          <div className="flex flex-col gap-3">
            <h3 className="text-brand-text font-bold text-lg tracking-wide uppercase">
              {companySettings.name}
            </h3>
            <p className="text-xs text-brand-text/75 leading-relaxed max-w-xs">
              A melhor experiência na compra, venda e troca de veículos premium e selecionados. Procedência, garantia e transparência.
            </p>
            {/* Social Links */}
            {(companySettings.instagram || companySettings.facebook) && (
              <div className="flex gap-3.5 mt-2">
                {companySettings.instagram && (
                  <a
                    href={companySettings.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-text/75 hover:text-brand-primary font-bold uppercase tracking-wider transition-colors duration-200"
                    aria-label="Siga no Instagram"
                  >
                    Instagram
                  </a>
                )}
                {companySettings.facebook && (
                  <a
                    href={companySettings.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-text/75 hover:text-brand-primary font-bold uppercase tracking-wider transition-colors duration-200"
                    aria-label="Siga no Facebook"
                  >
                    Facebook
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Useful Institutional Links */}
          <div className="flex flex-col gap-2.5">
            <h4 className="text-brand-text font-semibold text-xs uppercase tracking-widest mb-1">
              Institucional
            </h4>
            <nav className="flex flex-col gap-2">
              <Link
                href="/sobre"
                className="text-xs text-brand-text/75 hover:text-brand-primary uppercase tracking-wider transition-colors duration-200"
              >
                QUEM SOMOS
              </Link>
              <Link
                href="/contato"
                className="text-xs text-brand-text/75 hover:text-brand-primary uppercase tracking-wider transition-colors duration-200"
              >
                FALE CONOSCO
              </Link>
              <Link
                href="/#match-garagem"
                className="text-xs text-brand-text/75 hover:text-brand-primary uppercase tracking-wider transition-colors duration-200"
              >
                MATCH DE GARAGEM
              </Link>
              <Link
                href="/privacidade"
                className="text-xs text-brand-text/75 hover:text-brand-primary uppercase tracking-wider transition-colors duration-200"
              >
                PRIVACIDADE & LGPD
              </Link>
            </nav>
          </div>

          {/* Business Hours & Contact */}
          <div className="flex flex-col gap-2">
            <h4 className="text-brand-text font-semibold text-xs uppercase tracking-widest mb-1">
              Atendimento
            </h4>
            <p className="text-xs">
              <span className="text-brand-text/70 font-bold uppercase tracking-wider">Telefone:</span> {companySettings.phone}
            </p>
            <p className="text-xs">
              <span className="text-brand-text/70 font-bold uppercase tracking-wider">WhatsApp:</span> {companySettings.whatsapp}
            </p>
            <div className="text-xs leading-relaxed">
              <span className="text-brand-text/70 font-bold uppercase tracking-wider block mb-0.5">Horários:</span>
              <span className="whitespace-pre-line text-brand-text/75">{companySettings.hours}</span>
            </div>
          </div>

          {/* Dealership Address & CNPJ */}
          <div className="flex flex-col gap-2">
            <h4 className="text-brand-text font-semibold text-xs uppercase tracking-widest mb-1">
              Localização
            </h4>
            <p className="text-xs leading-relaxed whitespace-pre-line text-brand-text/75">
              {companySettings.address}
            </p>
            <p className="text-[10px] text-brand-text/70 mt-1">
              {companySettings.name}
              {companySettings.cnpj && (
                <>
                  <br />
                  CNPJ: {companySettings.cnpj}
                </>
              )}
            </p>
          </div>

        </div>

        {/* Marcas & Modelos - SEO Internal Links Block */}
        <div className="border-t border-brand-border/40 py-6 flex flex-col gap-6">
          {brands.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-brand-text font-semibold text-xs uppercase tracking-widest">
                Marcas Disponíveis
              </h4>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 text-xs text-brand-text/75">
                {brands.map((brand) => (
                  <Link
                    key={brand}
                    href={`/?marca=${encodeURIComponent(brand)}`}
                    className="hover:text-brand-primary hover:underline hover:underline-offset-4 uppercase tracking-wider font-medium transition-all duration-200"
                  >
                    {brand}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {models.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-brand-text font-semibold text-xs uppercase tracking-widest">
                Modelos em Destaque
              </h4>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 text-xs text-brand-text/75">
                {models.map((model) => (
                  <Link
                    key={model.href}
                    href={model.href}
                    className="hover:text-brand-primary hover:underline hover:underline-offset-4 uppercase tracking-wider font-medium transition-all duration-200"
                  >
                    {model.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Copyright & Disclaimers */}
        <div className="border-t border-brand-border pt-6 text-center md:flex md:justify-between md:text-left">
          <p className="text-xs text-brand-text/75">
            &copy; {new Date().getFullYear()} {companySettings.name}. Todos os direitos reservados.
          </p>
          <p className="text-[10px] text-brand-text/70 mt-2 md:mt-0 max-w-md md:text-right">
            Preços e condições sujeitos a alterações sem aviso prévio. Crédito sujeito a aprovação.
          </p>
        </div>

      </div>
    </footer>
  );
}
