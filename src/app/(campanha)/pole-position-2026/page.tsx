import type { Metadata } from "next";
import Image from "next/image";
import { permanentRedirect } from "next/navigation";

import { campanhaPorSlug, campanhaAcabou } from "../../../lib/campanhas";
import { getCachedSettings } from "../../../lib/settings";
import { montarCompartilhamento } from "../../../lib/compartilhamento";
import CtaDeCampanha from "../../../components/campanha/CtaDeCampanha";

/**
 * Pole Position — 12 a 20 de setembro de 2026.
 *
 * Quem abre: quem clicou no anúncio, no story ou no card do WhatsApp.
 * Que decisão sai daqui: falar com a loja durante a semana da campanha.
 *
 * ⚠️ **Cores literais, nunca os tokens `--brand-*`.** O script anti-flicker do
 * layout raiz troca esses tokens conforme o tema salvo no navegador do
 * visitante — são quatro —, e a arte de corrida apareceria em dourado para
 * quem tem `stealth-dark`. A paleta abaixo foi AMOSTRADA da arte do folder:
 * o creme #F4E2D3 é a cor medida NO NAVEGADOR na borda da arte servida (não a
 * do pôster: o `composite` do sharp desloca ~11 por canal, e casar pelo valor
 * medido é o que faz a imagem deixar de aparecer como um retângulo), e o
 * #EC3013 é o vermelho da
 * campanha, que por acaso é o mesmo do tema Modernist.
 *
 * O texto é o do folder, com as ressalvas literais — "podem chegar a",
 * "conforme as condições de financiamento", "em veículos selecionados". Elas
 * são parte da afirmação, não letra miúda a ser aparada no digital.
 */

const CAMPANHA = campanhaPorSlug("pole-position-2026")!;
const CAMINHO = "/pole-position-2026";

// O 308 da aposentadoria só entra na revalidação. Cinco minutos de atraso na
// manhã de 21/09, sem pagar renderização por visita.
export const revalidate = 300;

const CREME = "#F4E2D3";
const CARVAO = "#201E1D";
const VERMELHO = "#EC3013";
const CINZA = "#55504C";

export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();

  return {
    title: "Pole Position | Motors Store — 12 a 20 de setembro",
    description: CAMPANHA.descricao,
    // Sem isto a página herda o card do layout raiz, que de propósito não
    // declara canonical para não anunciar a home como canônica de todo mundo.
    alternates: { canonical: CAMINHO },
    ...montarCompartilhamento({
      empresa: companySettings,
      /*
       * `"pdp"` e não `"sobre"`, e o motivo é mecânico: `montarCompartilhamento`
       * faz `proprio = pagina === "pdp" ? {} : config[pagina] ?? {}`, e depois
       * `limpar(proprio.titulo) || limpar(tituloPadrao)`. Com `"sobre"`, um card
       * de "Quem Somos" customizado no painel VENCERIA o título e a descrição
       * desta LP — o card do WhatsApp da campanha viraria o texto institucional.
       * `"pdp"` zera esse override e deixa os padrões abaixo mandarem.
       */
      pagina: "pdp",
      tituloPadrao: "Pole Position — a largada para grandes oportunidades",
      descricaoPadrao: CAMPANHA.descricao,
      caminho: CAMINHO,
      // A arte da campanha vence o card do painel. Fica em `public/`, e NÃO
      // sob `/api/`: o `robots.ts` bloqueia esse caminho, e o card responderia
      // 200 no navegador e chegaria sem imagem no WhatsApp — que é justamente
      // por onde a campanha circula.
      imagemPreferida: "/campanhas/pole-position-2026-og.jpg",
      // O arquivo é exatamente 1200×630, então a dimensão pode ser declarada.
      // A flag existe para foto do RevendaMais, de proporção desconhecida.
      imagemPreferidaSemDimensao: false,
    }),
  };
}

