import LogoAnimado from "./LogoAnimado";
import LogoAoEntrarNaTela from "./LogoAoEntrarNaTela";

/**
 * O fecho: o logo grande que se acende quando o visitante chega ao fim da
 * página (07/10/2026).
 *
 * Entra como último bloco da home e de /sobre, as duas páginas que falam da
 * loja e não de um carro. Tem o fundo do rodapé e encosta nele, então na tela
 * é o topo do rodapé; o `Footer` tira o logo pequeno nessas rotas para o
 * desenho não aparecer duas vezes (a lista é `ROTAS_COM_FECHO`, em
 * `lib/fechoComLogo.ts`).
 *
 * Por que no fim e não na capa: a capa da home é a foto do carro e o `<h1>`,
 * e é ela que conta para o LCP. Uma abertura animada ali atrasaria as duas
 * coisas que o visitante veio ver. No fim da página ela não disputa com nada.
 *
 * Por que na página e não dentro do `Footer`: o rodapé é "use client" e é
 * montado pelo layout raiz, que não sabe em que rota está. Passado por lá, o
 * desenho viajaria no HTML de todas as páginas, inclusive catálogo e ficha,
 * para aparecer em duas.
 */
export default function FechoComLogo() {
  return (
    <div className="bg-mt-inverso-fundo px-6 pt-14 lg:px-10 lg:pt-16" data-fecho-com-logo>
      <div className="mx-auto max-w-[1600px] border-b border-mt-inverso-regua-fina pb-12 lg:pb-14">
        <LogoAoEntrarNaTela className="mx-auto w-[min(78vw,420px)]">
          <LogoAnimado tema="escuro" />
        </LogoAoEntrarNaTela>
      </div>
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
