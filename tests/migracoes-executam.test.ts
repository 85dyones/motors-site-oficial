import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PASSOS_DO_FUNIL } from "../src/lib/funilDoProfiler";
import {
  CRITERIOS_DE_CARRO,
  CRITERIOS_DE_PUBLICO,
  DESCANSOS_EM_DIAS,
  DESTINOS_SEM_CARRO,
  JANELAS_DE_INTERESSE,
  TEMPOS_DESDE_A_COMPRA,
} from "../src/lib/smsCampanhas";
import { ORIGENS_DE_IMPORTACAO } from "../src/lib/baseDeMarketing";
import { gerarTokenDoLink, hashDoToken, tokenTemForma } from "../src/lib/linkDoRelatorio";
import { supabaseDeTeste, type Chamada, type Resposta } from "./supabaseDaConsultaDeDocumento";

/**
 * As migrações rodam de verdade — e o aceite delas é cobrado (AUDITORIA §5.7).
 *
 * Toda migração séria deste projeto carrega **autoconferência**: um bloco
 * `do $$` que levanta exceção se a promessa do arquivo não valer contra o
 * banco real. O problema é que ninguém nunca as executava antes de empurrar —
 * o aceite só era conhecido quando o `db push` rodava em PRODUÇÃO. Um erro de
 * sintaxe no meio de um `do $$`, ou uma promessa que o SQL não cumpre, só
 * aparecia lá.
 *
 * A auditoria registrou isso como bloqueio ("testes de RLS exigem instância
 * Supabase de teste... Docker não está instalado nesta máquina") e ficou
 * parado. Um Postgres local basta: o que faltava era escrever o pedaço de
 * Supabase que as migrações pressupõem — `auth.users`, `auth.uid()`, os
 * papéis do PostgREST, os default privileges do schema `public`. É o
 * `supabase/testes/andaime.sql`.
 *
 * O que este arquivo prova, a cada `npm test` numa máquina com Postgres:
 *
 *  1. a cadeia aplica limpa, na ordem, num banco do zero;
 *  2. **cada autoconferência levanta o próprio "Aceite verificado"** — não
 *     basta não explodir, o aceite tem que ter rodado;
 *  3. o estado final é o prometido: quem é staff, quem abre o financeiro,
 *     quem apaga.
 *
 * **Sem Postgres alcançável, os testes são PULADOS, não falham.** A máquina de
 * quem só mexe em front-end não precisa de banco, e um teste vermelho por
 * ausência de infraestrutura é ruído que ensina a ignorar vermelho.
 */

const RAIZ = join(__dirname, "..");
const ANDAIME = join(RAIZ, "supabase", "testes", "andaime.sql");
const DIR_MIGRACOES = join(RAIZ, "supabase", "migrations");
const BANCO = "motors_teste";

/**
 * A cadeia coberta hoje: papéis e financeiro. É uma lista EXPLÍCITA porque o
 * andaime é um recorte — varrer a pasta inteira faria o teste falhar em
 * migração que toca tabela que o andaime não tem, e o vermelho seria sobre o
 * andaime, não sobre a migração.
 *
 * Acrescentar migração aqui é o gesto que a põe sob teste. Se ela precisar de
 * uma tabela nova, a tabela entra no andaime junto.
 */
const CADEIA = [
  "20260819150000_papeis_multiplos.sql",
  "20260821120000_financeiro_operacional.sql",
  "20260821150000_alcada_de_aprovacao.sql",
  "20260821180000_papeis_gestor_e_investidor.sql",
  "20260821210000_exclusao_financeira_so_admin.sql",
  // A migração paralela: entra na cadeia porque a fusão depende de rodar
  // DEPOIS dela — e porque foi ela que removeu o gestor de
  // `has_finance_access` sem querer. Sem ela aqui, o teste não veria o
  // defeito que a fusão conserta.
  "20260822120000_perfil_investidor.sql",
  "20260822130000_conciliacao_bancaria.sql",
  "20260822150000_aprovacao_de_recorrente.sql",
  "20260822180000_lancar_do_extrato_atomico.sql",
  "20260822210000_fundir_investidores.sql",
  "20260824150000_conta_absorve_insumo.sql",
  // A agenda de pessoas une três cadastros numa view. O andaime ganhou o
  // recorte de `clientes` e `parceiros_ciclo` junto — sem eles a view seria
  // testada com uma fonte só, que é justamente a forma que não é a de
  // produção.
  "20260824190000_agenda_de_pessoas.sql",
  // O funil de vendas (2026-08-28): etapas editáveis, desfecho com motivo,
  // fila de estagnação e o ramo de leads dentro da agenda. Entra na cadeia
  // porque mexe em RLS de tabela com PII e reconstrói a view da migração
  // acima — as duas coisas que só um banco de verdade prova.
  "20260828120000_funil_de_vendas.sql",
  // O terceiro desfecho (2026-08-28, mesma tarde): "não é uma oportunidade de
  // negócio". Entra na cadeia porque mexe em CHECK de três tabelas e recria o
  // gatilho e a view da migração acima — se as duas divergirem, o lead
  // descartado fica sem carimbo e volta para a fila de estagnação.
  "20260828160000_desfecho_sem_oportunidade.sql",
  // O motivo de desfecho ganha escopo (2026-09-05). Entra na cadeia porque o
  // aceite dela prova um CHECK novo tentando INSERIR o valor inválido — e
  // `check_violation` só acontece contra um Postgres de verdade.
  "20260905120000_motivo_por_escopo.sql",
  // sem_resposta vai para o fim das duas listas (2026-09-06). Entra na cadeia
  // porque o aceite só existe comparando `ordem` contra as linhas que a
  // migração de escopo, acima, inseriu — sem rodar as duas em sequência não
  // há "último motivo de avaliação" nenhum para comparar.
  "20260906120000_sem_retorno_por_ultimo.sql",
  // Motivos de ganho por escopo (2026-09-16). Entra na cadeia porque o aceite
  // conta os motivos de ganho por escopo — e só sabe o que contar depois que as
  // duas migrações acima deram escopo à tabela e as sementes de agosto
  // inseriram os quatro de pagamento.
  "20260916170000_motivos_de_ganho_por_escopo.sql",
  // O papel SDR (2026-09-23). Entra na cadeia porque troca o CHECK de
  // `profiles.role` e as duas réguas de vocabulário — o furo de 22/08 foi
  // exatamente uma dessas réguas reescrita sem as outras.
  "20260923130000_papel_sdr.sql",
  // A gestão do lead (2026-09-23): aplicada em produção FORA do repositório e
  // reconstruída em 2026-09-24 a partir do catálogo de lá. Entra na cadeia
  // porque o aceite compara constraint, índice e função com o texto lido de
  // produção, e prova grants e policy vestindo anon, um cliente e um staff —
  // e porque ela reescreve o gatilho do funil (acima) que a avaliação, logo
  // abaixo, atravessa.
  "20260923150000_gestao_do_lead.sql",
  // A avaliação mora no lead (2026-09-24). Entra na cadeia porque o aceite
  // prova os CHECKs tentando gravar o inválido, passa pelos gatilhos do funil
  // (acima) com as colunas novas e confere, vestindo `anon` e um cliente sem
  // staff, que o retrato com a recomendação não sai para quem não é equipe.
  "20260924190000_avaliacao_no_lead.sql",
  // A curva de deságio ganha `km_por_ano` (2026-09-24). Entra na cadeia porque
  // o aceite prova, contra o guarda de vigência de verdade, que a linha vigente
  // recebe 15.000 sem UPDATE, que zero e negativo são recusados e que o km
  // vigente não se edita — a tabela vem do recorte da F0 no andaime.
  "20260924220000_curva_km_por_ano.sql",
  // `leads_interacoes` ganha `org_id` (2026-09-25) — a divergência que a
  // gestão do lead (acima) registrou e não corrigiu. Entra na cadeia porque o
  // aceite prova pelo efeito, vestindo um staff, que a função grava na org
  // padrão sem listar a coluna e que a linha de uma org temporária some da
  // leitura dele — RLS cross-org só se prova num Postgres de verdade.
  "20260925130000_leads_interacoes_org_id.sql",
  // As etiquetas do lead e o crédito do SDR (2026-09-25). Entra na cadeia
  // porque o aceite passa o lead numa sessão de SDR, de Comercial e sem sessão
  // (o motor) e confere quem deixa crédito no rastro — gatilho e RLS só se
  // provam num banco de verdade. Depende da papel_sdr, acima, para o SDR ser
  // staff.
  "20260925180000_etiquetas_do_lead.sql",
  // O perfil do Garagem Profiler no lead (2026-09-25). Entra na cadeia porque
  // o aceite prova, com uma sonda desfeita, que a equipe lê a coluna e que anon
  // e cliente não veem o lead — RLS só se prova num banco de verdade.
  "20260925200000_perfil_no_lead.sql",
  // As condições de financiamento viram parâmetro com vigência (2026-09-28).
  // Entra na cadeia porque o aceite veste um financeiro, um admin, um
  // comercial, um gestor e um cliente para provar que só a A17 abre vigência,
  // que escrita direta é 42501 e que o guarda e o índice de vigente única
  // seguram — privilégio, RLS e SECURITY DEFINER só se provam num banco de
  // verdade. Usa `org_padrao` e o guarda do recorte da F0 no andaime.
  "20260928120000_parametros_financiamento.sql",
  // Os veículos de interesse do lead (2026-10-05): vários carros por lead,
  // cada um escolhido ou descartado com motivo, e o relatório por veículo.
  // Entra na cadeia porque o aceite prova cada regra tentando gravar o
  // inválido, veste admin, dois vendedores, marketing, cliente, desativado e
  // anônimo para provar que a opção acompanha a visibilidade do lead, e
  // confere que os relatórios não devolvem dado de pessoa. Aqui ela roda com
  // a RLS de `leads` por `is_staff` — a de produção hoje; a 20261003130000
  // vem mais abaixo na cadeia, e o `describe` dos veículos, no fim do arquivo,
  // a reaplica no outro mundo. Lê
  // `estoque_motors` (sem escrever): o recorte dela entrou no andaime junto.
  "20261005120000_veiculos_de_interesse.sql",
  // A agenda de pessoas é de toda a equipe; o lead, não (2026-10-05). Entra na
  // cadeia porque o aceite veste dez perfis e prova, NOS DOIS MUNDOS da RLS de
  // `leads` (ele troca a policy de leitura dentro da sonda e a devolve), que a
  // pessoa de origem lead é lida por toda a equipe ativa e que a etapa e as
  // observações só aparecem para quem enxerga o lead — view security_invoker
  // sobre função SECURITY DEFINER só se prova num banco de verdade. Aqui ela
  // encontra `leads` por `is_staff` e a view da 20260828160000; o `describe`
  // do fim a reaplica com dado, por cima do escopo.
  "20261005150000_agenda_para_toda_a_equipe.sql",
  // A RLS de `leads` vira o escopo (2026-10-03). Fica DEPOIS das duas de 05/10
  // de propósito, fora da ordem dos carimbos: é a ordem recomendada em
  // produção (a agenda primeiro, para o Financeiro e o Marketing não perderem
  // gente no intervalo), e as duas acima provam o próprio aceite com `leads`
  // ainda por `is_staff`. Entra na cadeia porque o aceite são 44 comandos na
  // pele de onze perfis — leitura, passagem de lead e exclusão.
  "20261003130000_leads_rls_por_escopo.sql",
  // O funil do Garagem Profiler contado por dia, sem identificador
  // (2026-10-06). Entra na cadeia porque o aceite chama a função vestindo
  // service_role, staff, cliente e anon, com o relógio da sessão num fuso em
  // que o dia não é o de São Paulo, e tenta violar cada regra. SECURITY
  // DEFINER, privilégio de função e RLS só se provam num banco de verdade.
  // Usa `org_padrao` do recorte da F0 no andaime.
  "20261006120000_funil_do_profiler.sql",
  // As consultas de placa (2026-10-06): o retrato do carro que a loja avalia,
  // comprado da APIBrasil. Entra na cadeia porque o aceite veste comercial,
  // gestor, marketing, um comercial desativado, cliente e anon para provar
  // quem lê e quem inclui, que ninguém edita nem apaga, e que o banco recusa
  // as chaves de dado pessoal no retrato. RLS, privilégio e CHECK só se provam
  // num banco de verdade. Usa `tem_papel`, `autor_atual` e `org_padrao`.
  "20261006180000_consultas_de_placa.sql",
  // O histórico da FIPE por modelo (2026-10-06): o que a aba sem custo guarda
  // para não gastar o teto diário do token a cada abertura. Entra na cadeia
  // porque o aceite veste comercial, gestor, marketing e anon, prova que o
  // mesmo mês não entra duas vezes e que ninguém edita nem apaga.
  "20261006190000_fipe_historico.sql",
  // As campanhas de SMS, por carro ou por perfil, e a base de marketing
  // importada (2026-10-07): a campanha, os destinatários, quem pediu para sair,
  // e as três tabelas `marketing_*` (importações, contatos, registros). Entra
  // na cadeia porque o aceite veste admin, marketing, comercial, um marketing
  // desativado, cliente e anon para provar que o painel lê a campanha e leva
  // 42501 no telefone do destinatário e em toda a base importada, tenta gravar
  // o inválido em cada regra, e usa as seis funções como service_role: a
  // reserva do lote, o clique e os presos; e a importação em lote (reenvio,
  // fusão pelo celular, telefone inválido, lote ruim), o resumo e o desfazer.
  // Aponta para `leads` (o recorte do andaime já tem `id uuid`) e não toca
  // `estoque_motors`. O andaime não precisou de nada novo.
  "20261007120000_sms_campanhas.sql",
  // As consultas de modelo (2026-10-08): o registro de cada análise feita
  // pelas abas de modelo, para o histórico da equipe e a conta do gasto.
  // Entra na cadeia porque o aceite veste admin, gestor, comercial,
  // marketing, um comercial desativado, cliente, anon e service_role para
  // provar quem lê e quem inclui, que autor, nome, data e org forjados pela
  // tela são sobrescritos pelo gatilho de carimbo (é a conta do gasto), que
  // ninguém edita nem apaga, e tenta gravar o inválido em cada regra. RLS,
  // privilégio, gatilho e CHECK só se provam num banco de verdade. Usa
  // `tem_papel`, `autor_atual` e `org_padrao`; o andaime não precisou de nada
  // novo.
  "20261008120000_consultas_de_modelo.sql",
  // O próximo passo opcional e o CONCLUIR sem passo novo (2026-10-09). Entra
  // na cadeia porque troca a assinatura de `registrar_interacao_do_lead` (DROP
  // e CREATE): o aceite prova que sobra uma função só, que a chamada de seis
  // argumentos da rota continua casando, e veste um vendedor para provar que a
  // nota sem passo mantém o passo e que o CONCLUIR sem passo novo o limpa —
  // SECURITY DEFINER, gatilho do lead e privilégio de anon só se provam num
  // banco de verdade. Vem depois da 20260925130000, que deu `org_id` à tabela
  // que a função grava, e da RLS por escopo, que a função atravessa.
  "20261009120000_concluir_passo_sem_proximo.sql",
  // A transferência espera o prazo do novo dono (2026-10-10): o rodízio
  // jogava o mesmo lead de um vendedor para o outro de hora em hora. Entra na
  // cadeia porque reescreve `montar_fila_do_funil` inteira, e o aceite prova a
  // trava contra o gatilho de `leads` de verdade — recém-transferido não
  // transfere, dono com o prazo inteiro transfere, `responsavel_desde` nulo
  // transfere como antes. Pediu ao andaime o recorte de `atendimentos`.
  "20261010140000_transferencia_espera_o_prazo_do_novo_dono.sql",
  // O lead novo vai ao administrador, e não ao rodízio (2026-10-10). Entra na
  // cadeia porque reescreve a fila inteira de novo; o aceite prova, contra o
  // gatilho de `leads`, que o lead sem dono vira `lead_novo` na primeira
  // rodada sem ninguém escolhido, que a marca segura 20 h, e que `atribuicao`
  // sumiu.
  "20261010160000_lead_novo_vai_ao_administrador.sql",
  // A resposta pelo Chatwoot tira o lead de "Novo" (2026-10-14). Traz a
  // função inteira, na forma de produção (a de 20260915120000, com `p_autor`
  // e a guarda que reconhece a chave de serviço); a 20260915120000 em si não
  // entra porque o aceite dela insere lead sem nome, e o recorte de `leads`
  // do andaime exige nome. O aceite veste a chave de serviço como o webhook;
  // o andaime ganhou `auth.role()` para isso.
  "20261014120000_resposta_no_chatwoot_tira_do_novo.sql",
  // O Copiloto de Mídia (2026-10-14): o retrato diário do Google Ads, os
  // achados e as propostas que Administrador ou Marketing aprova e o script da
  // conta aplica. Entra na cadeia porque o aceite veste admin, marketing,
  // comercial, um marketing desativado, cliente, anon e a chave de serviço
  // para provar quem lê, que ninguém escreve direto (nem a chave de serviço),
  // que a decisão carimba a autoria e vai à trilha, que o segundo retrato não
  // repete o aberto nem o recusado, que a reserva entrega uma vez só, que o
  // gatilho recusa transição para trás e alvo trocado, e que o desfazer é o
  // inverso exato. Pediu ao andaime o recorte de `auditoria_admin`.
  "20261014150000_copiloto_de_midia.sql",
  // O gclid do iPhone (2026-10-14): `leads` ganha `gbraid` e `wbraid`, e a
  // view de saúde da atribuição passa a contá-los. Entra na cadeia porque o
  // aceite confere coluna, comentário, ausência de CHECK que recuse lead e a
  // ordem das colunas da view — e `create or replace view` com coluna nova só
  // se prova num banco de verdade. Pediu ao recorte de `leads` as colunas de
  // mídia que a view lê.
  "20261014160000_gbraid_e_wbraid_no_lead.sql",
  // O pedido de verba do Copiloto (2026-10-16): uma pessoa pede a verba nova
  // de uma campanha, inclusive AUMENTO, e o pedido passa pela mesma aprovação.
  // Entra na cadeia porque o aceite veste admin, marketing, comercial, um
  // marketing desativado, um sem nome, cliente, anon e a chave de serviço para
  // provar quem pede, que a verba de hoje vem da sincronização, que o retrato
  // não descarta pedido e pula a verba com pedido aberto, que o diagnóstico
  // segue sem poder aumentar, o teto de 10× do script, a janela que pedido
  // recusado não segura, e que outra loja com a mesma chave não é tocada.
  // Pediu ao andaime o recorte de `midia_campanhas`.
  "20261016200000_copiloto_pedido_de_verba.sql",
  // O Copiloto no Meta Ads (2026-10-17): retrato e ação ganham plataforma, o
  // Meta ganha pausar/reativar conjunto e anúncio, a reserva do Meta nasce e o
  // anúncio sincronizado ganha conjunto e situação. Entra na cadeia porque o
  // aceite prova pelo efeito, vestindo admin, marketing e a chave de serviço,
  // que um retrato do Meta não descarta proposta nem pedido do Google (e
  // vice-versa), que cada reserva só entrega a sua plataforma, que a trilha
  // diz quem aplicou, que o desfazer do anúncio nasce no Meta e no mesmo
  // anúncio, o pedido de verba numa campanha do Meta, cada regra nova
  // tentando gravar o inválido, que a sessão de staff não reescreve o
  // anúncio nem o desempenho sincronizados (e cliente não os lê), e que as
  // regras do Meta são parâmetro com vigência numa porta só, de 21 argumentos,
  // que a chamada de 15 do site de hoje segue usando. Pediu ao andaime o
  // recorte de `midia_anuncios`, `midia_diario` e `midia_gravar_lote`.
  "20261017150000_copiloto_meta.sql",
  // As consultas de CPF e CNPJ e o link do relatório (2026-10-18). É dado
  // pessoal (LGPD): entra na cadeia porque o aceite veste admin, gestor,
  // comercial, financeiro, marketing, sdr, um financeiro desativado, cliente,
  // anon e service_role para provar que só os quatro papéis da ação nova leem,
  // que ninguém inclui direto e só a service_role registra, pela função
  // `registrar_consulta_de_documento`, com org, autor e nome carimbados por ela
  // (e recusa quem não tem o papel), que sem a declaração do titular a
  // consulta não entra, que ninguém edita nem apaga a consulta, que a sessão
  // não lê `token_hash`, que o link só se revoga (esticar prazo, mexer no
  // contador e desrevogar são negados, até à chave de serviço), que a porta
  // pública `abrir_relatorio_compartilhado` abre como anon só pelo TOKEN (o
  // hash não abre) e conta o acesso, e que `parametros_consulta_documento` é
  // parâmetro com vigência, lido pelos quatro e escrito só pelo admin. Usa
  // `tem_papel`, `autor_atual`, `org_padrao` e `nucleo_so_encerra_vigencia`;
  // o andaime não precisou de nada novo.
  "20261018120000_consultas_de_documento.sql",
  // Os níveis da consulta de placa e o aprofundar (2026-10-19). Entra na
  // cadeia porque o aceite grava a forma antiga como o app de hoje (sessão do
  // comercial) e prova que ela sai 'completo'; grava um básico e o aprofunda
  // para o intermediário pagando só o check-list; prova que o gatilho recusa
  // aprofundar fora do prazo do parâmetro, com fragmento trocado, de produto
  // que a origem não tem e sem origem; que a FK composta recusa outra placa,
  // outra loja e a homologação; que apagar a origem zera `aproveitou_de`; que
  // o comercial não vê consulta nem parâmetro de uma SEGUNDA loja; cada regra
  // nova tentando gravar o inválido; e `parametros_consulta_veiculo` como
  // parâmetro com vigência, escrito só pelo admin. FK com `set null (coluna)`,
  // gatilho, RLS e CHECK só se provam num banco de verdade. Usa `tem_papel`,
  // `org_padrao`, `nucleo_so_encerra_vigencia` e `orgs`; o andaime não
  // precisou de nada novo.
  "20261019120000_niveis_da_consulta_de_placa.sql",
  // O atendimento por IA (2026-10-20): conversa, retratos do aquecimento,
  // configuração e as colunas de estado no lead. Entra na cadeia porque a
  // leitura da conversa HERDA o escopo de `leads` por subconsulta — o aceite
  // veste dois vendedores, o marketing e o anônimo para provar que um não lê
  // a conversa do outro — e porque recria `registrar_contato_do_lead`, que a
  // 20261014120000, logo acima, deixou com o `chatwoot` tirando de "Novo".
  "20261020120000_atendimento_ia.sql",
  // As fotos do estoque classificadas por camada para o atendimento
  // (2026-10-20): a tabela da classificação e a foto na conversa. Entra na
  // cadeia porque acrescenta restrições a `atendimento_mensagens`, da
  // migração logo acima, e o aceite prova que a sessão só lê.
  "20261021120000_fotos_do_atendimento.sql",
  // A entrega do lead pronto para o comercial (2026-10-20): troca a regra do
  // motivo de entrega da 20261020120000 pela que aceita `agendou` e
  // `simulacao`. Entra na cadeia porque depende da regra criada lá.
  "20261022120000_atendimento_entrega_pronta.sql",
];

/**
 * Como falar com o Postgres desta máquina.
 *
 * `PSQL_TESTE` permite apontar para outro caminho ou outra forma de conexão
 * (`PSQL_TESTE="psql -h localhost -U postgres"`, por exemplo). Sem ela, tenta
 * o `psql` do usuário atual e, se não der, o do usuário `postgres` — que é
 * como um Postgres recém-instalado em Debian/Ubuntu se apresenta.
 */
