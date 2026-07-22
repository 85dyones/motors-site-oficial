"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "../app/ThemeContext";
import { getEstoque } from "../lib/supabase";

const DEFAULT_BRANDS = ["BMW", "BYD", "Land Rover", "Porsche", "Toyota"];
const DEFAULT_MODELS = ["911 Carrera S", "Defender 110", "Dolphin", "Hilux", "X5"];

export default function Footer() {
  const { companySettings } = useTheme();
  const brands = DEFAULT_BRANDS;
  const models = DEFAULT_MODELS;

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
                    key={model}
                    href={`/?modelo=${encodeURIComponent(model)}`}
                    className="hover:text-brand-primary hover:underline hover:underline-offset-4 uppercase tracking-wider font-medium transition-all duration-200"
                  >
                    {model}
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
