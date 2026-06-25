import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AntigravityTracker from "../components/AntigravityTracker";
import Header from "../components/Header";
import Footer from "../components/Footer";
import LeadPopup from "../components/LeadPopup";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://motors-site-oficial.vercel.app"),
  title: "Motors Store | Encontre seu Veículo Premium dos Sonhos",
  description: "Motors Store - A melhor revenda e avaliação de carros premium e seminovos selecionados de São Paulo. Facilidade no financiamento sem entrada.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.ico?v=2",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
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
          <AntigravityTracker />
          <Header />
          <main className="flex-grow flex flex-col">
            {children}
          </main>
          <Footer />
          <LeadPopup />
        </ThemeProvider>
      </body>
    </html>
  );
}
