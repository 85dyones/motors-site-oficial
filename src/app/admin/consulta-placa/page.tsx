import { redirect } from "next/navigation";

/** O endereço antigo (06/10/2026). A tela virou "Consulta de veículos" em 08/10/2026. */
export default function ConsultaDePlacaAntiga() {
  redirect("/admin/consulta-veiculos");
}
