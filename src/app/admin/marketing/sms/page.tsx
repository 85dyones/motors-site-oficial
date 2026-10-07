import { redirect } from "next/navigation";
import CampanhasDeSms from "../../../../components/marketing/sms/CampanhasDeSms";
import {
  MIGRACAO_DAS_CAMPANHAS_DE_SMS,
  autorizarCampanhasDeSms,
  configuracaoDoSms,
  lerCampanhasDeSms,
  lerCarrosParaCampanha,
} from "../../../../lib/smsCampanhas-servidor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Campanhas de SMS — Motors Store",
  description: "SMS com link para a ficha de um carro, para quem já demonstrou interesse: criação, envio e funil de cada campanha.",
};

/**
 * `/admin/marketing/sms` — criar campanhas de SMS por veículo e ver a lista
 * com o funil de cada uma (pedido do dono em 07/10/2026).
 *
 * Página fina: autoriza, lê e entrega. A leitura é com o cliente de serviço
 * (`porta.admin`), porque o público sai de `leads`, que o papel Marketing não
 * lê; o que desce para a tela é contagem.
 *
 * O 503 da porta é "falta SUPABASE_SERVICE_ROLE_KEY": a pessoa TEM o papel, e
 * mandá-la de volta ao painel esconderia o motivo. A tela abre com o aviso.
 */
export default async function CampanhasDeSmsPage() {
  const porta = await autorizarCampanhasDeSms();
  if (!porta.ok && porta.status !== 503) redirect(porta.status === 401 ? "/login" : "/admin");

  const configuracao = configuracaoDoSms();

  if (!porta.ok) {
    return (
      <CampanhasDeSms
        leitura={{ ok: false, faltaMigracao: false, motivo: porta.motivo }}
        carros={[]}
        configuracao={configuracao}
        migracao={MIGRACAO_DAS_CAMPANHAS_DE_SMS}
        semChaveDeServico
      />
    );
  }

  const [leitura, carros] = await Promise.all([lerCampanhasDeSms(porta.admin), lerCarrosParaCampanha(porta.admin)]);

  return <CampanhasDeSms leitura={leitura} carros={carros} configuracao={configuracao} migracao={MIGRACAO_DAS_CAMPANHAS_DE_SMS} />;
}
