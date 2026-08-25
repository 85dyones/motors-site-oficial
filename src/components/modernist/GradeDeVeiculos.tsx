import type { Veiculo } from "../../types";
import { getVeiculoPdpUrl } from "../../lib/supabase";
import { CardVeiculo } from "./primitivos";

/**
 * A grade de cards, renderizada no servidor.
 *
 * Existe por um motivo específico: `Catalogo` é client component e usa
 * `useSearchParams()`. Dentro de um `<Suspense>`, isso faz o Next entregar
 * apenas o FALLBACK no HTML estático — a grade real só aparece depois do
 * JavaScript. Medido em produção em 2026-08-25: `/estoque` respondia sem um
 * único link de veículo.
 *
 * A rodada anterior resolveu metade (título, trilha, `ItemList` e o índice de
 * marcas passaram para o servidor). Esta resolve a outra: a grade vira o
 * **fallback** do `<Suspense>`. É o único lugar dentro daquele boundary que o
 * servidor de fato renderiza, e ainda ganha o papel que um fallback deveria ter
 * — mostrar o conteúdo, não um retângulo vazio de 60vh.
 *
 * Quem lê sem executar JavaScript vê a vitrine; quem executa vê o `Catalogo`
 * assumir com filtro e ordenação. Os dois veem a mesma grade.
 */
export default function GradeDeVeiculos({
  veiculos,
  /** Quantos cards recebem `priority` — os que costumam nascer acima da dobra. */
  prioritarios = 3,
}: {
  veiculos: Veiculo[];
  prioritarios?: number;
}) {
  if (veiculos.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-11">
      {veiculos.map((v, i) => (
        <CardVeiculo
          key={v.id}
          veiculo={v}
          href={getVeiculoPdpUrl(v)}
          etiqueta={v.status_tag || undefined}
          contagemFotos={
            v.web_full_images?.length ? `${v.web_full_images.length} fotos` : undefined
          }
          prioridade={i < prioritarios}
        />
      ))}
    </div>
  );
}
