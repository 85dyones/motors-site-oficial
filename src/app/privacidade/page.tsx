import type { Metadata } from "next";
import Link from "next/link";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { LinkRegua, Rotulo } from "../../components/modernist/primitivos";
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
const ULTIMA_ATUALIZACAO = "1º de agosto de 2026";

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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

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
            </ul>
          </Secao>

          <Secao id="bases-legais" titulo="Bases legais">
            <p>
              A LGPD exige que todo tratamento tenha uma justificativa legal. As nossas são:
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-2">
              <li>
                <strong className="text-mt-ink">Consentimento</strong> — para cookies de
                publicidade e análise. Só são ativados depois que você clica em &ldquo;Aceitar&rdquo;
                no aviso de cookies, e você pode mudar de ideia a qualquer momento.
              </li>
              <li>
                <strong className="text-mt-ink">Execução de contrato e procedimentos
                preliminares</strong> — para tratar os dados que você nos envia com o objetivo de
                comprar, vender ou avaliar um veículo.
              </li>
              <li>
                <strong className="text-mt-ink">Legítimo interesse</strong> — para segurança
                do site e prevenção a fraudes.
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
              medir o desempenho dos nossos anúncios e entender como o site é usado.
            </p>
            <p>
              <strong className="text-mt-ink">Você pode se opor a qualquer momento</strong>, e a
              oposição funciona de verdade: ao clicar em &ldquo;Não quero ser rastreado&rdquo; no
              aviso, o rastreamento é interrompido e os identificadores de campanha guardados no
              seu navegador são apagados na hora. O site continua funcionando igual, e a sua
              escolha fica registrada para as próximas visitas neste dispositivo.
            </p>
            {/* Este parágrafo entrou em 28/08 e não é redação: ele descreve o
                que `lib/telemetry.ts` passou a fazer na mesma rodada. Se a
                gravação na chegada voltar a esperar o aceite, este texto tem de
                sair junto — política e código contando histórias diferentes é
                pior do que qualquer das duas escolhas. */}
            <p>
              Uma exceção, para você saber exatamente o que acontece: quando você chega ao site
              por um anúncio, o endereço traz um código que identifica de qual anúncio veio o
              clique (por exemplo <code>gclid</code> ou <code>fbclid</code>).{" "}
              <strong className="text-mt-ink">Esse código é guardado no seu navegador assim que
              você chega, antes da sua resposta ao aviso</strong> — é o que nos permite saber
              qual anúncio funcionou caso você aceite mais tarde, inclusive numa visita futura.
              Ele fica só no seu dispositivo e não é enviado a ninguém enquanto você não
              enviar um formulário por vontade própria.{" "}
              <strong className="text-mt-ink">Se você recusar, ele é apagado na hora.</strong>
            </p>
            <p>Se você aceitar, usamos:</p>
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
            <p>
              Para revogar o consentimento, apague os dados de navegação (cookies e armazenamento
              local) deste site no seu navegador. O aviso aparecerá de novo na próxima visita e você
              poderá recusar.
            </p>
          </Secao>

          <Secao id="compartilhamento" titulo="Com quem compartilhamos">
            <p>
              <strong className="text-mt-ink">Não vendemos seus dados.</strong> Compartilhamos
              apenas com quem é necessário para o site funcionar:
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-2">
              <li>
                <strong className="text-mt-ink">Google e Meta</strong> — dados de navegação e
                identificadores embaralhados, para medição de anúncios, mediante seu consentimento.
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
            <p>
              Você pode pedir a eliminação a qualquer momento, pelos canais da seção{" "}
              <a href="#contato" className="underline underline-offset-2">
                Como falar conosco
              </a>
              . Atendido o pedido, o registro é apagado — não fica cópia em nossa base.
            </p>
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
