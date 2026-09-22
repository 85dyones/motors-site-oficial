import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { getCachedSettings } from "../../../../lib/settings";
import { classificarEstado, versaoParaExibir, type LinhaDeEstoque } from "../../../../lib/estoqueTabela";
import { mapVeiculoDbToVeiculo } from "../../../../lib/supabase";
import CuradoriaDeDestaques from "../../../../components/admin/CuradoriaDeDestaques";
import { idsDaTvComHeranca } from "../../../../lib/destaquesDoPainel";

export const dynamic = "force-dynamic";

/**
 * O formato mínimo que este mapeamento precisa do registro cru do banco:
 * exatamente o que `classificarEstado` lê, mais o `id`. Extraído do PARÂMETRO
 * dela (`Parameters<...>`) em vez de redigitado — se a assinatura ganhar um
 * campo nunca, este tipo acompanha sozinho, em vez de discordar em silêncio.
 * Evita o `any` sem precisar mexer em `mapVeiculoDbToVeiculo`, que aceita
 * qualquer formato de propósito.
 */
type LinhaBruta = Parameters<typeof classificarEstado>[0] & { id: string | number };

export const metadata = {
  title: "Destaques — Motors Store",
  description: "Ordem e curadoria do banner da home, da grade da semana e da TV do showroom.",
};

/**
 * A tela de curadoria. Irmã de `/admin/site/areas` — mesmo molde de setas e de
 * publicação.
 *
 * Lê o estoque INTEIRO, e não só o publicado: a lista gravada pode conter
 * carros que já saíram do ar, e é justamente para poder mostrá-los (e
 * limpá-los) que eles precisam chegar aqui.
 */
export default async function DestaquesPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data: brutos }, settings] = await Promise.all([
    supabase.from("estoque_motors").select("*"),
    getCachedSettings(),
  ]);

  const linhas: LinhaDeEstoque[] = ((brutos ?? []) as LinhaBruta[]).map((bruto) => {
    const v = mapVeiculoDbToVeiculo(bruto);
    const promocional = Number(v.preco_promocional || 0);
    const cheio = Number(v.preco_original || 0);
    return {
      id: String(bruto.id),
      marca: v.marca,
      modelo: v.modelo,
      versao: versaoParaExibir(v.modelo, v.versao),
      preco: promocional > 0 && promocional < cheio ? promocional : cheio || null,
      estado: classificarEstado(bruto),
    } as unknown as LinhaDeEstoque;
  });

  const lista = (valor: unknown): string[] =>
    Array.isArray(valor) ? (valor as string[]).map(String) : [];

  // A TV NÃO usa `lista(...)` como as outras duas: ela passa pela casa única da
  // herança. Enquanto a linha `vitrine_tv` não existir no banco, quem está no ar
  // pela TV são os ids de `carousel_vehicles` — e é esses que esta tela precisa
  // carregar. Lendo o campo cru, a seção abria VAZIA afirmando que a TV estava
  // paginando o estoque (mentira: mostrava 4 carros curados), e daí bastava o
  // dono mexer só no banner e publicar para o POST levar `vitrineTv: []`,
  // gravar a linha vazia e trocar os 4 curados pelos 6 primeiros do estoque na
  // TV do showroom, em silêncio. Com a herança aqui, essa primeira publicação
  // vira no-op para a TV: carrega 4, publica os mesmos 4. Ver
  // `idsDaTvComHeranca`.
  const tvInicial = idsDaTvComHeranca(settings);

  return (
    <CuradoriaDeDestaques
      bannerInicial={lista(settings.carouselVehicleIds)}
      gradeInicial={lista(settings.destaquesDaSemana)}
      tvInicial={tvInicial}
      linhas={linhas}
    />
  );
}
