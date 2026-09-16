import type { Metadata } from "next";
import Link from "next/link";
import { getCachedSettings } from "../../lib/settings";
import { blocoJsonLd } from "../../lib/schemaListagem";
import { schemaDaLoja, schemaDoSite } from "../../lib/schemaLoja";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { LinkRegua, Rotulo } from "../../components/modernist/primitivos";
import ControleDeRastreamento from "../../components/ControleDeRastreamento";
import type { CompanySettings } from "../../types";
import { SITE_URL } from "../../lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();

  return {
    title: "Política de Privacidade e LGPD | Motors Store",
    description:
      "Como a Motors Store coleta, usa e protege seus dados pessoais. Cookies, publicidade, compartilhamento com terceiros e seus direitos como titular sob a LGPD.",
    alternates: {
      canonical: "/privacidade",
    },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "privacidade",
      caminho: "/privacidade",
    }),
  };
}

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: `${SITE_URL}/`,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Política de Privacidade",
      item: `${SITE_URL}/privacidade`,
    },
  ],
};

// Data da última revisão do texto. Atualizar sempre que o conteúdo mudar —
// a LGPD espera que o titular consiga saber qual versão aceitou.
const ULTIMA_ATUALIZACAO = "15 de setembro de 2026";

function Secao({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="mt-titulo m-0 border-t-2 border-mt-regua pt-4 text-[22px] sm:text-[26px]">
        {titulo}
      </h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-mt-neutral-800">
        {children}
      </div>
    </section>
  );
}

