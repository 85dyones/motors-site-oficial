import UserManagement from "../../../components/admin/UserManagement";

export const metadata = {
  title: "Controle de Usuários — Motors Showcase",
  description: "Gerencie o cadastro de colaboradores e níveis de permissão.",
};

export default function AdminUsuariosPage() {
  return <UserManagement />;
}
