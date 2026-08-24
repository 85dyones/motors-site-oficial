import { Fragment } from "react";
import Link from "next/link";
import { areasVisiveis, normalizarAreas } from "../lib/areasDoSite";
import HeroHome from "../components/modernist/HeroHome";
import BuscaRegua from "../components/modernist/BuscaRegua";
import BotaoWhatsApp from "../components/modernist/BotaoWhatsApp";
import InstagramFeed from "../components/InstagramFeed";
import GoogleReviewsFeed from "../components/GoogleReviewsFeed";
import type { Metadata } from "next";
import {
  CabecalhoSecao,
  CardVeiculo,
  LinkRegua,
  Rotulo,
  Seta,
} from "../components/modernist/primitivos";
import { getEstoque, getVeiculoPdpUrl } from "../lib/supabase";
import { contarMarcas } from "../lib/estatisticasEstoque";
import { getCachedSettings } from "../lib/settings";
import { montarCompartilhamento } from "../lib/compartilhamento";
import { getReputacaoGoogle } from "../lib/avaliacoesGoogle";
import { normalizarCuradoria } from "../lib/instagramCuradoria";
import {
  DESTAQUES_PADRAO,
  normalizarQuickTags,
  normalizarStockOverrides,
  resolverDestaques,
} from "../lib/destaquesRapidos";
// Importa o JSON DIRETO, não via `./ThemeContext`.
//
// `ThemeContext` é um módulo "use client": quando um Server Component importa
// uma constante dele, o Next entrega uma referência de cliente no lugar do
// objeto real. Era por isso que este schema.org saía com `"name": ""` e
// `"sameAs": []` — verificado em produção em 2026-08-06, bug silencioso e
// anterior a esta rodada: o nome da loja nunca chegou ao structured data.
import DEFAULT_COMPANY_SETTINGS from "../lib/companySettings.json";
import { linkWhatsApp } from "../lib/whatsapp";
import { SITE_URL } from "../lib/site";

// A home declara o próprio canonical desde que ele saiu do layout raiz, onde
// era herdado indevidamente por /login, /test e /admin. As demais páginas
// públicas (sobre, contato, privacidade, destaques, PDP) já declaravam o seu.
//
// O card de compartilhamento também é próprio: herdar o do layout funcionava,
// mas deixava a home sem lugar no painel — e é justamente a página que mais se
// cola no WhatsApp.
export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();
  const tabTitle = companySettings?.tabTitle?.trim();

  return {
    alternates: { canonical: "/" },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "home",
      tituloPadrao: tabTitle || "Motors Store | Seminovos premium em Curitiba",
      descricaoPadrao:
        "Veículos premium selecionados com laudo cautelar, procedência auditada e garantia. Financiamento sem entrada.",
      caminho: "/",
    }),
  };
}

/**
 * Endereço da loja para o schema.org, derivado do endereço em vigor — o mesmo
 * que alimenta o rodapé e a ficha impressa.
 *
 * Até 2026-08-06 este schema declarava "Av. Europa, 1000, São Paulo-SP" e o
 * telefone +55 11 4003-0000, ambos fictícios: a loja é em Curitiba. O Google
 * recebia um NAP (nome/endereço/telefone) que contradizia o rodapé e o title
 * das landings, o que anula SEO local e derruba a confiança no structured data
 * do domínio. Derivar da mesma fonte impede que as duas divirjam de novo.
 *
 * Recebe o endereço por parâmetro (e não lê o JSON direto) porque a home passou
 * a resolver as configurações no servidor: o que vale é o que está no painel,
 * com o JSON apenas como fallback.
 */
