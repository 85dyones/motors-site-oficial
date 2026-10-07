import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PASSOS_DO_FUNIL } from "../src/lib/funilDoProfiler";

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
  // As campanhas de SMS por veículo (2026-10-07): a campanha, os destinatários
  // e quem pediu para sair. Entra na cadeia porque o aceite veste admin,
  // marketing, comercial, um marketing desativado, cliente e anon para provar
  // que o painel lê a campanha e leva 42501 no telefone do destinatário, tenta
  // gravar o inválido em cada regra, e usa as três funções como service_role:
  // a reserva do lote, o clique e os presos. Aponta para `leads` (o recorte do
  // andaime já tem `id uuid`) e não toca `estoque_motors`.
  "20261007120000_sms_campanhas.sql",
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

// Sem banco, o arquivo não fica mudo: um teste que passa dizendo por que os
// outros não rodaram. Um `skip` silencioso vira "a suíte está verde" quando na
// verdade a parte que toca SQL nunca correu.
describe.skipIf(temBanco)("sem Postgres alcançável", () => {
  it("os testes de migração ficam de fora — instale Postgres ou aponte PSQL_TESTE", () => {
    expect(temBanco).toBe(false);
  });
});
