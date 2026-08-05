import Link from "next/link";
import HeroHome from "../components/modernist/HeroHome";
import BuscaRegua from "../components/modernist/BuscaRegua";
import BotaoWhatsApp from "../components/modernist/BotaoWhatsApp";
import InstagramFeed from "../components/InstagramFeed";
import GoogleReviewsFeed from "../components/GoogleReviewsFeed";
import {
  CabecalhoSecao,
  CardVeiculo,
  LinkRegua,
  Rotulo,
  Seta,
} from "../components/modernist/primitivos";
import { getEstoque, getVeiculoPdpUrl } from "../lib/supabase";
import { getCachedSettings } from "../lib/settings";
import {
  DESTAQUES_PADRAO,
  normalizarQuickTags,
  normalizarStockOverrides,
  resolverDestaques,
} from "../lib/destaquesRapidos";
import { DEFAULT_COMPANY_SETTINGS } from "./ThemeContext";

export const revalidate = 60;

const PASSOS_PROFILER = [
  {
    n: "01",
    t: "Cinco perguntas",
    d: "Uso, quilometragem mensal, quem anda no carro, orçamento e prazo.",
  },
  {
    n: "02",
    t: "Perfil de curadoria",
    d: "Cruzamos suas respostas com os veículos em estoque.",
  },
  {
    n: "03",
    t: "Três sugestões reais",
    d: "Um consultor envia no WhatsApp com fotos, laudo e parcela.",
  },
];

