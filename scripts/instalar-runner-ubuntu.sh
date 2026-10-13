#!/usr/bin/env bash
# Prepara um notebook com Ubuntu Server 24.04 dedicado ao CI e registra os
# runners dos dois repositórios. É a etapa "notebook dedicado" de
# docs/RUNNER_DO_CI.md.
#
# Rode com o usuário criado na instalação (o que tem sudo), não como root:
#   bash instalar-runner-ubuntu.sh
# Para cada repositório, pergunta quantas instâncias e o token da tela
# "New self-hosted runner" DAQUELE repositório. O token vale 1 hora e serve
# para todas as instâncias do repositório. Não fica em arquivo nem no histórico.
# Zero instâncias pula o repositório.
#
# Rodar de novo é seguro: troca as instâncias com o mesmo nome (--replace) e
# reescreve as configurações.
set -euo pipefail

ROTULO=motors-ci
DONO=85dyones
# Teto de cada instância. Medido em 12/10/2026: `next build` chega a 2,5 GB e o
# vitest com 2 processos a 1 GB. Com 8 GB de RAM e 4 GB de swap, 3 instâncias.
MEMORIA_ALTA=2600M
MEMORIA_MAXIMA=3G

if [ "$(id -u)" = "0" ]; then
  echo "Rode com o seu usuário, não como root." >&2
  exit 1
fi

pergunta_repositorio() {
  local repo=$1 padrao=$2 n token
  read -rp "Instâncias para $repo [$padrao]: " n
  n=${n:-$padrao}
  [[ "$n" =~ ^[0-9]$ ]] || { echo "Número inválido." >&2; exit 1; }
  token=""
  if [ "$n" != "0" ]; then
    read -rsp "Token de New self-hosted runner de $repo (não aparece enquanto digita): " token
    echo >&2
    [[ "$token" =~ ^[A-Za-z0-9]+$ ]] || { echo "Token vazio ou com caractere estranho." >&2; exit 1; }
  fi
  printf '%s %s %s\n' "$repo" "$n" "$token"
}

echo "Com 8 GB de RAM, 3 instâncias no total: 2 para a Motors e 1 para a plataforma."
PEDIDOS=$(
  pergunta_repositorio motors-site-oficial 2
  pergunta_repositorio motors-plataforma 1
)

echo "1/7 Pacotes e cliente do Postgres 17 (usado pelo workflow esquema-base)."
sudo apt-get update -qq
sudo apt-get install -y -qq git curl jq tar xz-utils ca-certificates lsb-release iptables ufw unattended-upgrades avahi-daemon >/dev/null
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql-client-17 >/dev/null

echo "2/7 Notebook que não dorme: tampa fechada e inatividade não suspendem."
sudo install -d /etc/systemd/logind.conf.d
sudo tee /etc/systemd/logind.conf.d/ci.conf >/dev/null <<'CONF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
HandleSuspendKey=ignore
HandleHibernateKey=ignore
IdleAction=ignore
CONF
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1
sudo systemctl restart systemd-logind

echo "3/7 Swap de 4 GB para os picos de memória."
if ! swapon --show=NAME --noheadings | grep -q .; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "4/7 Atualizações de segurança automáticas, com reinício às 4h30 quando preciso."
sudo tee /etc/apt/apt.conf.d/52ci-reinicio >/dev/null <<'CONF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
CONF
sudo systemctl enable --now unattended-upgrades >/dev/null 2>&1

