import LeituraCampanha from "../../../../../components/marketing/LeituraCampanha";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leitura da Campanha — Motors Showcase",
  description: "Instrumentos com faixa saudável, maturidade da leitura e diagnóstico.",
};

export default async function LeituraCampanhaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LeituraCampanha campanhaId={id} />;
}
