import LogoAnimado from "./LogoAnimado";
import LogoAoPassarOMouse from "./LogoAoPassarOMouse";

/**
 * Onde o logo animado aparece no site, e de que tamanho.
 *
 * São quatro usos, todos componentes de servidor. O cabeçalho e o rodapé são
 * "use client" e por isso RECEBEM o seu logo pronto do layout raiz
 * (`layout.tsx`): importado lá dentro, o desenho iria para o JavaScript de
 * todas as páginas.
 *
 * Histórico, porque a direção mudou duas vezes:
 * - 07/10 (PR #247): logo grande fechando a home e /sobre.
 * - 07/10 à noite: o dono pediu o logo no cabeçalho e no rodapé. A primeira
 *   leitura (tocar na carga da página, em tamanho novo no rodapé) estava errada.
 * - 08/10, a intenção dele: o logo fica no LUGAR e no TAMANHO de sempre, nos
 *   dois, e anima quando o mouse passa por cima. O grande, com a animação
 *   inteira, fica só na entrada de /sobre.
 */

/**
 * O logo do cabeçalho: o vertical, 80 × 40 no desktop e 72 × 36 na barra
 * compacta, as medidas do SVG que ele substitui. A régua de
 * `lib/menuDoCabecalho.ts` foi medida com elas e não muda.
 */
export function LogoDaBarra({ className }: { className: string }) {
  return (
    <LogoAoPassarOMouse className={`block ${className}`}>
      <LogoAnimado tema="escuro" simples traco={14} duracao={2.6} />
    </LogoAoPassarOMouse>
  );
}

/**
 * O logo do rodapé: o HORIZONTAL, 191 × 32, como o SVG que estava lá. O
 * arranjo horizontal tem a proporção do arquivo da marca.
 */
export function LogoDoRodape() {
  return (
    <LogoAoPassarOMouse className="block w-[191px]">
      <LogoAnimado tema="escuro" simples arranjo="horizontal" traco={12} duracao={2.6} />
    </LogoAoPassarOMouse>
  );
}

/**
 * A abertura de /sobre: o logo grande, com a animação inteira e no tempo do
 * projeto de design (8,2 s), no topo da página que fala da loja.
 *
 * A faixa tem o fundo do cabeçalho e encosta nele. Toca ao abrir, só com
 * CSS. O `<h1>` da página continua sendo texto, logo abaixo, e é ele o LCP.
 */
export function AberturaDaMotors() {
  return (
    <div className="bg-mt-inverso-fundo px-6 py-12 lg:py-16" data-abertura-da-motors>
      <LogoAnimado tema="escuro" tocar duracao={8.2} className="mx-auto w-[min(86vw,560px)]" />
    </div>
  );
}

/**
 * O logo das telas de acesso (/login, /recuperar-senha, /definir-senha).
 *
 * Substitui o nome em texto com a barra ferrugem ao lado, que não faz parte
 * da marca e já tinha saído do cabeçalho e do rodapé em 29/09. Toca uma vez
 * quando a tela abre, só com CSS. Sem câmera: em 168 px ela só cortaria o
 * desenho. O traço é mais grosso pelo mesmo motivo.
 */
export function LogoDoAcesso() {
  return <LogoAnimado tema="auto" tocar camera={false} traco={7} duracao={4.2} className="w-[168px] select-none" />;
}
