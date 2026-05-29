# Deploy JadeCapital v3 en Hostinger VPS

Esta guía asume Ubuntu/Debian en Hostinger VPS y despliegue con Docker.

## 1. Preparar VPS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git ufw

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

## 2. Firewall básico

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

## 3. Clonar proyecto

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/JesMedC/JadeCapitalPro.git
cd JadeCapitalPro/jade_capital_v3
```

## 4. Configurar variables

```bash
cp .env.production.example .env
nano .env
```

Cambia como mínimo:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `APP_ORIGIN`
- `CORS_ORIGINS`

Ejemplo si usarás dominio:

```env
APP_ORIGIN=https://tudominio.com
CORS_ORIGINS=https://tudominio.com
```

Ejemplo temporal si entrarás por IP:

```env
APP_ORIGIN=http://TU_IP_DEL_VPS
CORS_ORIGINS=http://TU_IP_DEL_VPS
```

## 5. Levantar JadeCapital v3

```bash
docker compose up -d --build
```

Ver estado:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f nginx
```

## 6. Verificar desde el VPS

```bash
curl -i http://localhost/health
curl -i http://localhost/api/health
```

Desde navegador abre:

```text
http://TU_IP_DEL_VPS
```

Cuando DNS apunte al VPS:

```text
https://tudominio.com
```

## 7. Actualizar despliegue después de cambios

```bash
cd ~/apps/JadeCapitalPro
git pull
cd jade_capital_v3
docker compose up -d --build
```

## 8. Comandos útiles

```bash
# Ver contenedores
docker compose ps

# Logs de todo
docker compose logs -f

# Reiniciar solo backend
docker compose restart backend

# Bajar todo sin borrar base de datos
docker compose down

# Bajar todo borrando volúmenes/base de datos — cuidado
docker compose down -v
```

## Notas

- PostgreSQL y Redis quedan solo dentro de la red Docker; no se publican al exterior.
- nginx publica el puerto 80.
- HTTPS/443 queda preparado para activarse luego con certificados TLS o con Caddy/Traefik.
