import type { Metadata } from "next";
import Link from "next/link";
import AutoAvaliacao from "../../components/AutoAvaliacao";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { blocoJsonLd, schemaDeTrilha } from "../../lib/schemaListagem";
import { schemaDaLoja } from "../../lib/schemaLoja";

const CAMINHO = "/avaliacao";

// "Um consultor retorna no WhatsApp", e não um prazo em minutos: a loja não
// mede tempo de retorno, e `promessa-publica` guarda essa linha em toda
// superfície de cliente. A frase com "menos de 10 minutos" é a versão anterior
// e não volta.
const DESCRICAO =
  "Dados oficiais da Tabela FIPE cruzados com o giro real do nosso estoque. Um consultor retorna no WhatsApp com a proposta.";

/**
 * Para onde a página manda quem terminou — ou quem desistiu no meio.
 *
 * Até 2026-09-05 esta era a única página comercial do site sem **nenhum** link
 * de saída: `AutoAvaliacao.tsx` tem 1441 linhas e zero `href`. Quem chegava
 * aqui só saía pelo rodapé, pelo voltar do navegador ou pelo WhatsApp — e o
 * crawler, que não tem nenhum dos três, tratava a página como beco sem saída.
 *
 * Os três destinos são os que respondem à pergunta seguinte de quem avalia um
 * carro: o que eu compro com isso, como eu pago a diferença, e o que vem com o
 * carro que eu levar.
 */
const DEPOIS_DA_AVALIACAO = [
  {
    rotulo: "Ver o estoque",
    href: "/estoque",
    apoio: "O que entrou depois da perícia — seu usado vale como entrada em qualquer um.",
  },
  {
    rotulo: "Simular financiamento",
    href: "/financiamento",
    apoio: "A diferença entre o seu carro e o próximo, parcelada com análise em vários bancos.",
  },
  {
    rotulo: "Garantia e laudo cautelar",
    href: "/garantia",
    apoio: "O que cobre motor e câmbio, e onde fica o laudo de cada veículo.",
  },
];

// Sem `openGraph` próprio esta rota herdava o do layout raiz — compartilhar a
// avaliação mostrava o título e a descrição da home, como se fosse ela.
export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();

  return {
    title: "Avaliação Express — quanto vale o seu carro | Motors Store",
    description: DESCRICAO,
    alternates: { canonical: CAMINHO },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "avaliacao",
      caminho: CAMINHO,
    }),
  };
}

/**
 * Tela 05 — Avaliação Express.
 *
 * A rota não põe moldura no funil: as duas colunas do design doc (formulário à
 * esquerda, prévia do resultado na faixa escura à direita) vivem dentro do
 * `AutoAvaliacao`, porque a prévia depende do valor que a consulta FIPE
 * devolve enquanto o usuário preenche. O `<h1>` vai junto.
 *
 * O que a rota põe é o que está FORA do funil e não podia entrar num componente
 * client: a trilha, o grafo e a saída. Envolver em vez de editar é deliberado —
 * `AutoAvaliacao` é o formulário de produção, com webhook, Turnstile e
 * tracking, e a conversão de compra de estoque depende dele.
 *
 * ---------------------------------------------------------------------------
 * O nó da loja sai sem `priceRange`, e isso é escolha
 * ---------------------------------------------------------------------------
 * `/garantia` e `/financiamento` chamam `recortesDoEstoque()` para calcular a
 * faixa de preço do `AutoDealer`. Aqui não. Desde `4c83ceb` a leitura de
 * estoque que falha **para a página** em vez de fingir pátio vazio — o que está
 * certo numa vitrine e é caro nesta: `/avaliacao` é a captação de estoque, e o
 * formulário não precisa do banco para funcionar. Trocar a disponibilidade
 * desta página por um campo opcional do schema seria um mau negócio.
 *
 * O nó continua completo no que sustenta o SEO local — endereço, `geo`,
 * horário, `sameAs`, `areaServed`. Só a faixa de preço fica de fora.
 */
export default async function AvaliacaoPage() {
  const { companySettings } = await getCachedSettings();

  const jsonLd = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Avaliação Express", caminho: CAMINHO },
    ]),
    schemaDaLoja(companySettings),
  ]);

  return (
    <div className="flex flex-col bg-mt-bg font-modernist text-mt-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <nav
        aria-label="Trilha"
        className="px-[18px] pt-8 text-[11px] font-semibold tracking-[.16em] text-mt-neutral-600 lg:px-11 lg:pt-11"
      >
        <Link href="/" className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink">
          HOME
        </Link>
        {" / "}
        <span className="uppercase text-mt-ink">Avaliação Express</span>
      </nav>

      <AutoAvaliacao />

      <section className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-11">
        <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">Depois da avaliação</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {DEPOIS_DA_AVALIACAO.map((destino) => (
            <Link
              key={destino.href}
              href={destino.href}
              className="mt-foco group flex flex-col gap-2 border border-mt-regua p-4 no-underline hover:border-mt-accent"
            >
              <span className="text-[12px] font-extrabold uppercase tracking-[.06em] text-mt-ink">
                {destino.rotulo}
              </span>
              <span className="text-[12px] leading-relaxed text-mt-neutral-800">
                {destino.apoio}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
