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
`src/lib/apiBrasilSms.ts`, rotas em `src/app/api/marketing/sms/` e
`src/app/s/[codigo]/`.
