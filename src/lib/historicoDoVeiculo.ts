/**
 * O histórico de alterações do veículo (`historico_veiculo`), como as telas do
 * painel o mostram. Saiu do `EditorDeVeiculo` em 01/10, quando a visão só de
 * leitura (`VisaoDoVeiculo`) passou a mostrar o mesmo histórico.
 */

export interface LinhaDeHistorico {
  id: string;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  autor_nome: string | null;
  registrado_em: string;
}

/** Rótulo legível para o nome de coluna que o histórico grava. */
export const NOME_DO_CAMPO: Record<string, string> = {
  placa: "Placa",
  motor: "Motor",
  cor_interna: "Cor interna",
  modelo_override: "Modelo",
  versao_override: "Versão",
  donos_anteriores: "Donos anteriores",
  garantia_fabrica: "Garantia de fábrica",
  preco_compra: "Preço de compra",
  preco: "Preço efetivo",
  preco_original: "Preço anunciado",
  preco_promocional: "Preço promocional",
  descricao: "Descrição",
  descricao_seo: "Descrição para portais",
  laudo_pericia: "Laudo cautelar",
  opcionais: "Opcionais",
  status_tag: "Tag de destaque",
  status_tag_color: "Cor da tag",
  em_preparacao: "Em preparação",
  previsao_chegada_em: "Previsão de chegada ao pátio",
  vendido: "Disponibilidade",
  // A trilha de quem pôs no ar e quem tirou. `aplicarNosVeiculos` já registra
  // autor e horário de qualquer campo — sem o rótulo, a linha sairia como
  // "estado_cadastro" no meio de uma lista em português.
  estado_cadastro: "Publicação",
  tipo: "Carroceria",
  perfil_uso: "Perfil de uso",
  perfis_uso: "Para que serve",
  whatsapp_images: "Fotos (galeria e anúncio)",
  web_full_images: "Fotos (card e vitrine)",
  url_imagem: "Foto de capa",
};

/** Colunas cujo valor é lista de URL — o histórico conta, não transcreve. */
const CAMPOS_DE_LISTA_DE_FOTO = new Set(["whatsapp_images", "web_full_images"]);

/** Encurta valor longo (descrição, opcionais) para caber na linha. */
export const resumir = (v: string | null, campo?: string) => {
  if (v === null || v === "") return "vazio";
  if (v === "true") return "vendido";
  if (v === "false") return "disponível";
  // Array de URL vira "12 fotos". `aplicarNosVeiculos` grava o valor com
  // `String(array)`, o que produz 1.700 caracteres de URL colados por vírgula:
  // transcrever isso na trilha não conta nada a ninguém, e o que importa
  // ("eram 6, ficaram 12") cabe em duas palavras.
  if (campo && CAMPOS_DE_LISTA_DE_FOTO.has(campo)) {
    const n = v.split(",").filter((u) => u.trim() !== "").length;
    return n === 1 ? "1 foto" : `${n} fotos`;
  }
  return v.length > 40 ? v.slice(0, 40) + "…" : v;
};


/**
 * As linhas que esta pessoa pode ler. O preço de compra é o campo que o painel
 * esconde de quem não vê custo (a tela nem desenha o campo); a linha dele no
 * histórico contaria o valor do mesmo jeito, então sai para quem não pode ver.
 */
export function historicoVisivel<T extends Pick<LinhaDeHistorico, "campo">>(
  linhas: T[],
  { podeVerCusto }: { podeVerCusto: boolean },
): T[] {
  return podeVerCusto ? linhas : linhas.filter((l) => l.campo !== "preco_compra");
}