function enderecoDoSchema(endereco: string) {
  // Formato esperado, o que o painel grava hoje:
  // "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350"
  //  └─ logradouro ──────┘   └ bairro ┘  └ cidade ┘  └UF┘ └─ CEP ─┘
  const bruto = (endereco || "").trim();

  const logradouro = bruto.split(" - ")[0]?.trim() || "";
  const miolo = bruto.split(" - ")[1] || "";
  const bairro = miolo.split(",")[0]?.trim() || "";
  const cidade = miolo.split(",")[1]?.trim() || "";
  const uf = (bruto.match(/\b([A-Z]{2})\b(?=\s*,|\s*\d{5})/) || [])[1] || "";
  const cep = (bruto.match(/\d{5}-?\d{3}/) || [""])[0];

  // Falha segura: endereço parcial no schema.org é pior que endereço nenhum —
  // o Google trata NAP inconsistente como sinal de baixa confiança. Se o dono
  // reescrever o endereço no painel num formato que este parse não entenda,
  // preferimos omitir o campo a publicar um endereço truncado ou errado.
  if (!logradouro || !cidade || !uf) return undefined;

  return {
    "@type": "PostalAddress",
    streetAddress: [logradouro, bairro].filter(Boolean).join(" - "),
    addressLocality: cidade,
    addressRegion: uf,
    postalCode: cep || undefined,
    addressCountry: "BR",
  };
}

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
  // SITE_URL vem de `lib/site` — endereço do site num lugar só.

  const [estoque, settings, reputacao] = await Promise.all([
    getEstoque(),
    getCachedSettings(),
    // Em paralelo com o estoque: são queries independentes, e encadeá-las
    // somaria a latência das duas ao TTFB da home.
    getReputacaoGoogle(),
  ]);
  const empresa = settings.companySettings ?? DEFAULT_COMPANY_SETTINGS;

  const publicacoesInstagram = normalizarCuradoria(settings.instagramCuradoria);
  const configDasAreas = normalizarAreas(settings.areasHome);

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

  const whatsappHref = linkWhatsApp(empresa);

  const autoDealerSchema = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    "name": empresa.name,
    "image": `${SITE_URL}/logo.png`,
    "url": SITE_URL,
    // `whatsappRaw` é o número da loja em formato discável, o mesmo que
    // alimenta todo botão de WhatsApp do site (`lib/whatsapp.ts`).
    "telephone": empresa.whatsappRaw ? `+${empresa.whatsappRaw}` : undefined,
    "address": enderecoDoSchema(empresa.address),
    "sameAs": [empresa.instagram, empresa.facebook].filter(Boolean),
    // Horário real da loja: Seg-Sex 08h30-18h30, Sáb 08h30-15h.
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "opens": "08:30",
        "closes": "18:30"
      },
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Saturday"],
        "opens": "08:30",
        "closes": "15:00"
      }
    ]
  };

  /**
   * As seções da home, indexadas pelo id do catálogo (`lib/areasDoSite.ts`).
   *
   * Até 2026-08-07 esta lista era JSX direto no `return`, em ordem fixa —
   * mudar a home exigia deploy. A tela A3 do design doc pede ordem e
   * visibilidade editáveis, então o `return` passou a percorrer a
   * configuração salva em vez do JSX literal. O conteúdo de cada bloco não
   * mudou; só passou a ter nome.
   */
  const blocos: Record<string, React.ReactNode> = {
    hero: (
      <HeroHome
        slides={slidesHero}
        totalEstoque={total}
        totalMarcas={contarMarcas(disponiveis)}
      />
    ),

    busca: <BuscaRegua estoque={disponiveis} />,

    /* Trilho de destaques rápidos — cada um é uma landing indexável */
    destaques_rapidos: destaquesRapidos.length > 0 && (
        /* A partir do tablet o trilho é uma faixa de 56px que rola na
           horizontal, e não uma caixa que quebra em várias linhas: na tela 09
           do design doc ele é uma régua só, do lado do rótulo. */
        <div className="flex flex-col border-b border-mt-regua-fina md:flex-row md:items-center lg:px-10">
          <span className="shrink-0 px-[18px] py-3.5 text-[10px] font-semibold tracking-[.16em] text-mt-neutral-600 md:border-r md:border-mt-regua-fina md:py-3.5 md:pr-5 lg:pl-0">
            DESTAQUES RÁPIDOS
          </span>
          <div className="flex flex-wrap gap-1.5 px-[18px] pb-3 md:flex-nowrap md:gap-0 md:overflow-x-auto md:px-0 md:pb-0">
            {destaquesRapidos.map((d) => (
              <Link
                key={d.slug}
                href={d.href}
                /* `uppercase` porque o nome vem do painel e não há garantia de
                   caixa no que já está salvo — o trilho é uma régua só, e um
                   chip em caixa baixa no meio dela salta aos olhos. */
                className="mt-foco flex shrink-0 items-baseline gap-1.5 whitespace-nowrap border border-mt-regua px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[.06em] text-mt-ink no-underline md:border-0 md:border-r md:border-mt-regua-fina md:px-5 md:py-3.5 md:text-xs md:tracking-[.08em]"
              >
                {d.tag.name}
                <span className="text-[10px] font-semibold text-mt-accent">{d.total}</span>
              </Link>
            ))}
          </div>
        </div>
      ),

    /* ─── 01 Estoque selecionado ─── */
    estoque_selecionado: (
      <section className="px-[18px] pt-12 lg:px-10 lg:pt-16">
        <CabecalhoSecao
          numero="01 — ESTOQUE SELECIONADO"
          titulo="Destaques da semana"
          acao={
            <LinkRegua href="/estoque">VER OS {total} VEÍCULOS</LinkRegua>
          }
        />
        {/* Três colunas só a partir de 1280px. A tela 09 do design doc põe a
            grade em duas colunas na faixa do tablet — é a tela que roda no
            navegador da TV e do tablet de balcão da loja, onde a foto do
            carro precisa de tamanho para vender de longe. */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 pt-10 sm:grid-cols-2 lg:gap-y-12 desktop:grid-cols-3">
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

    ),

    /* ─── 02 Consultoria ─── */
    consultoria: (
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

    ),

    /* ─── 03 Venda ou troca ─── */
    venda_troca: (
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
          <div className="flex-1 border-r border-mt-regua-media pr-4 pt-3.5">
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

    ),

    /* ─── 04 Reputação ───
       A seção inteira depende do sync do Google ter rodado. Sem dado ela não
       existe — nunca um cabeçalho "O que dizem os clientes" seguido de caixa
       vazia, que é o que anuncia ao visitante que a loja não tem avaliação. */
    reputacao: reputacao && (
        <section className="px-[18px] pt-12 lg:px-10 lg:pt-16">
          <CabecalhoSecao numero="04 — REPUTAÇÃO" titulo="O que dizem os clientes da Motors" />
          <GoogleReviewsFeed painel={reputacao} />
        </section>
    ),

    /* ─── Instagram ───
       Mesma regra da reputação: sem publicação curada no painel, não há
       faixa. O cabeçalho com o @ da loja só aparece se houver o que mostrar
       embaixo dele. */
    instagram: publicacoesInstagram.length > 0 && (
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
        <InstagramFeed publicacoes={publicacoesInstagram} />
      </section>
    ),

    /* ─── Faixa de contato ─── */
    contato: (
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
    ),
  };

  return (
    // `<div>`, não `<main>`: o layout raiz já abre um `<main>`, e landmarks
    // aninhados desorientam navegação por leitor de tela.
    <div className="flex flex-col bg-mt-bg font-modernist text-mt-ink">
      {/* Local Business (AutoDealer) Schema Markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(autoDealerSchema) }}
      />

      {/* A ordem e a visibilidade vêm da tela A3 do painel. `areasVisiveis`
          já descarta o que está desligado e normaliza config estranha — uma
          seção nunca some do site por causa de JSON malformado. */}
      {areasVisiveis(configDasAreas).map((area) => (
        <Fragment key={area.id}>{blocos[area.id]}</Fragment>
      ))}
    </div>
  );
}
