import Link from "next/link";
import RecuperarSenhaForm from "../../components/RecuperarSenhaForm";
import { Rotulo } from "../../components/modernist/primitivos";

export const metadata = {
  title: "Recuperar senha — Motors Store",
  description: "Pedido de troca de senha do painel.",
  // Como /login e /definir-senha: tela de acesso não entra em busca.
  robots: { index: false, follow: false },
};

/**
 * O pedido de troca de senha.
 *
 * Página própria, e não um campo escondido no `/login`, porque o estado depois
 * do envio é outro — a tela passa a falar de caixa de entrada, não de senha.
 *
 * Não checa sessão de propósito: quem esqueceu a senha está deslogado, e quem
 * está logado e quer trocar chega aqui pelo mesmo caminho sem prejuízo.
 */
export default function RecuperarSenhaPage() {
  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center bg-mt-bg px-[18px] py-16 font-modernist text-mt-ink">
      <div className="flex w-full max-w-[380px] flex-col gap-8">
        <div className="flex items-center gap-2.5 select-none">
          <span className="h-6 w-2 shrink-0 bg-mt-accent" aria-hidden="true" />
          <span className="text-[17px] font-extrabold tracking-[.02em]">
            MOTORS<span className="font-normal text-mt-neutral-600"> STORE</span>
          </span>
        </div>

        <div className="border-t-2 border-mt-regua pt-6">
          <Rotulo accent className="text-[11px] tracking-[.18em]">
            RECUPERAR ACESSO
          </Rotulo>
          <h1 className="mt-titulo m-0 mt-3 text-[30px]">Esqueceu a senha?</h1>
        </div>

        <RecuperarSenhaForm />

        <p className="m-0 border-t border-mt-regua-fina pt-4 text-[12px] leading-relaxed text-mt-neutral-600">
          Lembrou?{" "}
          <Link href="/login" className="font-semibold text-mt-ink underline underline-offset-2">
            Voltar para a entrada
          </Link>
          . Cliente Motors entra pela{" "}
          <Link href="/garagem" className="font-semibold text-mt-ink underline underline-offset-2">
            Garagem
          </Link>
          , com link por e-mail — lá não existe senha.
        </p>
      </div>
    </div>
  );
}
