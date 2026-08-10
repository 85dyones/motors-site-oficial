import type { Metadata } from "next";
import ContatoClientWrapper from "../../components/ContatoClientWrapper";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";

const DESCRICAO =
  "Entre em contato com a Motors Store Oficial. Envie sua mensagem diretamente para nossa equipe em Curitiba para agendamentos e propostas.";

export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();

  return {
    title: "Fale Conosco | Motors Store - Atendimento Showroom",
    description: DESCRICAO,
    alternates: {
      canonical: "/contato",
    },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "contato",
      caminho: "/contato",
    }),
  };
}

export default function ContatoPage() {
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://motors-site-oficial.vercel.app/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Contato",
        "item": "https://motors-site-oficial.vercel.app/contato"
      }
    ]
  };

  return (
    <div className="flex flex-col flex-grow items-center justify-start bg-brand-bg text-brand-text transition-colors duration-300 py-12 px-4 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <div className="max-w-xl mx-auto w-full flex flex-col gap-6">
        
        {/* Breadcrumbs / System Label */}
        <div className="flex items-center gap-2 self-start mb-2">
          <a
            href="/"
            className="text-[9px] font-thin uppercase tracking-wider text-brand-text/40 hover:text-brand-primary transition-colors"
          >
            HOME
          </a>
          <span className="text-brand-text/20 text-[8px]">/</span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-brand-gold">
            CONTATO
          </span>
        </div>

        {/* Hero Section */}
        <section className="flex flex-col gap-1.5 text-center sm:text-left mb-2">
          <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em]">
            CANAIS DE ATENDIMENTO
          </span>
          <h1 className="text-2xl font-extrabold text-brand-text tracking-tight uppercase" id="contato-h1">
            FALE CONOSCO
          </h1>
          <p className="text-xs text-brand-text/60 leading-relaxed font-light">
            Envie sua mensagem abaixo e nosso time premium em Curitiba fará contato em poucos minutos via WhatsApp para agendar visitas e analisar propostas.
          </p>
        </section>

        {/* Interactive Simple Form Wrapper */}
        <ContatoClientWrapper />

      </div>
    </div>
  );
}
