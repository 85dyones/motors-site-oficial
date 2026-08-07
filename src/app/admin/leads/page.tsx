import LeadsKanban from "../../../components/admin/LeadsKanban";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leads — Motors Showcase",
  description: "Contatos enviados pelo site, por etapa de atendimento.",
};

export default function LeadsPage() {
  return <LeadsKanban />;
}
