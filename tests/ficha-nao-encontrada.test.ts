import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";

/**
 * A ficha que não existe — e por que ela deixou de ser o 404 do Next.
 *
 * ---------------------------------------------------------------------------
 * O que estava no ar
 * ---------------------------------------------------------------------------
 * `notFound()` caía no 404 padrão: *"404: This page could not be found."*, em
 * `system-ui`, em inglês, sem estilo — e, como ele renderiza DENTRO do layout
 * raiz, com o cabeçalho e o rodapé da Motors Store em volta. A moldura da
 * marca com um erro genérico em inglês no meio.
 *
 * ---------------------------------------------------------------------------
 * Quem cai aqui, e quem NÃO cai
 * ---------------------------------------------------------------------------
 * Carro vendido **não** passa por aqui, e isso foi verificado no código em
 * 2026-09-10, contra a suposição de que a janela entre a venda e a recarga do
 * feed levaria clique pago para o 404. Não leva: `vendido` é coluna de
 * `estoque_motors`, nada apaga a linha, e `getVeiculoById` não filtra por ela.
 * A ficha segue viva, responde 200 com o selo "VENDIDO" e os similares por
 * `CARENCIA_VENDIDO_DIAS`, e só depois vira 301 para o hub do modelo.
 *
 * Quem cai aqui é URL truncada por app de mensagem, link velho para um id que
 * nunca existiu e erro de digitação.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 *  1. **A página existe e fala português.** O texto padrão do Next em inglês
 *     não pode voltar por remoção do arquivo.
 *  2. **Nenhuma página termina sem saída.** É a regra que motivou o trabalho:
 *     avisar, alternativas e catálogo.
 *  3. **Zero componente novo além do obrigatório.** `PaginaDeEstoque` já faz
 *     os quatro pedaços; o único componente novo existe porque
 *     `not-found.tsx` não recebe `params` — e ele não carrega dado nenhum.
 */

const NOT_FOUND = "src/app/[categoria]/[marca]/[modelo]/[ficha]/not-found.tsx";
const SAIDA = "src/components/SaidaDaFichaSumida.tsx";

describe("a ficha que não existe", () => {
  const fonte = lerCodigo(NOT_FOUND);

  it("existe, e o corpo não é o 404 do Next em inglês", () => {
    expect(fonte.length, "o arquivo sumiu — o 404 padrão volta a aparecer").toBeGreaterThan(100);
    expect(ler(NOT_FOUND)).not.toContain("This page could not be found");
  });

  it("fala português, e diz o que aconteceu", () => {
    const texto = ler(NOT_FOUND);
    expect(texto).toContain("Este anúncio saiu do ar");
    // "não corresponde a nenhum veículo" — a explicação, não só o título.
    expect(texto).toMatch(/não corresponde a nenhum ve[íi]culo/);
  });

  it("NENHUMA página termina sem saída — as três que a regra pede", () => {
    /* `PaginaDeEstoque` com a grade VAZIA é o que desenha o bloco de saída:
       "AVISE-ME QUANDO ENTRAR", os alternativos como card de verdade com preço
       e link, e "VER TODO O ESTOQUE". Com a grade cheia ele não desenha nada —
       daí o `veiculos={[]}` ser condição, e não descuido. */
    expect(fonte).toContain("veiculos={[]}");
    expect(fonte, "sem alternativas, a página é um beco").toContain("alternativos=");
    expect(fonte, "sem o avise-me, o lead mais qualificado volta para o Google").toContain(
      "avisarHref=",
    );
    expect(fonte).toContain("SaidaDaFichaSumida");
  });

  it("reusa o componente da listagem — zero componente novo evitável", () => {
    expect(fonte).toContain("PaginaDeEstoque");
    // Cards de veículo vêm de dentro do `PaginaDeEstoque`; montar grade aqui
    // seria reimplementar o que já existe.
    expect(fonte).not.toContain("CardVeiculo");
  });

  it("leitura que falha NÃO transforma um 404 em 500", () => {
    /* `getEstoque` lança `EstoqueIndisponivelError` quando a leitura falha, e
       para a vitrine isso está certo: pátio vazio ali é mentira. Aqui a régua
       se inverte — esta página já é a resposta a um erro, e deixá-la estourar
       troca um 404 tratado por a tela de falha do site inteiro.

       O aviso não se perde: quem lança já chamou `alertarFalha` antes. */
    expect(fonte).toContain("catch");
    expect(fonte).toMatch(/return \[\]/);
  });
});

describe("a saída, derivada do caminho", () => {
  const fonte = lerCodigo(SAIDA);

  it("é cliente, e é o ÚNICO componente novo", () => {
    /* `not-found.tsx` é Server Component e não recebe `params` — a
       documentação do Next 16 é literal: "not-found.js components do not
       accept any props". `usePathname` é o caminho que a própria documentação
       aponta. O componente existe porque a plataforma obriga. */
    expect(ler(SAIDA)).toContain('"use client"');
    expect(fonte).toContain("usePathname");
  });

  it("NÃO carrega dado nenhum — só manipulação de string", () => {
    /* Prop de client component é payload público: foi assim que `preco_compra`
       vazou no `/estoque`. Aqui não há veículo, não há fetch, não há import de
       biblioteca de dados. */
    for (const proibido of ["../lib/supabase", "getEstoque", "fetch(", "Veiculo"]) {
      expect(fonte, `${proibido} põe dado numa página que só precisa de link`).not.toContain(
        proibido,
      );
    }
  });

  it("não recomenda carro a partir do slug — oferece LINK", () => {
    /* O slug é entrada NÃO confiável: quem cai aqui chegou por URL truncada ou
       digitação errada. Cascatear similares por uma marca digitada errada
       devolve um carrossel da marca errada com cara de acerto. Marca e modelo
       viram link, que o visitante confere clicando. */
    expect(fonte).toContain("<Link");
    expect(fonte).not.toMatch(/escolherSimilares|similares/i);
  });

  it("as âncoras são descritivas — nada de 'clique aqui'", () => {
    /* Lido SEM comentários, e a primeira versão deste teste provou por que:
       ela usou a leitura crua e reprovou no próprio comentário do componente,
       que cita "Clique aqui" justamente para dizer que não se usa. A nota que
       explica uma proibição quase sempre CITA o que ela proíbe — é para isso
       que `lerCodigo` existe. */
    expect(fonte).toMatch(/Ver todos os \{nomeDaMarca\}/);
    expect(fonte).not.toMatch(/clique aqui|saiba mais|ver mais/i);
  });

  it("URL curta demais não inventa marca nem modelo", () => {
    // Menos de três segmentos não é ficha, e aí não há o que oferecer — a
    // página segue com o estoque e o "ver todo o estoque", que já bastam.
    expect(fonte).toContain("partes.length < 3");
    expect(fonte).toContain("return null");
  });
});
