"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import EncomendaDeCarro from "./EncomendaDeCarro";
import { contextoDaFichaPerdida, type MarcaConhecida } from "../lib/fichaPerdida";

/**
 * A saída personalizada da página da ficha que não existe.
 *
 * ---------------------------------------------------------------------------
 * Por que este componente existe, se `EncomendaDeCarro` já existe
 * ---------------------------------------------------------------------------
 * Porque `not-found.tsx` não recebe `params` — ao contrário de `page.tsx`. Nos
 * hubs de marca e de modelo o formulário sabe o que a pessoa procurava porque a
 * ROTA sabe; aqui a rota não sabe, e a única fonte é o caminho.
 *
 * Este componente é a fina camada que lê o caminho. A decisão de verdade — o
 * que casa, o que vira link e o que vira formulário — está em
 * `lib/fichaPerdida.ts`, que é puro e tem teste. Aqui não há regra nenhuma de
 * propósito: se houvesse, ela estaria num client component atrás de
 * `usePathname`, que é o lugar mais caro do repositório para testar.
 *
 * ---------------------------------------------------------------------------
 * Link OU formulário, nunca a promessa errada
 * ---------------------------------------------------------------------------
 * `mensagemDaEncomenda` escreve, na voz do cliente e dentro do `interesse` do
 * lead: *"Vi que não tem no estoque agora — me avisem quando entrar"*. Com um
 * Nivus no pátio e um caminho `/carros/volkswagen/nivus/…`, a primeira versão
 * desta página exibia "Quando entrar Volkswagen Nivus, um consultor avisa" com
 * o Nivus visível na mesma tela — e gravava isso no banco.
 *
 * Quem resolve é `contextoDaFichaPerdida`: hub com carro devolve `hubComEstoque`
 * e um contexto vazio; hub zerado devolve o contexto e nenhum link.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ Este bloco NÃO está no HTML da primeira resposta
 * ---------------------------------------------------------------------------
 * Medido no build de produção (`next build` + `next start`, 2026-09-11):
 *
 *   curl …/carros/volkswagen/nivus/…-999999999 | grep "<form"   → nada
 *   no navegador, depois da hidratação                          → o form existe
 *
 * A causa é `usePathname` numa rota PRERENDERIZADA: o caminho não existe no
 * momento do build, então o Next adia esta subárvore para o cliente e manda
 * uma referência no payload RSC no lugar do HTML. Não é defeito e não tem
 * conserto sem abrir mão do contexto — é o preço de personalizar uma página que
 * o framework prerenderiza.
 *
 * O que isso obriga: **nenhuma saída da página pode depender deste bloco.**
 * Título, grade do pátio, recortes e o "ver todo o estoque" saem do servidor, e
 * é neles que a R5 se apoia. Este é a melhor saída, não a única — e o
 * formulário já precisava de JavaScript de qualquer forma, por causa do
 * Turnstile.
 *
 * O teste em `tests/ficha-sem-veiculo.test.ts` renderiza a árvore com
 * `usePathname` dublado: ele prova a FIAÇÃO (o índice chega, a marca certa
 * sai), não que o bloco esteja no HTML servido. Os dois fatos convivem;
 * confundi-los é ler verde onde o servidor manda vazio.
 */
export default function EncomendaDaFichaPerdida({ marcas }: { marcas: MarcaConhecida[] }) {
  const caminho = usePathname() ?? "";
  const { encomenda, hubComEstoque } = contextoDaFichaPerdida(caminho, marcas);

  return (
    <div className="grid gap-6">
      {hubComEstoque && (
        <p className="m-0 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800">
          {/* Âncora que descreve o destino (R7), e a contagem junto: quem
              procurava este carro merece saber que ainda há dele no pátio antes
              de preencher um formulário de espera.

              Sem artigo antes da contagem, de propósito. "os 2 Honda" erra o
              gênero assim que o hub é de moto, e o gênero mora em
              `lib/generoDoVeiculo` — que é do servidor e não chega aqui. A
              frase sem artigo está certa nos dois segmentos. */}
          <Link href={hubComEstoque.href} className="mt-foco underline">
            {hubComEstoque.total === 1
              ? `Ver ${hubComEstoque.rotulo} no estoque`
              : `Ver ${hubComEstoque.total} ${hubComEstoque.rotulo} no estoque`}
          </Link>
        </p>
      )}
      <EncomendaDeCarro
        marca={encomenda.marca}
        modelo={encomenda.modelo}
        caminho={encomenda.caminho}
        segmento={encomenda.segmento}
      />
    </div>
  );
}
