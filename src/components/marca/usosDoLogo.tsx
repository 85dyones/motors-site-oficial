import LogoAnimado from "./LogoAnimado";
import LogoAoEntrarNaTela from "./LogoAoEntrarNaTela";

/**
 * Onde o logo animado aparece no site, e de que tamanho (07/10/2026).
 *
 * São quatro usos, todos componentes de servidor. O cabeçalho e o rodapé são
 * "use client" e por isso RECEBEM o seu logo pronto do layout raiz
 * (`layout.tsx`): importado lá dentro, o desenho iria para o JavaScript de
 * todas as páginas.
 *
 * Histórico: a primeira versão (PR #247) tinha o logo grande fechando a home
 * e /sobre. O dono pediu, no mesmo dia, que ele virasse um detalhe do
 * tamanho do cabeçalho e do rodapé em todo o site, e que o grande ficasse só
 * na entrada de /sobre.
 */

/**
 * O logo do cabeçalho, na altura da barra.
 *
 * Toca uma vez quando a página abre, só com CSS. O layout raiz não é
 * remontado na troca de página, então ele não repete a cada clique no menu:
 * só em carga inteira. É curto (2,8 s) porque durante a animação a barra fica
 * sem logo, e a barra é a primeira coisa que o visitante olha.
 *
 * A largura é a do SVG antigo: a 40 px de altura o desenho ocupa 80 px, e a
 * régua de `lib/menuDoCabecalho.ts` foi medida com esse número.
 */
export function LogoDaBarra({ className }: { className: string }) {
  return <LogoAnimado tema="escuro" simples tocar traco={14} duracao={2.8} className={className} />;
}

/** O logo do rodapé: o mesmo detalhe, tocando quando o rodapé entra na tela. */
export function LogoDoRodape() {
  return (
    <LogoAoEntrarNaTela className="w-[112px]">
      <LogoAnimado tema="escuro" simples traco={12} duracao={3.2} />
    </LogoAoEntrarNaTela>
  );
}

/**
 * A abertura de /sobre: o logo grande, com a animação inteira, no topo da
 * página que fala da loja.
 *
 * A faixa tem o fundo do cabeçalho e encosta nele. Toca ao abrir, só com
 * CSS. O `<h1>` da página continua sendo texto, logo abaixo, e é ele o LCP.
 */
export function AberturaDaMotors() {
  return (
    <div className="bg-mt-inverso-fundo px-6 py-10 lg:py-14" data-abertura-da-motors>
      <LogoAnimado tema="escuro" tocar className="mx-auto w-[min(78vw,420px)]" />
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
