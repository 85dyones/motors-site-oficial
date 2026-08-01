import type { Metadata } from "next";
import Link from "next/link";
import { getCachedSettings } from "../../lib/settings";
import type { CompanySettings } from "../../types";

export const metadata: Metadata = {
  title: "Política de Privacidade e LGPD | Motors Store",
  description:
    "Como a Motors Store coleta, usa e protege seus dados pessoais. Cookies, publicidade, compartilhamento com terceiros e seus direitos como titular sob a LGPD.",
  alternates: {
    canonical: "/privacidade",
  },
  openGraph: {
    title: "Política de Privacidade e LGPD | Motors Store",
    description:
      "Como a Motors Store coleta, usa e protege seus dados pessoais, e como exercer seus direitos sob a LGPD.",
    url: "/privacidade",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Política de Privacidade e LGPD | Motors Store",
    description:
      "Como a Motors Store coleta, usa e protege seus dados pessoais, e como exercer seus direitos sob a LGPD.",
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://motors-site-oficial.vercel.app/",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Política de Privacidade",
      item: "https://motors-site-oficial.vercel.app/privacidade",
    },
  ],
};

// Data da última revisão do texto. Atualizar sempre que o conteúdo mudar —
// a LGPD espera que o titular consiga saber qual versão aceitou.
const ULTIMA_ATUALIZACAO = "1º de agosto de 2026";

