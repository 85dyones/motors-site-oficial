# Campanhas de SMS

`/admin/marketing/sms` — pedido do dono em 07/10/2026: criar campanhas de SMS
por veículo, enviar para quem já demonstrou interesse e acompanhar cada uma.

## O que a tela faz

1. **Criar.** Escolhe-se um carro à venda, quem recebe e a mensagem.
   - Quem recebe, em relação ao carro: quem demonstrou interesse **neste
     carro**, **neste modelo**, **nesta marca** ou em **preço parecido** (a
     mesma banda dos "parecidos" da ficha). O interesse vem de
     `leads_veiculos` e do carro principal do lead, com um período (30, 90,
     180, 365 dias ou sempre).
   - Ficam de fora: quem já comprou, aqui ou fora (vale para o telefone: se
     o número tem um lead ganho, nenhum outro cadastro dele recebe), quem
     desistiu daquele interesse, lead descartado pela equipe, quem não tem
     celular, quem pediu para sair, e o mesmo número pela segunda vez. A
     prévia mostra quantos de cada. Lead **perdido** entra: perdeu-se aquela
     negociação, e a pessoa pode voltar por outro carro ou outro preço.
   - A mensagem aceita `{nome}`, `{carro}`, `{preco}` e `{link}`. O acento é
     removido no envio, junto com aspas curvas, travessão e emoji (um caractere fora do alfabeto do SMS derruba o limite
     de 160 para 70 e dobra o custo), e o rodapé "Sair: responda SAIR" entra
     sempre.
   - Criar **não envia**: a campanha nasce rascunho, com o público congelado.
2. **Enviar.** No monitor, com confirmação. Sai em lotes de 20; a tela chama o
   lote seguinte sozinha e mostra o progresso. Dá para interromper.
3. **Acompanhar.** Por campanha: público, enviados, na operadora, quem clicou
   no link, quem respondeu, quem saiu da lista, falhas, custo e leads novos
   que entraram pelo link. Por destinatário: a etapa em que está e a resposta.

## Quem recebe: por carro ou por perfil

A campanha escolhe o público de dois jeitos, conforme a intenção:

- **Por carro**: os quatro critérios acima, sempre com um carro.
- **Por perfil**: **Interessados** (quem procurou a loja e ainda não comprou,
  com ou sem carro identificado), **Clientes** (quem já comprou) ou **Todos**.
  O carro é opcional; sem ele o link leva ao estoque e a mensagem não usa
  `{carro}` nem `{preco}`.

Nos dois: filtro por **canal** de origem (OLX, Webmotors, WhatsApp…), o
**período** e o **descanso** (quem recebeu qualquer campanha há menos de 7, 15
ou 30 dias fica de fora; o padrão é 7).

### A prévia de leads e o percentual de match

Antes de criar, "Calcular público" mostra:

- **o alcance de cada critério** para o mesmo carro (este carro, este modelo,
  esta marca, preço parecido), para escolher entre o público certeiro e o largo;
- **o match de cada pessoa**, de 0 a 100: são cinco sinais, um quinto cada —
  mesma marca, mesmo modelo, este carro exato, preço parecido e interesse nos
  últimos 90 dias. Não há peso escolhido: o número diz quantos dos cinco a
  pessoa tem, no interesse dela que mais se parece com o carro da campanha;
- **uma amostra** das primeiras pessoas (primeiro nome, telefone mascarado, o
  carro que olhou e o match), na ordem de envio: maior match primeiro.

### Hora de trocar

Por perfil, com **Clientes** ou **Todos**, há o filtro "comprou há pelo menos
1 ano, 1 ano e meio, 2 ou 3 anos". A data vem da base importada (a última
compra do arquivo de clientes, ou a linha de pós-venda) e, no site, da data do
lead ganho. Quem não tem data conhecida fica de fora quando o filtro está
ligado. Sem carro, o link pode levar ao estoque ou à avaliação do usado; o
atalho "Campanha de troca" arma tudo de uma vez.

A pessoa é o telefone. O mesmo celular em dois leads do site e num contato da
base importada recebe uma vez, e o que se sabe de um vale para todos: se
qualquer cadastro diz que ela comprou, ela é cliente.

## A base de contatos (`/admin/marketing/base`)

É de onde vem a maior parte do público: a base antiga do RevendaMais,
importada de planilha. Ela **não** vai para `leads`, que é a fila de trabalho
do vendedor; mora em `marketing_contatos` e `marketing_interesses`, e as
campanhas leem as duas fontes.

- **Arquivos aceitos**: a exportação de leads do RevendaMais (o `.xls`, que é
  uma tabela HTML), a exportação de clientes (`.xlsx`) e planilha comum (CSV
  ou Excel) com colunas de nome, telefone, e-mail, veículo, marca, modelo,
  placa, data e canal. O arquivo é lido no navegador.
- **O que entra de cada um**: do arquivo de leads, os carros que cada pessoa
  olhou (marca, modelo e placa, com a data) e o carro comprado, nas linhas de
  pós-venda. Do arquivo de clientes, quem comprou e a data da última compra,
  que é o que um upsell vai usar.
- **O que não entra**: CPF, RG, nome da mãe, nascimento e endereço. As colunas
  que a importação não reconhece nem saem do navegador, e a tela lista quais
  foram ignoradas.
