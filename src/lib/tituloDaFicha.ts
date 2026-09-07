import { nomeTemOAno } from "./nomeDoVeiculo";
import type { Publicacao } from "./publicacao";

/**
 * O que a ficha do veículo anuncia FORA da página: `<title>`, meta description
 * e o card de compartilhamento.
 *
 * ---------------------------------------------------------------------------
 * Por que isto é uma função, e não três linhas dentro do `generateMetadata`
 * ---------------------------------------------------------------------------
 * Era três linhas lá dentro, e a decisão — "carro indisponível não anuncia
 * preço" — não tinha como ser testada: `generateMetadata` precisa de `params`,
 * do Supabase e das settings. O teste possível era conferir se o texto do
 * arquivo continha certas palavras, e um teste desses não percebe quando a
 * CONDIÇÃO é neutralizada: trocar `publicacao.indisponivel` por `false` deixa
 * o arquivo com as mesmas palavras e o comportamento invertido. Foi
 * exatamente o que a mutação M5 provou.
 *
 * Aqui a decisão é chamável, e o teste passa os dois estados.
 *
 * ---------------------------------------------------------------------------
 * A decisão
 * ---------------------------------------------------------------------------
 * Durante a carência a ficha do vendido fica no ar e indexável, com o selo
 * "VENDIDO" bem visível NA PÁGINA. Só que o selo não viaja para o resultado de
 * busca nem para o card do WhatsApp — e o preço, sim. Quem via o snippet via
 * uma oferta, e a oferta não existe.
 *
 * Pior no carro que segue no feed do RevendaMais: o sync atualiza o preço a
 * cada seis horas, então o número anunciado era mantido fresco num veículo que
 * a loja já vendeu.
 *
 * O JSON-LD continua declarando `price` junto de `OutOfStock` — ali é o par
 * correto, e o schema.org espera o preço da oferta que existiu. O que muda é
 * só o texto que uma pessoa lê antes de clicar.
 */
export type TextosDaFicha = {
  /** O `<title>` da aba e do resultado de busca. */
  titulo: string;
  /** A meta description, e a descrição padrão do card. */
  descricao: string;
  /** O título do card de compartilhamento, sem o sufixo da loja. */
  tituloDoCard: string;
};

export function montarTextosDaFicha(entrada: {
  /** Já deduplicado por `montarNomeDoVeiculo` — ver o comentário lá. */
  nome: string;
  ano: number;
  /** Traços que distinguem esta ficha das outras na cauda longa. */
  cor?: string | null;
  km?: number | null;
  /** Preço formatado em reais, do promocional quando houver. */
  precoTexto: string;
  /** A descrição do carro à venda, do feed ou montada. */
  descricaoDisponivel: string;
  publicacao: Pick<Publicacao, "indisponivel" | "rotulo">;
}): TextosDaFicha {
  const { nome, ano, cor, km, precoTexto, descricaoDisponivel, publicacao } = entrada;

  if (!publicacao.indisponivel) {
    return {
      titulo: `${nome} - ${precoTexto} | Motors Store`,
      descricao: descricaoDisponivel,
      tituloDoCard: `${nome} por ${precoTexto}`,
    };
  }

  /* "Vendido" e "Indisponível" não são a mesma afirmação. O segundo é o carro
     que sumiu do feed sem a loja dizer por quê — pode ser repasse, reserva ou
     anúncio expirado —, e chamá-lo de vendido seria afirmar um fato que
     ninguém verificou. A distinção já existe em `decidirPublicacao`; aqui ela
     só é traduzida para a linguagem de quem lê. */
  const rotulo = publicacao.rotulo === "VENDIDO" ? "Vendido" : "Indisponível";

  /* A description segue DESCREVENDO o carro, e não vira uma frase de molde.
     A ficha continua indexada durante os 90 dias justamente para capturar a
     cauda longa — quem procura "Spin 2014 prata automática" ainda deve achar
     esta página e, nela, os similares. Trocar tudo por "veículo vendido, veja
     outras opções" jogaria fora o que a carência existe para preservar.
     O que some é só o preço. */
  /* O ano só entra nos traços se o nome ainda não o carregar. O RevendaMais
     embute o ano no `modelo` em parte do cadastro, do mesmo jeito que embute a
     versão, e o `nome` que chega aqui já veio deduplicado — mas só da versão.
     Medido em 2026-09-07, a ficha do Nissan March `8006476` publicava:

       Nissan March 1.6 Rio 2016 2016, preto, 90.660 km — vendido.

     A pergunta mora em `lib/nomeDoVeiculo.ts`, junto da de versão, para as
     duas não divergirem. */
  const anoNoTraco = nomeTemOAno(nome, ano) ? "" : String(ano);

  const tracos = [anoNoTraco, cor, km ? `${km.toLocaleString("pt-BR")} km` : ""]
    .filter(Boolean)
    .join(", ");

  return {
    titulo: `${nome} — ${rotulo} | Motors Store`,
    descricao:
      `${nome} ${tracos} — ${rotulo.toLowerCase()}. ` +
      "Veja opções semelhantes no estoque da Motors Store, em Bacacheri, Curitiba.",
    tituloDoCard: `${nome} — ${rotulo}`,
  };
}