/** Os seis argumentos do folder, na ordem dele e com as ressalvas literais. */
const ARGUMENTOS = [
  {
    titulo: "Lives com ofertas relâmpago",
    texto:
      "Durante a ação, lives especiais com oportunidades que podem surgir a qualquer momento. " +
      "Fique ligado para não perder as ofertas relâmpago, com bônus que podem chegar a R$ 10 mil.",
  },
  {
    titulo: "Carros selecionados",
    texto:
      "Aqui você não encontra qualquer carro. Cada veículo é escolhido e avaliado criteriosamente " +
      "para fazer parte do nosso estoque.",
  },
  {
    /*
     * O folder impresso titula "PRIMEIRA PARCELA EM ATÉ 120 DIAS". Aqui o
     * número desce para o corpo, junto da condicional, porque a trava
     * `promessa-publica` proíbe prazo em campo de título — e o motivo dela,
     * escrito no próprio teste, é que **quem decide o prazo é o banco**. Um
     * título é lido sozinho; a ressalva tem de andar com o número, não uma
     * linha abaixo. O argumento é o mesmo e a afirmação continua inteira.
     */
    titulo: "Comece a pagar mais para frente",
    texto:
      "Você pode aproveitar seu carro novo agora e ter até 120 dias para começar a pagar, " +
      "conforme as condições de financiamento.",
  },
  {
    titulo: "Transferência + tanque cheio",
    texto:
      "Em veículos selecionados, a transferência fica por nossa conta e você ainda recebe o carro " +
      "com o tanque cheio.",
  },
  {
    titulo: "Garantia de motor e câmbio",
    /*
     * O folder titula só "GARANTIA" e o corpo dizia "a garantia Motors Store"
     * — nome que não existe em lugar nenhum do repositório, e escopo omitido
     * em página de tráfego pago sem link de saída para `/garantia`. O que a
     * loja realmente dá está em `paginasInstitucionais.ts`: motor e câmbio,
     * três meses, sem carência e sem franquia.
     *
     * O PRAZO fica de fora de propósito: `POSICIONAMENTO.md` é explícito que
     * 90 dias é o mínimo legal de PJ e não se vende como diferencial. Afirma-se
     * o escopo, que é o que o cliente precisa saber; o diferencial fica na
     * perícia.
     */
    texto:
      "Seu próximo carro sai com garantia de motor e câmbio por três meses, contratada na " +
      "entrega, sem carência e sem franquia.",
  },
  {
    /*
     * "independente", e não "aprovada" como no folder. Um título é lido
     * sozinho, e "Perícia cautelar aprovada" afirma que a perícia DESTE carro
     * está aprovada — o que o site nunca afirma, e que a medição desmentiu
     * (19 de 36 na conferência que originou a trava do `llms.txt`).
     *
     * O que é verdadeiro e continua dito é a afirmação de PROCESSO: todo
     * veículo PASSA por perícia antes da vitrine (decisão do dono em 04/09).
     * "Independente" carrega o diferencial real sem prometer o resultado.
     */
    titulo: "Perícia cautelar independente",
    /*
     * "assim que aprovada" não é enfeite: o laudo só abre na ficha depois da
     * perícia aprovada, e prometer o laudo sem a condição é o que a trava
     * `coerencia-da-pericia` existe para pegar. A afirmação de PROCESSO
     * ("passa por perícia antes da vitrine") é verdadeira e pode ser feita —
     * decisão do dono em 04/09; o que não se pode é prometer o documento.
     */
    texto:
      "Nossos veículos passam por perícia cautelar independente antes de entrar na vitrine — " +
      "estrutura, chassi e histórico de sinistro auditados, com o laudo publicado na ficha do " +
      "veículo assim que aprovada.",
  },
];

