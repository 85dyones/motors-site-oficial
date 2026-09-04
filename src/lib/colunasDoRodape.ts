import type { CompanySettings } from "../types";
import { PERFIL_NO_GOOGLE } from "./schemaLoja";
import { linkWhatsApp, telefoneVisivel } from "./whatsapp";

/**
 * As três colunas de contato do rodapé, como dado.
 *
 * Estavam montadas dentro de `components/Footer.tsx`, que é client component e
 * usa `useTheme()` — e por isso a única guarda possível era ler a fonte. A
 * revisão de 2026-09-04 mostrou o preço disso: o teste afirmava que o
 * IDENTIFICADOR `PERFIL_NO_GOOGLE` aparecia ao lado do endereço, e não o valor
 * dele. Um `import { ID_DA_LOJA as PERFIL_NO_GOOGLE }` deixava o endereço do
 * rodapé apontando para `motorsstore.com.br/#dealer` — âncora que não existe,
 * em toda página do site — com `tsc` limpo e os 1862 testes verdes.
 *
 * Aqui a decisão é função pura: o teste compara o `href` com a URL de verdade,
 * e apelido de import não engana comparação de string.
 */

export interface ItemDoRodape {
  rotulo: string;
  href: string | null;
  /** Marca as rotas de contato que disparam `Contact` no clique. */
  contato?: "whatsapp" | "phone";
  /**
   * Nome acessível, quando o rótulo sozinho não diz para onde o link vai.
   *
   * O endereço é o caso: fora do contexto visual da coluna "LOCALIZAÇÃO" —
   * que é `<div>` estilizado, sem heading e sem associação programática com a
   * lista — "Rua Ernesto Piazzetta, 98…" não informa que ali se abre um mapa.
   */
  rotuloAcessivel?: string;
}

export interface ColunaDoRodape {
  titulo: string;
  itens: ItemDoRodape[];
}

export function colunasDoRodape(companySettings: CompanySettings): ColunaDoRodape[] {
  return [
    {
      titulo: "INSTITUCIONAL",
      itens: [
        { rotulo: "Quem somos", href: "/sobre" },
        { rotulo: "Garagem Profiler", href: "/carro-perfeito" },
        { rotulo: "Avaliação Express", href: "/avaliacao" },
        { rotulo: "Financiamento", href: "/financiamento" },
        { rotulo: "Garantia", href: "/garantia" },
        { rotulo: "Privacidade & LGPD", href: "/privacidade" },
      ],
    },
    {
      titulo: "ATENDIMENTO",
      itens: [
        {
          rotulo: companySettings.phone,
          href: `tel:${(companySettings.phone || "").replace(/\D/g, "")}`,
          contato: "phone",
        },
        {
          // Rótulo e link saem do MESMO campo (`lib/whatsapp.ts`). Vinham de
          // dois: o texto de `companySettings.whatsapp`, o href de
          // `whatsappRaw`. Em 2026-08-25 o HTML servido da home mostrava
          // "(41) 99842-6127" com um wa.me para 5541997372165 — número na tela
          // diferente do número que o botão abre.
          rotulo: `WhatsApp ${telefoneVisivel(companySettings)}`,
          href: linkWhatsApp(companySettings),
          contato: "whatsapp",
        },
        { rotulo: companySettings.hours, href: null },
      ],
    },
    {
      titulo: "LOCALIZAÇÃO",
      itens: [
        {
          // O endereço era texto morto em todas as páginas. Agora aponta para
          // o Perfil da Empresa no Google — onde estão o mapa, as rotas e as
          // avaliações — e é o link que faltava para o buscador juntar o site
          // com a ficha. O porquê da forma `?cid=` está em `lib/schemaLoja.ts`.
          //
          // ATENÇÃO ao par rótulo/link: o rótulo sai do painel e o link é o
          // CID de um lugar fixo. Hoje concordam. Se alguém editar o endereço
          // nas configurações e a loja de fato mudar, o rótulo acompanha e o
          // link fica apontando para a entidade antiga — em silêncio, que é o
          // molde do defeito que `tests/nap-unico.test.ts` existe para pegar.
          // A trava está lá: o teste do CID afirma o endereço padrão junto.
          rotulo: companySettings.address,
          href: PERFIL_NO_GOOGLE,
          rotuloAcessivel: `${companySettings.address} — abrir no Google Maps`,
        },
        {
          rotulo: companySettings.instagramUsername || companySettings.instagram,
          href: companySettings.instagram || null,
        },
      ],
    },
  ];
}