function Secao({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 flex flex-col gap-3">
      <h2 className="text-brand-text font-bold text-base sm:text-lg tracking-wide">{titulo}</h2>
      <div className="flex flex-col gap-3 text-sm text-brand-text/75 leading-relaxed font-light">
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

      <main className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <article className="mx-auto max-w-3xl flex flex-col gap-10">
          {/* Cabeçalho */}
          <header className="flex flex-col gap-3 border-b border-brand-card-border pb-8">
            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-widest">
              Privacidade &amp; LGPD
            </span>
            <h1 className="text-brand-text font-extrabold text-2xl sm:text-3xl tracking-tight">
              Política de Privacidade
            </h1>
            <p className="text-sm text-brand-text/75 leading-relaxed font-light">
              Esta página explica quais dados a {nome} coleta quando você navega neste site,
              por que os coletamos, com quem compartilhamos e como você pode pedir acesso,
              correção ou exclusão deles.
            </p>
            <p className="text-[11px] text-brand-text/50 mt-1">
              Última atualização: {ULTIMA_ATUALIZACAO}
            </p>
          </header>

          {/* Índice */}
          <nav aria-label="Índice desta página" className="flex flex-col gap-2">
            <h2 className="text-[10px] font-bold text-brand-text/40 uppercase tracking-widest">
              Nesta página
            </h2>
            <ol className="flex flex-col gap-1.5 text-sm text-brand-text/75 font-light">
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
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="hover:text-brand-primary hover:underline underline-offset-4 transition-colors"
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
              <strong className="text-brand-text/90">Quando você preenche um formulário.</strong>{" "}
              Nos formulários de contato, avaliação de veículo, Match de Garagem e nas solicitações
              de proposta, pedimos <strong>nome, e-mail e telefone/WhatsApp</strong>. Nos formulários
              de avaliação, também coletamos os dados do veículo que você quer vender (marca,
              modelo, ano, quilometragem, estado de conservação). Nada disso é obrigatório para
              navegar — só para ser atendido.
            </p>
            <p>
              <strong className="text-brand-text/90">Enquanto você navega.</strong> Registramos
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
                <strong className="text-brand-text/90">Atender você.</strong> Responder à sua
                mensagem, elaborar propostas, avaliar seu veículo e dar continuidade à negociação
                pelo WhatsApp ou telefone.
              </li>
              <li>
                <strong className="text-brand-text/90">Melhorar o site.</strong> Entender quais
                veículos e páginas despertam mais interesse para organizar melhor o catálogo.
              </li>
              <li>
                <strong className="text-brand-text/90">Publicidade.</strong> Medir o resultado dos
                nossos anúncios no Google e na Meta (Facebook e Instagram) e exibir anúncios mais
                relevantes para quem já visitou o site.
              </li>
              <li>
                <strong className="text-brand-text/90">Segurança.</strong> Prevenir envio automatizado
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
                <strong className="text-brand-text/90">Consentimento</strong> — para cookies de
                publicidade e análise. Só são ativados depois que você clica em &ldquo;Aceitar&rdquo;
                no aviso de cookies, e você pode mudar de ideia a qualquer momento.
              </li>
              <li>
                <strong className="text-brand-text/90">Execução de contrato e procedimentos
                preliminares</strong> — para tratar os dados que você nos envia com o objetivo de
                comprar, vender ou avaliar um veículo.
              </li>
              <li>
                <strong className="text-brand-text/90">Legítimo interesse</strong> — para segurança
                do site e prevenção a fraudes.
              </li>
              <li>
                <strong className="text-brand-text/90">Obrigação legal</strong> — para guardar
                registros que a legislação fiscal e civil exige.
              </li>
            </ul>
          </Secao>

          <Secao id="cookies" titulo="Cookies e tecnologias de rastreamento">
            <p>
              Ao entrar no site pela primeira vez, você vê um aviso perguntando se aceita cookies.
              <strong className="text-brand-text/90"> Enquanto você não aceitar, nenhuma ferramenta
              de análise ou publicidade é carregada</strong> — nem Google Analytics, nem Google Ads,
              nem Meta Pixel. Se você recusar, o site continua funcionando normalmente.
            </p>
            <p>Se você aceitar, usamos:</p>
            <ul className="list-disc pl-5 flex flex-col gap-2">
              <li>
                <strong className="text-brand-text/90">Google Analytics 4</strong> — mede audiência e
                comportamento de navegação de forma agregada.
              </li>
              <li>
                <strong className="text-brand-text/90">Google Ads</strong> — mede quais anúncios
                geraram contato. Quando você envia um formulário, seu e-mail e telefone são
                convertidos em um código embaralhado irreversível (hash) antes de sair do seu
                navegador. O Google recebe esse código, nunca o dado original.
              </li>
              <li>
                <strong className="text-brand-text/90">Meta Pixel e Conversions API</strong> — mesma
                finalidade, para anúncios no Facebook e Instagram. Parte dessas informações é enviada
                pelo seu navegador e parte pelos nossos servidores, sempre com e-mail e telefone
                embaralhados da mesma forma. Também usamos os cookies <code>_fbp</code> e{" "}
                <code>_fbc</code> para identificar de qual anúncio veio a visita.
              </li>
              <li>
                <strong className="text-brand-text/90">Cloudflare Turnstile</strong> — verifica que
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
              <strong className="text-brand-text/90">Não vendemos seus dados.</strong> Compartilhamos
              apenas com quem é necessário para o site funcionar:
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-2">
              <li>
                <strong className="text-brand-text/90">Google e Meta</strong> — dados de navegação e
                identificadores embaralhados, para medição de anúncios, mediante seu consentimento.
              </li>
              <li>
                <strong className="text-brand-text/90">Provedores de infraestrutura</strong> —
                serviços de hospedagem, banco de dados e automação que armazenam e processam os
                dados em nosso nome, seguindo nossas instruções.
              </li>
              <li>
                <strong className="text-brand-text/90">Instituições financeiras</strong> — apenas se
                você solicitar simulação ou proposta de financiamento, e somente os dados necessários
                para isso.
              </li>
              <li>
                <strong className="text-brand-text/90">Autoridades</strong> — quando houver
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
              Mantemos seus dados de contato enquanto durar o relacionamento comercial e pelo prazo
              necessário para cumprir obrigações legais, fiscais e de defesa em eventual processo.
              Dados de navegação e publicidade seguem os prazos de retenção definidos pelas próprias
              plataformas Google e Meta.
            </p>
            <p>
              Encerrada a finalidade e vencidos os prazos legais, os dados são eliminados ou
              anonimizados.
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
                    className="text-brand-primary hover:underline underline-offset-4 font-medium"
                  >
                    {email}
                  </a>
                </li>
              )}
              <li>
                Formulário:{" "}
                <Link
                  href="/contato"
                  className="text-brand-primary hover:underline underline-offset-4 font-medium"
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
                className="text-brand-primary hover:underline underline-offset-4 font-medium"
              >
                Autoridade Nacional de Proteção de Dados (ANPD)
              </a>
              .
            </p>
          </Secao>

          {/* Rodapé da página */}
          <footer className="border-t border-brand-card-border pt-6 flex flex-col gap-3">
            <p className="text-[11px] text-brand-text/50 leading-relaxed">
              Podemos atualizar esta política para refletir mudanças no site ou na legislação.
              Alterações relevantes serão sinalizadas nesta página com nova data de atualização.
            </p>
            <Link
              href="/"
              className="text-[10px] font-bold text-brand-primary hover:text-brand-primary-hover uppercase tracking-widest transition-colors w-fit"
            >
              ← Voltar ao início
            </Link>
          </footer>
        </article>
      </main>
    </>
  );
}
