import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AntigravityTracker from "../components/AntigravityTracker";
import Header from "../components/Header";
import Footer from "../components/Footer";
import LeadPopup from "../components/LeadPopup";
import CookieConsentBanner from "../components/CookieConsentBanner";
import IntegrationsTracker from "../components/IntegrationsTracker";
import { ThemeProvider } from "./ThemeContext";

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

import { getCachedSettings } from "../lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  let tabTitle = "Motors Store | Encontre seu Veículo Premium dos Sonhos";
  try {
    const { companySettings } = await getCachedSettings();
    if (companySettings?.tabTitle?.trim()) {
      tabTitle = companySettings.tabTitle.trim();
    }
  } catch (e) {
    // Fallback to default
  }

  return {
    metadataBase: new URL("https://motors-site-oficial.vercel.app"),
    title: tabTitle,
    description: "Motors Store - A melhor revenda e avaliação de carros premium e seminovos selecionados de São Paulo. Facilidade no financiamento sem entrada.",
    alternates: {
      canonical: "/",
      types: {
        "application/llms+txt": "/api/llms-full.txt"
      }
    },
    icons: {
      icon: "/favicon.ico?v=2",
      apple: "/apple-touch-icon.png",
    },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "Motors Store",
      title: tabTitle,
      description: "A melhor revenda e avaliação de carros premium e seminovos selecionados. Facilidade no financiamento sem entrada.",
      images: [{ url: "/logo.png", width: 1200, height: 630, alt: "Motors Store Logo" }],
    },
    twitter: {
      card: "summary_large_image",
      title: tabTitle,
      description: "A melhor revenda e avaliação de carros premium e seminovos selecionados.",
      images: ["/logo.png"],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let ga4Id = "G-CZ4B4RYF61";
  try {
    const { companySettings } = await getCachedSettings();
    if (companySettings?.ga4Id?.trim()) {
      ga4Id = companySettings.ga4Id.trim();
    }
  } catch (e) {
    // Fallback default
  }

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Google Tag (gtag.js) */}
        {ga4Id && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
              strategy="afterInteractive"
            />
            <Script id="google-gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){window.dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${ga4Id}');
              `}
            </Script>
          </>
        )}
      </head>
      <body className="min-h-full flex flex-col bg-brand-bg text-brand-text font-sans transition-colors duration-300">
        {/* Anti-Flicker: blocking inline script restores theme BEFORE first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('ag_theme') || 'luxury-light';
                  var p = {
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
                  if (t !== 'luxury-light') d.classList.add('dark');
                } catch(e) {}
              })();
            `,
          }}
        />
        <ThemeProvider>
          <IntegrationsTracker />
          <AntigravityTracker />
          <Header />
          <main className="flex-grow flex flex-col">
            {children}
          </main>
          <Footer />
          <LeadPopup />
          <CookieConsentBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
