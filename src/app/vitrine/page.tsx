import type { Metadata } from "next";
import VitrineTV, { POR_PAGINA } from "../../components/modernist/VitrineTV";
import { getEstoque } from "../../lib/supabase";
import { disponiveisDe } from "../../lib/regrasEstoque";
import { getCachedSettings } from "../../lib/settings";
import DEFAULT_COMPANY_SETTINGS from "../../lib/companySettings.json";

/**
 * Tela 08 A do design doc — a vitrine que roda na TV do showroom.
 *
 * Não é página de site: é peça de exposição. Fora do índice de busca (nada a
 * ranquear e nada a canonizar) e sem a moldura do site, que `MolduraDoSite`
 * suprime nas rotas `/vitrine`.
 */
export const metadata: Metadata = {
  title: "Vitrine — TV do showroom",
  robots: { index: false, follow: false },
};

// A TV fica ligada o dia inteiro sem ninguém recarregar. Um minuto é o mesmo
// intervalo da home, e mantém preço e disponibilidade em dia sem martelar o
// banco.
export const revalidate = 60;

export default async function VitrinePage() {
  const [estoque, settings] = await Promise.all([getEstoque(), getCachedSettings()]);
  const empresa = settings.companySettings ?? DEFAULT_COMPANY_SETTINGS;

  const disponiveis = disponiveisDe(estoque);

  // A TV tem lista PRÓPRIA desde 2026-09-22.
  //
  // Até ali ela dividia `carousel_vehicles` com o banner da home, e os dois
  // tinham capacidades incompatíveis: o banner corta em `VAGAS.banner`, a TV
  // mostra a lista inteira paginada. Curar para um estragava o outro — medido
  // em 21/09, a lista tinha 9 ids e 5 eram carros arquivados ou vendidos.
  //
  // ⚠️ O `??` é HERANÇA, com prazo: enquanto a linha `vitrine_tv` não existir
  // no banco, a TV mostra exatamente o que mostrava antes. A primeira
  // publicação em /admin/site/destaques cria a linha, e aí esta queda pode
  // sair daqui.
  const idsDaTv = Array.isArray(settings.vitrineTv)
    ? (settings.vitrineTv as string[])
    : Array.isArray(settings.carouselVehicleIds)
      ? (settings.carouselVehicleIds as string[])
      : [];

  const curados = idsDaTv
    .map((id) => disponiveis.find((v) => v.id === id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));

  // A curadoria entra inteira: o rodapé da TV pagina de quatro em quatro, então
  // marcar sete veículos no painel expõe os sete. Antes o corte era em quatro
  // fixos e os demais nunca apareciam.
  //
  // Sem curadoria nenhuma, continua uma página só. Não é limitação técnica — é
  // que rodar o pátio inteiro a 8s por carro daria mais de dez minutos de volta
  // completa, e quem decide o que a TV mostra é a loja, curando.
  const vitrine = curados.length > 0 ? curados : disponiveis.slice(0, POR_PAGINA);

  // Só entra na rotação quem tem foto: uma célula vazia numa TV de showroom é
  // pior do que um veículo a menos no rodízio.
  const comFoto = vitrine.filter(
    (v) => (v.web_full_images?.[0] ?? v.whatsapp_images?.[0]) !== undefined,
  );

  return (
    <VitrineTV
      veiculos={comFoto.length > 0 ? comFoto : vitrine}
      totalEstoque={disponiveis.length}
      nomeLoja={empresa.name}
      telefone={empresa.phone}
    />
  );
}
