"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full bg-brand-footer border-t border-brand-border text-brand-text/60 py-10 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          
          {/* Institutional Brand */}
          <div className="flex flex-col gap-3">
            <h3 className="text-brand-text font-bold text-lg tracking-wide">
              MOTORS <span className="text-brand-gold">STORE</span>
            </h3>
            <p className="text-xs text-brand-text/50 leading-relaxed max-w-xs">
              A melhor experiência na compra, venda e troca de veículos premium e selecionados. Procedência, garantia e transparência.
            </p>
          </div>

          {/* Useful Institutional Links */}
          <div className="flex flex-col gap-2.5">
            <h4 className="text-brand-text font-semibold text-xs uppercase tracking-widest mb-1">
              Institucional
            </h4>
            <nav className="flex flex-col gap-2">
              <Link
                href="/sobre"
                className="text-xs text-brand-text/50 hover:text-brand-primary uppercase tracking-wider transition-colors duration-200"
              >
                QUEM SOMOS
              </Link>
              <Link
                href="/contato"
                className="text-xs text-brand-text/50 hover:text-brand-primary uppercase tracking-wider transition-colors duration-200"
              >
                FALE CONOSCO
              </Link>
              <Link
                href="/#match-garagem"
                className="text-xs text-brand-text/50 hover:text-brand-primary uppercase tracking-wider transition-colors duration-200"
              >
                MATCH DE GARAGEM
              </Link>
              <Link
                href="/test"
                className="text-xs text-brand-text/50 hover:text-brand-primary uppercase tracking-wider transition-colors duration-200"
              >
                SANDBOX TESTES (QA)
              </Link>
              <Link
                href="/configuracoes"
                className="text-xs text-brand-text/50 hover:text-brand-primary uppercase tracking-wider transition-colors duration-200"
              >
                CONFIGURAÇÕES DO SITE
              </Link>
            </nav>
          </div>

          {/* Business Hours & Contact */}
          <div className="flex flex-col gap-2">
            <h4 className="text-brand-text font-semibold text-xs uppercase tracking-widest mb-1">
              Atendimento
            </h4>
            <p className="text-xs">
              <span className="text-brand-text/40 font-bold uppercase tracking-wider">Telefone:</span> (11) 4003-0000
            </p>
            <p className="text-xs">
              <span className="text-brand-text/40 font-bold uppercase tracking-wider">WhatsApp:</span> (11) 99999-9999
            </p>
            <p className="text-xs leading-relaxed">
              <span className="text-brand-text/40 font-bold uppercase tracking-wider">Horários:</span><br />
              Seg a Sex das 9h às 19h<br />
              Sáb das 9h às 14h
            </p>
          </div>

          {/* Dealership Address & CNPJ */}
          <div className="flex flex-col gap-2">
            <h4 className="text-brand-text font-semibold text-xs uppercase tracking-widest mb-1">
              Localização
            </h4>
            <p className="text-xs leading-relaxed">
              Av. Europa, 1000 - Jardim Europa<br />
              São Paulo - SP, CEP 01449-000
            </p>
            <p className="text-[10px] text-brand-text/40 mt-1">
              Motors Store Ltda.<br />
              CNPJ: 12.345.678/0001-99
            </p>
          </div>

        </div>

        {/* Copyright & Disclaimers */}
        <div className="border-t border-brand-border pt-6 text-center md:flex md:justify-between md:text-left">
          <p className="text-xs text-brand-text/50">
            &copy; {new Date().getFullYear()} Motors Store. Todos os direitos reservados.
          </p>
          <p className="text-[10px] text-brand-text/40 mt-2 md:mt-0 max-w-md md:text-right">
            Preços e condições sujeitos a alterações sem aviso prévio. Crédito sujeito a aprovação.
          </p>
        </div>

      </div>
    </footer>
  );
}