export default async function PolePosition() {
  /*
   * `campanhaAcabou`, e não `!campanhaEstaViva`.
   *
   * A segunda forma redirecionava também ANTES do início — com 308, que o
   * navegador guarda para sempre. Quem abrisse o link antes do dia 12 ficaria
   * com o redirect gravado e não veria a LP nem durante o feirão. Foi pego na
   * verificação de 08/09, e é o tipo de defeito que nenhum teste de unidade
   * acusaria: a função estava certa, o uso é que estava errado.
   *
   * Antes do início a página ABRE e diz a data: é destino de anúncio, e
   * anúncio se monta e se revisa antes de rodar. Do sitemap ela só entra
   * quando fica vigente.
   */
  if (campanhaAcabou(CAMPANHA, new Date())) {
    permanentRedirect(CAMPANHA.destinoAposFim);
  }

  const { companySettings } = await getCachedSettings();
  const endereco = companySettings?.address?.trim();

  return (
    <div style={{ backgroundColor: CREME, color: CARVAO }} className="w-full flex-grow">
      {/* ---------------------------------------------------------------- */}
      {/* Abertura                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-8 px-6 pb-4 pt-12 md:grid-cols-2 md:gap-4 md:pt-20">
        <div>
          <div className="mb-5 h-1 w-12" style={{ backgroundColor: VERMELHO }} />
          <p className="text-xs font-semibold tracking-[0.35em]" style={{ color: CARVAO }}>
            MOTORS STORE
          </p>
          <h1 className="mt-4 text-5xl font-extrabold leading-[0.92] tracking-tight sm:text-6xl md:text-7xl">
            POLE
            <br />
            POSITION
          </h1>
          <p className="mt-5 max-w-md text-xl leading-snug sm:text-2xl" style={{ color: CINZA }}>
            A largada para grandes oportunidades.
          </p>

          <p
            className="mt-7 inline-block px-5 py-3 text-base font-bold text-white sm:text-lg"
            style={{ backgroundColor: VERMELHO }}
          >
            12 a 20 de setembro
          </p>

          <div className="mt-8">
            <CtaDeCampanha
              campanha={CAMPANHA}
              rotulo="Quero as condições do Pole Position"
              style={{ backgroundColor: VERMELHO }}
              className="w-full rounded-sm px-8 py-4 text-base font-bold text-white transition-transform hover:scale-[1.02] sm:w-auto sm:text-lg"
            />
            <p className="mt-3 text-sm" style={{ color: CINZA }}>
              Condições exclusivas por uma semana.
            </p>
          </div>
        </div>

        {/*
          O BANNER — a única imagem que se troca sem tocar em código.
          Medidas e recorte em `public/campanhas/LEIA-ME.md`; para gerar as três
          artes de uma foto só, `scripts/preparar-arte-de-campanha.js`.

          `aspect-square` + `object-cover` de propósito, e não `h-auto`: com
          altura automática é a PROPORÇÃO DO ARQUIVO que decide a altura do
          hero, então trocar a foto por uma de outro formato mexeria no layout
          inteiro — o texto ao lado subiria ou desceria. Medido: com o bloco
          fixo, uma foto 4:1 no lugar da 1:1 deixa a página com a mesma altura
          ao pixel.

          A arte de campanha (de fundo integrado) e uma foto de carro de
          verdade funcionam as duas aqui: a primeira se dissolve no creme, a
          segunda fica como um bloco de foto, que é um elemento legítimo.
        */}
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden md:max-w-none">
          <Image
            src="/campanhas/pole-position-2026-carro.jpg"
            alt="Fórmula 1 branco e vermelho visto de cima, alinhado na pista"
            fill
            priority
            unoptimized
            sizes="(max-width: 768px) 90vw, 45vw"
            className="object-cover object-center"
          />
        </div>
      </section>

      {/* Zebra de autódromo — o divisor que o folder usa. */}
      <div
        aria-hidden
        className="h-3 w-full"
        style={{
          backgroundImage: `repeating-linear-gradient(135deg, ${VERMELHO} 0 22px, #FFFFFF 22px 44px)`,
        }}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Os seis argumentos                                                */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-6 py-14 md:py-20">
        <h2 className="max-w-2xl text-2xl font-extrabold leading-tight sm:text-3xl">
          Tudo o que você vai encontrar para sair de carro novo
        </h2>

        <ol className="mt-10 grid grid-cols-1 gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {ARGUMENTOS.map((item, indice) => (
            <li key={item.titulo}>
              <span
                className="block text-3xl font-extrabold leading-none"
                style={{ color: VERMELHO }}
              >
                {String(indice + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-lg font-bold leading-snug">{item.titulo}</h3>
              <p className="mt-2 text-[15px] leading-relaxed" style={{ color: CINZA }}>
                {item.texto}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Fecho — a segunda âncora do MESMO CTA, não um destino novo         */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative isolate w-full overflow-hidden" style={{ backgroundColor: CARVAO }}>
        <Image
          src="/campanhas/pole-position-2026-pista.jpg"
          alt=""
          aria-hidden
          width={1600}
          height={400}
          sizes="100vw"
          unoptimized
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-25"
        />
        <div className="mx-auto w-full max-w-6xl px-6 py-16 text-center md:py-20">
          <h2 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            A largada é dia 12
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/80 sm:text-lg">
            Fale com a loja e receba as condições do Pole Position antes de vir. Se preferir,
            venha direto ao showroom durante a semana da campanha.
          </p>

          <div className="mt-8 flex justify-center">
            <CtaDeCampanha
              campanha={CAMPANHA}
              rotulo="Quero as condições do Pole Position"
              style={{ backgroundColor: VERMELHO }}
              className="rounded-sm px-8 py-4 text-base font-bold text-white transition-transform hover:scale-[1.02] sm:text-lg"
            />
          </div>

          {/* O endereço vem de `companySettings`, e não escrito aqui: a loja
              muda o endereço num lugar só, e a LP acompanha. */}
          {endereco ? <p className="mt-8 text-sm text-white/70">{endereco}</p> : null}
        </div>
      </section>
    </div>
  );
}
