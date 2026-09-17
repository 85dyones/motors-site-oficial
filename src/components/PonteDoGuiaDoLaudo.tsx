import Link from "next/link";
import { TEXTO_PONTE_DO_GUIA } from "../lib/textoDoLaudo";
import { criarLinkador } from "../lib/linksNoTexto";

/**
 * A linha que leva a ficha ao guia do laudo.
 *
 * Existe como componente, e não como `<p>` solto nas duas pontas da PDP, por
 * dois motivos:
 *
 * 1. a trava de conteúdo (`tests/coerencia-da-pericia.test.ts`) RENDERIZA o
 *    bloco do laudo e lê o texto que chega na tela — o mesmo desenho vale
 *    aqui, e um teste próprio (`tests/links-entre-guias.test.ts`) confere que
 *    a âncora sai com `href` para a peça;
 * 2. a frase aparece nos DOIS blocos da ficha, o do laudo aprovado e o
 *    pendente. Duas cópias de texto no JSX viram duas redações na primeira vez
 *    que alguém mexer numa delas.
 *
 * O link não é escrito aqui: quem decide é `TERMOS_COM_DESTINO`, e o
 * `criarLinkador` é local ao componente porque a régua é uma âncora por
 * destino, e é o que se quer — a ficha inteira não deve virar um tapete de
 * links para o mesmo guia.
 */
export default function PonteDoGuiaDoLaudo({ className }: { className?: string }) {
  const linkar = criarLinkador();
  return (
    <p className={className}>
      {linkar(TEXTO_PONTE_DO_GUIA).map((parte, i) =>
        parte.href ? (
          <Link
            key={i}
            href={parte.href}
            className="underline decoration-brand-primary/40 underline-offset-2 hover:decoration-brand-primary"
          >
            {parte.texto}
          </Link>
        ) : (
          <span key={i}>{parte.texto}</span>
        ),
      )}
    </p>
  );
}
