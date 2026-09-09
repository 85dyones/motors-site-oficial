import robots from "../src/app/robots";

/**
 * Os bloqueios do robots.txt, um array por grupo de user-agent.
 *
 * Existe porque três telas de acesso restrito (`/garagem`, `/definir-senha`,
 * `/recuperar-senha`) cobram, cada uma no seu arquivo, que o seu caminho esteja
 * fora de busca em TODOS os grupos. As três faziam isso lendo o fonte de
 * `src/app/robots.ts` e casando `disallow: [...]` — o que amarrava a trava à
 * grafia do arquivo em vez de ao robots.txt que sai dele.
 *
 * Em 2026-09-08 os dois grupos passaram a ler de uma constante só (era assim
 * que `/api/` e `/test` tinham ficado fechados para o Google e abertos para os
 * bots de IA). A mudança está certa e as três travas reprovaram, porque
 * `disallow: FORA_DO_RASTREIO` não é `disallow: ["..."]`. Chamando a função,
 * elas passam a afirmar a condição — e continuam valendo na próxima vez que a
 * forma de escrever a lista mudar.
 */
export function bloqueiosPorGrupo(): string[][] {
  const regras = robots().rules;
  return (Array.isArray(regras) ? regras : [regras]).map((grupo) => {
    const disallow = grupo.disallow ?? [];
    return Array.isArray(disallow) ? disallow : [disallow];
  });
}