export default async function PrivacidadePage() {
  let company: Partial<CompanySettings> = {};
  try {
    const { companySettings } = await getCachedSettings();
    company = (companySettings as CompanySettings) || {};
  } catch {
    // Segue com os fallbacks abaixo — a política nunca pode deixar de ser exibida.
  }

  const nome = company.name || "Motors Store";
  const email = company.privacyContactEmail?.trim() || "";
  const endereco = company.address || "";
  const cnpj = company.cnpj || "";
  const telefone = company.phone || "";

  /**
   * A loja e o site entram aqui, mas o `try` acima é quem manda: se as settings
   * falharem, `company` fica `{}` e os nós saem com os campos ausentes em vez
   * de derrubar a página. A política de privacidade nunca pode deixar de ser
   * exibida — é obrigação legal, não conteúdo editorial.
   *
   * Ficou de fora da primeira entrega da F2, junto com `/carro-perfeito`, sob
   * uma frase que dizia que as páginas sem o nó eram "erro, área logada ou
   * bloqueadas no robots". As duas estão no sitemap e permitidas no
   * `robots.ts`; a revisão apontou.
   */
  const grafo = blocoJsonLd([
    breadcrumbSchema,
    schemaDaLoja(company as CompanySettings),
    schemaDoSite(company as CompanySettings),
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: grafo }} />

      {/* `<div>`, não `<main>`: o layout raiz já abre um `<main>`. */}
      <div className="w-full bg-mt-bg px-[18px] py-12 font-modernist text-mt-ink sm:px-6 sm:py-16 lg:px-8">
        <article className="mx-auto flex max-w-3xl flex-col gap-10">
          {/* Cabeçalho */}
          <header className="flex flex-col gap-3 border-b-2 border-mt-regua pb-8">
            <Rotulo accent className="text-[11px] tracking-[.18em]">
              PRIVACIDADE &amp; LGPD
            </Rotulo>
            <h1 className="mt-titulo m-0 mt-1 text-[38px] sm:text-[52px]">
              Política de Privacidade
            </h1>
            <p className="m-0 text-sm leading-relaxed text-mt-neutral-800 sm:text-base">
              Esta página explica quais dados a {nome} coleta quando você navega neste site,
              por que os coletamos, com quem compartilhamos e como você pode pedir acesso,
              correção ou exclusão deles.
            </p>
            <p className="m-0 mt-1 text-[11px] text-mt-neutral-600">
              Última atualização: {ULTIMA_ATUALIZACAO}
            </p>
          </header>

          {/* Índice */}
          <nav aria-label="Índice desta página" className="flex flex-col gap-2">
            <Rotulo className="text-[10px] tracking-[.16em]">NESTA PÁGINA</Rotulo>
            <ol className="mt-1.5 flex flex-col text-sm text-mt-neutral-800">
              {[
                ["quem-somos", "Quem é o controlador dos seus dados"],
                ["dados", "Quais dados coletamos"],
                ["finalidades", "Para que usamos"],
                ["bases-legais", "Bases legais"],
                ["cookies", "Cookies e tecnologias de rastreamento"],
                ["compartilhamento", "Com quem compartilhamos"],
                ["retencao", "Por quanto tempo guardamos"],
                ["direitos", "Seus direitos como titular"],
                ["seguranca", "Segurança"],
                ["contato", "Como falar conosco"],
              ].map(([id, label]) => (
                <li key={id} className="border-b border-mt-regua-fina">
                  <a
                    href={`#${id}`}
                    className="mt-foco block py-2 no-underline transition-colors hover:text-mt-accent"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <Secao id="quem-somos" titulo="Quem é o controlador dos seus dados">
            <p>
              O controlador dos dados pessoais tratados neste site é a <strong>{nome}</strong>
              {cnpj && <>, inscrita no CNPJ sob o nº {cnpj}</>}
              {endereco && <>, com endereço em {endereco}</>}.
            </p>
            <p>
              &ldquo;Controlador&rdquo; é o termo que a Lei Geral de Proteção de Dados (Lei nº
              13.709/2018) usa para quem decide como e por que os dados são tratados. Na prática:
              somos nós que respondemos pelas decisões descritas nesta página.
            </p>
          </Secao>

          <Secao id="dados" titulo="Quais dados coletamos">
            <p>Coletamos dados em dois momentos distintos.</p>
            <p>
              <strong className="text-mt-ink">Quando você preenche um formulário.</strong>{" "}
              Nos formulários de contato, avaliação de veículo, Match de Garagem e nas solicitações
              de proposta, pedimos <strong>nome, e-mail e telefone/WhatsApp</strong>. Nos formulários
              de avaliação, também coletamos os dados do veículo que você quer vender (marca,
              modelo, ano, quilometragem, estado de conservação). Nada disso é obrigatório para
              navegar — só para ser atendido.
            </p>
            <p>
              <strong className="text-mt-ink">Enquanto você navega.</strong> Registramos
              automaticamente as páginas e veículos que você visita, seu endereço IP, informações do
              navegador e dispositivo, a origem da visita (por exemplo, se você chegou por um anúncio)
              e um identificador anônimo gerado pelo próprio site para reconhecer sua sessão.
            </p>
            <p>
              Não coletamos dados sensíveis (origem racial, convicção religiosa, opinião política,
              saúde, biometria) nem dados de crianças e adolescentes de forma intencional.
            </p>
          </Secao>

          <Secao id="finalidades" titulo="Para que usamos">
            <ul className="list-disc pl-5 flex flex-col gap-2">
              <li>
                <strong className="text-mt-ink">Atender você.</strong> Responder à sua
                mensagem, elaborar propostas, avaliar seu veículo e dar continuidade à negociação
                pelo WhatsApp ou telefone.
              </li>
              <li>
                <strong className="text-mt-ink">Melhorar o site.</strong> Entender quais
                veículos e páginas despertam mais interesse para organizar melhor o catálogo.
              </li>
              <li>
                <strong className="text-mt-ink">Publicidade.</strong> Medir o resultado dos
                nossos anúncios no Google e na Meta (Facebook e Instagram) e exibir anúncios mais
                relevantes para quem já visitou o site.
              </li>
              <li>
                <strong className="text-mt-ink">Segurança.</strong> Prevenir envio automatizado
                de formulários, spam e uso abusivo.
              </li>
              {/* Entra em 2026-09-11, junto da tabela `erros`. A finalidade precisa
                  estar declarada ANTES de a coleta começar — é a régua da §2.3 do
                  spec de observabilidade, e o motivo de este parágrafo não ter
                  ficado para depois. */}
              <li>
                <strong className="text-mt-ink">Consertar o que quebra.</strong> Quando uma
                página apresenta falha, registramos o diagnóstico técnico — a mensagem e o
                rastreamento do erro, o endereço da página, o navegador, o método e a versão do
                site, além do identificador anônimo de navegação — para conseguir reproduzir e
                corrigir o problema. Não registramos o conteúdo dos formulários de propósito, e
                mascaramos telefone, CPF, CNPJ e e-mail antes de gravar; ainda assim, uma mensagem
                de erro do banco de dados pode citar um valor por acidente.
              </li>
            </ul>
          </Secao>

          <Secao id="bases-legais" titulo="Bases legais">
            <p>
              A LGPD exige que todo tratamento tenha uma justificativa legal. As nossas são:
            </p>
            {/* Até 31/08/2026 havia aqui um item "Consentimento" para cookies
                de publicidade e análise — descrevia um aceite que a decisão
                do dono, na mesma data, revogou. QA encontrou a sobra em
                15/09/2026: nenhum cookie de publicidade ou análise depende
                mais de consentimento, então o item saiu, e a medição de
                anúncios e de uso do site entrou no legítimo interesse, junto
                do que já estava lá. A seção "Seus direitos como titular",
                abaixo, não muda — os direitos que a LGPD associa a
                consentimento continuam existindo em tese. (Consentimento
                como base legal não desapareceu do site inteiro: a Garagem
                Motors grava consentimento de canal de comunicação —
                `garagem/meus-dados/page.tsx`, `api/garagem/consentimento` —,
                só não é tratamento descrito nesta página.) Se algum dia
                voltar a haver cookie sob consentimento, o item volta junto.

                15/09/2026, rodada 2 — a revisão adversarial bloqueou a
                primeira versão deste bullet por dois motivos, os dois
                confirmados no código antes desta reescrita:

                (B1) "Legítimo interesse" juntava publicidade com segurança,
                prevenção a fraudes e diagnóstico de falhas, e dizia que TODOS
                se opunham pelo botão de cookies. Falso para os três últimos:
                a captura de erro arma sempre, sem consultar
                `ag_cookie_consent` (`instrumentation-client.ts:76`,
                `configurar({ ativo: true })`) e manda o `ag_uid` a
                `/api/erros` (`observabilidade-cliente.ts:152` lê o cookie,
                `:236` envia); o `ag_uid` de 1 ano é gravado sem portão
                nenhum (`AntigravityTracker.tsx:24-34`); e o Turnstile é
                exigido em todo lead, `ISENTOS_DE_CAPTCHA` vazio
                (`api/leads/route.ts:41-54`). `rastreamentoRecusado()` só é
                lido em `IntegrationsTracker.tsx:161,329` e
                `telemetry.ts:499,605,650,692,744` — nenhum desses três usos
                está nessa lista. Por isso o bullet separou: publicidade se
                opõe pelo botão de cookies, os outros três pelos canais de
                contato.

                (B2) A finalidade "exibir anúncios mais relevantes para quem
                já visitou o site" (remarketing, `finalidades` acima) ficou
                sem base legal: o texto anterior só dizia "medir" e
                "entender o uso". O remarketing é real — `Ads - Remarketing
                dinamico` em `docs/GTM_CONFIGURACAO.md`. Dois eventos a
                alimentam, de dois lugares diferentes: `view_vehicle`, que
                `trackVehicleView` empurra ao abrir uma ficha
                (`telemetry.ts:587`, `dataLayer.ts:331`), e `page_context`,
                que `CamadaDeDados` empurra a CADA página, não só fichas
                (`CamadaDeDados.tsx:28`, `dataLayer.ts:235`). (Correção de
                rodada 3: a versão anterior deste comentário atribuía os dois
                eventos a `trackVehicleView` — só o `view_vehicle` é dele.)
                Acrescentado aqui, no Compartilhamento
                (`#compartilhamento`) e, por coerência, no primeiro parágrafo
                da seção de cookies abaixo. */}
            <ul className="list-disc pl-5 flex flex-col gap-2">
              <li>
                <strong className="text-mt-ink">Execução de contrato e procedimentos
                preliminares</strong> — para tratar os dados que você nos envia com o objetivo de
                comprar, vender ou avaliar um veículo.
              </li>
              <li>
                <strong className="text-mt-ink">Legítimo interesse</strong> — para medir o
                desempenho dos nossos anúncios, exibir anúncios a quem já visitou o site e
                entender como o site é usado. Você pode se opor a esses usos a qualquer
                momento, pelo botão da seção{" "}
                <a href="#cookies" className="underline underline-offset-2">
                  Cookies e tecnologias de rastreamento
                </a>
                . Também com base no legítimo interesse, e fora do alcance desse botão:
                segurança do site, prevenção a fraudes e diagnóstico de falhas. Para esses,
                a oposição é pedida pelos canais da seção{" "}
                <a href="#contato" className="underline underline-offset-2">
                  Como falar conosco
                </a>
                .
              </li>
              <li>
                <strong className="text-mt-ink">Obrigação legal</strong> — para guardar
                registros que a legislação fiscal e civil exige.
              </li>
            </ul>
          </Secao>

          <Secao id="cookies" titulo="Cookies e tecnologias de rastreamento">
            {/* ⚠️ Reescrito em 2026-08-31, na MESMA rodada em que o portão do
                `IntegrationsTracker` mudou. Até essa data este parágrafo dizia
                "enquanto você não aceitar, nenhuma ferramenta de análise ou
                publicidade é carregada", e era verdade. Deixou de ser.

                Se algum dia o carregamento voltar a esperar o aceite, este
                texto tem de voltar junto. `tests/brechas-de-mensuracao.test.ts`
                amarra as duas pontas: política e código não podem contar
                histórias diferentes. */}
            <p>
              Ao entrar no site você vê um aviso sobre cookies.{" "}
              <strong className="text-mt-ink">As ferramentas de análise e de publicidade —
              Google Analytics, Google Ads e Meta Pixel — são carregadas desde o início da
              visita</strong>, antes da sua resposta ao aviso, com fundamento no{" "}
              <strong className="text-mt-ink">legítimo interesse</strong> (art. 7º, IX da LGPD):
              medir o desempenho dos nossos anúncios, exibir anúncios a quem já visitou o
              site e entender como o site é usado.
            </p>
            <p>
              <strong className="text-mt-ink">Você pode se opor a qualquer momento</strong>, e a
              oposição funciona de verdade: o botão abaixo interrompe o rastreamento e apaga na
              hora os identificadores de campanha guardados no seu navegador. O site continua
              funcionando igual, e a escolha vale para as próximas visitas neste dispositivo.
            </p>
            <ControleDeRastreamento />
            {/* Este parágrafo entrou em 28/08 e não é redação: ele descreve o
                que `lib/telemetry.ts` passou a fazer na mesma rodada. Se a
                gravação na chegada voltar a esperar o aceite, este texto tem de
                sair junto — política e código contando histórias diferentes é
                pior do que qualquer das duas escolhas.

                15/09/2026 — QA encontrou duas frases que a decisão de 31/08 já
                tinha tornado falsas: "caso você aceite mais tarde" (não há mais
                aceite para esperar) e "não é enviado a ninguém enquanto você não
                enviar um formulário" (havia — quando ainda havia portão de
                aceite para o Pixel e o gtag). Conferido em
                `IntegrationsTracker.tsx`: `persistirFbc()` grava o `_fbc` a
                partir do `fbclid` e, na sequência do mesmo `checkAndInitTrackors`,
                sem nada entre os dois além da recusa explícita, inicializa o
                Meta Pixel — cujo próprio script dispara `fbq('track',
                'PageView')` de imediato, já com o `_fbc` presente no navegador.
                GA4 e Google Ads são inicializados do mesmo jeito, e o gtag deles
                lê `gclid`/`gbraid`/`wbraid` da URL por conta própria. Nenhum dos
                dois caminhos passa por formulário. Reescrito para dizer isso.

                15/09/2026, rodada 2 — a revisão adversarial (B3) achou o
                parágrafo acima incompleto: ele só atribuía o envio aos
                scripts de terceiro, mas o PRÓPRIO site repassa o
                identificador aos servidores da Meta, sem formulário. Fluxo
                conferido: `tracking-identity.ts:44-48` (`getMatchParams`)
                monta `fbc` a partir do cookie `_fbc` ou, na falta dele, do
                `fbclid` da URL — sem portão. Ele sai em três pontos, cada um
                sem exigir formulário: ao abrir a ficha do veículo
                (`PDPClientWrapper.tsx:211-233`, POST para `/api/capi`), ao
                tocar em WhatsApp/telefone
                (`telemetry.ts:779` chama `espelharNoCapi("Contact", ...)`) e
                ao usar o Match de Garagem (`telemetry.ts:712`,
                `espelharNoCapi("Search", ...)`). `/api/capi` chama
                `sendCapiEvent` (`meta-capi.ts:137`, POST ao Graph da Meta),
                que manda `fbc`/`fbp`/IP/user-agent em claro — só e-mail,
                telefone e `external_id` levam hash
                (`meta-capi.ts:107-117`).

                E a frase final prometia demais: "apagado na hora" sem
                dizer ONDE. `ControleDeRastreamento.tsx:56-61` e
                `descartarParametrosDeCampanha` (`telemetry.ts:287-294`) só
                apagam a cópia local (cookie e `localStorage`) — nenhum dos
                dois chama Google nem Meta para apagar o que já foi
                recebido. Corrigido para dizer isso, mantendo as duas
                âncoras que `tests/brechas-de-mensuracao.test.ts` (B.4)
                exige: "antes da sua resposta ao aviso" e "recusar, ele é
                apagado". */}
            <p>
              Um detalhe, para você saber exatamente o que acontece: quando você chega ao site
              por um anúncio, o endereço traz um código que identifica de qual anúncio veio o
              clique (por exemplo <code>gclid</code> ou <code>fbclid</code>).{" "}
              <strong className="text-mt-ink">Esse código é guardado no seu navegador assim que
              você chega, antes da sua resposta ao aviso</strong> — para que o anúncio não perca
              o crédito pela visita, inclusive numa visita futura. E ele não espera
              formulário: o Google Analytics, o Google Ads e o Meta Pixel, ativos desde a
              chegada, podem recebê-lo na própria medição deles, e os nossos servidores
              repassam à Meta (Conversions API) o código dos anúncios dela, o{" "}
              <code>fbclid</code>, quando você abre a página de um veículo, usa o Match de
              Garagem ou toca num botão de contato.{" "}
              <strong className="text-mt-ink">Se você recusar, ele é apagado deste navegador na hora</strong>;
              o que já chegou ao Google e à Meta segue os prazos de retenção deles.
            </p>
            {/* Até 15/09/2026 dizia "Se você aceitar, usamos:" — não há mais
                aceite para condicionar a lista a ele. As ferramentas abaixo
                carregam desde o início da visita, como o parágrafo do topo
                desta seção já diz; esta linha só introduz a lista. */}
            <p>Usamos estas ferramentas:</p>
            <ul className="list-disc pl-5 flex flex-col gap-2">
              <li>
                <strong className="text-mt-ink">Google Analytics 4</strong> — mede audiência e
                comportamento de navegação de forma agregada.
              </li>
              <li>
                <strong className="text-mt-ink">Google Ads</strong> — mede quais anúncios
                geraram contato. Quando você envia um formulário, seu e-mail e telefone são
                convertidos em um código embaralhado irreversível (hash) antes de sair do seu
                navegador. O Google recebe esse código, nunca o dado original.
              </li>
              <li>
                <strong className="text-mt-ink">Meta Pixel e Conversions API</strong> — mesma
                finalidade, para anúncios no Facebook e Instagram. Parte dessas informações é enviada
                pelo seu navegador e parte pelos nossos servidores, sempre com e-mail e telefone
                embaralhados da mesma forma. Também usamos os cookies <code>_fbp</code> e{" "}
                <code>_fbc</code> para identificar de qual anúncio veio a visita.
              </li>
              <li>
                <strong className="text-mt-ink">Cloudflare Turnstile</strong> — verifica que
                quem preenche o formulário é uma pessoa, não um robô.
              </li>
            </ul>
            {/* Até 15/09/2026 esta orientação dizia "para revogar o
                consentimento, apague os dados de navegação" — instrução de um
                regime de aceite que não existe mais. Conferido contra
                `ControleDeRastreamento.tsx`: quem se opõe é quem grava
                `ag_cookie_consent = "rejected"` no `localStorage`, pelo botão
                acima; apagar dados do navegador NÃO grava isso — ao
                contrário, apaga a chave se ela já existir, e a ausência da
                chave é lida como "não recusou" (`rastreamentoRecusado()` em
                `lib/telemetry.ts`). A orientação antiga fazia prometer o
                oposto do que o código faz. */}
            <p>
              Para se opor ao rastreamento, use o botão acima. A escolha fica gravada neste
              navegador e vale para as próximas visitas. Apagar os dados de navegação (cookies e
              armazenamento local) deste site tem o efeito contrário do que parece: apaga também
              essa escolha, e o rastreamento volta a ficar ativo por padrão — se for esse o caso,
              use o botão acima de novo para se opor.
            </p>
          </Secao>

          <Secao id="compartilhamento" titulo="Com quem compartilhamos">
            <p>
              <strong className="text-mt-ink">Não vendemos seus dados.</strong> Compartilhamos
              apenas com quem é necessário para o site funcionar:
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-2">
              {/* Até 15/09/2026: "mediante seu consentimento" — a medição de
                  anúncios não depende de consentimento desde 31/08.

                  15/09/2026, rodada 2 (B2 + menor): duas correções juntas,
                  porque a segunda apareceu ao investigar a primeira.
                  "Para medição de anúncios" ficava sem cobrir o remarketing
                  (ver o comentário de Bases legais, acima) — acrescentado
                  "exibi-los a quem já visitou o site". E "identificadores
                  embaralhados" era impreciso: só e-mail, telefone e
                  `external_id` levam hash; `fbc`, `fbp`, IP e user-agent
                  viajam em claro (`meta-capi.ts:107-117`, conferido linha a
                  linha). */}
              <li>
                <strong className="text-mt-ink">Google e Meta</strong> — dados de navegação,
                identificadores de anúncio (como <code>gclid</code>, <code>_fbc</code> e{" "}
                <code>_fbp</code>) e e-mail e telefone embaralhados, para medir anúncios e
                exibi-los a quem já visitou o site, com base no legítimo interesse e
                respeitando a oposição da seção{" "}
                <a href="#cookies" className="underline underline-offset-2">
                  Cookies e tecnologias de rastreamento
                </a>
                .
              </li>
              <li>
                <strong className="text-mt-ink">Provedores de infraestrutura</strong> —
                serviços de hospedagem, banco de dados e automação que armazenam e processam os
                dados em nosso nome, seguindo nossas instruções.
              </li>
              <li>
                <strong className="text-mt-ink">Instituições financeiras</strong> — apenas se
                você solicitar simulação ou proposta de financiamento, e somente os dados necessários
                para isso.
              </li>
              <li>
                <strong className="text-mt-ink">Autoridades</strong> — quando houver
                obrigação legal ou ordem judicial.
              </li>
            </ul>
            <p>
              Alguns desses provedores operam servidores fora do Brasil. Nesses casos, a
              transferência internacional segue as garantias previstas na LGPD.
            </p>
          </Secao>

          <Secao id="retencao" titulo="Por quanto tempo guardamos">
            <p>
              Quando você preenche um formulário do site, registramos em nossa base o{" "}
              <strong>nome, o telefone e o interesse informado</strong> (o veículo ou o tipo de
              carro que você procura), junto da data do contato. Esse registro é o que permite a
              nossa equipe retomar a conversa de onde parou.
            </p>
            <p>
              Esses dados de contato <strong>não têm prazo de descarte automático</strong>: ficam
              conosco enquanto forem úteis ao atendimento e ao relacionamento comercial, e são
              eliminados quando você pedir. O acesso é restrito à equipe autenticada no nosso painel
              interno.
            </p>
            <p>
              Dados de navegação e publicidade seguem os prazos de retenção definidos pelas próprias
              plataformas Google e Meta.
            </p>
            {/* O registro técnico de erro, e a RESSALVA que ele obriga.
                A frase seguinte dizia, sem qualificar, que atendido o pedido não
                fica cópia nenhuma. Com a tabela `erros` isso deixaria de ser
                verdade: o identificador anônimo de navegação sobrevive na linha
                técnica até a janela de 90 dias fechar. Declarar é o que torna a
                coleta legítima; calar seria a política mentir sobre a base. */}
            {/* O prazo vai em PROSA, sem `<strong>` ao redor do número.
                `>90 dias<` casa com a trava "prazo renderizado como
                estatística" de `promessa-publica.test.ts`, que existe para
                impedir que promessa de atendimento volte em forma de número
                solto numa superfície pública. Aqui o número é retenção legal e
                não promessa de serviço, mas a régua olha a FORMA — e enfraquecer
                uma guarda de página pública por causa de um negrito seria a
                troca errada. O destaque que importa já está no sujeito da
                frase. */}
            <p>
              <strong className="text-mt-ink">Registros técnicos de erro</strong> ficam
              guardados por 90 dias e depois são apagados por rotina automática. Eles contêm a
              mensagem e o rastreamento do erro, a página, o navegador, o método, a versão do site
              e o identificador anônimo de navegação.
            </p>
            <p>
              Você pode pedir a eliminação a qualquer momento, pelos canais da seção{" "}
              <a href="#contato" className="underline underline-offset-2">
                Como falar conosco
              </a>
              . Atendido o pedido, seu cadastro de contato é apagado. Um registro técnico de erro
              gerado antes do pedido pode permanecer até o fim dos 90 dias, e some sozinho no
              prazo: ele guarda o identificador anônimo de navegação e, nos casos em que a
              mensagem do banco de dados cita um valor, pode conter um dado seu que escapou do
              mascaramento.
            </p>
            {/* Sem oferta de apagar esses registros mais cedo, a pedido. A frase
                existia, e a revisão de 13/09 mediu que nada a cumpria: o painel não
                tem DELETE em `erros`, e a exclusão do lead não encosta na tabela.
                Depois dela some o elo direto (`leads.ag_uid`). O identificador segue
                no cookie e no localStorage do titular e em cópias fora do banco: o
                JSON do lead enviado adiante, a nota do Chatwoot e a forma curta na
                mensagem de WhatsApp. A oferta volta junto com um executor, num PR
                próprio (decisão do dono, 13/09). */}
          </Secao>

          <Secao id="direitos" titulo="Seus direitos como titular">
            <p>
              O artigo 18 da LGPD garante que você pode, a qualquer momento e gratuitamente:
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-2">
              <li>Confirmar se tratamos dados seus e obter acesso a eles</li>
              <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
              <li>
                Pedir anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em
                desconformidade com a lei
              </li>
              <li>Solicitar a portabilidade dos dados a outro fornecedor</li>
              <li>Pedir a eliminação dos dados tratados com base no seu consentimento</li>
              <li>Saber com quais entidades públicas e privadas compartilhamos seus dados</li>
              <li>
                Ser informado sobre a possibilidade de não consentir e quais são as consequências
              </li>
              <li>Revogar o consentimento a qualquer momento</li>
              <li>Opor-se a tratamento feito com base em legítimo interesse</li>
            </ul>
            <p>
              Para exercer qualquer um desses direitos, use os canais da seção abaixo. Podemos pedir
              informações que confirmem sua identidade antes de atender — é uma proteção para você,
              para que ninguém obtenha seus dados se passando por você.
            </p>
          </Secao>

          <Secao id="seguranca" titulo="Segurança">
            <p>
              Adotamos medidas técnicas e administrativas para proteger seus dados: comunicação
              criptografada (HTTPS), controle de acesso restrito à equipe que precisa dos dados para
              atender você, limite de requisições para conter uso abusivo e verificação anti-robô nos
              formulários.
            </p>
            <p>
              Nenhum sistema é infalível. Se ocorrer um incidente de segurança com risco relevante
              aos seus direitos, comunicaremos você e a Autoridade Nacional de Proteção de Dados
              (ANPD), conforme a lei exige.
            </p>
          </Secao>

          <Secao id="contato" titulo="Como falar conosco">
            <p>
              Para dúvidas sobre esta política ou para exercer seus direitos:
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-2">
              {email && (
                <li>
                  E-mail:{" "}
                  <a
                    href={`mailto:${email}`}
                    className="text-mt-accent hover:underline underline-offset-4 font-medium"
                  >
                    {email}
                  </a>
                </li>
              )}
              <li>
                Formulário:{" "}
                <Link
                  href="/contato"
                  className="text-mt-accent hover:underline underline-offset-4 font-medium"
                >
                  página de contato
                </Link>
              </li>
              {telefone && <li>Telefone: {telefone}</li>}
              {endereco && <li>Endereço: {endereco}</li>}
            </ul>
            <p>
              Responderemos no menor prazo possível. Se você entender que sua solicitação não foi
              adequadamente atendida, pode registrar reclamação junto à{" "}
              <a
                href="https://www.gov.br/anpd/pt-br"
                target="_blank"
                rel="noopener noreferrer"
                className="text-mt-accent hover:underline underline-offset-4 font-medium"
              >
                Autoridade Nacional de Proteção de Dados (ANPD)
              </a>
              .
            </p>
          </Secao>

          {/* Rodapé da página */}
          <footer className="flex flex-col items-start gap-5 border-t-2 border-mt-regua pt-6">
            <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-600">
              Podemos atualizar esta política para refletir mudanças no site ou na legislação.
              Alterações relevantes serão sinalizadas nesta página com nova data de atualização.
            </p>
            <LinkRegua href="/">VOLTAR AO INÍCIO</LinkRegua>
          </footer>
        </article>
      </div>
    </>
  );
}
