#!/usr/bin/env bash
# Instala o runner do CI no Ubuntu do WSL. É a etapa 2 de docs/RUNNER_DO_CI.md,
# no computador do dono.
#
# Rode no Ubuntu com o seu usuário (o que tem sudo), não como root:
#   bash instalar-runner-wsl.sh
# Pede o número de instâncias e o token da tela "New self-hosted runner".
# O token vale 1 hora e serve para todas as instâncias. Não fica em arquivo nem
# no histórico.
#
# Rodar de novo é seguro: troca as instâncias com o mesmo nome (--replace).
set -euo pipefail

REPO_URL=https://github.com/85dyones/motors-site-oficial
ROTULO=motors-ci

if [ "$(id -u)" = "0" ]; then
  echo "Rode com o seu usuário do Ubuntu, não como root." >&2
  exit 1
fi

read -rp "Quantas instâncias (uma a cada 4 GB cedidos ao WSL; com 16 GB, 4): " INSTANCIAS
[[ "$INSTANCIAS" =~ ^[1-9][0-9]?$ ]] || { echo "Número inválido." >&2; exit 1; }
read -rsp "Token da tela New self-hosted runner (não aparece enquanto digita): " TOKEN
echo
[[ "$TOKEN" =~ ^[A-Za-z0-9]+$ ]] || { echo "Token vazio ou com caractere estranho." >&2; exit 1; }

echo "1/5 Isolando dos arquivos e programas do Windows (vale depois do wsl --shutdown)."
sudo tee /etc/wsl.conf >/dev/null <<'CONF'
[boot]
systemd=true
[automount]
enabled=false
[interop]
enabled=false
appendWindowsPath=false
CONF

echo "2/5 Pacotes e cliente do Postgres 17 (usado pelo workflow esquema-base)."
sudo apt-get update -qq
sudo apt-get install -y -qq git curl jq tar xz-utils ca-certificates lsb-release >/dev/null
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql-client-17 >/dev/null

echo "3/5 Usuário runner, sem sudo e sem senha."
id runner >/dev/null 2>&1 || sudo adduser --disabled-password --gecos "" runner >/dev/null

echo "4/5 Runner mais recente e as bibliotecas de que ele precisa."
URL=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest \
  | jq -r '.assets[] | select(.name | test("^actions-runner-linux-x64-[0-9.]+\\.tar\\.gz$")) | .browser_download_url')
[ -n "$URL" ] || { echo "Não achei a versão mais recente do runner." >&2; exit 1; }
TMP=$(mktemp -d)
curl -fsSL -o "$TMP/runner.tar.gz" "$URL"
chmod 755 "$TMP"
chmod 644 "$TMP/runner.tar.gz"
mkdir "$TMP/deps"
tar xzf "$TMP/runner.tar.gz" -C "$TMP/deps"
sudo "$TMP/deps/bin/installdependencies.sh" >/dev/null

echo "5/5 Registrando $INSTANCIAS instância(s) com o rótulo $ROTULO."
for N in $(seq 1 "$INSTANCIAS"); do
  DIR=/home/runner/actions-runner-$N
  sudo -u runner -H mkdir -p "$DIR"
  sudo -u runner -H tar xzf "$TMP/runner.tar.gz" -C "$DIR"
  sudo -u runner -H bash -c "cd '$DIR' && ./config.sh --url '$REPO_URL' --token '$TOKEN' \
    --name motors-casa-$N --labels '$ROTULO' --work _work --unattended --replace" >/dev/null
  echo "    motors-casa-$N registrada."
done

sudo tee /home/runner/iniciar-runners.sh >/dev/null <<'SH'
#!/usr/bin/env bash
# Sobe todas as instâncias e fica de pé enquanto elas rodam.
for d in /home/runner/actions-runner-*; do
  (cd "$d" && ./run.sh) &
done
wait
SH
sudo chown runner:runner /home/runner/iniciar-runners.sh
sudo chmod 755 /home/runner/iniciar-runners.sh
rm -rf "$TMP"

echo
echo "Pronto. Agora, no PowerShell como administrador: wsl --shutdown"
echo "e depois crie a tarefa que sobe os runners (docs/RUNNER_DO_CI.md, Windows, passo 4)."