echo "5/7 Usuário runner, sem sudo e sem senha; bloqueio de rede dele; SSH."
id runner >/dev/null 2>&1 || sudo adduser --disabled-password --gecos "" runner >/dev/null
# O runner sai para a internet e resolve nomes pelo resolvedor local, mas não
# chega à rede de casa (roteador, impressora, outros computadores) nem a
# serviços desta máquina. As regras entram no topo de OUTPUT e são recolocadas
# a cada início de instância (ExecStartPre abaixo).
sudo tee /usr/local/sbin/ci-firewall.sh >/dev/null <<'SH'
#!/usr/bin/env bash
set -e
regra() { iptables -C OUTPUT "$@" 2>/dev/null || iptables -I OUTPUT "$@"; }
# Ordem inversa: cada -I entra no topo da lista.
regra -m owner --uid-owner runner -d 192.168.0.0/16 -j REJECT
regra -m owner --uid-owner runner -d 172.16.0.0/12 -j REJECT
regra -m owner --uid-owner runner -d 10.0.0.0/8 -j REJECT
regra -m owner --uid-owner runner -d 169.254.0.0/16 -j REJECT
regra -m owner --uid-owner runner -o lo -j REJECT
regra -m owner --uid-owner runner -o lo -p tcp --dport 53 -j ACCEPT
regra -m owner --uid-owner runner -o lo -p udp --dport 53 -j ACCEPT
SH
sudo chmod 700 /usr/local/sbin/ci-firewall.sh
# Entrada: só SSH. O runner não recebe conexão nenhuma; ele só sai. O ufw liga
# antes das regras do runner, para elas ficarem acima das dele.
sudo ufw default deny incoming >/dev/null
sudo ufw default allow outgoing >/dev/null
sudo ufw allow OpenSSH >/dev/null
# mDNS, para o outro notebook achar esta máquina como motors-ci.local.
sudo ufw allow 5353/udp >/dev/null
sudo ufw --force enable >/dev/null
sudo /usr/local/sbin/ci-firewall.sh
# Com chave SSH cadastrada (a instalação importa a do GitHub), senha não entra
# mais por SSH. Sem chave, fica como está, para ninguém ficar trancado fora.
if [ -s "$HOME/.ssh/authorized_keys" ]; then
  echo "PasswordAuthentication no" | sudo tee /etc/ssh/sshd_config.d/50-ci.conf >/dev/null
  sudo systemctl reload ssh 2>/dev/null || true
fi

echo "6/7 Runner mais recente e as bibliotecas de que ele precisa."
URL=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest \
  | jq -r '.assets[] | select(.name | test("^actions-runner-linux-x64-[0-9.]+\\.tar\\.gz$")) | .browser_download_url')
[ -n "$URL" ] || { echo "Não achei a versão mais recente do runner." >&2; exit 1; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/runner.tar.gz" "$URL"
chmod 755 "$TMP"
chmod 644 "$TMP/runner.tar.gz"
mkdir "$TMP/deps"
tar xzf "$TMP/runner.tar.gz" -C "$TMP/deps"
sudo "$TMP/deps/bin/installdependencies.sh" >/dev/null

echo "7/7 Registrando as instâncias como serviços que sobem no boot."
while read -r REPO N TOKEN <&3; do
  [ "$N" = "0" ] && { echo "    $REPO: nenhuma instância."; continue; }
  # motors-site-oficial mantém os nomes da primeira instalação (12/10/2026).
  if [ "$REPO" = "motors-site-oficial" ]; then PASTA=actions-runner; NOME=motors-casa
  else PASTA=actions-runner-$REPO; NOME=$REPO-casa; fi
  for I in $(seq 1 "$N"); do
    DIR=/home/runner/$PASTA-$I
    # Rodada anterior: desliga o serviço e apaga o registro local; o --replace
    # troca o registro no GitHub.
    if [ -f "$DIR/.service" ]; then
      (cd "$DIR" && { sudo ./svc.sh stop >/dev/null 2>&1 || true; sudo ./svc.sh uninstall >/dev/null 2>&1 || true; })
    fi
    sudo rm -f "$DIR/.runner" "$DIR/.credentials" "$DIR/.credentials_rsaparams" "$DIR/.service"
    sudo -u runner -H mkdir -p "$DIR"
    sudo -u runner -H tar xzf "$TMP/runner.tar.gz" -C "$DIR"
    sudo -u runner -H bash -c "cd '$DIR' && ./config.sh --url 'https://github.com/$DONO/$REPO' --token '$TOKEN' \
      --name $NOME-$I --labels '$ROTULO' --work _work --unattended --replace" >/dev/null
    (cd "$DIR" && sudo ./svc.sh install runner >/dev/null)
    SERVICO=$(cat "$DIR/.service")
    sudo install -d "/etc/systemd/system/$SERVICO.d"
    sudo tee "/etc/systemd/system/$SERVICO.d/ci.conf" >/dev/null <<CONF
[Service]
ExecStartPre=+/usr/local/sbin/ci-firewall.sh
MemoryHigh=$MEMORIA_ALTA
MemoryMax=$MEMORIA_MAXIMA
Restart=always
RestartSec=10
CONF
    sudo systemctl daemon-reload
    sudo systemctl enable --now "$SERVICO" >/dev/null 2>&1
    echo "    $NOME-$I registrada e ligada."
  done
done 3<<<"$PEDIDOS"

echo
echo "Pronto. Confira em cada repositório: Settings → Actions → Runners (as instâncias aparecem como Idle)."
echo "Estado por aqui: systemctl list-units 'actions.runner.*' --no-pager"
