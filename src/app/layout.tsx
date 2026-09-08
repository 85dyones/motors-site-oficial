import type { Metadata } from "next";
import { Geist, Geist_Mono, Archivo } from "next/font/google";
import "./globals.css";
import AntigravityTracker from "../components/AntigravityTracker";
import Header from "../components/Header";
import Footer from "../components/Footer";
import LeadPopup from "../components/LeadPopup";
import CookieConsentBanner from "../components/CookieConsentBanner";
import MolduraDoSite from "../components/MolduraDoSite";
import IntegrationsTracker from "../components/IntegrationsTracker";
import CamadaDeDados from "../components/CamadaDeDados";
import { ThemeProvider } from "./ThemeContext";
import { SITE_URL } from "../lib/site";
import { getNavegacaoDoRodape } from "../lib/navegacaoDoRodape";
import { SpeedInsights } from '@vercel/speed-insights/next';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Tipografia do redesign Modernist. Os três pesos são os que o design doc
// usa: 400 corrido, 600 rótulos em versalete, 800 títulos e botões.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  display: "swap",
});

import { getCachedSettings } from "../lib/settings";
import { montarCompartilhamento } from "../lib/compartilhamento";

export async function generateMetadata(): Promise<Metadata> {
  let tabTitle = "Motors Store | Seminovos Selecionados em Curitiba";
  let empresa = null;
  try {
    const { companySettings } = await getCachedSettings();
    empresa = companySettings;
    if (companySettings?.tabTitle?.trim()) {
      tabTitle = companySettings.tabTitle.trim();
    }
  } catch (e) {
    // Fallback to default
  }

  const descricaoPadrao =
    "Seminovos que passaram pela perícia cautelar independente, em Curitiba. Avaliação do seu usado e financiamento.";

  // Card herdado por quem não declara o próprio — hoje só /login, /test e as
  // rotas de /admin, que ninguém compartilha. As páginas públicas montam o
  // seu com `montarCompartilhamento`, cada uma com o seu texto.
  //
  // Até 2026-08-10 este bloco declarava `/logo.png` como 1200×630. O arquivo é
  // 1024×513, e o scraper estica a imagem para a dimensão declarada: era daí o
  // logo deformado no WhatsApp.
  const { openGraph, twitter } = montarCompartilhamento({
    empresa,
    pagina: "home",
    tituloPadrao: tabTitle,
    descricaoPadrao,
  });

  return {
    metadataBase: new URL(SITE_URL),
    title: tabTitle,
    description:
      "Motors Store — seminovos selecionados em Curitiba, com perícia cautelar independente. Avaliação do seu usado e financiamento.",
    alternates: {
      // Sem `canonical` aqui de propósito. No layout raiz ele é HERDADO por
      // toda página que não declare o seu — /login, /test e as rotas de /admin
      // acabavam anunciando a home como canônica. As páginas públicas
      // (home, sobre, contato, privacidade, destaques, PDP) definem o próprio.
      types: {
        "application/llms+txt": "/api/llms-full.txt"
      }
    },
    icons: {
      icon: "/favicon.ico?v=2",
      apple: "/apple-touch-icon.png",
    },
    openGraph,
    twitter,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Marcas e modelos do rodapé, resolvidos aqui porque o rodapé é client
  // component e não pode consultar o banco sem virar `useEffect` — que foi
  // exatamente o que manteve esses links fora do HTML servido até 2026-08-25.
  // A leitura passa por `unstable_cache` (1h): o layout roda em toda rota,
  // inclusive nas do painel, e nenhuma delas pode pagar consulta por visita.
  const navegacaoDoRodape = await getNavegacaoDoRodape();

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* GA4/Meta/Google Ads são inicializados exclusivamente pelo <IntegrationsTracker />,
          que respeita o consentimento de cookies (ag_cookie_consent). Não duplicar aqui. */}
      <body className="min-h-full flex flex-col bg-brand-bg text-brand-text font-sans transition-colors duration-300">
        {/* Anti-Flicker: blocking inline script restores theme BEFORE first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('ag_theme') || 'luxury-light';
                  var p = {
                    'motors-modernist': {
                      '--brand-background':'#f3f2f2','--brand-foreground':'#201e1d',
                      '--brand-primary':'#ec3013','--brand-primary-hover':'#ae1800',
                      '--brand-gold':'#ec3013','--brand-card':'#eae9e9',
                      '--brand-card-border':'#d7d3d3','--brand-border':'#d7d3d3',
                      '--brand-shadow':'rgba(45,43,43,0.22)',
                      '--brand-glass-bg':'rgba(243,242,242,0.86)',
                      '--brand-footer-bg':'#201e1d'
                    },
                    'luxury-light': {
                      '--brand-background':'#fafafc','--brand-foreground':'#1a1a23',
                      '--brand-primary':'#C83F00','--brand-primary-hover':'#9E3100',
                      '--brand-gold':'#9E3100','--brand-card':'#ffffff',
                      '--brand-card-border':'#f3f4f6','--brand-border':'#f1f3f5',
                      '--brand-shadow':'rgba(0,0,0,0.03)',
                      '--brand-glass-bg':'rgba(255,255,255,0.8)',
                      '--brand-footer-bg':'#f1f3f5'
                    },
                    'stealth-dark': {
                      '--brand-background':'#09090B','--brand-foreground':'#F4F4F7',
                      '--brand-primary':'#D4AF37','--brand-primary-hover':'#bfa030',
                      '--brand-gold':'#D4AF37','--brand-card':'#14141B',
                      '--brand-card-border':'#24242b','--brand-border':'#1e1e24',
                      '--brand-shadow':'rgba(0,0,0,0.5)',
                      '--brand-glass-bg':'rgba(20, 20, 27, 0.85)',
                      '--brand-footer-bg':'#09090B'
                    },
                    'sport-nardo': {
                      '--brand-background':'#1A1D20','--brand-foreground':'#FFFFFF',
                      '--brand-primary':'#E30613','--brand-primary-hover':'#c50510',
                      '--brand-gold':'#E30613','--brand-card':'#272B30',
                      '--brand-card-border':'#363b42','--brand-border':'#363b42',
                      '--brand-shadow':'rgba(227,6,19,0.08)',
                      '--brand-glass-bg':'rgba(39,43,48,0.85)',
                      '--brand-footer-bg':'#1A1D20'
                    }
                  };
                  var a = p[t] || p['luxury-light'];
                  var d = document.documentElement;
                  for (var k in a) d.style.setProperty(k, a[k]);
                  d.setAttribute('data-theme', t);
                  // motors-modernist e luxury-light são temas claros
                  if (t === 'stealth-dark' || t === 'sport-nardo') d.classList.add('dark');
                } catch(e) {}
              })();
            `,
          }}
        />
        <ThemeProvider>
          {/* A camada de dados vem ANTES do carregador de tags: o contexto da
              página precisa estar no `dataLayer` quando o GTM inicializar. */}
          <CamadaDeDados />
          <IntegrationsTracker />
          <AntigravityTracker />
          <MolduraDoSite>
            <Header />
          </MolduraDoSite>
          <main className="flex-grow flex flex-col">
            {children}
          </main>
          <MolduraDoSite>
            <Footer navegacao={navegacaoDoRodape} />
            <LeadPopup />
            <CookieConsentBanner />
          </MolduraDoSite>
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