function descobrirPsql(): ((sql: string, banco?: string) => string) | null {
  const tentativas: string[][] = [];
  if (process.env.PSQL_TESTE) {
    tentativas.push(process.env.PSQL_TESTE.split(" "));
  }
  tentativas.push(["psql"]);
  tentativas.push(["su", "postgres", "-c", "PSQL"]);

  for (const t of tentativas) {
    const rodar = montar(t);
    try {
      rodar("select 1", "postgres");
      return rodar;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Roda psql e devolve **stdout + stderr juntos**.
 *
 * O `RAISE NOTICE` das autoconferências sai em stderr — capturar só stdout
 * faria o teste do aceite procurar a frase no lugar errado e acusar todas as
 * migrações de silenciosas. (Foi o que aconteceu na primeira versão deste
 * arquivo: o teste pegou o próprio bug antes de pegar o de alguém.)
 */
function rodar(prefixo: string[], modo: "-c" | "-f", valor: string, banco: string): string {
  const args = [...prefixo];
  const i = args.indexOf("PSQL");
  const r =
    i >= 0
      ? // Forma `su postgres -c "psql ..."`: o comando inteiro é um argumento só.
        (() => {
          const copia = [...args];
          copia[i] = `psql -v ON_ERROR_STOP=1 -X -q -d ${banco} ${modo} ${aspas(valor)}`;
          return spawnSync(copia[0], copia.slice(1), { encoding: "utf-8" });
        })()
      : spawnSync(
          args[0],
          [...args.slice(1), "-v", "ON_ERROR_STOP=1", "-X", "-q", "-d", banco, modo, valor],
          { encoding: "utf-8" },
        );

  const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0) throw new Error(`psql falhou (${r.status}): ${saida}`);
  return saida;
}

function montar(prefixo: string[]) {
  return (sql: string, banco = BANCO): string => rodar(prefixo, "-c", sql, banco);
}

/** Aspas para o SQL sobreviver à camada de shell do `su -c`. */
function aspas(valor: string): string {
  return `'${valor.replace(/'/g, "'\\''")}'`;
}

function arquivo(prefixo: string[], caminho: string, banco = BANCO): string {
  return rodar(prefixo, "-f", caminho, banco);
}

const psql = descobrirPsql();
const temBanco = psql !== null;

/** O prefixo que funcionou, para os `-f` reusarem a mesma forma de conexão. */
const PREFIXO = process.env.PSQL_TESTE
  ? process.env.PSQL_TESTE.split(" ")
  : (() => {
      const r = spawnSync("psql", ["-X", "-q", "-d", "postgres", "-c", "select 1"], {
        encoding: "utf-8",
      });
      return r.status === 0 ? ["psql"] : ["su", "postgres", "-c", "PSQL"];
    })();

/**
 * A saída de cada migração, para as asserções lerem os avisos. No módulo, e
 * não dentro do primeiro `describe`: o dos veículos de interesse, no fim,
 * compara a saída da cadeia com a da reaplicação.
 */
const saidas = new Map<string, string>();

describe.skipIf(!temBanco)("as migrações aplicam num Postgres limpo", () => {

  beforeAll(() => {
    // Banco descartável: `dropdb` antes garante que o teste parte do zero
    // mesmo depois de uma execução interrompida no meio.
    const admin = montar(PREFIXO);
    admin(`drop database if exists ${BANCO}`, "postgres");
    admin(`create database ${BANCO}`, "postgres");
    arquivo(PREFIXO, ANDAIME);

    for (const m of CADEIA) {
      saidas.set(m, arquivo(PREFIXO, join(DIR_MIGRACOES, m)));
    }
  }, 120_000);

  it("o andaime existe e a cadeia declarada aponta para arquivos reais", () => {
    expect(existsSync(ANDAIME)).toBe(true);
    for (const m of CADEIA) {
      expect(existsSync(join(DIR_MIGRACOES, m)), `migração sumiu: ${m}`).toBe(true);
    }
  });

  it("toda migração da cadeia levanta o próprio aceite", () => {
    // A asserção que dá sentido ao arquivo: não basta a migração não explodir.
    // Um `do $$` com o bloco de aceite comentado por engano aplicaria em
    // silêncio — e é justamente o aceite que prova a promessa.
    for (const m of CADEIA) {
      expect(saidas.get(m), `sem "Aceite verificado" em ${m}`).toContain("Aceite verificado");
    }
  });

  it("nenhuma delas deixou ERROR no caminho", () => {
    for (const m of CADEIA) {
      expect(saidas.get(m), `ERROR em ${m}`).not.toMatch(/^psql.*ERROR:/m);
    }
  });
});

describe.skipIf(!temBanco)("o estado final é o prometido", () => {
  /** `t`/`f` do psql viram boolean, com o resto do ruído fora. */
  const ehVerdade = (sql: string): boolean =>
    psql!(`select ${sql}`).replace(/[\s|-]/g, "").includes("t");

  it("o vocabulário de papéis tem os oito, e recusa inventado", () => {
    expect(
      ehVerdade(
        "public.papeis_validos(array['admin','gestor','comercial','financeiro','marketing','sdr','cliente','investidor'])",
      ),
    ).toBe(true);
    expect(ehVerdade("not public.papeis_validos(array['chefe'])")).toBe(true);
  });

  it("gestor é staff e abre o financeiro; investidor não é nem uma coisa nem outra", () => {
    expect(ehVerdade("(select prosrc like '%gestor%' from pg_proc where proname='is_staff')")).toBe(true);
    expect(
      ehVerdade("(select prosrc not like '%investidor%' from pg_proc where proname='is_staff')"),
    ).toBe(true);
    expect(
      ehVerdade("(select prosrc like '%gestor%' from pg_proc where proname='has_finance_access')"),
    ).toBe(true);
  });

  it("is_admin lê `papeis`, não `role` — o terceiro gêmeo do bug multi-papel", () => {
    expect(ehVerdade("(select prosrc like '%papeis%' from pg_proc where proname='is_admin')")).toBe(true);
    expect(ehVerdade("(select prosrc not like '%role =%' from pg_proc where proname='is_admin')")).toBe(true);
  });

  it("as quatro tabelas de lançamento só deixam o admin apagar", () => {
    expect(
      ehVerdade(
        `(select count(*)=4 from pg_policies where schemaname='public' and cmd='DELETE'
            and tablename in ('contas','movimentacoes','compras_produtos','movimentacoes_investidor')
            and qual like '%is_admin%')`,
      ),
    ).toBe(true);
  });

  it("a leitura própria do investidor sobreviveu à varredura de policies", () => {
    // `20260821210000` derruba TODA policy das tabelas alvo para recriá-las.
    // Sem recriar esta, a área do investidor ficaria vazia sem erro nenhum —
    // exatamente o tipo de silêncio que este projeto já pagou caro.
    expect(
      ehVerdade(
        `exists (select 1 from pg_policies where tablename='movimentacoes_investidor'
                   and policyname='Investidor le o proprio extrato')`,
      ),
    ).toBe(true);
  });

  it("as condições de financiamento são parâmetro com vigência, escrito só pela função", () => {
    // A única porta de escrita roda como dono — é o que deixa a tabela sem
    // INSERT/UPDATE para `authenticated` e sem policy de escrita.
    expect(
      ehVerdade(
        `(select prosecdef from pg_proc
           where oid = 'public.financiamento_nova_vigencia(numeric,numeric,numeric,integer,integer,text[],text,text)'::regprocedure) is true`,
      ),
    ).toBe(true);
    // O site lê pela chave de serviço, no servidor; anônimo não lê nada.
    expect(ehVerdade("not has_table_privilege('anon', 'public.parametros_financiamento', 'SELECT')")).toBe(true);
    // Uma vigente só, e é a do dono: carro anterior a 2009 fica sem estimativa.
    expect(
      ehVerdade(
        `(select count(*) = 1 and bool_and(ano_mais_antigo = 2009)
            from public.parametros_financiamento where vigencia_ate is null)`,
      ),
    ).toBe(true);
  });

  it("o funil do Profiler conta por dia sem identificador, e só o servidor escreve", () => {
    // A única porta de escrita roda como dono — é o que deixa a tabela sem
    // escrita para `authenticated` e sem policy de escrita.
    expect(
      ehVerdade(
        `(select prosecdef from pg_proc
           where oid = 'public.profiler_contar_passo(text)'::regprocedure) is true`,
      ),
    ).toBe(true);
    // O navegador nunca chama direto: nem anônimo, nem logado.
    expect(ehVerdade("not has_function_privilege('anon', 'public.profiler_contar_passo(text)', 'EXECUTE')")).toBe(true);
    expect(
      ehVerdade("not has_function_privilege('authenticated', 'public.profiler_contar_passo(text)', 'EXECUTE')"),
    ).toBe(true);
    expect(ehVerdade("has_function_privilege('service_role', 'public.profiler_contar_passo(text)', 'EXECUTE')")).toBe(
      true,
    );
    // Nenhuma coluna de identificador nem de horário: as quatro, e nenhuma
    // quinta (ag_uid, IP, sessão, nem um atualizado_em, que com tráfego baixo
    // daria a hora do lead ou da última visita).
    expect(
      ehVerdade(
        `(select string_agg(attname, ',' order by attnum) from pg_attribute
           where attrelid = 'public.profiler_funil_diario'::regclass and attnum > 0 and not attisdropped)
         = 'org_id,dia,passo,contagem'`,
      ),
    ).toBe(true);
    // A lista do CHECK é a da rota: um passo que a rota aceita e o banco
    // recusa seria contagem perdida em silêncio (a rota só loga o aviso).
    const passos = PASSOS_DO_FUNIL.map((p) => `'${p}'`).join(",");
    expect(
      ehVerdade(
        `(select array(select m[1] from regexp_matches(pg_get_constraintdef(oid), '''([^'']+)''', 'g') m order by 1)
           from pg_constraint where conname = 'profiler_funil_diario_passo_valido')
         = array(select unnest(array[${passos}]::text[]) order by 1)`,
      ),
    ).toBe(true);
  });

  it("cada migração da cadeia se registrou no livro-razão (D6)", () => {
    const versoes = CADEIA.map((m) => `'${m.slice(0, 14)}'`).join(",");
    expect(
      ehVerdade(
        `(select count(*)=${CADEIA.length} from supabase_migrations.schema_migrations where version in (${versoes}))`,
      ),
    ).toBe(true);
  });
});

/**
 * As campanhas de SMS e a base de marketing (20261007120000), pelo lado de
 * fora. O aceite da migração já prova o efeito com sonda; aqui ficam as duas
 * coisas que só o teste enxerga: as listas fechadas do banco são as do
 * código (um valor que a rota aceita e o CHECK recusa é campanha que não se
 * cria, ou importação que não abre), e a violação falha pelo NOME da regra.
 * Nada do que entra aqui fica: toda escrita é desfeita.
 */
describe.skipIf(!temBanco)("as campanhas de SMS e a base de marketing, pelo lado de fora", () => {
  const vale = (expr: string): boolean => /^\s*t\s*$/m.test(psql!(`select (${expr}) as ok`));

  /** A mensagem do erro, ou "" se o comando passou. Sempre desfeito. */
  const recusa = (sql: string): string => {
    try {
      psql!(`begin; ${sql}; rollback;`);
      return "";
    } catch (e) {
      return String((e as Error).message);
    }
  };

  /** Os valores entre aspas (ou os números) de um CHECK, em ordem. */
  const valoresDoCheck = (regra: string, padrao = "'([^']+)'") =>
    `(select array(select m[1] from regexp_matches(pg_get_constraintdef(oid), $re$${padrao}$re$, 'g') m order by 1)
        from pg_constraint where conname = '${regra}')`;
  const lista = (valores: readonly (string | number)[]) =>
    `array(select unnest(array[${valores.map((v) => `'${v}'`).join(",")}]::text[]) order by 1)`;

  const campanha = (colunas: string, valores: string) =>
    `insert into public.sms_campanhas (nome, codigo, destino, mensagem, ${colunas})
     values ('Teste de fora', 'abc2345', '/estoque', 'Veja: {link}', ${valores})`;

  it("as listas fechadas do banco são as do código: critério, critério de carro, descanso, janela e origem", () => {
    expect(vale(`${valoresDoCheck("sms_campanhas_criterio_valido")} = ${lista(CRITERIOS_DE_PUBLICO)}`)).toBe(true);
    expect(vale(`${valoresDoCheck("sms_campanhas_carro_do_criterio")} = ${lista(CRITERIOS_DE_CARRO)}`)).toBe(true);
    expect(vale(`${valoresDoCheck("sms_campanhas_descanso_valido", "\\m([0-9]+)\\M")} = ${lista(DESCANSOS_EM_DIAS)}`)).toBe(true);
    expect(
      vale(
        `${valoresDoCheck("sms_campanhas_janela_valida", "\\m([0-9]+)\\M")} = ${lista(JANELAS_DE_INTERESSE.filter((j) => j !== null) as number[])}`,
      ),
    ).toBe(true);
    expect(
      vale(
        `${valoresDoCheck("sms_campanhas_compra_valida", "\\m([0-9]+)\\M")} = ${lista(TEMPOS_DESDE_A_COMPRA.filter((t) => t !== null) as number[])}`,
      ),
    ).toBe(true);
    // O filtro de compra só existe com "clientes" e "todos" — os dois critérios de perfil que alcançam quem comprou.
    expect(vale(`${valoresDoCheck("sms_campanhas_compra_so_de_cliente")} = ${lista(["clientes", "todos"])}`)).toBe(true);
    expect(vale(`${valoresDoCheck("marketing_importacoes_origem_valida")} = ${lista(ORIGENS_DE_IMPORTACAO)}`)).toBe(true);
    // O telefone do contato é o do envio: a mesma expressão, e não uma parecida.
    expect(
      vale(
        `(select pg_get_constraintdef(oid) from pg_constraint where conname = 'marketing_contatos_telefone_valido')
         = (select pg_get_constraintdef(oid) from pg_constraint where conname = 'sms_envios_telefone_valido')`,
      ),
    ).toBe(true);
  });

  it("violação falha: critério de carro sem carro, carro pela metade, {preco} sem carro, descanso fora da lista", () => {
    // Controle positivo: por perfil, sem carro, entra — com cada um dos três critérios de perfil.
    for (const criterio of CRITERIOS_DE_PUBLICO.filter((c) => !(CRITERIOS_DE_CARRO as readonly string[]).includes(c))) {
      expect(recusa(campanha("criterio", `'${criterio}'`)), criterio).toBe("");
    }
    for (const criterio of CRITERIOS_DE_CARRO) {
      expect(recusa(campanha("criterio", `'${criterio}'`)), criterio).toContain("sms_campanhas_carro_do_criterio");
      expect(recusa(campanha("criterio, veiculo_id, veiculo_rotulo", `'${criterio}', 7950008, 'Fiat Uno'`)), criterio).toBe("");
    }
    expect(recusa(campanha("criterio, veiculo_id", "'todos', 7950008"))).toContain("sms_campanhas_carro_do_criterio");
    expect(
      recusa(`insert into public.sms_campanhas (nome, codigo, destino, criterio, mensagem)
              values ('Teste de fora', 'abc2345', '/estoque', 'clientes', 'Por {preco}: {link}')`),
    ).toContain("sms_campanhas_sem_carro_sem_variavel");
    for (const dias of [1, 3, 14, 90]) {
      expect(recusa(campanha("criterio, descanso_dias", `'todos', ${dias}`)), String(dias)).toContain("sms_campanhas_descanso_valido");
    }
    for (const dias of DESCANSOS_EM_DIAS) {
      expect(recusa(campanha("criterio, descanso_dias", `'todos', ${dias}`)), String(dias)).toBe("");
    }
    expect(vale("(select count(*) = 0 from public.sms_campanhas where nome = 'Teste de fora')")).toBe(true);
  });

  it("violação falha: tempo desde a compra fora da lista, ou em critério que não alcança cliente; os destinos sem carro entram", () => {
    for (const meses of TEMPOS_DESDE_A_COMPRA) {
      for (const criterio of ["clientes", "todos"]) {
        expect(recusa(campanha("criterio, compra_ha_meses", `'${criterio}', ${meses === null ? "null" : meses}`)), `${criterio} ${meses}`).toBe("");
      }
    }
    for (const meses of [0, 6, 13, 48, -12]) {
      expect(recusa(campanha("criterio, compra_ha_meses", `'clientes', ${meses}`)), String(meses)).toContain("sms_campanhas_compra_valida");
    }
    expect(recusa(campanha("criterio, compra_ha_meses", "'interessados', 24"))).toContain("sms_campanhas_compra_so_de_cliente");
    for (const criterio of CRITERIOS_DE_CARRO) {
      expect(
        recusa(campanha("criterio, veiculo_id, veiculo_rotulo, compra_ha_meses", `'${criterio}', 7950008, 'Fiat Uno', 24`)),
        criterio,
      ).toContain("sms_campanhas_compra_so_de_cliente");
    }
    // O destino escolhido não pediu regra nova: os dois caminhos passam pela que já existia.
    for (const destino of Object.values(DESTINOS_SEM_CARRO)) {
      expect(
        recusa(`insert into public.sms_campanhas (nome, codigo, destino, criterio, compra_ha_meses, mensagem)
                values ('Teste de fora', 'abc2345', '${destino}', 'clientes', 24, 'Veja: {link}')`),
        destino,
      ).toBe("");
    }
    expect(vale("(select count(*) = 0 from public.sms_campanhas where nome = 'Teste de fora')")).toBe(true);
  });

  it("violação falha: a base recusa telefone fixo, compra sem cliente, tipo e placa fora da regra, e a linha repetida", () => {
    const contato = (colunas: string, valores: string) =>
      `insert into public.marketing_contatos (${colunas}) values (${valores})`;
    expect(recusa(contato("telefone", "'554133334444'"))).toContain("marketing_contatos_telefone_valido");
    expect(recusa(contato("telefone, comprou_em", "'5541900000201', now()"))).toContain("marketing_contatos_compra_e_de_cliente");
    expect(recusa(contato("telefone, comprou_em, cliente", "'5541900000201', now(), true"))).toBe("");
    expect(recusa(`${contato("telefone", "'5541900000201'")}; ${contato("telefone", "'5541900000201'")}`)).toContain(
      "marketing_contatos_telefone_unico",
    );
    expect(recusa(`insert into public.marketing_importacoes (origem) values ('excel')`)).toContain("marketing_importacoes_origem_valida");

    const registro = (colunas: string, valores: string) =>
      `${contato("id, telefone", "'00000000-0000-0000-0000-0000000000c1', '5541900000201'")};
       insert into public.marketing_interesses (contato_id, ${colunas})
       values ('00000000-0000-0000-0000-0000000000c1', ${valores})`;
    expect(recusa(registro("tipo", "'cliente'"))).toContain("marketing_interesses_tipo_valido");
    expect(recusa(registro("tipo, placa", "'interesse', 'abc1d23'"))).toContain("marketing_interesses_placa_valida");
    expect(recusa(registro("tipo, placa", "'compra', 'ABC1D23'"))).toBe("");
    expect(
      recusa(`${registro("tipo, origem_id", "'interesse', 'fora-1'")};
              insert into public.marketing_interesses (contato_id, tipo, origem_id)
              values ('00000000-0000-0000-0000-0000000000c1', 'compra', 'fora-1')`),
    ).toContain("marketing_interesses_origem_unica");
    expect(
      recusa(`${registro("tipo, marca, modelo, ocorreu_em", "'interesse', 'Fiat', 'Uno', '2025-01-01T12:00:00Z'")};
              insert into public.marketing_interesses (contato_id, tipo, marca, modelo, ocorreu_em)
              values ('00000000-0000-0000-0000-0000000000c1', 'interesse', 'FIAT', 'uno', '2025-01-01T12:00:00Z')`),
    ).toContain("marketing_interesses_sem_origem_unico");
    expect(vale("(select count(*) = 0 from public.marketing_contatos)")).toBe(true);
  });

  it("violação falha: sessão do painel não lê a base nem chama as funções; importar sem importação levanta erro", () => {
    for (const papel of ["anon", "authenticated"]) {
      for (const alvo of [
        "select count(*) from public.marketing_contatos",
        "select count(*) from public.marketing_interesses",
        "select count(*) from public.marketing_importacoes",
        "select public.marketing_resumo_da_base()",
        "select * from public.marketing_importar_lote(gen_random_uuid(), '[]'::jsonb)",
        "select * from public.marketing_desfazer_importacao(gen_random_uuid())",
      ]) {
        expect(recusa(`set local role ${papel}; ${alvo}`), `${papel}: ${alvo}`).toContain("permission denied");
      }
    }
    // O servidor chama; e sem a importação aberta, nada entra.
    expect(
      recusa(`set local role service_role; select * from public.marketing_importar_lote(gen_random_uuid(), '[]'::jsonb)`),
    ).toContain("não existe");
    expect(recusa(`set local role service_role; select public.marketing_resumo_da_base()`)).toBe("");
  });
});

/**
 * O pedido de verba do Copiloto (20261016200000), pelo lado de fora. O aceite
 * da migração prova o efeito com sonda; aqui ficam a reaplicação (o catálogo
 * e as linhas não mudam), cada violação falhando pelo NOME da regra (com um
 * controle que tem de entrar), a campanha sincronizada que a sessão não
 * reescreve, e "uma mudança de verba aberta por campanha" passando pelas
 * portas de verdade (pedido, desfazer, retrato). Toda escrita é desfeita.
 */
describe.skipIf(!temBanco)("o pedido de verba do Copiloto, reaplicado e pelo lado de fora", () => {
  const MIGRACAO = "20261016200000_copiloto_pedido_de_verba.sql";

  /** A mensagem do erro, ou "" se o comando passou. Sempre desfeito. */
  const recusa = (sql: string): string => {
    try {
      psql!(`begin; ${sql}; rollback;`);
      return "";
    } catch (e) {
      return String((e as Error).message);
    }
  };

  /** Regras, índices, colunas, corpo e privilégio das quatro funções, policies, comentário e contagens, num hash. */
  const retrato = (): string => {
    const saida = psql!(
      `select md5(
         (select string_agg(conname || ':' || pg_get_constraintdef(oid), '|' order by conname)
            from pg_constraint where conrelid = 'public.midia_copiloto_acoes'::regclass)
         || (select string_agg(attname || ':' || format_type(atttypid, atttypmod), '|' order by attnum)
               from pg_attribute where attrelid = 'public.midia_copiloto_acoes'::regclass and attnum > 0 and not attisdropped)
         || (select string_agg(proname || ':' || md5(prosrc) || ':' || coalesce(array_to_string(proacl, ','), ''), '|' order by proname)
               from pg_proc where pronamespace = 'public'::regnamespace
                 and proname in ('midia_copiloto_pedir_verba', 'midia_copiloto_gravar_diagnostico',
                                 'midia_copiloto_acoes_transicao', 'midia_copiloto_desfazer'))
         || (select string_agg(indexrelid::regclass::text || ':' || pg_get_indexdef(indexrelid), '|' order by indexrelid::regclass::text)
               from pg_index where indrelid = 'public.midia_copiloto_acoes'::regclass)
         || (select string_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' order by policyname)
               from pg_policies where schemaname = 'public' and tablename = 'midia_campanhas')
         || coalesce(array_to_string((select relacl from pg_class where oid = 'public.midia_campanhas'::regclass), ','), '')
         || coalesce(obj_description('public.midia_copiloto_acoes'::regclass, 'pg_class'), '')
         || (select count(*) from public.midia_copiloto_acoes)::text
         || (select count(*) from public.auditoria_admin)::text
         || (select count(*) from public.midia_campanhas)::text) as h`,
    );
    return saida.match(/[0-9a-f]{32}/)?.[0] ?? `sem hash: ${saida}`;
  };

  /** Uma ação gravada como dono: só o gatilho e os CHECKs falam. */
  const acao = (colunas: string, valores: string) =>
    `insert into public.midia_copiloto_acoes
       (chave, tipo, campanha_id_externo, campanha_nome, motivo, ${colunas})
     values ('fora:' || gen_random_uuid(), 'mudar_verba', '111', 'Pesquisa', 'teste de fora', ${valores})`;
  const doDiagnostico = (colunas: string, valores: string) =>
    `with d as (insert into public.midia_copiloto_diagnosticos (conta, de, ate, dados, resumo)
                values ('1', '2026-10-08', '2026-10-14', '{}', '{}') returning id)
     insert into public.midia_copiloto_acoes
       (diagnostico_id, chave, tipo, campanha_id_externo, campanha_nome, motivo, ${colunas})
     select d.id, 'fora:' || gen_random_uuid(), 'mudar_verba', '111', 'Pesquisa', 'teste de fora', ${valores} from d`;
  const PESSOA = "'00000000-0000-0000-0000-0000000000a1'";

  it("reaplicar levanta o aceite de novo e não muda regra, coluna, função, privilégio nem linha", () => {
    const antes = retrato();
    // Um hash nulo seria igual a ele mesmo: a comparação só vale com um md5 de verdade.
    expect(antes).toMatch(/^[0-9a-f]{32}$/);
    // A migração do Meta (20261017150000), logo depois na cadeia, reescreve o
    // gatilho, a gravação do retrato, o pedido, o desfazer e o CHECK de origem
    // por `create or replace`/`drop constraint` + `add constraint`. Reaplicar
    // só esta voltaria tudo à forma de antes do Meta — verdade, mas não é o
    // que este teste mede. Reaplica-se o TRECHO da cadeia a partir desta, e
    // cada uma levanta o próprio aceite.
    for (const m of CADEIA.slice(CADEIA.indexOf(MIGRACAO))) {
      const saida = arquivo(PREFIXO, join(DIR_MIGRACOES, m));
      expect(saida, m).toContain("Aceite verificado");
      expect(saida, m).not.toMatch(/^psql.*ERROR:/m);
    }
    expect(retrato()).toBe(antes);
  });

  it("violação falha: o diagnóstico não aumenta, o pedido não passa de 10× nem é de negativa, e o nome não vem sem quem pediu", () => {
    // Controles: o corte do diagnóstico e o pedido de 10× exatos entram.
    expect(recusa(doDiagnostico("verba_atual, verba_nova", "50, 35"))).toBe("");
    expect(recusa(acao("verba_atual, verba_nova, pedida_por, pedida_por_nome", `10, 100, ${PESSOA}, 'Fora'`))).toBe("");
    expect(recusa(doDiagnostico("verba_atual, verba_nova", "50, 80"))).toContain("midia_copiloto_acoes_proposta_so_corta");
    expect(recusa(acao("verba_atual, verba_nova, pedida_por", `10, 100.01, ${PESSOA}`))).toContain(
      "midia_copiloto_acoes_pedido_na_faixa",
    );
    expect(
      recusa(
        `insert into public.midia_copiloto_acoes
           (chave, tipo, campanha_id_externo, campanha_nome, texto, correspondencia, motivo, pedida_por)
         values ('fora:negativa', 'negativar', '111', 'Pesquisa', 'x', 'exata', 'teste de fora', ${PESSOA})`,
      ),
    ).toContain("midia_copiloto_acoes_origem_do_tipo");
    expect(recusa(doDiagnostico("verba_atual, verba_nova, pedida_por", `50, 80, ${PESSOA}`))).toContain(
      "midia_copiloto_acoes_origem_do_tipo",
    );
    expect(recusa(doDiagnostico("verba_atual, verba_nova, pedida_por_nome", "50, 35, 'Ninguém'"))).toContain(
      "midia_copiloto_acoes_pedido_carimbado",
    );
    // O pedido nasce proposta, e quem pediu não muda depois.
    expect(
      recusa(acao("verba_atual, verba_nova, pedida_por, situacao, decidida_por, decidida_em", `10, 20, ${PESSOA}, 'aprovada', ${PESSOA}, now()`)),
    ).toContain("nasce proposta");
    expect(
      recusa(
        `${acao("verba_atual, verba_nova, pedida_por", `10, 20, ${PESSOA}`)};
         update public.midia_copiloto_acoes set situacao = 'descartada', pedida_por = gen_random_uuid()
          where motivo = 'teste de fora'`,
      ),
    ).toContain("não muda depois de proposto");
    expect(psql!("select count(*) from public.midia_copiloto_acoes where motivo = 'teste de fora'")).toMatch(/^\s*0\s*$/m);
  });

  it("violação falha: anônimo não chama a porta; sessão sem o papel e chamada sem sessão levam 42501", () => {
    expect(recusa("set local role anon; select public.midia_copiloto_pedir_verba('111', 80, null)")).toContain("permission denied");
    expect(
      recusa(
        `select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
         set local role authenticated; select public.midia_copiloto_pedir_verba('111', 80, null)`,
      ),
    ).toContain("Só Administrador ou Marketing");
    expect(recusa("select public.midia_copiloto_pedir_verba('111', 80, null)")).toContain("sem sessão");
  });

  /**
   * Um cenário inteiro numa transação desfeita: uma pessoa com o papel dado,
   * uma campanha sincronizada (R$ 50, há uma hora) e, depois, o `sql` — na
   * sessão dela (claims), como dono. Devolve a saída (as linhas `t`/`f` são
   * os vereditos) ou a mensagem do erro.
   */
  const PESSOA_DE_FORA = "00000000-0000-0000-0000-0000000000b1";
  const CAMPANHA = "88880001";
  const cenario = (papel: string, sql: string): string => {
    try {
      return psql!(
        `begin;
         insert into auth.users (id, instance_id, aud, role, email)
         values ('${PESSOA_DE_FORA}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fora-verba@exemplo.invalido');
         update public.profiles set full_name = 'Fora ${papel}', papeis = array['${papel}'], role = '${papel}', is_active = true
          where id = '${PESSOA_DE_FORA}';
         insert into public.midia_campanhas (nome, plataforma, origem, id_externo, orcamento_diario, situacao, sincronizado_em)
         values ('Fora Pesquisa', 'google', 'google', '${CAMPANHA}', 50, 'no_ar', now() - interval '1 hour');
         select set_config('request.jwt.claims', json_build_object('sub', '${PESSOA_DE_FORA}', 'role', 'authenticated')::text, true);
         create temp table fora (nome text primary key, id uuid) on commit drop;
         ${sql};
         rollback;`,
      );
    } catch (e) {
      return String((e as Error).message);
    }
  };
  /** Os vereditos (`t`/`f`) que a saída trouxe, em ordem. */
  const vereditos = (saida: string): string[] => (saida.match(/^\s*[tf]\s*$/gm) ?? []).map((v) => v.trim());
  const id = (nome: string) => `(select id from fora where nome = '${nome}')`;
  /** O pedido p1 (50 → 80) aprovado e aplicado há 10 dias — fora da janela do retrato. */
  const P1_APLICADO_HA_10_DIAS = `
    insert into fora select 'p1', public.midia_copiloto_pedir_verba('${CAMPANHA}', 80, null);
    select public.midia_copiloto_decidir(array[${id("p1")}], 'aprovar');
    update public.midia_copiloto_acoes set situacao = 'em_aplicacao', reservada_em = now() - interval '10 days', tentativas = 1
     where id = ${id("p1")};
    update public.midia_copiloto_acoes set situacao = 'aplicada', concluida_em = now() - interval '10 days', lido_de_volta = '{"verba": 80}'
     where id = ${id("p1")};
    update public.midia_campanhas set orcamento_diario = 80 where id_externo = '${CAMPANHA}'`;
  const DESFAZER_P1 = `insert into fora select 'd1', public.midia_copiloto_desfazer(${id("p1")})`;
  /** O retrato (não prévia) com as propostas dadas, como a chave de serviço o grava. */
  const DOLAR = "$j$";
  const retratoCom = (propostas: string) =>
    `select public.midia_copiloto_gravar_diagnostico(${DOLAR}{"conta": "1", "de": "2026-10-08", "ate": "2026-10-14", "previa": false,
       "achados": [{"regra": "ritmo_de_verba", "gravidade": "media", "titulo": "t", "detalhe": "d"}],
       "propostas": [${propostas}]}${DOLAR}::jsonb)`;

  it("violação falha: a sessão não reescreve nem apaga a campanha sincronizada; a manual segue de staff", () => {
    const sincronizada = `where id_externo = '${CAMPANHA}'`;
    for (const papel of ["comercial", "marketing", "admin"]) {
      expect(
        vereditos(
          cenario(
            papel,
            `set local role authenticated;
             with u as (update public.midia_campanhas set nome = 'Forjada', orcamento_diario = 5 ${sincronizada} returning 1)
             select count(*) = 0 as ok from u;
             with d as (delete from public.midia_campanhas ${sincronizada} returning 1) select count(*) = 0 as ok from d;
             select (select count(*) = 1 from public.midia_campanhas ${sincronizada}) as ok`,
          ),
        ),
        papel,
      ).toEqual(["t", "t", "t"]);
    }
    // Ninguém cria uma sincronizada, nem transforma a manual numa.
    expect(
      cenario(
        "comercial",
        `set local role authenticated;
         insert into public.midia_campanhas (nome, plataforma, origem, id_externo, orcamento_diario)
         values ('Forjada', 'google', 'google', '88880999', 5)`,
      ),
    ).toContain("row-level security");
    expect(
      cenario(
        "comercial",
        `set local role authenticated;
         insert into public.midia_campanhas (nome, plataforma, orcamento_diario) values ('Fora Manual', 'meta', 30);
         update public.midia_campanhas set origem = 'google', plataforma = 'google', id_externo = '88880999' where nome = 'Fora Manual'`,
      ),
    ).toContain("row-level security");
    // Controle: a manual entra, muda e sai pela sessão de staff.
    expect(
      vereditos(
        cenario(
          "comercial",
          `set local role authenticated;
           insert into public.midia_campanhas (nome, plataforma, orcamento_diario) values ('Fora Manual', 'meta', 30);
           with u as (update public.midia_campanhas set orcamento_diario = 35 where nome = 'Fora Manual' returning 1)
           select count(*) = 1 as ok from u;
           with d as (delete from public.midia_campanhas where nome = 'Fora Manual' returning 1) select count(*) = 1 as ok from d`,
        ),
      ),
    ).toEqual(["t", "t"]);
    // E o pedido continua lendo o nome e a verba de lá, não da sessão.
    expect(
      vereditos(
        cenario(
          "marketing",
          `insert into fora select 'p', public.midia_copiloto_pedir_verba('${CAMPANHA}', 80, null);
           select (campanha_nome = 'Fora Pesquisa' and verba_atual = 50 and evidencias->>'verbaLidaDe' = 'sincronizacao') as ok
             from public.midia_copiloto_acoes where id = ${id("p")}`,
        ),
      ),
    ).toEqual(["t"]);
    expect(recusa("set local role anon; select count(*) from public.midia_campanhas")).toContain("permission denied");
    expect(recusa("set local role authenticated; truncate public.midia_campanhas")).toContain("permission denied");
  });

  it("violação falha: uma mudança de verba aberta por campanha — pedido, desfazer, índice e retrato", () => {
    // Pedido com um desfazer aprovado na campanha: recusado, e a frase diz que é um desfazer.
    expect(
      cenario("marketing", `${P1_APLICADO_HA_10_DIAS}; ${DESFAZER_P1};
                            select public.midia_copiloto_pedir_verba('${CAMPANHA}', 200, null)`),
    ).toContain("desfazer de verba aprovado");
    // Desfazer com um pedido PROPOSTO: o pedido sai de cena com o nome de quem desfez.
    expect(
      vereditos(
        cenario(
          "marketing",
          `${P1_APLICADO_HA_10_DIAS};
           insert into fora select 'p2', public.midia_copiloto_pedir_verba('${CAMPANHA}', 120, null);
           ${DESFAZER_P1};
           select (situacao = 'descartada' and descartada_motivo = 'Substituída pelo desfazer de Fora marketing.') as ok
             from public.midia_copiloto_acoes where id = ${id("p2")};
           select (situacao = 'aprovada' and verba_atual = 80 and verba_nova = 50) as ok
             from public.midia_copiloto_acoes where id = ${id("d1")}`,
        ),
      ),
    ).toEqual(["t", "t"]);
    // Desfazer com um pedido APROVADO: recusado.
    expect(
      cenario(
        "marketing",
        `${P1_APLICADO_HA_10_DIAS};
         insert into fora select 'p2', public.midia_copiloto_pedir_verba('${CAMPANHA}', 120, null);
         select public.midia_copiloto_decidir(array[${id("p2")}], 'aprovar');
         ${DESFAZER_P1}`,
      ),
    ).toContain("antes de desfazer");
    // O índice, sem função no meio: a segunda aberta, de outra chave, é recusada pelo nome.
    expect(
      cenario(
        "marketing",
        `${P1_APLICADO_HA_10_DIAS}; ${DESFAZER_P1};
         insert into public.midia_copiloto_acoes
           (chave, tipo, campanha_id_externo, campanha_nome, verba_atual, verba_nova, motivo, pedida_por)
         values ('fora:outra', 'mudar_verba', '${CAMPANHA}', 'Fora Pesquisa', 80, 120, 'teste de fora', '${PESSOA_DE_FORA}')`,
      ),
    ).toContain("midia_copiloto_acoes_uma_verba_aberta");
    // O retrato com a verba aberta por um desfazer (outra chave) pula a proposta, sem erro.
    expect(
      vereditos(
        cenario(
          "marketing",
          `${P1_APLICADO_HA_10_DIAS}; ${DESFAZER_P1};
           select (r->>'propostas' = '0' and r->>'puladas' = '1') as ok
             from (${retratoCom(`{"achado": 0, "chave": "verba:${CAMPANHA}", "tipo": "mudar_verba", "campanha_id_externo": "${CAMPANHA}",
                                 "campanha_nome": "Fora Pesquisa", "verba_atual": 80, "verba_nova": 56, "motivo": "corte"}`)} as r) s;
           select (situacao = 'aprovada') as ok from public.midia_copiloto_acoes where id = ${id("d1")}`,
        ),
      ),
    ).toEqual(["t", "t"]);
  });

  it("a verba de agora vem do que o script leu de volta quando é mais nova que a sincronização", () => {
    expect(
      vereditos(
        cenario(
          "marketing",
          `insert into fora select 'p1', public.midia_copiloto_pedir_verba('${CAMPANHA}', 80, null);
           select public.midia_copiloto_decidir(array[${id("p1")}], 'aprovar');
           update public.midia_copiloto_acoes set situacao = 'em_aplicacao', reservada_em = now(), tentativas = 1 where id = ${id("p1")};
           select public.midia_copiloto_registrar_resultado(${id("p1")}, 'aplicada', '{"verba": 80}', null);
           insert into fora select 'p2', public.midia_copiloto_pedir_verba('${CAMPANHA}', 120, null);
           select (verba_atual = 80 and evidencias->>'verbaLidaDe' = 'aplicacao') as ok
             from public.midia_copiloto_acoes where id = ${id("p2")}`,
        ),
      ),
    ).toEqual(["t"]);
  });

  it("o retrato tira de cena o pedido parado há mais de uma janela, e volta a propor para a campanha", () => {
    expect(
      vereditos(
        cenario(
          "marketing",
          `with i as (
             insert into public.midia_copiloto_acoes
               (chave, tipo, campanha_id_externo, campanha_nome, verba_atual, verba_nova, motivo, pedida_por, proposta_em)
             values ('verba:${CAMPANHA}', 'mudar_verba', '${CAMPANHA}', 'Fora Pesquisa', 50, 70, 'teste de fora',
                     '${PESSOA_DE_FORA}', now() - interval '8 days')
             returning id)
           insert into fora select 'parado', id from i;
           select (r->>'propostas' = '1') as ok
             from (${retratoCom(`{"achado": 0, "chave": "verba:${CAMPANHA}", "tipo": "mudar_verba", "campanha_id_externo": "${CAMPANHA}",
                                 "campanha_nome": "Fora Pesquisa", "verba_atual": 50, "verba_nova": 35, "motivo": "corte"}`)} as r) s;
           select (situacao = 'descartada' and descartada_motivo like 'Pedido sem decisão por 8 dias;%') as ok
             from public.midia_copiloto_acoes where id = ${id("parado")};
           select (count(*) = 1) as ok from public.midia_copiloto_acoes
            where campanha_id_externo = '${CAMPANHA}' and situacao = 'proposta' and diagnostico_id is not null`,
        ),
      ),
    ).toEqual(["t", "t", "t"]);
  });
});

/**
 * O Copiloto no Meta (20261017150000), pelo lado de fora. O aceite da
 * migração prova o efeito com sonda; aqui ficam a reaplicação (o catálogo e as
 * linhas não mudam), cada violação falhando pelo NOME da regra (com controles
 * que têm de entrar), e o isolamento entre as duas plataformas passando pelas
 * portas de verdade — o retrato, as duas reservas, o resultado, o desfazer, o
 * pedido de verba e a gravação do lote —, e o anúncio e o desempenho
 * sincronizados, que a sessão não reescreve. Toda escrita é desfeita.
 */
describe.skipIf(!temBanco)("o Copiloto no Meta, reaplicado e pelo lado de fora", () => {
  const MIGRACAO = "20261017150000_copiloto_meta.sql";

  /** A mensagem do erro, ou "" se o comando passou. Sempre desfeito. */
  const recusa = (sql: string): string => {
    try {
      psql!(`begin; ${sql}; rollback;`);
      return "";
    } catch (e) {
      return String((e as Error).message);
    }
  };

  /**
   * Regras, colunas e comentários das quatro tabelas que a migração toca;
   * corpo, privilégio e comentário de toda função `midia_*`; os índices da
   * ação e do retrato; e as contagens — num hash.
   */
  const TABELAS = ["midia_copiloto_acoes", "midia_copiloto_diagnosticos", "midia_copiloto_achados", "midia_anuncios",
                   "midia_copiloto_parametros"]
    .map((t) => `'public.${t}'::regclass`)
    .join(", ");
  const retrato = (): string => {
    const saida = psql!(
      `select md5(
         (select string_agg(conrelid::regclass::text || ':' || conname || ':' || pg_get_constraintdef(oid), '|'
                            order by conrelid::regclass::text, conname)
            from pg_constraint where conrelid in (${TABELAS}))
         || (select string_agg(attrelid::regclass::text || ':' || attname || ':' || format_type(atttypid, atttypmod)
                               || ':' || attnotnull, '|' order by attrelid::regclass::text, attnum)
               from pg_attribute where attrelid in (${TABELAS}) and attnum > 0 and not attisdropped)
         || (select string_agg(proname || ':' || pg_get_function_identity_arguments(oid) || ':' || md5(prosrc) || ':'
                               || prosecdef || ':' || coalesce(array_to_string(proconfig, ','), '') || ':'
                               || coalesce(array_to_string(proacl, ','), '') || ':' || coalesce(md5(obj_description(oid, 'pg_proc')), ''),
                               '|' order by proname, oid)
               from pg_proc where pronamespace = 'public'::regnamespace and proname like 'midia\\_%')
         || (select string_agg(indexrelid::regclass::text || ':' || pg_get_indexdef(indexrelid), '|' order by indexrelid::regclass::text)
               from pg_index where indrelid in ('public.midia_copiloto_acoes'::regclass, 'public.midia_copiloto_diagnosticos'::regclass))
         || (select string_agg(objoid::regclass::text || ':' || objsubid || ':' || md5(description), '|'
                               order by objoid::regclass::text, objsubid)
               from pg_description where classoid = 'pg_class'::regclass and objoid in (${TABELAS}))
         || (select string_agg(tablename || ':' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':'
                               || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' order by tablename, policyname)
               from pg_policies where schemaname = 'public' and tablename in ('midia_anuncios', 'midia_diario'))
         || (select string_agg(relname || ':' || coalesce(array_to_string(relacl, ','), ''), '|' order by relname)
               from pg_class where oid in ('public.midia_anuncios'::regclass, 'public.midia_diario'::regclass))
         || (select count(*) from public.midia_copiloto_acoes)::text
         || (select count(*) from public.midia_copiloto_diagnosticos)::text
         || (select count(*) from public.midia_copiloto_achados)::text
         || (select count(*) from public.auditoria_admin)::text
         || (select count(*) from public.midia_campanhas)::text
         || (select count(*) from public.midia_anuncios)::text
         || (select string_agg(id::text || ':' || coalesce(vigencia_ate::text, 'vigente'), '|' order by id)
               from public.midia_copiloto_parametros)) as h`,
    );
    return saida.match(/[0-9a-f]{32}/)?.[0] ?? `sem hash: ${saida}`;
  };

  // IDs com a cara de cada plataforma: o do Google, curto; os do Meta, do Graph.
  const G = "88881001";
  const M = "888800000000001101";
  const M_CONJUNTOS = "888800000000001102";
  const DUPLA = "88881201";
  const CJ = "888800000000001121";
  const AN = "888800000000001111";
  const NEGATIVA = `negativar:${G}:exata:teste de fora`;
  const ANUNCIO = `meta:pausar_anuncio:${AN}`;
  const CONJUNTO = `meta:pausar_conjunto:${CJ}`;

  /** Uma ação gravada como dono, de um retrato: só o gatilho e os CHECKs falam. */
  const acao = (plataforma: string, tipo: string, colunas = "", valores = "") =>
    `with d as (insert into public.midia_copiloto_diagnosticos (conta, de, ate, dados, resumo)
                values ('fora', '2026-10-10', '2026-10-16', '{}', '{}') returning id)
     insert into public.midia_copiloto_acoes
       (diagnostico_id, plataforma, chave, tipo, campanha_id_externo, campanha_nome, motivo${colunas ? `, ${colunas}` : ""})
     select d.id, '${plataforma}', 'fora:' || gen_random_uuid(), '${tipo}', '${M}', 'Fora', 'teste de fora'${valores ? `, ${valores}` : ""} from d`;
  const CONJ = `grupo_id_externo, grupo_nome`;
  const CONJ_V = `'${CJ}', 'Fora Conjunto'`;
  const ANUN = `${CONJ}, anuncio_id_externo, anuncio_nome`;
  const ANUN_V = `${CONJ_V}, '${AN}', 'Fora Anúncio'`;

  /** O retrato, como a chave de serviço o grava (sem `plataforma` = o script do Google). */
  const DOLAR = "$j$";
  const retratoDe = (plataforma: "google" | "meta" | "tiktok" | null, propostas: object[]) =>
    `select public.midia_copiloto_gravar_diagnostico(${DOLAR}${JSON.stringify({
      ...(plataforma ? { plataforma } : {}),
      conta: "fora",
      de: "2026-10-10",
      ate: "2026-10-16",
      previa: false,
      achados: [{ regra: plataforma === "meta" ? "meta_sem_lead" : "ritmo_de_verba", gravidade: "media", titulo: "t", detalhe: "d" }],
      propostas,
    })}${DOLAR}::jsonb)`;
  const negativa = {
    achado: 0, chave: NEGATIVA, tipo: "negativar", campanha_id_externo: G, campanha_nome: "Fora Google",
    texto: "teste de fora", correspondencia: "exata", motivo: "m",
  };
  const anuncio = {
    achado: 0, chave: ANUNCIO, tipo: "pausar_anuncio", campanha_id_externo: M, campanha_nome: "Fora Meta",
    grupo_id_externo: CJ, grupo_nome: "Fora Conjunto", anuncio_id_externo: AN, anuncio_nome: "Fora Anúncio", motivo: "m",
  };
  const conjunto = {
    achado: 0, chave: CONJUNTO, tipo: "pausar_conjunto", campanha_id_externo: M, campanha_nome: "Fora Meta",
    grupo_id_externo: CJ, grupo_nome: "Fora Conjunto", motivo: "m",
  };

  /**
   * Um cenário inteiro numa transação desfeita: um marketing com sessão, as
   * campanhas sincronizadas (uma do Google, uma do Meta com orçamento de
   * campanha, uma do Meta com a verba nos conjuntos, e o mesmo ID nas duas) e,
   * depois, o `sql`. Devolve a saída (as linhas `t`/`f` são os vereditos) ou a
   * mensagem do erro.
   */
  const PESSOA = "00000000-0000-0000-0000-0000000000c1";
  const cenario = (sql: string): string => {
    try {
      return psql!(
        `begin;
         insert into auth.users (id, instance_id, aud, role, email)
         values ('${PESSOA}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fora-meta@exemplo.invalido');
         update public.profiles set full_name = 'Fora marketing', papeis = array['marketing'], role = 'marketing', is_active = true
          where id = '${PESSOA}';
         insert into public.midia_campanhas (nome, plataforma, origem, id_externo, orcamento_diario, situacao, sincronizado_em)
         values ('Fora Google', 'google', 'google', '${G}', 50, 'no_ar', now() - interval '1 hour'),
                ('Fora Meta', 'meta', 'meta', '${M}', 40, 'no_ar', now() - interval '1 hour'),
                ('Fora Meta Conjuntos', 'meta', 'meta', '${M_CONJUNTOS}', null, 'no_ar', now() - interval '1 hour'),
                ('Fora Dupla Google', 'google', 'google', '${DUPLA}', 20, 'no_ar', now() - interval '1 hour'),
                ('Fora Dupla Meta', 'meta', 'meta', '${DUPLA}', 25, 'no_ar', now() - interval '1 hour');
         select set_config('request.jwt.claims', json_build_object('sub', '${PESSOA}', 'role', 'authenticated')::text, true);
         ${sql};
         rollback;`,
      );
    } catch (e) {
      return String((e as Error).message);
    }
  };
  /** Os vereditos (`t`/`f`) que a saída trouxe, em ordem. */
  const vereditos = (saida: string): string[] => (saida.match(/^\s*[tf]\s*$/gm) ?? []).map((v) => v.trim());
  const idDe = (chave: string, situacao = "") =>
    `(select id from public.midia_copiloto_acoes where chave = '${chave}'${situacao ? ` and situacao = '${situacao}'` : ""})`;
  /** Os dois retratos (o do Google e o do Meta), e o marketing aprovando a negativa, o anúncio e o conjunto. */
  const DUAS_FILAS = `
    set local role service_role;
    ${retratoDe(null, [negativa])};
    ${retratoDe("meta", [anuncio, conjunto])};
    reset role;
    select public.midia_copiloto_decidir(array[${idDe(NEGATIVA)}, ${idDe(ANUNCIO)}, ${idDe(CONJUNTO)}], 'aprovar')`;

  it("reaplicar levanta o aceite de novo e não muda regra, coluna, função, privilégio, comentário nem linha", () => {
    const antes = retrato();
    // Um hash nulo seria igual a ele mesmo: a comparação só vale com um md5 de verdade.
    expect(antes).toMatch(/^[0-9a-f]{32}$/);
    const saida = arquivo(PREFIXO, join(DIR_MIGRACOES, MIGRACAO));
    expect(saida).toContain("Aceite verificado");
    expect(saida).not.toMatch(/^psql.*ERROR:/m);
    expect(retrato()).toBe(antes);
  });

  it("nenhuma porta ganhou sobrecarga, e a reserva do Meta é só da chave de serviço", () => {
    // Duas funções com o mesmo nome deixariam o PostgREST ambíguo (PGRST203).
    expect(
      psql!(
        `select count(*) from (select proname from pg_proc where pronamespace = 'public'::regnamespace
                                 and proname like 'midia\\_%' group by proname having count(*) > 1) d`,
      ),
    ).toMatch(/^\s*0\s*$/m);
    for (const papel of ["anon", "authenticated"]) {
      expect(recusa(`set local role ${papel}; select * from public.midia_copiloto_reservar_acoes_meta(1)`), papel).toContain(
        "permission denied",
      );
    }
    expect(recusa("set local role service_role; select * from public.midia_copiloto_reservar_acoes_meta(1)")).toBe("");
  });

  it("violação falha: cada tipo na sua plataforma, e o tipo inventado cai na regra de tipo", () => {
    // Controles: o que é de cada plataforma entra.
    expect(recusa(acao("meta", "pausar_anuncio", ANUN, ANUN_V))).toBe("");
    expect(recusa(acao("meta", "pausar_conjunto", CONJ, CONJ_V))).toBe("");
    expect(recusa(acao("meta", "mudar_verba", "verba_atual, verba_nova", "40, 28"))).toBe("");
    expect(recusa(acao("google", "pausar_grupo", CONJ, CONJ_V))).toBe("");
    expect(recusa(acao("google", "pausar_conjunto", CONJ, CONJ_V))).toContain("midia_copiloto_acoes_tipo_da_plataforma");
    expect(recusa(acao("google", "pausar_anuncio", ANUN, ANUN_V))).toContain("midia_copiloto_acoes_tipo_da_plataforma");
    expect(recusa(acao("meta", "negativar", "texto, correspondencia", "'x', 'exata'"))).toContain(
      "midia_copiloto_acoes_tipo_da_plataforma",
    );
    expect(recusa(acao("meta", "pausar_grupo", CONJ, CONJ_V))).toContain("midia_copiloto_acoes_tipo_da_plataforma");
    expect(recusa(acao("meta", "excluir_anuncio", ANUN, ANUN_V))).toContain("midia_copiloto_acoes_tipo_valido");
    expect(recusa(acao("tiktok", "mudar_verba", "verba_atual, verba_nova", "40, 28"))).toContain(
      "midia_copiloto_acoes_plataforma_valida",
    );
  });

  it("violação falha: o anúncio leva o conjunto, o conjunto não leva anúncio, e reativar só nasce desfazendo", () => {
    expect(recusa(acao("meta", "pausar_conjunto", ANUN, ANUN_V))).toContain("midia_copiloto_acoes_alvo_do_tipo");
    expect(recusa(acao("meta", "pausar_anuncio", "anuncio_id_externo, anuncio_nome", `'${AN}', 'Fora Anúncio'`))).toContain(
      "midia_copiloto_acoes_alvo_do_tipo",
    );
    expect(recusa(acao("meta", "pausar_anuncio", `${CONJ}, anuncio_id_externo`, `${CONJ_V}, '${AN}'`))).toContain(
      "midia_copiloto_acoes_alvo_do_tipo",
    );
    expect(recusa(acao("meta", "pausar_anuncio", `${ANUN}, verba_atual, verba_nova`, `${ANUN_V}, 40, 28`))).toContain(
      "midia_copiloto_acoes_alvo_do_tipo",
    );
    expect(recusa(acao("google", "negativar", "texto, correspondencia, anuncio_id_externo", `'x', 'exata', '${AN}'`))).toContain(
      "midia_copiloto_acoes_alvo_do_tipo",
    );
    expect(recusa(acao("meta", "mudar_verba", "verba_atual, verba_nova, anuncio_nome", "40, 28, 'Fora Anúncio'"))).toContain(
      "midia_copiloto_acoes_alvo_do_tipo",
    );
    expect(recusa(acao("meta", "pausar_anuncio", ANUN, `${CONJ_V}, 'act_${AN}', 'Fora Anúncio'`))).toContain(
      "midia_copiloto_acoes_ids_validos",
    );
    expect(recusa(acao("meta", "reativar_conjunto", CONJ, CONJ_V))).toContain("midia_copiloto_acoes_origem_do_tipo");
    expect(recusa(acao("meta", "reativar_anuncio", ANUN, ANUN_V))).toContain("midia_copiloto_acoes_origem_do_tipo");
    // E pelo retrato: o diagnóstico do Meta não propõe reativar.
    expect(
      recusa(`set local role service_role; ${retratoDe("meta", [{ ...anuncio, chave: "meta:reativar_anuncio:1", tipo: "reativar_anuncio" }])}`),
    ).toContain("midia_copiloto_acoes_origem_do_tipo");
    expect(psql!("select count(*) from public.midia_copiloto_acoes where motivo = 'teste de fora'")).toMatch(/^\s*0\s*$/m);
  });

  it("violação falha: regra de achado fora da lista, achado do Meta com classe de termo, retrato de plataforma inventada", () => {
    const achado = (regra: string, grupo = "null") =>
      `with d as (insert into public.midia_copiloto_diagnosticos (plataforma, conta, de, ate, dados, resumo)
                  values ('meta', 'fora', '2026-10-10', '2026-10-16', '{}', '{}') returning id)
       insert into public.midia_copiloto_achados (diagnostico_id, ordem, regra, grupo, gravidade, titulo, detalhe)
       select d.id, 0, '${regra}', ${grupo}, 'alta', 't', 'd' from d`;
    for (const regra of ["meta_sem_lead", "meta_custo_por_lead", "meta_qualidade", "meta_medicao", "ritmo_de_verba"]) {
      expect(recusa(achado(regra)), regra).toBe("");
    }
    expect(recusa(achado("meta_inventada"))).toContain("midia_copiloto_achados_regra_valida");
    expect(recusa(achado("meta_sem_lead", "'outros'"))).toContain("midia_copiloto_achados_meta_sem_grupo");
    expect(
      recusa(`insert into public.midia_copiloto_diagnosticos (plataforma, conta, de, ate, dados, resumo)
              values ('tiktok', 'fora', '2026-10-10', '2026-10-16', '{}', '{}')`),
    ).toContain("midia_copiloto_diagnosticos_plataforma_valida");
    expect(recusa(`set local role service_role; ${retratoDe("tiktok", [])}`)).toContain("Plataforma do diagnóstico é google ou meta");
  });

  it("violação falha: o desfazer não troca de plataforma nem de anúncio, e a plataforma não muda depois de proposta", () => {
    const aplicado = `
      ${DUAS_FILAS};
      update public.midia_copiloto_acoes set situacao = 'em_aplicacao', reservada_em = now(), tentativas = 1 where id = ${idDe(ANUNCIO)};
      update public.midia_copiloto_acoes set situacao = 'aplicada', concluida_em = now() where id = ${idDe(ANUNCIO)}`;
    const desfazer = (plataforma: string, anuncioId: string) =>
      `insert into public.midia_copiloto_acoes
         (plataforma, desfaz_acao_id, chave, tipo, campanha_id_externo, campanha_nome, grupo_id_externo, grupo_nome,
          anuncio_id_externo, anuncio_nome, motivo, situacao, decidida_por, decidida_em)
       values ('${plataforma}', ${idDe(ANUNCIO)}, 'fora:desfazer', 'reativar_anuncio', '${M}', 'Fora Meta', '${CJ}', 'Fora Conjunto',
               '${anuncioId}', 'Fora Anúncio', 'teste de fora', 'aprovada', '${PESSOA}', now())`;
    // Controle: o inverso exato entra.
    expect(vereditos(cenario(`${aplicado}; ${desfazer("meta", AN)}; select true as ok`))).toEqual(["t"]);
    expect(cenario(`${aplicado}; ${desfazer("google", AN)}`)).toContain("inverso exato");
    expect(cenario(`${aplicado}; ${desfazer("meta", "12345")}`)).toContain("inverso exato");
    expect(
      cenario(`${DUAS_FILAS}; update public.midia_copiloto_acoes set situacao = 'recusada', plataforma = 'google' where id = ${idDe(ANUNCIO)}`),
    ).toContain("não muda depois de proposto");
    expect(
      cenario(`${DUAS_FILAS}; update public.midia_copiloto_acoes set situacao = 'recusada', anuncio_nome = 'Outro' where id = ${idDe(ANUNCIO)}`),
    ).toContain("não muda depois de proposto");
  });

  it("violação falha: o anúncio sincronizado só aceita conjunto numérico e situação da régua", () => {
    const lote = (anuncio: object) =>
      `set local role service_role;
       select public.midia_gravar_lote(${DOLAR}${JSON.stringify({
         plataforma: "meta", de: "2026-10-10", ate: "2026-10-16",
         campanhas: [{ id_externo: M, nome: "Fora Meta", situacao: "no_ar", orcamento_diario: 40, dias: [],
                       anuncios: [{ id_externo: AN, nome: "Fora Anúncio", ...anuncio }] }],
       })}${DOLAR}::jsonb)`;
    expect(recusa(lote({ conjunto_id_externo: CJ, situacao: "no_ar", conjunto_situacao: "pausada" }))).toBe("");
    expect(recusa(lote({ conjunto_id_externo: "act_1" }))).toContain("midia_anuncios_conjunto_id_valido");
    expect(recusa(lote({ situacao: "ACTIVE" }))).toContain("midia_anuncios_situacoes_validas");
    expect(recusa(lote({ conjunto_situacao: "ativa" }))).toContain("midia_anuncios_situacoes_validas");
  });

  it("violação falha: a sessão não reescreve anúncio nem desempenho sincronizados; o anúncio de campanha manual segue de staff", () => {
    // O lote do Meta, como a chave de serviço o grava: um anúncio e um dia de gasto.
    const sincronizado = `
      set local role service_role;
      select public.midia_gravar_lote(${DOLAR}${JSON.stringify({
        plataforma: "meta", de: "2026-10-10", ate: "2026-10-16",
        campanhas: [{ id_externo: M, nome: "Fora Meta", situacao: "no_ar", orcamento_diario: 40,
                      anuncios: [{ id_externo: AN, nome: "Fora Anúncio", conjunto_id_externo: CJ, conjunto_nome: "Fora Conjunto" }],
                      dias: [{ anuncio_id_externo: AN, dia: "2026-10-15", investido: 12.5, impressoes: 100, cliques: 3, conversoes: 1 }] }],
      })}${DOLAR}::jsonb);
      reset role;
      insert into public.midia_campanhas (nome, plataforma) values ('Fora Manual', 'meta')`;
    const daCampanha = (qual: string) => `(select id from public.midia_campanhas where ${qual})`;
    const META = daCampanha(`plataforma = 'meta' and id_externo = '${M}'`);
    const MANUAL = daCampanha(`nome = 'Fora Manual'`);
    // Marketing e, no mesmo cenário, a mesma checagem para quem a sessão é: nada muda no sincronizado.
    expect(
      vereditos(
        cenario(
          `${sincronizado};
           set local role authenticated;
           with u as (update public.midia_anuncios set nome = 'Forjado', conjunto_id_externo = '1' where id_externo = '${AN}' returning 1)
           select count(*) = 0 as ok from u;
           with d as (delete from public.midia_anuncios where id_externo = '${AN}' returning 1) select count(*) = 0 as ok from d;
           select (count(*) = 1) as ok from public.midia_diario where campanha_id = ${META};
           reset role;
           select (nome = 'Fora Anúncio' and conjunto_id_externo = '${CJ}') as ok from public.midia_anuncios where id_externo = '${AN}'`,
        ),
      ),
    ).toEqual(["t", "t", "t", "t"]);
    // Ninguém cria anúncio em campanha sincronizada, nem leva o manual para uma.
    expect(
      cenario(`${sincronizado}; set local role authenticated;
               insert into public.midia_anuncios (campanha_id, nome, conjunto_id_externo) values (${META}, 'Forjado', '${CJ}')`),
    ).toContain("row-level security");
    expect(
      cenario(`${sincronizado}; set local role authenticated;
               insert into public.midia_anuncios (campanha_id, nome) values (${MANUAL}, 'Fora Anúncio Manual');
               update public.midia_anuncios set campanha_id = ${META} where nome = 'Fora Anúncio Manual'`),
    ).toContain("row-level security");
    // O desempenho não se escreve nem se trunca pela sessão.
    for (const comando of [
      `update public.midia_diario set investido = 9999 where campanha_id = ${META}`,
      `delete from public.midia_diario where campanha_id = ${META}`,
      `insert into public.midia_diario (campanha_id, dia, investido) values (${MANUAL}, '2026-10-15', 1)`,
      "truncate public.midia_diario",
      "truncate public.midia_anuncios",
    ]) {
      expect(cenario(`${sincronizado}; set local role authenticated; ${comando}`), comando).toContain("permission denied");
    }
    // Controle: o anúncio de campanha manual entra, muda e sai pela sessão de staff.
    expect(
      vereditos(
        cenario(
          `${sincronizado}; set local role authenticated;
           insert into public.midia_anuncios (campanha_id, nome) values (${MANUAL}, 'Fora Anúncio Manual');
           with u as (update public.midia_anuncios set nome = 'Fora Anúncio Manual 2' where nome = 'Fora Anúncio Manual' returning 1)
           select count(*) = 1 as ok from u;
           with d as (delete from public.midia_anuncios where nome = 'Fora Anúncio Manual 2' returning 1) select count(*) = 1 as ok from d`,
        ),
      ),
    ).toEqual(["t", "t"]);
    // Cliente (logado, sem perfil de equipe) não lê o anúncio nem o gasto; anon nem chega.
    expect(
      vereditos(
        cenario(
          `${sincronizado};
           select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
           set local role authenticated;
           select (count(*) = 0) as ok from public.midia_diario;
           select (count(*) = 0) as ok from public.midia_anuncios`,
        ),
      ),
    ).toEqual(["t", "t"]);
    for (const tabela of ["midia_anuncios", "midia_diario"]) {
      expect(recusa(`set local role anon; select count(*) from public.${tabela}`), tabela).toContain("permission denied");
    }
  });

  /** Os 15 argumentos nomeados da porta das regras — a chamada do site de hoje. */
  const REGRAS_15 = `p_gasto_minimo_termo => 11, p_gasto_minimo_grupo => 51, p_gasto_minimo_campanha => 101,
    p_ritmo_alto_pct => 90, p_ritmo_baixo_pct => 50, p_reducao_verba_pct => 30, p_iq_baixo => 3,
    p_leads_gclid_minimos => 2, p_cliques_minimos_gclid => 30, p_perda_por_verba_pct => 10,
    p_perda_por_ranking_pct => 30, p_concorrentes => '{}', p_cidades_fora => '{}',
    p_palavras_informativas => '{}', p_hora_do_diagnostico => 7`;
  const regrasMeta = (conjunto: number, campanha: number, semLead: number, caro: number, maduros: number, dias: number) =>
    `p_meta_gasto_minimo_conjunto => ${conjunto}, p_meta_gasto_minimo_campanha => ${campanha},
     p_meta_vezes_sem_lead => ${semLead}, p_meta_vezes_custo_caro => ${caro},
     p_meta_leads_maduros_minimos => ${maduros}, p_meta_dias_para_amadurecer => ${dias}`;
  const vigenteE = (conjunto: number, campanha: number, semLead: number, caro: number, maduros: number, dias: number) =>
    `select (meta_gasto_minimo_conjunto = ${conjunto} and meta_gasto_minimo_campanha = ${campanha}
             and meta_vezes_sem_lead = ${semLead} and meta_vezes_custo_caro = ${caro}
             and meta_leads_maduros_minimos = ${maduros} and meta_dias_para_amadurecer = ${dias}) as ok
       from public.midia_copiloto_parametros where vigencia_ate is null`;

  it("as regras do Meta são parâmetro com vigência: a vigente ganhou o padrão; 21 argumentos gravam, os 15 nomeados copiam, e a trilha traz os valores", () => {
    expect(
      vereditos(
        cenario(
          `${vigenteE(100, 200, 2.5, 2, 8, 7)};
           select public.midia_copiloto_nova_vigencia(${REGRAS_15}, ${regrasMeta(150, 300, 3, 2.5, 10, 5)});
           ${vigenteE(150, 300, 3, 2.5, 10, 5)};
           select public.midia_copiloto_nova_vigencia(${REGRAS_15});
           ${vigenteE(150, 300, 3, 2.5, 10, 5)};
           select (gasto_minimo_termo = 11 and count(*) over () = 1) as ok
             from public.midia_copiloto_parametros where vigencia_ate is null;
           select exists (select 1 from public.auditoria_admin
                           where acao = 'copiloto_regras' and autor_id = '${PESSOA}'
                             and detalhe like '%; Meta: gasto mínimo 150.00 no conjunto e 300.00 na campanha em 14 dias, sem lead a partir de 3.00× o custo por lead, caro a partir de 2.50×, qualidade com 10 lead(s) maduro(s) de 5 dia(s)') as ok`,
        ),
      ),
    ).toEqual(["t", "t", "t", "t", "t"]);
  });

  it("violação falha: cada regra do Meta fora da faixa, pela tabela e pela porta", () => {
    const vigencia = (coluna: string, valor: string) =>
      `insert into public.midia_copiloto_parametros (gasto_minimo_termo, gasto_minimo_grupo, gasto_minimo_campanha,
         ritmo_alto_pct, ritmo_baixo_pct, reducao_verba_pct, iq_baixo, leads_gclid_minimos, cliques_minimos_gclid,
         perda_por_verba_pct, perda_por_ranking_pct, hora_do_diagnostico, vigencia_ate, ${coluna})
       values (1, 1, 1, 90, 50, 30, 3, 2, 30, 10, 30, 7, current_date, ${valor})`;
    // Controles: as bordas de dentro entram.
    for (const [coluna, valor] of [
      ["meta_gasto_minimo_conjunto", "100000"], ["meta_gasto_minimo_campanha", "0.01"], ["meta_vezes_sem_lead", "1"],
      ["meta_vezes_sem_lead", "10"], ["meta_vezes_custo_caro", "1.01"], ["meta_leads_maduros_minimos", "500"],
      ["meta_dias_para_amadurecer", "1"], ["meta_dias_para_amadurecer", "29"],
    ]) {
      expect(recusa(vigencia(coluna, valor)), `${coluna} ${valor}`).toBe("");
    }
    for (const [coluna, valor] of [
      ["meta_gasto_minimo_conjunto", "0"], ["meta_gasto_minimo_campanha", "100000.01"], ["meta_vezes_sem_lead", "0.99"],
      ["meta_vezes_sem_lead", "10.01"], ["meta_vezes_custo_caro", "1"], ["meta_vezes_custo_caro", "10.01"],
      ["meta_leads_maduros_minimos", "0"], ["meta_leads_maduros_minimos", "501"],
      ["meta_dias_para_amadurecer", "0"], ["meta_dias_para_amadurecer", "30"],
    ]) {
      expect(recusa(vigencia(coluna, valor)), `${coluna} ${valor}`).toContain("midia_copiloto_parametros_meta_validos");
    }
    expect(cenario(`select public.midia_copiloto_nova_vigencia(${REGRAS_15}, p_meta_dias_para_amadurecer => 30)`)).toContain(
      "midia_copiloto_parametros_meta_validos",
    );
  });

  it("a porta das regras é uma só, de 21 argumentos (6 opcionais), de authenticated e não de anon", () => {
    const VINTE_E_UM =
      "public.midia_copiloto_nova_vigencia(numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text[], text[], text[], integer, numeric, numeric, numeric, numeric, integer, integer)";
    expect(
      vereditos(
        psql!(
          `select (count(*) = 1) as ok from pg_proc where pronamespace = 'public'::regnamespace and proname = 'midia_copiloto_nova_vigencia';
           select (pronargs = 21 and pronargdefaults = 6 and prosecdef) as ok from pg_proc where oid = to_regprocedure('${VINTE_E_UM}');
           select (has_function_privilege('authenticated', '${VINTE_E_UM}', 'execute')
                   and not has_function_privilege('anon', '${VINTE_E_UM}', 'execute')) as ok`,
        ),
      ),
    ).toEqual(["t", "t", "t"]);
    expect(recusa(`set local role anon; select public.midia_copiloto_nova_vigencia(${REGRAS_15})`)).toContain("permission denied");
    expect(
      recusa(
        `select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
         set local role authenticated; select public.midia_copiloto_nova_vigencia(${REGRAS_15})`,
      ),
    ).toContain("Só Administrador ou Marketing");
  });

  it("a sincronização grava conjunto e situação do anúncio, e o lote que não os traz não os apaga", () => {
    const lote = (plataforma: string, campanha: string, anuncio: object) =>
      `select public.midia_gravar_lote(${DOLAR}${JSON.stringify({
        plataforma, de: "2026-10-10", ate: "2026-10-16",
        campanhas: [{ id_externo: campanha, nome: `Fora ${plataforma}`, situacao: "no_ar", orcamento_diario: 40, dias: [],
                      anuncios: [anuncio] }],
      })}${DOLAR}::jsonb)`;
    expect(
      vereditos(
        cenario(
          `set local role service_role;
           ${lote("meta", M, { id_externo: AN, nome: "Fora Anúncio", conjunto_id_externo: CJ, conjunto_nome: "Fora Conjunto", situacao: "no_ar", conjunto_situacao: "no_ar" })};
           ${lote("meta", M, { id_externo: AN, nome: "Fora Anúncio 2", conjunto_situacao: "pausada" })};
           ${lote("google", G, { id_externo: "77770001", nome: "Fora Anúncio Google" })};
           reset role;
           select (nome = 'Fora Anúncio 2' and conjunto_id_externo = '${CJ}' and conjunto_nome = 'Fora Conjunto'
                   and situacao = 'no_ar' and conjunto_situacao = 'pausada') as ok
             from public.midia_anuncios where id_externo = '${AN}';
           select (conjunto_id_externo is null and conjunto_nome is null and situacao is null and conjunto_situacao is null) as ok
             from public.midia_anuncios where id_externo = '77770001'`,
        ),
      ),
    ).toEqual(["t", "t"]);
  });

  it("um retrato do Meta não descarta proposta do Google, e o do Google não descarta a do Meta", () => {
    expect(
      vereditos(
        cenario(
          `set local role service_role;
           ${retratoDe(null, [negativa])};
           ${retratoDe("meta", [anuncio])};
           reset role;
           select (situacao = 'proposta' and plataforma = 'google') as ok from public.midia_copiloto_acoes where chave = '${NEGATIVA}';
           select (plataforma = 'meta') as ok from public.midia_copiloto_diagnosticos
            where id = (select diagnostico_id from public.midia_copiloto_acoes where chave = '${ANUNCIO}');
           set local role service_role;
           ${retratoDe("google", [])};
           reset role;
           select (situacao = 'descartada') as ok from public.midia_copiloto_acoes where chave = '${NEGATIVA}';
           select (situacao = 'proposta' and plataforma = 'meta' and anuncio_id_externo = '${AN}' and grupo_id_externo = '${CJ}') as ok
             from public.midia_copiloto_acoes where chave = '${ANUNCIO}';
           set local role service_role;
           ${retratoDe("meta", [])};
           reset role;
           select (situacao = 'descartada') as ok from public.midia_copiloto_acoes where chave = '${ANUNCIO}'`,
        ),
      ),
    ).toEqual(["t", "t", "t", "t", "t"]);
  });

  it("a reserva do Google não entrega o Meta, e a do Meta não entrega o Google — com a fila da outra cheia", () => {
    // As duas ordens: quem reserva primeiro encontra a fila da outra plataforma cheia.
    const doGoogle = `select (count(*) filter (where plataforma <> 'google') = 0 and count(*) filter (where chave = '${NEGATIVA}') = 1) as ok
                        from public.midia_copiloto_reservar_acoes(50)`;
    const doMeta = `select (count(*) filter (where plataforma <> 'meta') = 0
                            and count(*) filter (where chave in ('${ANUNCIO}', '${CONJUNTO}')) = 2) as ok
                      from public.midia_copiloto_reservar_acoes_meta(20)`;
    expect(vereditos(cenario(`${DUAS_FILAS}; set local role service_role; ${doGoogle}; ${doMeta}`))).toEqual(["t", "t"]);
    expect(vereditos(cenario(`${DUAS_FILAS}; set local role service_role; ${doMeta}; ${doGoogle}`))).toEqual(["t", "t"]);
  });

  it("o limite de cada reserva vale qualquer que seja o plano (estatística de tabela vazia)", () => {
    // Com a estatística de tabela vazia, o planejador escolhe um Nested Loop
    // Semi Join que reexecuta o subselect com LIMIT a cada linha: a forma
    // antiga (`where id in (select ... limit n for update skip locked)`)
    // entregava 2 com limite 1. O lote materializado entrega o limite.
    // Cinco propostas de cada plataforma, de um retrato gravado como dono.
    const cinco = (plataforma: string, tipo: string) =>
      `insert into public.midia_copiloto_acoes
         (plataforma, diagnostico_id, chave, tipo, campanha_id_externo, campanha_nome, grupo_id_externo, grupo_nome, motivo)
       select '${plataforma}', (select id from public.midia_copiloto_diagnosticos where conta = 'fora-limite'),
              'fora:limite:${plataforma}:' || g, '${tipo}', '${M}', 'Fora', (1000 + g)::text, 'g', 'teste de fora'
         from generate_series(1, 5) g`;
    expect(
      vereditos(
        cenario(
          `analyze public.midia_copiloto_acoes;
           insert into public.midia_copiloto_diagnosticos (conta, de, ate, dados, resumo)
           values ('fora-limite', '2026-10-10', '2026-10-16', '{}', '{}');
           ${cinco("meta", "pausar_conjunto")};
           ${cinco("google", "pausar_grupo")};
           select public.midia_copiloto_decidir(array(select id from public.midia_copiloto_acoes where chave like 'fora:limite:%'), 'aprovar');
           set local role service_role;
           select (count(*) = 1) as ok from public.midia_copiloto_reservar_acoes_meta(1);
           select (count(*) = 1) as ok from public.midia_copiloto_reservar_acoes(1);
           select (count(*) = 1) as ok from public.midia_copiloto_reservar_acoes_meta(0);
           select (count(*) = 3) as ok from public.midia_copiloto_reservar_acoes_meta(500);
           select (count(*) = 4) as ok from public.midia_copiloto_reservar_acoes(50)`,
        ),
      ),
    ).toEqual(["t", "t", "t", "t", "t"]);
  });

  it("o resultado do Meta vai à trilha como 'Copiloto (API do Meta)', e o desfazer do anúncio nasce no Meta, no mesmo anúncio", () => {
    expect(
      vereditos(
        cenario(
          `${DUAS_FILAS};
           set local role service_role;
           select count(*) from public.midia_copiloto_reservar_acoes_meta(20);
           select public.midia_copiloto_registrar_resultado(${idDe(ANUNCIO)}, 'aplicada', '{"status": "PAUSED"}', null);
           reset role;
           select exists (select 1 from public.auditoria_admin
                           where acao = 'copiloto_aplicou' and autor_nome = 'Copiloto (API do Meta)'
                             and detalhe like 'Pausar o anúncio Fora Anúncio (Fora Conjunto · Fora Meta) (ação %') as ok;
           select public.midia_copiloto_desfazer(${idDe(ANUNCIO)});
           select (tipo = 'reativar_anuncio' and situacao = 'aprovada' and plataforma = 'meta'
                   and anuncio_id_externo = '${AN}' and grupo_id_externo = '${CJ}') as ok
             from public.midia_copiloto_acoes where desfaz_acao_id = ${idDe(ANUNCIO)}`,
        ),
      ),
    ).toEqual(["t", "t"]);
  });

  it("o pedido de verba numa campanha do Meta nasce do Meta; verba nos conjuntos e ID nas duas plataformas são recusados", () => {
    expect(
      vereditos(
        cenario(
          `select public.midia_copiloto_pedir_verba('${M}', 60, null);
           select (plataforma = 'meta' and verba_atual = 40 and verba_nova = 60 and chave = 'verba:${M}') as ok
             from public.midia_copiloto_acoes where chave = 'verba:${M}' and situacao = 'proposta';
           select public.midia_copiloto_pedir_verba('${G}', 60, null);
           select (plataforma = 'google' and verba_atual = 50) as ok
             from public.midia_copiloto_acoes where chave = 'verba:${G}' and situacao = 'proposta'`,
        ),
      ),
    ).toEqual(["t", "t"]);
    expect(cenario(`select public.midia_copiloto_pedir_verba('${M_CONJUNTOS}', 60, null)`)).toContain(
      "A verba desta campanha do Meta fica nos conjuntos de anúncios",
    );
    expect(cenario(`select public.midia_copiloto_pedir_verba('${DUPLA}', 30, null)`)).toContain(
      "é de uma campanha do Google Ads e de uma do Meta",
    );
    expect(cenario(`select public.midia_copiloto_pedir_verba('88889999', 30, null)`)).toContain(
      "não está entre as do Google Ads nem as do Meta sincronizadas",
    );
    expect(cenario(`select public.midia_copiloto_pedir_verba('${M}', 401, null)`)).toContain("mude pelo Gerenciador de Anúncios do Meta");
  });
});

/**
 * Os veículos de interesse do lead (20261005120000), com DADO e nos dois
 * mundos da RLS de `leads`.
 *
 * Na cadeia a migração roda num banco sem lead nenhum e com `leads` aberta a
 * toda a equipe (`is_staff`) — produção em 2026-10-05. Aqui: entram leads com
 * veículo, a tabela é esvaziada, a 20261003130000 (escopo — já aplicada no
 * fim da cadeia, e aqui reaplicada, para o bloco não depender disso) e a
 * migração é REAPLICADA. Isso prova três coisas que a cadeia sozinha não
 * prova: a carga inicial com linhas de verdade, o aceite no mundo do escopo, e
 * que reaplicar é seguro.
 *
 * Depois, os invariantes pelo lado de fora: cada violação tem de falhar, pelo
 * nome da regra.
 *
 * ⚠️ Este bloco e o da agenda, logo abaixo, ficam por último de propósito:
 * contam com a RLS de `leads` por escopo no banco de teste.
 */
describe.skipIf(!temBanco)("os veículos de interesse do lead, com dado e nos dois mundos", () => {
  const MIGRACAO = "20261005120000_veiculos_de_interesse.sql";
  const ESCOPO = "20261003130000_leads_rls_por_escopo.sql";
  const UNO = 7950008; // os dois carros de semente do andaime
  const BMW = 7950009;
  let reaplicada = "";

  /** A expressão é verdadeira? Lê a linha `t` do psql, e só ela. */
  const vale = (expr: string): boolean => /^\s*t\s*$/m.test(psql!(`select (${expr}) as ok`));

  /**
   * A mesma pergunta, na sessão de alguém. O `case` garante a ordem: primeiro
   * os claims, depois a expressão — as funções de relatório leem `auth.uid()`.
   */
  const valeNaSessaoDe = (email: string, expr: string): boolean =>
    vale(
      `case when (select set_config('request.jwt.claims',
                     json_build_object('sub', p.id, 'role', 'authenticated')::text, true)
                    from public.profiles p where p.email = '${email}') is not null
            then (${expr}) end`,
    );

  /** A mensagem do erro, ou "" se o comando passou. */
  const recusa = (sql: string): string => {
    try {
      psql!(sql);
      return "";
    } catch (e) {
      return String((e as Error).message);
    }
  };

  const opcao = (lead: string, carro: number) =>
    `(select v.id from public.leads_veiculos v join public.leads l on l.id = v.lead_id
       where l.nome = '${lead}' and v.veiculo_id = ${carro})`;

  beforeAll(() => {
    psql!(`
      insert into auth.users (id, instance_id, aud, role, email) values
        (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lv-equipe@exemplo.invalido'),
        (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lv-cliente@exemplo.invalido');
      update public.profiles set full_name = 'LV Marketing', papeis = array['marketing'], role = 'marketing', is_active = true
       where email = 'lv-equipe@exemplo.invalido';
      update public.profiles set full_name = 'LV Cliente', papeis = array['cliente'], role = 'cliente', is_active = true
       where email = 'lv-cliente@exemplo.invalido';
      insert into public.leads (nome, telefone, interesse, veiculo_id) values
        ('LV aberto',   '5541900000001', 'Uno',              ${UNO}),
        ('LV ganho',    '5541900000002', 'BMW',              ${BMW}),
        ('LV perdido',  '5541900000003', 'Uno',              ${UNO}),
        ('LV sumiu',    '5541900000004', '  Fiat Argo 2020 ', 111),
        ('LV sem nome', '5541900000005', null,               222),
        ('LV sem carro','5541900000006', 'qualquer',         null);
      update public.leads set situacao = (select chave from public.funil_etapas where tipo = 'ganho' and ativa limit 1)
       where nome = 'LV ganho';
      update public.leads set situacao = (select chave from public.funil_etapas where tipo = 'perdido' and ativa limit 1)
       where nome = 'LV perdido';
      delete from public.leads_veiculos;
    `);
    arquivo(PREFIXO, join(DIR_MIGRACOES, ESCOPO));
    reaplicada = arquivo(PREFIXO, join(DIR_MIGRACOES, MIGRACAO));
  }, 120_000);

  it("o aceite passa com leads por is_staff (a cadeia) e com leads por escopo (a reaplicação)", () => {
    expect(saidas.get(MIGRACAO)).toContain("leads por is_staff (20261003130000 ainda não aplicada)");
    expect(reaplicada).toContain("Aceite verificado");
    expect(reaplicada).toContain("leads por escopo (20261003130000 aplicada)");
    expect(reaplicada).not.toMatch(/^psql.*ERROR:/m);
  });

  it("a carga inicial: uma opção por lead com veículo, ganho vira escolhido, perda não vira descarte", () => {
    expect(reaplicada).toContain("Carga inicial: 5 linha(s)");
    expect(vale("(select count(*) from public.leads_veiculos) = 5")).toBe(true);
    expect(
      vale(`(select situacao = 'escolhido' and resolvido_em is not null from public.leads_veiculos where id = ${opcao("LV ganho", BMW)})`),
    ).toBe(true);
    expect(
      vale(
        `(select situacao = 'em_avaliacao' and motivo_descarte is null and resolvido_em is null
            from public.leads_veiculos where id = ${opcao("LV perdido", UNO)})`,
      ),
    ).toBe(true);
    expect(vale("(select count(*) from public.leads_veiculos where situacao = 'descartado') = 0")).toBe(true);
    // Sem autor, e datada pelo lead.
    expect(
      vale(
        `(select bool_and(v.adicionado_por is null and v.criado_em = l.created_at)
            from public.leads_veiculos v join public.leads l on l.id = v.lead_id)`,
      ),
    ).toBe(true);
  });

  it("o retrato: rótulo do estoque, do interesse do lead ou genérico; preço só de carro que existe", () => {
    expect(
      vale(
        `(select veiculo_rotulo = 'fiat uno mille fire economy 2013' and veiculo_preco = 28900
            from public.leads_veiculos where id = ${opcao("LV aberto", UNO)})`,
      ),
    ).toBe(true);
    // A versão embutida no modelo não se repete (a regra de nomeDoVeiculo).
    expect(
      vale(`(select veiculo_rotulo = 'bmw x4 m40i 3.0 m sport 2022' from public.leads_veiculos where id = ${opcao("LV ganho", BMW)})`),
    ).toBe(true);
    expect(
      vale(
        `(select veiculo_rotulo = 'Fiat Argo 2020' and veiculo_preco is null
            from public.leads_veiculos where id = ${opcao("LV sumiu", 111)})`,
      ),
    ).toBe(true);
    expect(
      vale(`(select veiculo_rotulo = 'Veículo nº 222' from public.leads_veiculos where id = ${opcao("LV sem nome", 222)})`),
    ).toBe(true);
  });

  it("reaplicar não refaz a carga: a opção que o admin apagou não volta", () => {
    psql!(`delete from public.leads_veiculos where id = ${opcao("LV sem nome", 222)}`);
    const denovo = arquivo(PREFIXO, join(DIR_MIGRACOES, MIGRACAO));
    expect(denovo).toContain("Carga inicial pulada");
    expect(denovo).toContain("Aceite verificado");
    expect(vale("(select count(*) from public.leads_veiculos) = 4")).toBe(true);
  });

  it("violação falha: descartar pede motivo, o motivo é da lista, e 'outro' pede nota", () => {
    const alvo = opcao("LV aberto", UNO);
    expect(recusa(`update public.leads_veiculos set situacao = 'descartado' where id = ${alvo}`)).toContain(
      "leads_veiculos_motivo_so_no_descarte",
    );
    expect(
      recusa(`update public.leads_veiculos set situacao = 'descartado', motivo_descarte = 'feio' where id = ${alvo}`),
    ).toContain("leads_veiculos_motivo_valido");
    expect(
      recusa(`update public.leads_veiculos set situacao = 'descartado', motivo_descarte = 'outro' where id = ${alvo}`),
    ).toContain("leads_veiculos_outro_pede_nota");
    expect(recusa(`update public.leads_veiculos set motivo_descarte = 'preco' where id = ${alvo}`)).toContain(
      "leads_veiculos_motivo_so_no_descarte",
    );
    expect(recusa(`update public.leads_veiculos set situacao = 'talvez' where id = ${alvo}`)).toContain(
      "leads_veiculos_situacao_valida",
    );
    // Nada disso passou.
    expect(vale(`(select situacao = 'em_avaliacao' from public.leads_veiculos where id = ${alvo})`)).toBe(true);
  });

  it("violação falha: um escolhido por lead, o mesmo carro uma vez, e a opção não troca de carro", () => {
    const novo = (situacao: string) =>
      `insert into public.leads_veiculos (lead_id, veiculo_id, veiculo_rotulo, situacao)
       select id, ${UNO}, 'fiat uno', '${situacao}' from public.leads where nome = 'LV ganho'`;
    expect(recusa(novo("escolhido"))).toContain("leads_veiculos_um_escolhido_por_lead");
    // Controle positivo: o segundo carro entra, em avaliação…
    expect(recusa(novo("em_avaliacao"))).toBe("");
    // …e não entra de novo.
    expect(recusa(novo("em_avaliacao"))).toContain("leads_veiculos_lead_veiculo_unico");
    expect(recusa(`update public.leads_veiculos set veiculo_id = ${BMW} where id = ${opcao("LV aberto", UNO)}`)).toContain(
      "não troca de lead nem de carro",
    );
    // A opção vai embora com o lead (LGPD: a eliminação do lead leva tudo).
    psql!(`delete from public.leads where nome = 'LV sumiu'`);
    expect(vale("(select count(*) from public.leads_veiculos where veiculo_id = 111) = 0")).toBe(true);
  });

  it("o resumo do veículo: contagens, motivos e notas — para a equipe, e sem dado de pessoa", () => {
    // O lead perdido descarta o Uno por preço, com nota.
    psql!(
      `update public.leads_veiculos
          set situacao = 'descartado', motivo_descarte = 'preco', nota = 'achou caro para o ano'
        where id = ${opcao("LV perdido", UNO)}`,
    );
    const resumo = `(select to_jsonb(r) from public.resumo_de_interesse_do_veiculo(${UNO}) r)`;
    // Uno: LV aberto (em avaliação), LV perdido (descartado), LV ganho (em avaliação, do teste acima).
    // Quem pergunta é do Marketing: no mundo do escopo não vê lead nenhum, e lê o resumo da loja inteira.
    expect(
      valeNaSessaoDe(
        "lv-equipe@exemplo.invalido",
        `${resumo} @> '{"total": 3, "em_avaliacao": 2, "sem_resolucao": 1, "escolhido": 0, "descartado": 1,
                       "motivos": [{"motivo": "preco", "total": 1}]}'::jsonb
         and ${resumo}->'notas'->0->>'nota' = 'achou caro para o ano'
         and ${resumo}->'notas'->0->>'motivo' = 'preco'`,
      ),
    ).toBe(true);
    // Nada de nome, telefone, lead ou autor na saída.
    expect(
      valeNaSessaoDe(
        "lv-equipe@exemplo.invalido",
        `${resumo}::text !~ 'LV (aberto|perdido|ganho)|55419|lead_id|adicionado_por|resolvido_por'`,
      ),
    ).toBe(true);
    // O ranking traz os dois carros do estoque e o que já saiu dele.
    expect(
      valeNaSessaoDe(
        "lv-equipe@exemplo.invalido",
        `(select count(*) filter (where no_estoque) = 2
                 and bool_or(veiculo_id = ${UNO} and total = 3 and motivo_principal = 'preco')
            from public.interesse_por_veiculo())`,
      ),
    ).toBe(true);
  });

  it("quem não é da equipe não lê o relatório — nem cliente logado, nem chamada sem sessão", () => {
    expect(recusa(`select total from public.resumo_de_interesse_do_veiculo(${UNO})`)).toContain("restrito à equipe");
    expect(recusa(`select count(*) from public.interesse_por_veiculo()`)).toContain("restrito à equipe");
    expect(
      recusa(
        `select case when (select set_config('request.jwt.claims',
                             json_build_object('sub', p.id, 'role', 'authenticated')::text, true)
                            from public.profiles p where p.email = 'lv-cliente@exemplo.invalido') is not null
                     then (select total from public.resumo_de_interesse_do_veiculo(${UNO})) end`,
      ),
    ).toContain("restrito à equipe");
  });

  it("nada foi pendurado em estoque_motors nem em leads", () => {
    expect(
      vale(
        `not exists (select 1 from pg_constraint
                      where confrelid = 'public.estoque_motors'::regclass)
         and not exists (select 1 from pg_trigger
                          where tgrelid = 'public.estoque_motors'::regclass and not tgisinternal)
         and (select count(*) = 2 from public.estoque_motors)`,
      ),
    ).toBe(true);
  });
});

/**
 * A agenda para toda a equipe (20261005150000), com DADO e por cima do escopo.
 *
 * Na cadeia ela roda com `leads` por `is_staff` e a view antiga. Aqui o banco
 * já está no mundo do escopo (a 20261003130000 veio depois dela na cadeia), há
 * leads de verdade e a migração é REAPLICADA: prova a idempotência, o aceite
 * começando pelo outro mundo, e — pelo lado de fora, na sessão de cada um — o
 * que a rota `/api/pessoas` vai receber.
 */
describe.skipIf(!temBanco)("a agenda para toda a equipe, com dado e por cima do escopo", () => {
  const MIGRACAO = "20261005150000_agenda_para_toda_a_equipe.sql";
  let reaplicada = "";

  const vale = (expr: string): boolean => /^\s*t\s*$/m.test(psql!(`select (${expr}) as ok`));

  /**
   * A expressão, lida como `authenticated` na sessão de alguém — a pele que o
   * PostgREST veste. Tudo num comando só: `set local` não sobrevive a ele.
   */
  const naSessaoDe = (email: string, expr: string): boolean =>
    /^\s*t\s*$/m.test(
      psql!(
        `begin;
         do $sessao$
         begin
           perform set_config('request.jwt.claims',
                     json_build_object('sub', p.id, 'role', 'authenticated')::text, true)
              from public.profiles p where p.email = '${email}';
           if not found then
             raise exception 'sem perfil para ${email}';
           end if;
         end $sessao$;
         set local role authenticated;
         select (${expr}) as ok;
         rollback;`,
      ),
    );

  const recusa = (sql: string): string => {
    try {
      psql!(sql);
      return "";
    } catch (e) {
      return String((e as Error).message);
    }
  };

  const LEADS = "origem = 'lead' and nome like 'AG lead %'";
  const COMERCIAL = "(especialidade is not null or observacoes is not null)";

  beforeAll(() => {
    psql!(`
      insert into auth.users (id, instance_id, aud, role, email)
      select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             'ag-' || q || '@exemplo.invalido'
        from unnest(array['admin', 'sdr', 'vendedor', 'financeiro', 'marketing', 'cliente', 'saiu']) q;
      update public.profiles set full_name = 'AG Admin', papeis = array['admin'], role = 'admin', is_active = true
       where email = 'ag-admin@exemplo.invalido';
      update public.profiles set full_name = 'AG SDR', papeis = array['sdr'], role = 'sdr', is_active = true
       where email = 'ag-sdr@exemplo.invalido';
      update public.profiles set full_name = 'AG Vendedor', papeis = array['comercial'], role = 'comercial', is_active = true
       where email = 'ag-vendedor@exemplo.invalido';
      update public.profiles set full_name = 'AG Financeiro', papeis = array['financeiro'], role = 'financeiro', is_active = true
       where email = 'ag-financeiro@exemplo.invalido';
      update public.profiles set full_name = 'AG Marketing', papeis = array['marketing'], role = 'marketing', is_active = true
       where email = 'ag-marketing@exemplo.invalido';
      update public.profiles set full_name = 'AG Cliente', papeis = array['cliente'], role = 'cliente', is_active = true
       where email = 'ag-cliente@exemplo.invalido';
      update public.profiles set full_name = 'AG Saiu', papeis = array['financeiro'], role = 'financeiro', is_active = false
       where email = 'ag-saiu@exemplo.invalido';
      insert into public.leads (nome, telefone, email, interesse, observacoes, responsavel, desfecho) values
        ('AG lead novo',    '5541900001001', 'ag1@exemplo.invalido', 'Onix',  'quer financiar', null,          null),
        ('AG lead meu',     '5541900001002', 'ag2@exemplo.invalido', 'HB20',  'volta sábado',   'AG Vendedor', null),
        ('AG lead alheio',  '5541900001003', 'ag3@exemplo.invalido', 'Corsa', 'pediu desconto', 'Outra Pessoa', null),
        ('AG lead perdido', '5541900001004', 'ag4@exemplo.invalido', 'Gol',   'achou caro',     'Outra Pessoa', 'perdido');
    `);
    reaplicada = arquivo(PREFIXO, join(DIR_MIGRACOES, MIGRACAO));
  }, 120_000);

  it("o aceite passa nos dois pontos de partida: view antiga com is_staff, view nova com escopo", () => {
    const naCadeia = saidas.get(MIGRACAO) ?? "";
    expect(naCadeia).toContain("a view encontrada é a da 20260828160000");
    expect(naCadeia).toContain("começando por [leads por is_staff (20261003130000 ainda não aplicada)] (80 casos)");
    expect(reaplicada).toContain("a view encontrada é a desta migração (reaplicação)");
    expect(reaplicada).toContain("começando por [leads por escopo (20261003130000 aplicada)] (80 casos)");
    expect(reaplicada).not.toMatch(/^psql.*ERROR:/m);
  });

  it("as doze colunas da view são as mesmas, na ordem — o contrato com /api/pessoas", () => {
    expect(
      vale(
        `(select string_agg(attname, ',' order by attnum) from pg_attribute
           where attrelid = 'public.agenda_de_pessoas'::regclass and attnum > 0)
         = 'origem,id,nome,papel,especialidade,documento,telefone,email,cidade,observacoes,ativo,created_at'`,
      ),
    ).toBe(true);
  });

  it("financeiro e marketing: as quatro pessoas, com contato, e nada do atendimento", () => {
    for (const quem of ["ag-financeiro@exemplo.invalido", "ag-marketing@exemplo.invalido"]) {
      expect(
        naSessaoDe(
          quem,
          `(select count(*) = 4 and bool_and(telefone like '55419000010__' and email like 'ag_@exemplo.invalido')
              from public.agenda_de_pessoas where ${LEADS})`,
        ),
      ).toBe(true);
      expect(naSessaoDe(quem, `(select count(*) = 0 from public.agenda_de_pessoas where ${LEADS} and ${COMERCIAL})`)).toBe(true);
      // O lead em si segue fechado para eles: a RLS de `leads` é quem manda.
      expect(naSessaoDe(quem, "(select count(*) = 0 from public.leads)")).toBe(true);
      // O filtro padrão da tela (`ativo=sim`) esconde o perdido de todo mundo.
      expect(naSessaoDe(quem, `(select count(*) = 3 from public.agenda_de_pessoas where ${LEADS} and ativo)`)).toBe(true);
    }
  });

  it("violação falha: quem não vê o lead não o acha buscando pela anotação nem pela etapa", () => {
    const quem = "ag-financeiro@exemplo.invalido";
    expect(naSessaoDe(quem, "(select count(*) = 0 from public.agenda_de_pessoas where observacoes ilike '%desconto%')")).toBe(true);
    expect(
      naSessaoDe(quem, "(select count(*) = 0 from public.agenda_de_pessoas where origem = 'lead' and especialidade is not null)"),
    ).toBe(true);
    // …e a busca por nome, que é diretório, acha.
    expect(naSessaoDe(quem, "(select count(*) = 1 from public.agenda_de_pessoas where nome ilike '%lead alheio%')")).toBe(true);
  });

  it("o vendedor acha o contato de todos, e lê o atendimento só do lead dele", () => {
    const quem = "ag-vendedor@exemplo.invalido";
    expect(naSessaoDe(quem, `(select count(*) = 4 from public.agenda_de_pessoas where ${LEADS})`)).toBe(true);
    expect(
      naSessaoDe(
        quem,
        `(select count(*) = 1 and bool_and(nome = 'AG lead meu' and observacoes = 'HB20 — volta sábado')
            from public.agenda_de_pessoas where ${LEADS} and ${COMERCIAL})`,
      ),
    ).toBe(true);
  });

  it("o SDR lê o atendimento dos que têm responsável; o admin, de todos", () => {
    expect(
      naSessaoDe("ag-sdr@exemplo.invalido", `(select count(*) = 3 from public.agenda_de_pessoas where ${LEADS} and ${COMERCIAL})`),
    ).toBe(true);
    expect(
      naSessaoDe(
        "ag-sdr@exemplo.invalido",
        `(select count(*) = 1 from public.agenda_de_pessoas where nome = 'AG lead novo' and telefone is not null and not ${COMERCIAL})`,
      ),
    ).toBe(true);
    expect(
      naSessaoDe("ag-admin@exemplo.invalido", `(select count(*) = 4 from public.agenda_de_pessoas where ${LEADS} and ${COMERCIAL})`),
    ).toBe(true);
  });

  it("violação falha: cliente e perfil desativado não leem ninguém, nem pela view nem pela função", () => {
    for (const quem of ["ag-cliente@exemplo.invalido", "ag-saiu@exemplo.invalido"]) {
      expect(naSessaoDe(quem, "(select count(*) = 0 from public.agenda_de_pessoas where origem = 'lead')")).toBe(true);
      expect(naSessaoDe(quem, "(select count(*) = 0 from public.pessoas_dos_leads())")).toBe(true);
    }
  });

  it("violação falha: anônimo é barrado na view e na função", () => {
    expect(recusa("begin; set local role anon; select count(*) from public.agenda_de_pessoas; rollback;")).toContain(
      "permission denied",
    );
    expect(recusa("begin; set local role anon; select count(*) from public.pessoas_dos_leads(); rollback;")).toContain(
      "permission denied",
    );
  });

  it("a função não devolve coluna comercial, e a migração não deixou policy nova em leads", () => {
    expect(
      vale(
        `(select array_to_string(proargnames, ',') from pg_proc
           where oid = 'public.pessoas_dos_leads()'::regprocedure) = 'id,nome,telefone,email,ativo,created_at'`,
      ),
    ).toBe(true);
    expect(
      vale(
        `(select string_agg(policyname, ',' order by policyname) from pg_policies
           where schemaname = 'public' and tablename = 'leads')
         = 'leads_atualizacao_por_escopo,leads_exclusao_admin,leads_leitura_por_escopo'`,
      ),
    ).toBe(true);
  });

  it("quem lê sem sessão (chave de serviço, dono) segue lendo o lead inteiro, uma linha por lead", () => {
    expect(
      vale(
        `(select count(*) = (select count(*) from public.leads) and count(*) = count(distinct id)
                 and bool_and(especialidade is not null)
            from public.agenda_de_pessoas where origem = 'lead')`,
      ),
    ).toBe(true);
  });
});

/**
 * As consultas de documento (20261018120000), pelo lado de fora. O aceite da
 * migração prova o efeito com sonda; aqui ficam a reaplicação (o catálogo não
 * muda), cada violação falhando pelo NOME da regra (com controles que têm de
 * entrar), a porta pública vista como anon — com o token que o APP gera e o
 * hash que o APP calcula —, a leitura do link sem `token_hash`, o registro da
 * consulta só pela função da service_role, e os parâmetros com vigência.
 * Toda escrita é desfeita.
 */
describe.skipIf(!temBanco)("as consultas de CPF e CNPJ e o link do relatório, pelo lado de fora", () => {
  const MIGRACAO = "20261018120000_consultas_de_documento.sql";
  const PESSOA = "'00000000-0000-0000-0000-0000000000d0'::uuid";

  /** A mensagem do erro, ou "" se o comando passou. Sempre desfeito. */
  const recusa = (sql: string): string => {
    try {
      psql!(`begin; ${sql}; rollback;`);
      return "";
    } catch (e) {
      return String((e as Error).message);
    }
  };

  /** A saída do comando, numa transação desfeita. Erro sobe. */
  const desfeito = (sql: string): string => psql!(`begin; ${sql}; rollback;`);

  /** Um usuário de sonda com um papel, e a sessão dele vestida (claims + role). */
  const UID: Record<string, string> = {
    admin: "00000000-0000-0000-0000-00000000dc01",
    gestor: "00000000-0000-0000-0000-00000000dc02",
    comercial: "00000000-0000-0000-0000-00000000dc03",
    financeiro: "00000000-0000-0000-0000-00000000dc04",
    marketing: "00000000-0000-0000-0000-00000000dc05",
    sdr: "00000000-0000-0000-0000-00000000dc06",
  };
  const usuario = (papel: string) =>
    `insert into auth.users (id, instance_id, aud, role, email)
       values ('${UID[papel]}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               'doc-${papel}@exemplo.invalido');
     update public.profiles set full_name = 'Doc ${papel}', papeis = array['${papel}'], role = '${papel}', is_active = true
      where id = '${UID[papel]}'`;
  const sessao = (papel: string) =>
    `select set_config('request.jwt.claims',
       json_build_object('sub', '${UID[papel]}', 'role', 'authenticated')::text, true);
     set local role authenticated`;
  const comoPapel = (papel: string, sql: string) => `${usuario(papel)}; ${sessao(papel)}; ${sql}`;

  const consulta = (tipo: string, documento: string, ciente = "true", nivel = "basico") =>
    `insert into public.consultas_de_documento
       (tipo_documento, documento, nivel, produtos, relatorio, situacao, finalidade, titular_ciente, criado_por)
     values ('${tipo}', '${documento}', '${nivel}', '{cpf-lite}', '{}', 'completa', 'financiamento', ${ciente}, ${PESSOA})`;

  /** Uma consulta (como dono) com situação e tentativas dadas. */
  const tentativa = (situacao: string, tentativas: string) =>
    `insert into public.consultas_de_documento
       (tipo_documento, documento, nivel, produtos, relatorio, situacao, tentativas, finalidade, titular_ciente, criado_por)
     values ('cpf', '00000000191', 'credito', '{cpf-lite,receita-federal}', '{}', '${situacao}',
             '${tentativas}'::jsonb, 'financiamento', true, ${PESSOA})`;

  /** Um link para uma consulta nova, no mesmo comando; `prazo` é o intervalo até expirar. */
  const link = (prazo: string, hash = "repeat('a', 64)") =>
    `with c as (${consulta("cpf", "00000000191")} returning id)
     insert into public.relatorios_compartilhados (consulta_id, token_hash, expira_em, criado_por)
     select c.id, ${hash}, now() + interval '${prazo}', ${PESSOA} from c`;

  /** A chamada da função de registro, com os 14 argumentos na ordem. */
  const registrar = (quem: string, situacao: string, tentativas: string, ciente = "true") =>
    `public.registrar_consulta_de_documento(
       ${quem}, 'cpf', '00000000191', 'credito', '{cpf-lite,receita-federal}'::text[], 'DOC TESTE',
       '{"titular": {}}'::jsonb, '{"cpf-lite": {}}'::jsonb, '${tentativas}'::jsonb, '${situacao}',
       null::numeric, false, 'financiamento', ${ciente})`;

  const PARCIAL =
    '[{"produto": "cpf-lite", "ok": true, "status": 200, "motivo": null, "pode_ter_cobrado": true, "custo": 0.12},' +
    ' {"produto": "receita-federal", "ok": false, "status": 504, "motivo": "tempo esgotado", "pode_ter_cobrado": true, "custo": null}]';

  const retrato = (): string =>
    psql!(
      `select md5(
         (select string_agg(conname || ':' || pg_get_constraintdef(oid), '|' order by conname)
            from pg_constraint where conrelid in ('public.consultas_de_documento'::regclass,
                                                  'public.relatorios_compartilhados'::regclass,
                                                  'public.parametros_consulta_documento'::regclass))
         || (select string_agg(tablename || ':' || policyname || ':' || cmd || ':' || coalesce(qual, '')
                               || ':' || coalesce(with_check, ''), '|' order by tablename, policyname)
               from pg_policies where tablename in ('consultas_de_documento', 'relatorios_compartilhados',
                                                    'parametros_consulta_documento'))
         || (select string_agg(proname || ':' || md5(prosrc) || ':' || prosecdef || ':'
                               || coalesce(array_to_string(proconfig, ','), '') || ':'
                               || coalesce(array_to_string(proacl, ','), ''), '|' order by proname)
               from pg_proc where proname in ('abrir_relatorio_compartilhado', 'registrar_consulta_de_documento',
                                              'consulta_documento_nova_vigencia', 'consulta_documento_tentativas_validas',
                                              'consulta_documento_situacao_coerente', 'consulta_documento_precos_validos',
                                              'relatorios_compartilhados_carimbar', 'relatorios_compartilhados_so_revogar',
                                              'consultas_de_documento_so_inclusao'))
         || (select string_agg(relname || ':' || coalesce(array_to_string(relacl, ','), ''), '|' order by relname)
               from pg_class where oid in ('public.consultas_de_documento'::regclass,
                                           'public.relatorios_compartilhados'::regclass,
                                           'public.parametros_consulta_documento'::regclass))
         || (select string_agg(attname || ':' || coalesce(array_to_string(attacl, ','), ''), '|' order by attname)
               from pg_attribute where attrelid = 'public.relatorios_compartilhados'::regclass and attnum > 0)
         || (select count(*)::text from public.parametros_consulta_documento)
       )`,
    ).match(/[0-9a-f]{32}/)?.[0] ?? "";

  it("reaplicar levanta o aceite de novo e não muda regra, policy, função, privilégio nem a semente", () => {
    const antes = retrato();
    expect(antes).toMatch(/^[0-9a-f]{32}$/);
    const saida = arquivo(PREFIXO, join(DIR_MIGRACOES, MIGRACAO));
    expect(saida).toContain("Aceite verificado");
    expect(saida).not.toMatch(/^psql.*ERROR:/m);
    expect(retrato()).toBe(antes);
  });

  it("violação falha: CPF fora de 11 dígitos, CNPJ fora do alfanumérico, e consulta sem o titular ciente", () => {
    // Controles: CPF de 11 dígitos, CNPJ numérico e CNPJ alfanumérico entram.
    expect(recusa(consulta("cpf", "00000000191"))).toBe("");
    expect(recusa(consulta("cnpj", "11222333000181"))).toBe("");
    expect(recusa(consulta("cnpj", "12ABC34501DE35"))).toBe("");
    expect(recusa(consulta("cpf", "000.000.001-91"))).toContain("consultas_de_documento_documento_valido");
    expect(recusa(consulta("cnpj", "12abc34501de35"))).toContain("consultas_de_documento_documento_valido");
    expect(recusa(consulta("cnpj", "12ABC34501DEAB"))).toContain("consultas_de_documento_documento_valido");
    expect(recusa(consulta("rg", "00000000191"))).toContain("consultas_de_documento_tipo_valido");
    expect(recusa(consulta("cpf", "00000000191", "false"))).toContain("consultas_de_documento_titular_ciente");
  });

  it("violação falha: o nível é um dos seis, e o completo com score é só de CNPJ", () => {
    for (const nivel of ["basico", "dados", "credito", "completo_economico", "completo_integral"]) {
      expect(recusa(consulta("cpf", "00000000191", "true", nivel)), nivel).toBe("");
    }
    expect(recusa(consulta("cnpj", "11222333000181", "true", "completo_score"))).toBe("");
    expect(recusa(consulta("cpf", "00000000191", "true", "completo_score"))).toContain(
      "consultas_de_documento_score_so_cnpj",
    );
    expect(recusa(consulta("cpf", "00000000191", "true", "completo"))).toContain(
      "consultas_de_documento_nivel_valido",
    );
  });

  it("violação falha: situação fora da lista, tentativa malformada ou de produto não chamado, e situação que desmente as tentativas", () => {
    // Controles: a parcial de verdade, a falha sem resposta e a completa sem tentativas entram.
    expect(recusa(tentativa("parcial", PARCIAL))).toBe("");
    expect(
      recusa(tentativa("falhou", '[{"produto": "cpf-lite", "ok": false, "pode_ter_cobrado": true, "status": null, "custo": null}]')),
    ).toBe("");
    expect(recusa(tentativa("completa", "[]"))).toBe("");
    expect(recusa(tentativa("cancelada", "[]"))).toContain("consultas_de_documento_situacao_valida");
    expect(recusa(tentativa("completa", "{}"))).toContain("consultas_de_documento_tentativas_validas");
    expect(
      recusa(tentativa("completa", '[{"produto": "cnpj", "ok": true, "pode_ter_cobrado": true}]')),
    ).toContain("consultas_de_documento_tentativas_validas");
    expect(recusa(tentativa("completa", '[{"produto": "cpf-lite", "ok": true}]'))).toContain(
      "consultas_de_documento_tentativas_validas",
    );
    expect(
      recusa(tentativa("completa", '[{"produto": "cpf-lite", "ok": true, "pode_ter_cobrado": true, "custo": -1}]')),
    ).toContain("consultas_de_documento_tentativas_validas");
    expect(
      recusa(tentativa("completa", '[{"produto": "cpf-lite", "ok": false, "pode_ter_cobrado": true}]')),
    ).toContain("consultas_de_documento_situacao_coerente");
    expect(
      recusa(tentativa("falhou", '[{"produto": "cpf-lite", "ok": true, "pode_ter_cobrado": true}]')),
    ).toContain("consultas_de_documento_situacao_coerente");
    expect(
      recusa(tentativa("parcial", '[{"produto": "cpf-lite", "ok": true, "pode_ter_cobrado": true}]')),
    ).toContain("consultas_de_documento_situacao_coerente");
    // O relatório continua obrigatório, mesmo numa falha.
    expect(
      recusa(`insert into public.consultas_de_documento
                (tipo_documento, documento, nivel, produtos, situacao, finalidade, titular_ciente, criado_por)
              values ('cpf', '00000000191', 'basico', '{cpf-lite}', 'falhou', 'financiamento', true, ${PESSOA})`),
    ).toContain("relatorio");
  });

  it("violação falha: link de mais de 30 dias, link que expira antes de nascer, e desrevogar até pela chave de serviço", () => {
    expect(recusa(link("720 hours"))).toBe("");
    expect(recusa(link("721 hours"))).toContain("relatorios_compartilhados_prazo_valido");
    expect(recusa(link("-1 second"))).toContain("relatorios_compartilhados_prazo_valido");
    expect(
      recusa(
        `${link("1 day")};
         update public.relatorios_compartilhados set revogado_em = now() where token_hash = repeat('a', 64);
         set local role service_role;
         update public.relatorios_compartilhados set revogado_em = null where token_hash = repeat('a', 64)`,
      ),
    ).toContain("Link revogado não volta");
  });

  it("o hash do app é o do banco: sha256 hex do token em UTF-8, dos dois lados", () => {
    const tokens = [gerarTokenDoLink(), gerarTokenDoLink(), "a".repeat(43), "ação-Ç-não-é-token"];
    expect(tokenTemForma(tokens[0])).toBe(true);
    for (const token of tokens) {
      const doBanco = psql!(
        `select 'hash=' || encode(sha256(convert_to('${token}', 'UTF8')), 'hex')`,
      ).match(/hash=([0-9a-f]{64})/)?.[1];
      expect(doBanco, token).toBe(hashDoToken(token));
    }
  });

  it("anon abre o link com o token, e não com o hash; nem revogado, nem fora da forma, nem com token alheio", () => {
    expect(recusa("set local role anon; select count(*) from public.consultas_de_documento")).toContain(
      "permission denied",
    );
    expect(recusa("set local role anon; select count(*) from public.relatorios_compartilhados")).toContain(
      "permission denied",
    );
    // O miolo (`respostas`) não é coluna da porta: só as cinco do relatório. E
    // o argumento é o token, não o hash.
    expect(
      psql!(
        `select 'args=' || array_to_string(proargnames, ',') from pg_proc
          where oid = 'public.abrir_relatorio_compartilhado(text)'::regprocedure`,
      ),
    ).toContain("args=p_token,relatorio,tipo_documento,nivel,criado_em,expira_em");

    // O token e o hash como o app os faz: o link gravado com hashDoToken(token).
    const token = gerarTokenDoLink();
    const hash = hashDoToken(token);
    const abrir = (antes: string, argumento: string): string =>
      desfeito(
        `${antes}; set local role anon;
         select 'linhas=' || count(*) from public.abrir_relatorio_compartilhado(${argumento})`,
      );
    expect(abrir(link("1 day", `'${hash}'`), `'${token}'`)).toContain("linhas=1");
    // Quem só tem o hash (vazou a tabela) não abre.
    expect(abrir(link("1 day", `'${hash}'`), `'${hash}'`)).toContain("linhas=0");
    expect(abrir(link("1 day", `'${hash}'`), `'${token}x'`)).toContain("linhas=0");
    expect(abrir(link("1 day", `'${hash}'`), `'${token.slice(0, 42)}'`)).toContain("linhas=0");
    expect(abrir(link("1 day", `'${hash}'`), "null")).toContain("linhas=0");
    expect(abrir(link("1 day", `'${hash}'`), `'${gerarTokenDoLink()}'`)).toContain("linhas=0");
    expect(
      abrir(
        `${link("1 day", `'${hash}'`)}; update public.relatorios_compartilhados set revogado_em = now() where token_hash = '${hash}'`,
        `'${token}'`,
      ),
    ).toContain("linhas=0");
    // Abrir conta o acesso.
    expect(
      desfeito(
        `${link("1 day", `'${hash}'`)}; set local role anon;
         select count(*) from public.abrir_relatorio_compartilhado('${token}');
         reset role;
         select 'acessos=' || acessos from public.relatorios_compartilhados where token_hash = '${hash}'`,
      ),
    ).toContain("acessos=1");
  });

  it("violação falha: authenticated não lê token_hash (nem por *), e lê o resto do link", () => {
    // O link nasce como dono; só a leitura é na sessão do comercial.
    const comLink = (sql: string) => `${usuario("comercial")}; ${link("1 day")}; ${sessao("comercial")}; ${sql}`;
    const NEGADO = "permission denied for table relatorios_compartilhados";
    expect(recusa(comLink("select token_hash from public.relatorios_compartilhados"))).toContain(NEGADO);
    expect(recusa(comLink("select * from public.relatorios_compartilhados"))).toContain(NEGADO);
    expect(
      recusa(comLink("select 1 from public.relatorios_compartilhados where token_hash = repeat('a', 64)")),
    ).toContain(NEGADO);
    // Controle: as colunas da tela (src/lib/consultaDeDocumento-servidor.ts) saem.
    expect(
      desfeito(
        comLink(
          `select 'vistos=' || count(*) from (
             select id, org_id, consulta_id, expira_em, revogado_em, revogado_por, acessos,
                    ultimo_acesso_em, criado_por, criado_por_nome, criado_em
               from public.relatorios_compartilhados) l`,
        ),
      ),
    ).toContain("vistos=1");
    // E o INSERT continua gravando token_hash pela sessão — sem `returning *`.
    expect(
      desfeito(
        comoPapel(
          "comercial",
          `reset role;
           ${consulta("cpf", "00000000191")};
           ${sessao("comercial")};
           insert into public.relatorios_compartilhados (consulta_id, token_hash, expira_em)
           select id, repeat('c', 64), now() + interval '7 days' from public.consultas_de_documento limit 1
           returning 'gravou=' || (criado_por = '${UID.comercial}')`,
        ),
      ),
    ).toContain("gravou=true");
  });

  it("violação falha: authenticated (nem admin) e anon não inserem direto em consultas_de_documento, nem chamam a função de registro", () => {
    const direto = `insert into public.consultas_de_documento
       (tipo_documento, documento, nivel, produtos, relatorio, situacao, finalidade, titular_ciente, criado_por)
     values ('cpf', '00000000191', 'basico', '{cpf-lite}', '{}', 'completa', 'financiamento', true, '${UID.admin}')`;
    expect(recusa(comoPapel("admin", direto))).toContain("permission denied for table consultas_de_documento");
    expect(recusa(`set local role anon; ${direto}`)).toContain("permission denied for table consultas_de_documento");
    expect(recusa(`set local role service_role; ${direto}`)).toContain(
      "permission denied for table consultas_de_documento",
    );
    expect(recusa(comoPapel("admin", `select ${registrar(`'${UID.admin}'`, "parcial", PARCIAL)}`))).toContain(
      "permission denied for function registrar_consulta_de_documento",
    );
    expect(recusa(`set local role anon; select ${registrar(`'${UID.admin}'`, "parcial", PARCIAL)}`)).toContain(
      "permission denied for function registrar_consulta_de_documento",
    );
  });

  it("violação falha: ninguém edita a consulta — nem a service_role, nem o dono; a service_role apaga linha a linha (eliminação LGPD), sem TRUNCATE", () => {
    const registrada = `${usuario("comercial")};
       set local role service_role;
       select ${registrar(`'${UID.comercial}'`, "parcial", PARCIAL)}`;
    // service_role: sem o privilégio de UPDATE, 42501 antes de qualquer linha.
    expect(
      recusa(`${registrada};
              update public.consultas_de_documento set finalidade = 'cadastro_de_cliente' where nome = 'DOC TESTE'`),
    ).toContain("permission denied for table consultas_de_documento");
    // dono (o papel que aplica a migração): o gatilho só-inclusão recusa.
    expect(
      recusa(`${registrada}; reset role;
              update public.consultas_de_documento set custo = 0 where nome = 'DOC TESTE'`),
    ).toContain("A consulta de documento não se edita");
    // E o gatilho está lá, BEFORE UPDATE por linha (não só o privilégio).
    expect(
      psql!(`select tgname || ':' || (tgtype & 2 = 2) || ':' || (tgtype & 16 = 16) || ':' || (tgtype & 1 = 1)
               from pg_trigger where tgrelid = 'public.consultas_de_documento'::regclass and not tgisinternal`),
    ).toContain("consultas_de_documento_so_inclusao:true:true:true");
    // service_role apaga — o pedido de eliminação do titular —, e o link vai junto (cascata).
    const apagada = desfeito(
      `${registrada};
       insert into public.relatorios_compartilhados (consulta_id, token_hash, expira_em, criado_por)
         select id, repeat('e', 64), now() + interval '1 day', '${UID.comercial}'
           from public.consultas_de_documento where nome = 'DOC TESTE';
       with apagou as (delete from public.consultas_de_documento where nome = 'DOC TESTE' returning 1)
       select 'apagou=' || count(*) from apagou;
       reset role;
       select 'restou=' || (select count(*) from public.consultas_de_documento where nome = 'DOC TESTE')
              || ':' || (select count(*) from public.relatorios_compartilhados where token_hash = repeat('e', 64))`,
    );
    expect(apagada).toContain("apagou=1");
    expect(apagada).toContain("restou=0:0");
    // A sessão (nem o admin) continua sem apagar.
    expect(
      recusa(comoPapel("admin", "delete from public.consultas_de_documento")),
    ).toContain("permission denied for table consultas_de_documento");
    // Eliminação é linha a linha: a service_role não trunca a consulta nem o link.
    expect(recusa("set local role service_role; truncate public.consultas_de_documento cascade")).toContain(
      "permission denied for table consultas_de_documento",
    );
    expect(recusa("set local role service_role; truncate public.relatorios_compartilhados")).toContain(
      "permission denied for table relatorios_compartilhados",
    );
    expect(
      psql!(`select has_table_privilege('service_role', 'public.consultas_de_documento', 'TRUNCATE') || ':'
                 || has_table_privilege('service_role', 'public.relatorios_compartilhados', 'TRUNCATE') || ':'
                 || has_table_privilege('service_role', 'public.relatorios_compartilhados', 'DELETE')`),
    ).toContain("false:false:true");
  });

  it("a service_role registra pela função, e a linha sai com a org, o autor e o nome certos", () => {
    const saida = desfeito(
      `${usuario("comercial")};
       set local role service_role;
       select 'id=' || ${registrar(`'${UID.comercial}'`, "parcial", PARCIAL)};
       reset role;
       select 'linhas=' || count(*) || ':' ||
              bool_and(org_id = public.org_padrao() and criado_por = '${UID.comercial}'
                       and criado_por_nome = 'Doc comercial' and criado_em > now() - interval '1 minute'
                       and situacao = 'parcial' and tentativas = '${PARCIAL}'::jsonb and custo is null)
         from public.consultas_de_documento where nome = 'DOC TESTE'`,
    );
    expect(saida).toMatch(/id=[0-9a-f-]{36}/);
    expect(saida).toContain("linhas=1:true");
  });

  it("violação falha: a função recusa marketing, sdr, quem não tem perfil, e a consulta sem o titular ciente", () => {
    for (const papel of ["marketing", "sdr"]) {
      expect(
        recusa(`${usuario(papel)}; set local role service_role; select ${registrar(`'${UID[papel]}'`, "parcial", PARCIAL)}`),
        papel,
      ).toContain("Consultar CPF e CNPJ");
    }
    expect(
      recusa(`set local role service_role; select ${registrar("gen_random_uuid()", "parcial", PARCIAL)}`),
    ).toContain("Consultar CPF e CNPJ");
    expect(recusa(`set local role service_role; select ${registrar("null", "parcial", PARCIAL)}`)).toContain(
      "Consultar CPF e CNPJ",
    );
    expect(
      recusa(`${usuario("financeiro")}; set local role service_role;
              select ${registrar(`'${UID.financeiro}'`, "parcial", PARCIAL, "false")}`),
    ).toContain("consultas_de_documento_titular_ciente");
    // Controle: o financeiro registra.
    expect(
      recusa(`${usuario("financeiro")}; set local role service_role; select ${registrar(`'${UID.financeiro}'`, "parcial", PARCIAL)}`),
    ).toBe("");
  });

  it("os parâmetros: a semente de 2026-10-18 é a vigente, o comercial lê, o marketing não vê, anon é barrado", () => {
    expect(
      desfeito(
        comoPapel(
          "comercial",
          `select 'vigente=' || (count(*) = 1
             and bool_and(dias_do_link = 7 and dias_de_consulta_recente = 90 and minutos_contra_repeticao = 30
                          and links_ativos_por_consulta = 10 and tabela_de_precos_em = date '2026-10-18'
                          and fonte = 'Tabela pública da APIBrasil'
                          and (precos_de_referencia->>'analise-credito-plus-pf')::numeric = 29.02
                          and (select count(*) from jsonb_object_keys(precos_de_referencia)) = 12))
             from public.parametros_consulta_documento where vigencia_ate is null`,
        ),
      ),
    ).toContain("vigente=true");
    expect(
      desfeito(comoPapel("marketing", "select 'vistos=' || count(*) from public.parametros_consulta_documento")),
    ).toContain("vistos=0");
    expect(recusa("set local role anon; select 1 from public.parametros_consulta_documento")).toContain(
      "permission denied",
    );
  });

  it("violação falha: parâmetro só se escreve pela função, e só o admin abre vigência", () => {
    const nova = (dias: number) =>
      `select 'nova=' || dias_do_link from public.consulta_documento_nova_vigencia(
         ${dias}, 60, 15, 5, '{"cpf-lite": 0.2}'::jsonb, date '2026-11-01', 'Teste')`;
    expect(recusa(comoPapel("comercial", nova(10)))).toContain("Só o Administrador");
    expect(recusa(comoPapel("financeiro", nova(10)))).toContain("Só o Administrador");
    expect(recusa(nova(10))).toContain("sem sessão");
    expect(
      recusa(
        comoPapel(
          "admin",
          `insert into public.parametros_consulta_documento
             (dias_do_link, dias_de_consulta_recente, minutos_contra_repeticao, links_ativos_por_consulta,
              precos_de_referencia, tabela_de_precos_em, fonte)
           values (7, 90, 30, 10, '{"cpf-lite": 0.12}', current_date, 'direto')`,
        ),
      ),
    ).toContain("permission denied");
    expect(
      recusa(comoPapel("admin", "update public.parametros_consulta_documento set vigencia_ate = current_date")),
    ).toContain("permission denied");
    // O admin: a vigente nova tem o valor dele, a antiga encerrou hoje, e há uma vigente só.
    const saida = desfeito(
      comoPapel(
        "admin",
        `${nova(14)};
         reset role;
         select 'vigentes=' || count(*) || ':' || bool_and(dias_do_link = 14 and criado_por = '${UID.admin}')
           from public.parametros_consulta_documento where vigencia_ate is null;
         select 'encerradas_hoje=' || count(*) from public.parametros_consulta_documento
          where vigencia_ate = current_date and dias_do_link = 7`,
      ),
    );
    expect(saida).toContain("nova=14");
    expect(saida).toContain("vigentes=1:true");
    expect(saida).toContain("encerradas_hoje=1");
    // A faixa vale pela função também.
    expect(recusa(comoPapel("admin", nova(31)))).toContain("parametros_consulta_documento_dias_do_link_na_faixa");
    // Valor vigente não sofre UPDATE nem pelo dono (D-T1.7).
    expect(recusa("update public.parametros_consulta_documento set dias_do_link = 8 where vigencia_ate is null")).toContain(
      "não sofre UPDATE",
    );
  });

  it("violação falha: cada faixa dos parâmetros e a tabela de preços", () => {
    // Cada caso é uma vigência FUTURA e já encerrada, inserida como dono: fica
    // fora do índice de vigente única, e o guarda D-T1.7 (só de UPDATE) não entra.
    const caso = (muda: Record<string, string>) => {
      const base: Record<string, string> = {
        dias_do_link: "7",
        dias_de_consulta_recente: "90",
        minutos_contra_repeticao: "30",
        links_ativos_por_consulta: "10",
        precos_de_referencia: `'{"cpf-lite": 0.12}'::jsonb`,
        fonte: "'Teste'",
        ...muda,
      };
      return `insert into public.parametros_consulta_documento
                (${Object.keys(base).join(", ")}, tabela_de_precos_em, vigencia_desde, vigencia_ate)
              values (${Object.values(base).join(", ")}, current_date, current_date + 365, current_date + 730)`;
    };
    expect(recusa(caso({}))).toBe("");
    expect(recusa(caso({ dias_do_link: "30", minutos_contra_repeticao: "0" }))).toBe("");
    expect(recusa(caso({ dias_do_link: "31" }))).toContain("parametros_consulta_documento_dias_do_link_na_faixa");
    expect(recusa(caso({ dias_de_consulta_recente: "366" }))).toContain(
      "parametros_consulta_documento_dias_de_consulta_recente_na_faixa",
    );
    expect(recusa(caso({ minutos_contra_repeticao: "1441" }))).toContain(
      "parametros_consulta_documento_minutos_contra_repeticao_na_faixa",
    );
    expect(recusa(caso({ links_ativos_por_consulta: "0" }))).toContain(
      "parametros_consulta_documento_links_ativos_na_faixa",
    );
    expect(recusa(caso({ precos_de_referencia: `'{"cpf-lite": -0.01}'::jsonb` }))).toContain(
      "parametros_consulta_documento_precos_validos",
    );
    expect(recusa(caso({ precos_de_referencia: `'{}'::jsonb` }))).toContain(
      "parametros_consulta_documento_precos_validos",
    );
    expect(recusa(caso({ precos_de_referencia: `'{"cpf-lite": "0.12"}'::jsonb` }))).toContain(
      "parametros_consulta_documento_precos_validos",
    );
    expect(recusa(caso({ fonte: "'   '" }))).toContain("parametros_consulta_documento_fonte_preenchida");
    // Uma vigente por org.
    expect(
      recusa(`insert into public.parametros_consulta_documento
                (dias_do_link, dias_de_consulta_recente, minutos_contra_repeticao, links_ativos_por_consulta,
                 precos_de_referencia, tabela_de_precos_em, fonte)
              values (7, 90, 30, 10, '{"cpf-lite": 0.12}', current_date, 'segunda')`),
    ).toContain("parametros_consulta_documento_um_vigente");
  });
});

/**
 * Os níveis da consulta de placa (20261019120000), pelo lado de fora. O aceite
 * da migração prova o efeito com sonda; aqui ficam a reaplicação (o catálogo
 * não muda), o backfill por cima de consultas que JÁ existem (a tabela volta à
 * forma de 20261006180000 numa transação desfeita, recebe linhas antigas e a
 * migração roda por cima), a conferência prévia que para tudo diante de dado
 * pessoal antigo, cada violação pelo nome da regra, o prazo do aprofundar lido
 * do parâmetro vigente, e o isolamento entre duas lojas.
 */
describe.skipIf(!temBanco)("os níveis da consulta de placa e o aprofundar, pelo lado de fora", () => {
  const MIGRACAO = "20261019120000_niveis_da_consulta_de_placa.sql";

  /** A mensagem do erro, ou "" se o comando passou. Sempre desfeito. */
  const recusa = (sql: string): string => {
    try {
      psql!(`begin; ${sql}; rollback;`);
      return "";
    } catch (e) {
      return String((e as Error).message);
    }
  };

  /** A saída do comando, numa transação desfeita. Erro sobe. */
  const desfeito = (sql: string): string => psql!(`begin; ${sql}; rollback;`);

  const UID: Record<string, string> = {
    admin: "00000000-0000-0000-0000-00000000ae01",
    gestor: "00000000-0000-0000-0000-00000000ae02",
    comercial: "00000000-0000-0000-0000-00000000ae03",
    marketing: "00000000-0000-0000-0000-00000000ae04",
  };
  const usuario = (papel: string) =>
    `insert into auth.users (id, instance_id, aud, role, email)
       values ('${UID[papel]}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               'niveis-${papel}@exemplo.invalido');
     update public.profiles set full_name = 'Níveis ${papel}', papeis = array['${papel}'], role = '${papel}', is_active = true
      where id = '${UID[papel]}'`;
  const sessao = (papel: string) =>
    `select set_config('request.jwt.claims',
       json_build_object('sub', '${UID[papel]}', 'role', 'authenticated')::text, true);
     set local role authenticated`;
  const comoPapel = (papel: string, sql: string) => `${usuario(papel)}; ${sessao(papel)}; ${sql}`;

  const FRAG = { estadual: { uf: "PR" }, recall: { pendentes: 0 }, fipe: { valor: 50000 } };
  const comprada = (produto: string, custo: number | null = null) => ({
    produto, ok: true, status: 200, motivo: null, pode_ter_cobrado: true, custo, reaproveitado: false,
  });
  const reaproveitada = (produto: string) => ({ produto, ok: true, pode_ter_cobrado: false, reaproveitado: true });
  const TENT3 = [comprada("estadual", 2.5), comprada("recall", 0.62), comprada("fipe", 0.06)];
  const REAP3 = [reaproveitada("estadual"), reaproveitada("recall"), reaproveitada("fipe")];
  const ORIGEM = "00000000-0000-0000-0000-0000000f0001";
  const BASE = {
    placa: "FOR1A23", produto: "niveis", nivel: "basico", produtos: ["estadual", "recall", "fipe"],
    homologacao: false, retrato: { placa: "FOR1A23" }, fragmentos: FRAG, tentativas: TENT3, custo: 3.18,
  };
  /** O aprofundar para o intermediário: os três do básico reaproveitados, o check-list comprado. */
  const APROFUNDAR = {
    nivel: "intermediario", produtos: ["estadual", "recall", "fipe", "check-list"],
    fragmentos: { ...FRAG, "check-list": { itens: 3 } }, tentativas: [...REAP3, comprada("check-list", 2.4)],
    custo: 2.4, aproveitou_de: ORIGEM,
  };

  /**
   * Uma linha gravada como dono (só gatilho e regras falam), em cima de BASE;
   * `muda` ganha, e `extra` (uma expressão jsonb em SQL) ganha de todos.
   */
  const linha = (muda: Record<string, unknown> = {}, extra = "'{}'::jsonb") =>
    `insert into public.consultas_de_placa
     select * from jsonb_populate_record(null::public.consultas_de_placa,
       '${JSON.stringify(BASE)}'::jsonb
       || jsonb_build_object('id', gen_random_uuid(), 'org_id', public.org_padrao(), 'criado_em', now())
       || '${JSON.stringify(muda)}'::jsonb || ${extra})`;
  /** A origem do aprofundar: o básico, com o id conhecido. */
  const origem = (muda: Record<string, unknown> = {}, extra?: string) => linha({ id: ORIGEM, ...muda }, extra);

  /** Uma segunda loja, criada DEPOIS da padrão (org_padrao() não muda). */
  const OUTRA_LOJA = `insert into public.orgs (nome, criada_em)
                        select 'Outra loja (níveis)', max(criada_em) + interval '1 day' from public.orgs`;
  const naOutraLoja = "jsonb_build_object('org_id', (select id from public.orgs where nome = 'Outra loja (níveis)'))";

  const PRECOS = `'{"estadual": 2.5, "recall": 0.62, "fipe": 0.06, "check-list": 2.4, "historico-proprietarios": 5.0, "veiculos-total": 30.0}'::jsonb`;

  const retrato = (): string =>
    psql!(
      `select md5(
         (select string_agg(conname || ':' || pg_get_constraintdef(oid), '|' order by conname)
            from pg_constraint where conrelid in ('public.consultas_de_placa'::regclass,
                                                  'public.parametros_consulta_veiculo'::regclass))
         || (select string_agg(attname || ':' || format_type(atttypid, atttypmod) || ':' || attnotnull || ':'
                               || coalesce(pg_get_expr(d.adbin, d.adrelid), ''), '|' order by attnum)
               from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
              where a.attrelid = 'public.consultas_de_placa'::regclass and a.attnum > 0 and not a.attisdropped)
         || (select string_agg(tgrelid::regclass::text || ':' || tgname || ':' || tgfoid::regprocedure::text || ':'
                               || tgtype || ':' || tgenabled::text, '|' order by tgrelid::regclass::text, tgname)
               from pg_trigger where tgrelid in ('public.consultas_de_placa'::regclass,
                                                 'public.parametros_consulta_veiculo'::regclass) and not tgisinternal)
         || (select string_agg(proname || ':' || md5(prosrc) || ':' || prosecdef || ':'
                               || coalesce(array_to_string(proconfig, ','), '') || ':'
                               || coalesce(array_to_string(proacl, ','), ''), '|' order by proname)
               from pg_proc where pronamespace = 'public'::regnamespace
                 and (proname like 'consulta_placa_%' or proname like 'consulta_veiculo_%'
                      or proname like 'consultas_de_placa_%'))
         || (select string_agg(tablename || ':' || policyname || ':' || cmd || ':' || coalesce(qual, '')
                               || ':' || coalesce(with_check, ''), '|' order by tablename, policyname)
               from pg_policies where tablename in ('consultas_de_placa', 'parametros_consulta_veiculo'))
         || (select string_agg(relname || ':' || coalesce(array_to_string(relacl, ','), ''), '|' order by relname)
               from pg_class where oid in ('public.consultas_de_placa'::regclass,
                                           'public.parametros_consulta_veiculo'::regclass))
         || (select string_agg(pg_get_indexdef(indexrelid), '|' order by indexrelid::regclass::text)
               from pg_index where indrelid in ('public.consultas_de_placa'::regclass,
                                                'public.parametros_consulta_veiculo'::regclass))
         || (select count(*)::text from public.parametros_consulta_veiculo)
         || (select count(*)::text from public.consultas_de_placa)
       )`,
    ).match(/[0-9a-f]{32}/)?.[0] ?? "";

  /**
   * Roda a migração por cima de `consultas_de_placa` devolvida à forma de
   * 20261006180000, com as linhas antigas dadas, numa transação desfeita. Um
   * arquivo de verdade (e não `-c`) porque é por `\i` que a migração entra
   * inteira, como no `db push`.
   */
  const sobreAntigas = (antigas: string, depois: string): string => {
    const dir = mkdtempSync(join(tmpdir(), "niveis-placa-"));
    const sql = join(dir, "sobre-antigas.sql");
    writeFileSync(
      sql,
      `begin;
       drop trigger if exists consultas_de_placa_forma_antiga on public.consultas_de_placa;
       drop trigger if exists consultas_de_placa_reaproveitamento on public.consultas_de_placa;
       alter table public.consultas_de_placa
         drop constraint consultas_de_placa_produto_conhecido,
         drop constraint consultas_de_placa_sem_dado_pessoal,
         drop column nivel cascade, drop column produtos cascade, drop column fragmentos cascade,
         drop column tentativas cascade, drop column aproveitou_de cascade;
       alter table public.consultas_de_placa
         add constraint consultas_de_placa_produto_conhecido check (produto in ('veiculos-total')),
         add constraint consultas_de_placa_sem_dado_pessoal
           check (retrato::text !~* '"(proprietario|pronome|pronomeAnterior|cpfCnpj|cpf|documentoFinanciado|restricaoArrendatario|restricaoDocArrendatario|email|cellphone)"\\s*:');
       ${antigas};
       \\i ${join(DIR_MIGRACOES, MIGRACAO)}
       ${depois};
       rollback;
      `,
    );
    // O psql pode rodar como `postgres` (su): o diretório temporário nasce 0700.
    chmodSync(dir, 0o755);
    chmodSync(sql, 0o644);
    try {
      return arquivo(PREFIXO, sql);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("reaplicar levanta o aceite de novo e não muda regra, coluna, gatilho, função, privilégio, índice nem linha", () => {
    const antes = retrato();
    expect(antes).toMatch(/^[0-9a-f]{32}$/);
    const saida = arquivo(PREFIXO, join(DIR_MIGRACOES, MIGRACAO));
    expect(saida).toContain("Aceite verificado");
    expect(saida).not.toMatch(/^psql.*ERROR:/m);
    expect(retrato()).toBe(antes);
  });

  it("sobre consultas que já existem: as antigas saem completo, {veiculos-total} e a tentativa cobrada (a da homologação, não)", () => {
    const saida = sobreAntigas(
      `insert into public.consultas_de_placa (placa, produto, retrato, custo, homologacao) values
         ('OLD1A11', 'veiculos-total',
          '{"placa": "OLD1A11", "veiculo": {"descricao": "GOL"}, "gratuito": {"empresaDoFaturamento": {"razaoSocial": "X", "nomeFantasia": "Y"}}}', 30, false),
         ('OLD1A12', 'veiculos-total', '{"placa": "EXEMPLO"}', 0, true)`,
      `select 'antigas=' || string_agg(placa || ':' || nivel || ':' || array_to_string(produtos, ',') || ':'
                                       || (tentativas -> 0 ->> 'pode_ter_cobrado') || ':' || (tentativas -> 0 ->> 'custo') || ':'
                                       || jsonb_array_length(tentativas) || ':' || fragmentos::text || ':'
                                       || coalesce(aproveitou_de::text, 'nulo'), '|' order by placa)
         from public.consultas_de_placa where placa like 'OLD%'`,
    );
    expect(saida).toContain("Aceite verificado");
    expect(saida).toContain(
      "antigas=OLD1A11:completo:veiculos-total:true:30.00:1:{}:nulo|OLD1A12:completo:veiculos-total:false:0.00:1:{}:nulo",
    );
  });

  it("violação falha: consulta antiga com chave pessoal nova no retrato para a migração ANTES de mexer em qualquer coisa", () => {
    let erro = "";
    try {
      sobreAntigas(
        `insert into public.consultas_de_placa (placa, produto, retrato, custo)
           values ('OLD1A13', 'veiculos-total', '{"placa": "OLD1A13", "veiculo": {"documento": "123"}}', 30)`,
        "select 1",
      );
    } catch (e) {
      erro = String((e as Error).message);
    }
    expect(erro).toContain("DADO PESSOAL: 1 consulta(s) de placa");
    // Nada ficou: a tabela segue com as colunas e o gatilho da migração (o banco do teste).
    expect(
      psql!(`select 'colunas=' || count(*) from information_schema.columns
              where table_schema = 'public' and table_name = 'consultas_de_placa'
                and column_name in ('nivel', 'produtos', 'fragmentos', 'tentativas', 'aproveitou_de')`),
    ).toContain("colunas=5");
  });

  it("o app de hoje (sem nível) segue gravando pela sessão do comercial, e a linha sai completo", () => {
    const saida = desfeito(
      comoPapel(
        "comercial",
        `insert into public.consultas_de_placa (placa, produto, retrato, custo, homologacao)
         values ('APP1A23', 'veiculos-total', '{"placa": "APP1A23"}', 30, false)
         returning 'gravou=' || nivel || ':' || array_to_string(produtos, ',') || ':' || jsonb_array_length(tentativas)
                   || ':' || (consultado_por = '${UID.comercial}')`,
      ),
    );
    expect(saida).toContain("gravou=completo:veiculos-total:1:true");
    // A forma antiga com produto 'niveis' não é completada: cai na regra.
    expect(
      recusa(comoPapel("comercial", `insert into public.consultas_de_placa (placa, produto, retrato)
                                     values ('APP1A23', 'niveis', '{"placa": "APP1A23"}')`)),
    ).toContain('null value in column "nivel"');
  });

  it("o básico e o aprofundar para o intermediário, pela sessão do comercial; o marketing não inclui", () => {
    /** Pela sessão: só as colunas que o app manda (org, autor e hora são do carimbo). */
    const peloApp = (muda: Record<string, unknown>) =>
      `insert into public.consultas_de_placa
         (id, placa, produto, nivel, produtos, fragmentos, tentativas, retrato, custo, aproveitou_de)
       select id, placa, produto, nivel, produtos, fragmentos, tentativas, retrato, custo, aproveitou_de
         from jsonb_populate_record(null::public.consultas_de_placa, '${JSON.stringify({ ...BASE, ...muda })}'::jsonb)`;
    const saida = desfeito(
      comoPapel(
        "comercial",
        `${peloApp({ id: ORIGEM })};
         ${peloApp({ ...APROFUNDAR, id: "00000000-0000-0000-0000-0000000f0002" })};
         select 'aprofundou=' || count(*) || ':' || string_agg(nivel || '/' || coalesce(aproveitou_de::text, '-'), ',' order by nivel)
           from public.consultas_de_placa where placa = 'FOR1A23'`,
      ),
    );
    expect(saida).toContain(`aprofundou=2:basico/-,intermediario/${ORIGEM}`);
    expect(recusa(comoPapel("marketing", peloApp({ id: ORIGEM })))).toContain("row-level security");
  });

  it("violação falha: nível inventado, produto avulso em `produto`, e produto × nível desencontrados", () => {
    expect(recusa(linha())).toBe("");
    expect(recusa(linha({ produto: "veiculos-total", nivel: "completo", produtos: ["veiculos-total"], fragmentos: {},
                          tentativas: [comprada("veiculos-total", 30)] }))).toBe("");
    expect(recusa(linha({ nivel: "premium" }))).toContain("consultas_de_placa_nivel_valido");
    expect(recusa(linha({ produto: "estadual" }))).toContain("consultas_de_placa_produto_conhecido");
    expect(recusa(linha({ produto: "veiculos-total" }))).toContain("consultas_de_placa_produto_coerente_com_nivel");
    expect(
      recusa(linha({ nivel: "completo", produtos: ["veiculos-total"], fragmentos: {}, tentativas: [comprada("veiculos-total")] })),
    ).toContain("consultas_de_placa_produto_coerente_com_nivel");
    // Sem nível e fora da forma antiga: o NOT NULL.
    expect(recusa(linha({ nivel: null }))).toContain('null value in column "nivel"');
  });

  it("violação falha: produtos vazios, repetidos, inventados ou de outro nível; fragmento fora dos produtos; tentativas malformadas ou desmentindo os produtos", () => {
    // Controle: a parcial (recall falhou) entra — o produto que falhou fica fora de `produtos`.
    expect(
      recusa(linha({ produtos: ["estadual", "fipe"], fragmentos: { fipe: { valor: 1 } },
                     tentativas: [comprada("estadual"), { ...comprada("recall"), ok: false, status: 504, motivo: "tempo esgotado" }, comprada("fipe")] })),
    ).toBe("");
    expect(recusa(linha({ produtos: [], fragmentos: {} }))).toContain("consultas_de_placa_produtos_conhecidos");
    expect(recusa(linha({ produtos: ["estadual", "estadual", "recall", "fipe"] }))).toContain("consultas_de_placa_produtos_conhecidos");
    expect(recusa(linha({ produtos: ["estadual", "recall", "fipe", "cpf-lite"] }))).toContain("consultas_de_placa_produtos_conhecidos");
    expect(
      recusa(linha({ produtos: ["estadual", "recall", "fipe", "check-list"], tentativas: [...TENT3, comprada("check-list")] })),
    ).toContain("consultas_de_placa_produtos_do_nivel");
    expect(recusa(linha({ fragmentos: { "check-list": { itens: 1 } } }))).toContain("consultas_de_placa_fragmentos_validos");
    expect(recusa(linha({ fragmentos: { fipe: 50000 } }))).toContain("consultas_de_placa_fragmentos_validos");
    expect(recusa(linha({ tentativas: {} }))).toContain("consultas_de_placa_tentativas_validas");
    expect(
      recusa(linha({ tentativas: [{ produto: "estadual", ok: true, pode_ter_cobrado: true }, TENT3[1], TENT3[2]] })),
    ).toContain("consultas_de_placa_tentativas_validas");
    expect(
      recusa(linha({ tentativas: [...TENT3, { ...comprada("historico-proprietarios"), ok: false }] })),
    ).toContain("consultas_de_placa_tentativas_validas");
    expect(
      recusa(linha({ aproveitou_de: ORIGEM, tentativas: [{ ...reaproveitada("estadual"), custo: 2.5 }, TENT3[1], TENT3[2]] })),
    ).toContain("consultas_de_placa_tentativas_validas");
    expect(
      recusa(linha({ tentativas: [TENT3[0], { ...TENT3[1], ok: false }, TENT3[2]] })),
    ).toContain("consultas_de_placa_tentativas_coerentes");
    expect(recusa(linha({ produtos: ["estadual", "fipe"], fragmentos: {} }))).toContain(
      "consultas_de_placa_tentativas_coerentes",
    );
  });

  it("violação falha: o aprofundar fora do prazo, com fragmento trocado, de produto que a origem não tem, sem origem, ou sem comprar nada", () => {
    const REAP = "consultas_de_placa_reaproveitamento";
    // Controle: origem de hoje, aprofundar entra.
    expect(recusa(`${origem()}; ${linha(APROFUNDAR)}`)).toBe("");
    // Origem de 8 dias, com o parâmetro semeado de 7.
    expect(
      recusa(`${origem({ criado_em: new Date(Date.now() - 8 * 86_400_000).toISOString() })}; ${linha(APROFUNDAR)}`),
    ).toContain(REAP);
    // Origem posterior à linha.
    expect(
      recusa(`${origem({ criado_em: new Date(Date.now() + 86_400_000).toISOString() })}; ${linha(APROFUNDAR)}`),
    ).toContain(REAP);
    expect(
      recusa(`${origem()}; ${linha({ ...APROFUNDAR, fragmentos: { ...APROFUNDAR.fragmentos, fipe: { valor: 1 } } })}`),
    ).toContain(REAP);
    expect(
      recusa(`${origem()}; ${linha({
        ...APROFUNDAR, nivel: "economico", produtos: [...APROFUNDAR.produtos, "historico-proprietarios"],
        tentativas: [...REAP3, reaproveitada("check-list"), comprada("historico-proprietarios", 5)],
      })}`),
    ).toContain(REAP);
    expect(recusa(linha({ ...APROFUNDAR, aproveitou_de: null }))).toContain(REAP);
    // Tudo reaproveitado e nada comprado: é reabrir, não consultar.
    expect(recusa(`${origem()}; ${linha({ aproveitou_de: ORIGEM, tentativas: REAP3 })}`)).toContain(
      "consultas_de_placa_tentativas_coerentes",
    );
    // Origem que não é outra linha.
    expect(recusa(linha({ id: ORIGEM, aproveitou_de: ORIGEM, tentativas: [...REAP3.slice(0, 2), TENT3[2]] }))).toContain(
      "consultas_de_placa_aproveitou_coerente",
    );
  });

  it("o prazo do aprofundar é o do parâmetro vigente: com 30 dias aberto pelo admin, a origem de 8 dias entra", () => {
    const oitoDias = new Date(Date.now() - 8 * 86_400_000).toISOString();
    expect(
      desfeito(
        comoPapel(
          "admin",
          `select 'nova=' || dias_para_aprofundar from public.consulta_veiculo_nova_vigencia(
             30, 30, ${PRECOS}, date '2026-10-19', 'Teste');
           reset role;
           ${origem({ criado_em: oitoDias })};
           ${linha(APROFUNDAR)};
           select 'linhas=' || count(*) from public.consultas_de_placa where placa = 'FOR1A23'`,
        ),
      ),
    ).toMatch(/nova=30[\s\S]*linhas=2/);
  });

  it("violação falha: reaproveitar de outra placa, de outra loja ou da homologação cai na FK composta", () => {
    const FK = "consultas_de_placa_aproveitou_da_mesma_placa";
    expect(recusa(`${origem({ placa: "OUT1A23", retrato: { placa: "OUT1A23" } })}; ${linha(APROFUNDAR)}`)).toContain(FK);
    expect(recusa(`${origem({ homologacao: true, retrato: { placa: "EXEMPLO" } })}; ${linha(APROFUNDAR)}`)).toContain(FK);
    expect(recusa(`${OUTRA_LOJA}; ${origem({}, naOutraLoja)}; ${linha(APROFUNDAR)}`)).toContain(FK);
    // Origem que não existe.
    expect(recusa(linha(APROFUNDAR))).toContain(FK);
  });

  it("violação falha: dado pessoal em fragmentos e tentativas, com as chaves novas; as chaves legítimas do retrato passam", () => {
    const PESSOAL = "consultas_de_placa_sem_dado_pessoal";
    // Controle: as chaves do RetratoDaConsulta que lembram as proibidas não colidem (a regex casa a chave inteira).
    expect(
      recusa(linha({ retrato: { placa: "FOR1A23", veiculo: { descricao: "GOL" },
                                gratuito: { empresaDoFaturamento: { razaoSocial: "X", nomeFantasia: "Y" } },
                                pessoas: { donosNoHistorico: 2, financiadosDistintos: 1 } } })),
    ).toBe("");
    for (const chave of ["nome_razao", "nome_financiado", "cpf_cnpj_financiado", "numero_identificacao_do_faturado",
                         "codigo_seguranca_crv", "nome", "Nome", "documento", "cpf", "pronome"]) {
      expect(recusa(linha({ fragmentos: { ...FRAG, estadual: { [chave]: "X" } } })), `fragmento: ${chave}`).toContain(PESSOAL);
    }
    expect(recusa(linha({ tentativas: [{ ...TENT3[0], documento: "0" }, TENT3[1], TENT3[2]] }))).toContain(PESSOAL);
    expect(recusa(linha({ retrato: { placa: "FOR1A23", veiculo: { nome: "FULANO" } } }))).toContain(PESSOAL);
  });

  it("apagar a origem (só o serviço apaga) não apaga o aprofundamento: aproveitou_de vira nulo e a linha fica", () => {
    const saida = desfeito(
      `${origem()};
       ${linha({ ...APROFUNDAR, id: "00000000-0000-0000-0000-0000000f0003" })};
       set local role service_role;
       delete from public.consultas_de_placa where id = '${ORIGEM}';
       reset role;
       select 'ficou=' || count(*) || ':' || bool_and(aproveitou_de is null) || ':' || nivel
         from public.consultas_de_placa where id = '00000000-0000-0000-0000-0000000f0003' group by nivel`,
    );
    expect(saida).toContain("ficou=1:true:intermediario");
    // A sessão (nem o admin) continua sem apagar nem editar.
    expect(recusa(comoPapel("admin", `delete from public.consultas_de_placa`))).toContain("permission denied");
    expect(recusa(comoPapel("admin", `update public.consultas_de_placa set nivel = 'completo'`))).toContain("permission denied");
  });

  it("os parâmetros: a semente de 2026-10-19 é a vigente, admin/gestor/comercial leem, o marketing não vê, anon é barrado", () => {
    for (const papel of ["admin", "gestor", "comercial"]) {
      expect(
        desfeito(
          comoPapel(
            papel,
            `select 'vigente=' || (count(*) = 1
               and bool_and(dias_para_aprofundar = 7 and minutos_contra_repeticao = 30
                            and tabela_de_precos_em = date '2026-10-19' and fonte = 'Tabela pública da APIBrasil'
                            and precos_de_referencia = ${PRECOS}))
               from public.parametros_consulta_veiculo where vigencia_ate is null`,
          ),
        ),
        papel,
      ).toContain("vigente=true");
    }
    expect(desfeito(comoPapel("marketing", "select 'vistos=' || count(*) from public.parametros_consulta_veiculo"))).toContain(
      "vistos=0",
    );
    expect(recusa("set local role anon; select 1 from public.parametros_consulta_veiculo")).toContain("permission denied");
  });

  it("violação falha: parâmetro só se escreve pela função, só o admin abre vigência, e o valor vigente não se edita", () => {
    const nova = (dias: number, precos = PRECOS) =>
      `select 'nova=' || dias_para_aprofundar from public.consulta_veiculo_nova_vigencia(
         ${dias}, 15, ${precos}, date '2026-11-01', 'Teste')`;
    for (const papel of ["gestor", "comercial", "marketing"]) {
      expect(recusa(comoPapel(papel, nova(10))), papel).toContain("Só o Administrador");
    }
    expect(recusa(nova(10))).toContain("sem sessão");
    expect(recusa(`set local role anon; ${nova(10)}`)).toContain("permission denied for function consulta_veiculo_nova_vigencia");
    expect(
      recusa(comoPapel("admin", `insert into public.parametros_consulta_veiculo
           (precos_de_referencia, tabela_de_precos_em, fonte, dias_para_aprofundar, minutos_contra_repeticao)
         values (${PRECOS}, current_date, 'direto', 7, 30)`)),
    ).toContain("permission denied");
    expect(
      recusa(comoPapel("admin", "update public.parametros_consulta_veiculo set vigencia_ate = current_date")),
    ).toContain("permission denied");
    const saida = desfeito(
      comoPapel(
        "admin",
        `${nova(14)};
         reset role;
         select 'vigentes=' || count(*) || ':' || bool_and(dias_para_aprofundar = 14 and criado_por = '${UID.admin}')
           from public.parametros_consulta_veiculo where vigencia_ate is null;
         select 'encerradas_hoje=' || count(*) from public.parametros_consulta_veiculo
          where vigencia_ate = current_date and dias_para_aprofundar = 7`,
      ),
    );
    expect(saida).toContain("nova=14");
    expect(saida).toContain("vigentes=1:true");
    expect(saida).toContain("encerradas_hoje=1");
    expect(recusa(comoPapel("admin", nova(91)))).toContain("parametros_consulta_veiculo_dias_para_aprofundar_na_faixa");
    expect(recusa(comoPapel("admin", nova(7, `${PRECOS} - 'recall'`)))).toContain("parametros_consulta_veiculo_precos_validos");
    // Valor vigente não sofre UPDATE nem pelo dono (D-T1.7).
    expect(
      recusa("update public.parametros_consulta_veiculo set dias_para_aprofundar = 8 where vigencia_ate is null"),
    ).toContain("não sofre UPDATE");
  });

  it("violação falha: cada faixa dos parâmetros e a tabela de preços com exatamente os seis produtos", () => {
    // Vigência FUTURA e já encerrada, como dono: fora do índice de vigente única e do guarda D-T1.7.
    const caso = (muda: Record<string, string>) => {
      const base: Record<string, string> = {
        precos_de_referencia: PRECOS, fonte: "'Teste'", dias_para_aprofundar: "7", minutos_contra_repeticao: "30", ...muda,
      };
      return `insert into public.parametros_consulta_veiculo
                (${Object.keys(base).join(", ")}, tabela_de_precos_em, vigencia_desde, vigencia_ate)
              values (${Object.values(base).join(", ")}, current_date, current_date + 365, current_date + 730)`;
    };
    expect(recusa(caso({}))).toBe("");
    expect(recusa(caso({ dias_para_aprofundar: "90", minutos_contra_repeticao: "0" }))).toBe("");
    expect(recusa(caso({ dias_para_aprofundar: "0" }))).toContain("parametros_consulta_veiculo_dias_para_aprofundar_na_faixa");
    expect(recusa(caso({ minutos_contra_repeticao: "1441" }))).toContain(
      "parametros_consulta_veiculo_minutos_contra_repeticao_na_faixa",
    );
    expect(recusa(caso({ precos_de_referencia: `${PRECOS} || '{"cpf-lite": 0.12}'` }))).toContain(
      "parametros_consulta_veiculo_precos_validos",
    );
    expect(recusa(caso({ precos_de_referencia: `${PRECOS} || '{"fipe": -0.01}'` }))).toContain(
      "parametros_consulta_veiculo_precos_validos",
    );
    expect(recusa(caso({ precos_de_referencia: `${PRECOS} || '{"fipe": "0.06"}'` }))).toContain(
      "parametros_consulta_veiculo_precos_validos",
    );
    expect(recusa(caso({ fonte: "'   '" }))).toContain("parametros_consulta_veiculo_fonte_preenchida");
    // Uma vigente por loja.
    expect(
      recusa(`insert into public.parametros_consulta_veiculo
                (precos_de_referencia, tabela_de_precos_em, fonte, dias_para_aprofundar, minutos_contra_repeticao)
              values (${PRECOS}, current_date, 'segunda', 7, 30)`),
    ).toContain("parametros_consulta_veiculo_um_vigente");
  });

  it("isolamento entre duas lojas: a consulta e o parâmetro da outra não aparecem, e cada loja tem a sua vigente", () => {
    const saida = desfeito(
      `${OUTRA_LOJA};
       ${usuario("comercial")};
       ${linha({ placa: "ISO1A23", retrato: { placa: "ISO1A23" } }, naOutraLoja)};
       ${linha({ placa: "ISO1A23", retrato: { placa: "ISO1A23" } })};
       insert into public.parametros_consulta_veiculo
         (org_id, precos_de_referencia, tabela_de_precos_em, fonte, dias_para_aprofundar, minutos_contra_repeticao)
       select id, ${PRECOS}, current_date, 'Outra loja', 30, 0 from public.orgs where nome = 'Outra loja (níveis)';
       select 'vigentes_por_loja=' || count(*) from public.parametros_consulta_veiculo where vigencia_ate is null;
       ${sessao("comercial")};
       select 'consultas_vistas=' || count(*) from public.consultas_de_placa where placa = 'ISO1A23';
       select 'parametros_vistos=' || count(*) || ':' || bool_and(org_id = public.org_padrao())
         from public.parametros_consulta_veiculo`,
    );
    expect(saida).toContain("vigentes_por_loja=2");
    expect(saida).toContain("consultas_vistas=1");
    expect(saida).toContain("parametros_vistos=1:true");
  });
});

/**
 * Os níveis da consulta de placa, pela porta de verdade (19/10/2026): a linha
 * que `gravar()` de `niveisDaPlaca-servidor.ts` monta — leitores e
 * `montarRetratoPorNivel` sobre as respostas da doc (tests/fixtures/apibrasil/
 * placa-niveis.json) — vai ao banco vestida de COMERCIAL, como o PostgREST a
 * levaria, e tem de passar em todas as regras e no gatilho do
 * reaproveitamento. O aceite da migração prova as regras com linhas escritas
 * à mão; aqui é o app que escreve.
 *
 * O "PostgREST" é um tradutor mínimo: cada cadeia do dublê do supabase-js
 * (select com eq/is/gte/order/limit, e insert…select) vira SQL rodado pelo
 * psql na sessão do comercial. A trava contra repetição, a leitura dos
 * parâmetros e a leitura da guardada no aprofundar também passam por ele —
 * contra o banco de verdade.
 *
 * Diferente dos blocos acima, as linhas aqui são GRAVADAS (o aprofundar lê a
 * básica em outra conexão); o `afterAll` apaga o que este bloco criou.
 */
describe.skipIf(!temBanco)("os níveis da consulta de placa, gravados pela porta do app", () => {
  const UID = "00000000-0000-0000-0000-00000000ae13";
  const PLACA = "QOZ7702";
  const PLACA_COMPLETO = "ABC1D23";
  const COLUNAS = "id, placa, nivel, produtos, fragmentos, retrato, custo, homologacao, criado_em, consultado_por_nome";
  const respostas = JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", "placa-niveis.json"), "utf8")) as Record<string, unknown>;
  const veiculosTotal = JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", "veiculos-total-mg-com-alienacao.json"), "utf8")) as unknown;

  type Servidor = typeof import("../src/lib/niveisDaPlaca-servidor");
  let servidor: Servidor;
  let fetchOriginal: typeof globalThis.fetch;

  const literal = (v: unknown): string =>
    v === null ? "null" : typeof v === "boolean" || typeof v === "number" ? String(v) : `$v$${String(v)}$v$`;

  /** A cadeia do dublê em SQL: um comando que devolve a lista de linhas em JSON, entre marcas `@@`. */
  function emSql(c: Chamada): string {
    if (c.operacao === "insert") {
      const valores = c.valores as Record<string, unknown>;
      const colunas = Object.keys(valores).join(", ");
      return `with ins as (
                insert into public.${c.tabela} (${colunas})
                select ${colunas} from jsonb_populate_record(null::public.${c.tabela}, $j$${JSON.stringify(valores)}$j$::jsonb)
                returning ${COLUNAS})
              select '@@' || coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb)::text || '@@' from ins`;
    }
    const onde: string[] = [];
    let ordem = "";
    let limite = "";
    for (const [nome, coluna, valor] of c.filtros as Array<[string, string, unknown]>) {
      if (nome === "eq") onde.push(`${coluna} = ${literal(valor)}`);
      else if (nome === "gte") onde.push(`${coluna} >= ${literal(valor)}`);
      else if (nome === "is") onde.push(`${coluna} is ${literal(valor)}`);
      else if (nome === "order") ordem = ` order by ${coluna} ${(valor as { ascending?: boolean })?.ascending === false ? "desc" : "asc"}`;
      else if (nome === "limit") limite = ` limit ${Number(coluna)}`;
      else throw new Error(`filtro não traduzido: ${nome}`);
    }
    return `select '@@' || coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)::text || '@@'
              from (select ${c.colunas ?? "*"} from public.${c.tabela}${onde.length ? ` where ${onde.join(" and ")}` : ""}${ordem}${limite}) t`;
  }

  /** O banco que o app vê: cada chamada numa transação própria, na sessão do comercial. */
  const banco = supabaseDeTeste({
    responder: (c: Chamada): Resposta => {
      try {
        const saida = psql!(
          `begin;
           select set_config('request.jwt.claims', json_build_object('sub', '${UID}', 'role', 'authenticated')::text, true);
           set local role authenticated;
           ${emSql(c)};
           commit;`,
        );
        const linhas = JSON.parse(saida.match(/@@([\s\S]*?)@@/)![1]) as unknown[];
        return { data: c.fim === null ? linhas : (linhas[0] ?? null), error: null };
      } catch (e) {
        const mensagem = String((e as Error).message);
        return { data: null, error: { message: mensagem, code: mensagem.match(/\b(23514|23503|42501|P0001)\b/)?.[1] } };
      }
    },
  });
  const cliente = banco.cliente as unknown as Parameters<Servidor["consultarPlacaPorNivel"]>[0];

  /** O gateway: as respostas da doc, por produto, e o que foi pedido. */
  function gateway() {
    const tipos: string[] = [];
    const buscar = async (_url: string, init: { body: string }) => {
      const tipo = String((JSON.parse(init.body) as { tipo: string }).tipo);
      tipos.push(tipo);
      return { status: 200, json: async () => structuredClone(tipo === "veiculos-total" ? veiculosTotal : respostas[tipo]) };
    };
    return { buscar, tipos };
  }

  /** Consulta como a rota: parâmetros lidos do banco, token, modo de produção. Devolve também o erro do banco, se a gravação falhou. */
  async function consultar(pedido: { placa: string; nivel: "basico" | "intermediario" | "economico" | "completo"; aprofundarDe?: string | null; repetir?: boolean }) {
    const parametros = await servidor.lerParametrosDaPlaca(cliente);
    if (!parametros.ok) throw new Error(parametros.motivo);
    const gw = gateway();
    const erros: string[] = [];
    const espia = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void erros.push(a.map(String).join(" ")));
    try {
      const r = await servidor.consultarPlacaPorNivel(cliente, pedido, { token: "tok", homologacao: false, parametros: parametros.parametros, buscar: gw.buscar as never });
      return { r, gw, erroDoBanco: erros.join(" | ") };
    } finally {
      espia.mockRestore();
    }
  }

  /** A linha gravada, lida como dono (sem RLS), em JSON. */
  const linhaNoBanco = (id: string) =>
    JSON.parse(
      psql!(
        `select '@@' || to_jsonb(c)::text || '@@' from public.consultas_de_placa c where id = '${id}'`,
      ).match(/@@([\s\S]*?)@@/)![1],
    ) as Record<string, unknown>;

  const limpar = () =>
    psql!(
      `delete from public.consultas_de_placa where placa in ('${PLACA}', '${PLACA_COMPLETO}') and consultado_por = '${UID}';
       delete from public.profiles where id = '${UID}';
       delete from auth.users where id = '${UID}'`,
    );

  let idDaBasica = "";

  beforeAll(async () => {
    servidor = await import("../src/lib/niveisDaPlaca-servidor");
    limpar();
    psql!(
      `insert into auth.users (id, instance_id, aud, role, email)
         values ('${UID}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'niveis-porta@exemplo.invalido');
       update public.profiles set full_name = 'Comercial da porta', papeis = array['comercial'], role = 'comercial', is_active = true
        where id = '${UID}'`,
    );
    // A parte sem custo (BrasilAPI) não sai da máquina: a falha dela vira aviso, como em produção.
    fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => null })) as never;
  });

  afterAll(() => {
    globalThis.fetch = fetchOriginal;
    limpar();
  });

  it("os parâmetros vêm do banco, na sessão do comercial, com os preços da semente", async () => {
    const p = await servidor.lerParametrosDaPlaca(cliente);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.parametros).toMatchObject({ tabelaDePrecosEm: "2026-10-19", diasParaAprofundar: 7, minutosContraRepeticao: 30 });
    expect(servidor.niveisComPreco(p.parametros.precos).map((n) => n.preco)).toEqual([3.18, 5.58, 10.58, 30]);
  });

  it("básico: a linha que gravar() monta passa em todas as regras, e o carimbo é do comercial", async () => {
    const { r, gw, erroDoBanco } = await consultar({ placa: PLACA, nivel: "basico" });
    expect(erroDoBanco, "o banco recusou a linha do básico").toBe("");
    expect(r.ok && r.gravada).toBe(true);
    expect(gw.tipos.sort()).toEqual(["estadual", "fipe", "recall"]);
    if (!r.ok) return;
    idDaBasica = r.consulta.id!;
    const linha = linhaNoBanco(idDaBasica);
    expect(linha).toMatchObject({
      produto: "niveis",
      nivel: "basico",
      produtos: ["estadual", "recall", "fipe"],
      custo: 3.18,
      homologacao: false,
      aproveitou_de: null,
      consultado_por: UID,
      consultado_por_nome: "Comercial da porta",
    });
    expect((linha.tentativas as unknown[]).length).toBe(3);
  });

  it("o aprofundar para o econômico (aproveitou_de da básica) passa nas regras e no gatilho, pagando só o que falta", async () => {
    expect(idDaBasica).not.toBe("");
    const { r, gw, erroDoBanco } = await consultar({ placa: PLACA, nivel: "economico", aprofundarDe: idDaBasica });
    expect(erroDoBanco, "o banco recusou o aprofundar").toBe("");
    expect(r.ok && r.gravada).toBe(true);
    expect(gw.tipos.sort()).toEqual(["check-list", "historico-proprietarios"]);
    if (!r.ok) return;
    const linha = linhaNoBanco(r.consulta.id!);
    expect(linha).toMatchObject({
      nivel: "economico",
      produtos: ["estadual", "recall", "fipe", "check-list", "historico-proprietarios"],
      aproveitou_de: idDaBasica,
      custo: 7.4,
    });
    const tentativas = linha.tentativas as Array<{ produto: string; reaproveitado: boolean }>;
    expect(tentativas.filter((t) => t.reaproveitado).map((t) => t.produto)).toEqual(["estadual", "recall", "fipe"]);
    // A guardada nova já é a mais recente da placa, com as dez checagens.
    expect((linha.retrato as { naoVeio: unknown[] }).naoVeio).toEqual([]);
  });

  it("o intermediário a partir da mesma básica também passa", async () => {
    const { r, erroDoBanco } = await consultar({ placa: PLACA, nivel: "intermediario", aprofundarDe: idDaBasica });
    expect(erroDoBanco).toBe("");
    expect(r.ok && r.gravada).toBe(true);
  });

  it("a trava de verdade: o básico de novo, há pouco, volta 409 sem chamar o gateway; com `repetir`, grava", async () => {
    const trava = await consultar({ placa: PLACA, nivel: "basico" });
    expect(trava.r).toMatchObject({ ok: false, status: 409 });
    expect(trava.gw.tipos).toEqual([]);
    const repetida = await consultar({ placa: PLACA, nivel: "basico", repetir: true });
    expect(repetida.erroDoBanco).toBe("");
    expect(repetida.r.ok && repetida.r.gravada).toBe(true);
  });

  it("completo: o Veículos Total gravado como produto veiculos-total passa nas regras", async () => {
    const { r, gw, erroDoBanco } = await consultar({ placa: PLACA_COMPLETO, nivel: "completo" });
    expect(erroDoBanco).toBe("");
    expect(r.ok && r.gravada).toBe(true);
    expect(gw.tipos).toEqual(["veiculos-total"]);
    if (r.ok) expect(linhaNoBanco(r.consulta.id!)).toMatchObject({ produto: "veiculos-total", nivel: "completo", produtos: ["veiculos-total"], fragmentos: {} });
  });
});

// Sem banco, o arquivo não fica mudo: um teste que passa dizendo por que os
// outros não rodaram. Um `skip` silencioso vira "a suíte está verde" quando na
// verdade a parte que toca SQL nunca correu.
describe.skipIf(temBanco)("sem Postgres alcançável", () => {
  it("os testes de migração ficam de fora — instale Postgres ou aponte PSQL_TESTE", () => {
    expect(temBanco).toBe(false);
  });
});