export default async function Home() {
  const SITE_URL = "https://motors-site-oficial.vercel.app";

  const [estoque, settings] = await Promise.all([getEstoque(), getCachedSettings()]);
  const empresa = settings.companySettings ?? DEFAULT_COMPANY_SETTINGS;

  const disponiveis = estoque.filter((v) => !v.vendido);
  const total = disponiveis.length;

  const quickTags = normalizarQuickTags(settings.quickTags);
  const stockOverrides = normalizarStockOverrides(settings.stockOverrides);
  const destaquesRapidos = resolverDestaques(
    quickTags.length > 0 ? quickTags : DESTAQUES_PADRAO,
    disponiveis,
    stockOverrides,
  );

  // O carrossel do hero respeita a curadoria feita no painel; sem curadoria,
  // usa os três primeiros do estoque (que já vem ordenado por preço).
  const curados = Array.isArray(settings.carouselVehicleIds)
    ? (settings.carouselVehicleIds as string[])
        .map((id) => disponiveis.find((v) => v.id === id))
        .filter((v): v is NonNullable<typeof v> => Boolean(v))
    : [];
  const slidesHero = (curados.length > 0 ? curados : disponiveis).slice(0, 3);
  const destaquesSemana = disponiveis.slice(0, 6);

  const whatsappHref = `https://wa.me/${(empresa.whatsappRaw || empresa.whatsapp || "").replace(/\D/g, "")}`;

  const autoDealerSchema = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: empresa.name,
    image: `${SITE_URL}/logo.png`,
    url: SITE_URL,
    telephone: empresa.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: empresa.address,
      addressLocality: "Curitiba",
      addressRegion: "PR",
      addressCountry: "BR",
    },
    sameAs: [empresa.instagram, empresa.facebook].filter(Boolean),
  };

  return (
    <main role="main" className="flex flex-col bg-mt-bg font-modernist text-mt-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(autoDealerSchema) }}
      />

      <HeroHome slides={slidesHero} totalEstoque={total} />

      <BuscaRegua estoque={disponiveis} />

      {/* Trilho de destaques rápidos — cada um é uma landing indexável */}
      {destaquesRapidos.length > 0 && (
        <div className="flex flex-col border-b border-mt-regua-fina lg:flex-row lg:items-center lg:px-10">
          <span className="shrink-0 px-[18px] py-3.5 text-[10px] font-semibold tracking-[.16em] text-mt-neutral-600 lg:border-r lg:border-mt-regua-fina lg:py-3.5 lg:pl-0 lg:pr-5">
            DESTAQUES RÁPIDOS
          </span>
          <div className="flex flex-wrap gap-1.5 px-[18px] pb-3 lg:gap-0 lg:px-0 lg:pb-0">
            {destaquesRapidos.map((d) => (
              <Link
                key={d.slug}
                href={d.href}
                className="mt-foco flex items-baseline gap-1.5 border border-mt-regua px-2.5 py-1.5 text-[10px] font-extrabold tracking-[.06em] text-mt-ink no-underline lg:border-0 lg:border-r lg:border-mt-regua-fina lg:px-5 lg:py-3.5 lg:text-xs lg:tracking-[.08em]"
              >
                {d.tag.name}
                <span className="text-[10px] font-semibold text-mt-accent">{d.total}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ─── 01 Estoque selecionado ─── */}
      <section className="px-[18px] pt-12 lg:px-10 lg:pt-16">
        <CabecalhoSecao
          numero="01 — ESTOQUE SELECIONADO"
          titulo="Destaques da semana"
          acao={
            <LinkRegua href="/estoque">VER OS {total} VEÍCULOS</LinkRegua>
          }
        />
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 pt-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-12">
          {destaquesSemana.map((v, i) => (
            <CardVeiculo
              key={v.id}
              veiculo={v}
              href={getVeiculoPdpUrl(v)}
              densidade="destaque"
              etiqueta={v.status_tag || undefined}
              prioridade={i < 3}
            />
          ))}
        </div>
      </section>

      {/* ─── 02 Consultoria ─── */}
      <section className="mt-16 flex flex-col gap-10 bg-mt-inverso-fundo px-[18px] py-12 text-mt-inverso lg:mt-20 lg:flex-row lg:gap-16 lg:px-10 lg:py-16">
        <div className="lg:flex-[1.15]">
          <div className="mb-3.5 text-[10px] font-semibold tracking-[.18em] text-mt-accent-400 lg:text-[11px]">
            02 — CONSULTORIA
          </div>
          <h2 className="mt-titulo m-0 text-[34px] lg:text-[54px] lg:leading-[.95]">
            Garagem
            <br />
            Profiler
          </h2>
          <p className="m-0 mt-4 max-w-[420px] text-[13px] leading-relaxed text-mt-neutral-400 lg:mt-6 lg:text-base">
            Cinco perguntas, trinta segundos. Traçamos seu perfil de uso e nossos
            consultores enviam apenas o que faz sentido — direto no WhatsApp.
          </p>
          <Link href="/carro-perfeito" className="mt-btn mt-btn-primario mt-foco mt-6 lg:mt-8">
            INICIAR CURADORIA
            <Seta />
          </Link>
        </div>

        <div className="flex flex-col border-t-2 border-mt-inverso-regua lg:flex-1">
          {PASSOS_PROFILER.map((passo) => (
            <div
              key={passo.n}
              className="flex gap-5 border-b border-mt-inverso-regua-fina py-5"
            >
              <span className="w-6 shrink-0 text-xs font-extrabold tracking-[.1em] text-mt-accent">
                {passo.n}
              </span>
              <div>
                <div className="text-[17px] font-extrabold tracking-[-.01em]">
                  {passo.t}
                </div>
                <div className="mt-1.5 text-[13px] text-mt-inverso-suave">{passo.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 03 Venda ou troca ─── */}
      <section className="border-b-2 border-mt-regua px-[18px] py-12 lg:px-10 lg:py-16">
        <Rotulo accent className="text-[11px] tracking-[.18em]">
          03 — VENDA OU TROCA
        </Rotulo>
        <h2 className="mt-titulo m-0 mt-3.5 text-[28px] lg:text-[40px]">
          Avaliação Express
        </h2>
        <p className="m-0 mt-4 max-w-[420px] text-[13px] leading-relaxed text-mt-neutral-800 lg:text-[15px]">
          Proposta real em menos de 10 minutos, com base na Tabela FIPE e no giro
          do nosso estoque.
        </p>
        <div className="mt-7 flex max-w-[420px] border-t-2 border-mt-regua">
          <div className="flex-1 border-r border-mt-regua-media pt-3.5">
            <div className="text-[26px] font-extrabold">10 min</div>
            <div className="mt-1 text-[10px] font-semibold tracking-[.14em] text-mt-neutral-600">
              RESPOSTA
            </div>
          </div>
          <div className="flex-1 pl-4 pt-3.5">
            <div className="text-[26px] font-extrabold">FIPE</div>
            <div className="mt-1 text-[10px] font-semibold tracking-[.14em] text-mt-neutral-600">
              DADOS OFICIAIS
            </div>
          </div>
        </div>
        <Link href="/avaliacao" className="mt-btn mt-btn-contorno mt-foco mt-8">
          AVALIAR MEU CARRO
        </Link>
      </section>

      {/* ─── 04 Reputação ─── */}
      <section className="px-[18px] pt-12 lg:px-10 lg:pt-16">
        <CabecalhoSecao numero="04 — REPUTAÇÃO" titulo="O que dizem os clientes da Motors" />
        {/* Widget de terceiro: mantém o template próprio dentro desta grade */}
        <div className="pt-8">
          <GoogleReviewsFeed />
        </div>
      </section>

      {/* ─── Instagram ─── */}
      <section className="px-[18px] py-12 lg:px-10 lg:py-16">
        <div className="mb-3.5 flex flex-wrap items-baseline gap-4 border-t-2 border-mt-regua pt-5">
          <h3 className="mt-titulo m-0 text-2xl">
            {empresa.instagramUsername || "@motorsstore.oficial"}
          </h3>
          <span className="mr-auto text-xs text-mt-neutral-600">
            Chegadas e entregas da semana
          </span>
          {empresa.instagram && (
            <a
              href={empresa.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-foco text-[11px] font-extrabold tracking-[.12em] text-mt-accent no-underline"
            >
              SEGUIR
            </a>
          )}
        </div>
        <InstagramFeed />
      </section>

      {/* ─── Faixa de contato ─── */}
      <section className="bg-mt-accent px-[18px] py-14 text-mt-inverso lg:px-10 lg:py-[76px]">
        <h2 className="mt-display m-0 max-w-[1000px] text-[34px] lg:text-[88px]">
          O carro certo não é o mais caro. É o que você não quer devolver.
        </h2>
        <div className="mt-8 flex flex-wrap gap-0.5 lg:mt-11">
          <Link href="/estoque" className="mt-btn mt-btn-tinta mt-foco">
            VER OS {total} VEÍCULOS
            <Seta />
          </Link>
          <BotaoWhatsApp
            href={whatsappHref}
            origem="Home - Faixa de contato"
            rotulo="FALAR COM CONSULTOR"
            className="mt-btn mt-foco border-2 border-mt-inverso text-mt-inverso"
          />
        </div>
      </section>
    </main>
  );
}