- **Carro de interesse**: a placa liga o registro ao carro do estoque. Sem
  placa, marca e modelo ligam quando há um carro só daquela família no
  cadastro. O registro guarda marca e modelo de qualquer jeito, e é por eles
  que "este modelo" e "esta marca" acham quem olhou um carro já vendido.
- **Reimportar não duplica**: a pessoa é o celular, e cada linha do RevendaMais
  tem um id que não entra duas vezes. Os dois arquivos se somam: importar o de
  clientes depois do de leads marca os compradores e acrescenta quem faltava.
- **Datas**: a pessoa leva a data de quando apareceu na origem (cadastro,
  contato, compra), e nunca a da importação. Quem não tem data nenhuma só
  entra em campanha com período "sempre".
- **Desfazer**: cada importação pode ser desfeita. Saem as pessoas que ela
  criou, com todos os registros e envios de SMS delas (inclusive registros que
  outra importação acrescentou). Quem já estava na base fica como a importação
  deixou: o que foi atualizado não volta atrás. Depois de desfazer, importe de
  novo os arquivos que vieram depois. Quem pediu para sair continua fora.

### O que ainda não tem

- **Teto de envio.** "Todos", sem filtro, alcança a base inteira (mais de 11
  mil pessoas). A prévia mostra quantos recebem e o custo estimado (com
  `SMS_PRECO_POR_PARTE` configurado), e o envio pede confirmação, mas nada
  limita o tamanho de uma campanha.
- **Envio grande é lento**: sai em lotes de 20 com a página aberta.

## Dado pessoal

- Quem usa é o Administrador e o Marketing. O Marketing **não lê contato de
  lead**, e continua não lendo: o público é montado no servidor, e a tela
  recebe contagem, primeiro nome e telefone mascarado.
- `sms_envios` e `sms_descadastros` não têm leitura para nenhuma sessão do
  painel; só o servidor entra, depois de conferir a matriz.
- A base legal adotada é o legítimo interesse. Ela vem com o direito de
  oposição: quem responde SAIR (ou PARE, STOP, CANCELAR, "não quero") vai para
  `sms_descadastros`, sai da fila de todas as campanhas e não entra em público
  nenhum depois. O descadastro guarda só o telefone e sobrevive à eliminação
  do lead, de propósito: é o registro de que a pessoa pediu para não receber.

## O link curto

Cada destinatário recebe `<domínio>/s/<código>`. A rota conta o clique daquela
pessoa e leva à ficha com `utm_campaign=sms-<código da campanha>`; é por essa
marca que um lead novo vindo do SMS aparece no monitor.

## O que protege o dinheiro

- O lote é reservado no banco (`sms_reservar_envios`): duas abas ou dois
  cliques não mandam o mesmo SMS.
- Nada é reenviado sozinho. Resposta que não chegou vira "falhou — pode ter
  saído", e não volta para a fila.
- Sem saldo ou com token recusado o lote para, ninguém vira falha e a fila
  espera: depois do crédito, "Continuar envio".
- Mensagem acima de 3 SMS por pessoa é recusada, medida pessoa a pessoa.
- Lote em que o fornecedor recusa todos pelo mesmo motivo (o `tipo` errado,
  por exemplo) volta inteiro para a fila, com aviso: erro de configuração não
  queima a campanha.
- Rascunho envelhece: se o carro saiu do site ou o preço mudou desde a
  criação, o envio é recusado e pede campanha nova.
- Campanha criada em modo de teste não sai em ambiente de verdade, nem o
  contrário.
- Quem pediu para sair depois de a campanha ser criada é conferido de novo na
  hora de cada lote.

## Para ligar

1. Aplicar a migração `20261007120000_sms_campanhas`.
2. Na Vercel (Production):
   - `APIBRASIL_TOKEN` — o mesmo da consulta de placa.
   - `SMS_WEBHOOK_TOKEN` — um texto longo e aleatório. **Obrigatório**: sem
     ele a resposta SAIR não chega, e o envio de campanha de verdade é
     recusado.
   - `SMS_PRECO_POR_PARTE` — o preço do SMS em reais ("0.10"), para a prévia
     de custo.
   - `APIBRASIL_SMS_TIPO` — só se o fornecedor recusar o padrão
     (`sms-marketing`).
3. Antes da primeira campanha, usar **Enviar teste para mim**.

## O que ainda não foi conferido com o fornecedor

O contrato de envio veio do guia público da APIBrasil; a chamada real não foi
feita. Três pontos só o primeiro teste confirma:

- o identificador do produto de marketing (`tipo`);
- o nome dos campos do aviso de resposta (o leitor aceita `message`, `text`,
  `reply`, `body`, `content`);
- se a APIBrasil avisa a entrega no aparelho. Pelo guia, o último aviso é "na
  operadora", e é isso que a tela mostra.

Arquivos: `src/lib/smsCampanhas.ts` (puro), `src/lib/smsCampanhas-servidor.ts`,
`src/lib/apiBrasilSms.ts`, `src/lib/baseDeMarketing.ts` (a planilha),
`src/lib/baseDeMarketing-servidor.ts`, `src/lib/familiaDoModelo.ts`, rotas em
`src/app/api/marketing/sms/`, `src/app/api/marketing/base/` e
`src/app/s/[codigo]/`.
