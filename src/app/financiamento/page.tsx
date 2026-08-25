import type { Metadata } from "next";
import PaginaDeEstoque from "../../components/modernist/PaginaDeEstoque";
import SimuladorDeFinanciamento from "../../components/SimuladorDeFinanciamento";
import ContagemDeEstoque from "../../components/ContagemDeEstoque";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { FAIXAS_DE_PRECO, hubsDeCarroceria, recortesDoEstoque } from "../../lib/hubsDeEstoque";
import { precoVigente } from "../../lib/regrasEstoque";
import { blocoJsonLd, schemaDeListagem, schemaDePerguntas, schemaDeTrilha } from "../../lib/schemaListagem";
import { schemaDaLoja } from "../../lib/schemaLoja";
import { PERGUNTAS_DE_FINANCIAMENTO, TEXTO_DE_FINANCIAMENTO } from "../../lib/paginasInstitucionais";

/**
 * `/financiamento` — destino da campanha 05 do plano de aquisição.
 *
 * O cluster de financiamento é classificado no §1.6 como alto volume e
 * **qualificação irregular**: sem uma página que explique como funciona, o
 * clique cai no catálogo e o visitante não encontra o que veio buscar.
 *
 * ---------------------------------------------------------------------------
 * O que esta página NÃO faz
 * ---------------------------------------------------------------------------
 * Não promete taxa, parcela fechada nem aprovação. Anúncio e página com valor
 * de parcela exigem, pela regulação de publicidade de crédito, CET, quantidade
 * de parcelas e valor total — o simulador já entrega os três e traz o aviso de
 * que a taxa depende de análise. O texto ao redor fala de processo, não de
 * número: é o que o §1.4b do plano pede e o que sustenta a conversa no balcão.
 */

export const revalidate = 3600;

const CAMINHO = "/financiamento";

export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();

  return {
    title: "Financiamento de Carro Seminovo em Curitiba | Motors Store",
    description:
      "Simule a parcela do seu seminovo em Curitiba com entrada, troca ou sem entrada. " +
      "Aprovação com múltiplos bancos, análise no mesmo dia. Loja no Bacacheri.",
    alternates: { canonical: CAMINHO },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "estoque",
      rotulo: "Financiamento",
      tituloPadrao: "Financiamento de seminovo em Curitiba",
      descricaoPadrao:
        "Monte sua parcela com o estoque real da loja e fale com um consultor pelo WhatsApp.",
      caminho: CAMINHO,
    }),
  };
}

export default async function FinanciamentoPage() {
  const [{ historico, disponiveis }, settings] = await Promise.all([
    recortesDoEstoque(),
    getCachedSettings(),
  ]);

  // A grade mostra a faixa de entrada: é quem pesquisa financiamento que mais
  // depende dela, e uma vitrine de R$ 300 mil embaixo de um simulador de
  // parcela é o tipo de descompasso que faz o visitante fechar a aba.
  const faixaDeEntrada = FAIXAS_DE_PRECO[0];
  const paraGrade = disponiveis
    .filter((v) => {
      // `precoVigente` e não o ternário à mão: é a mesma regra que a vitrine, o
      // filtro de preço e o `priceRange` do schema usam. Duas cópias dela é
      // como esta grade e `/estoque/ate-60-mil` acabam discordando sobre qual
      // carro cabe na faixa.
      const preco = precoVigente(v);
      return preco > 0 && preco < faixaDeEntrada.max;
    })
    .slice(0, 6);

  const jsonLd = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Financiamento", caminho: CAMINHO },
    ]),
    schemaDeListagem("Seminovos para financiar em Curitiba", paraGrade),
    schemaDePerguntas(PERGUNTAS_DE_FINANCIAMENTO),
    schemaDaLoja(settings.companySettings, { disponiveis }),
  ]);

  return (
    <div className="flex flex-col bg-mt-bg text-mt-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <ContagemDeEstoque total={disponiveis.length} />
      <PaginaDeEstoque
        trilha={[{ rotulo: "Home", href: "/" }]}
        titulo="Financiamento de seminovo em Curitiba"
        introducao={TEXTO_DE_FINANCIAMENTO}
        contagem={false}
        veiculos={paraGrade}
        textoSemEstoque="Sem veículos nesta faixa agora — o simulador abaixo funciona com qualquer carro do estoque."
        conteudo={<SimuladorDeFinanciamento veiculos={disponiveis} />}
        blocos={[
          {
            titulo: "Por faixa de preço",
            links: FAIXAS_DE_PRECO.map((f) => ({ rotulo: f.nome, href: `/estoque/${f.slug}` })),
          },
          {
            titulo: "Por carroceria",
            links: hubsDeCarroceria(historico, disponiveis)
              .filter((c) => c.veiculos.length > 0)
              .map((c) => ({ rotulo: c.nome, href: `/estoque/${c.slug}`, total: c.veiculos.length })),
          },
        ]}
        faq={PERGUNTAS_DE_FINANCIAMENTO}
      />
    </div>
  );
}
