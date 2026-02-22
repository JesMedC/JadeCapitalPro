#!/bin/bash

# --- JADE CAPITAL PRO | SCRIPT DE DESPLIEGUE ---

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Virtualenv usado para el backend.
# Por defecto se espera en: jade_capital_pro/backend/.venv
# Puedes sobreescribirlo exportando VENV_PATH antes de ejecutar el script.
VENV_PATH="${VENV_PATH:-"$BASE_DIR/backend/.venv"}"

echo "🚀 Iniciando despliegue de JADE CAPITAL PRO..."

# 1. Limpiar procesos anteriores
echo "🧹 Limpiando procesos en puertos 8080 y 3000..."
fuser -k 8080/tcp 2>/dev/null
fuser -k 3000/tcp 2>/dev/null

# 2. Iniciar Backend (FastAPI + Gunicorn)
echo "⚙️ Iniciando Backend (Gunicorn + Uvicorn)..."
cd $BASE_DIR/backend

if [ ! -f "$VENV_PATH/bin/activate" ]; then
    echo "❌ No se encontro el virtualenv en: $VENV_PATH"
    echo "   Crea uno en jade_capital_pro/backend/.venv o exporta VENV_PATH=/ruta/al/venv"
    exit 1
fi

source "$VENV_PATH/bin/activate"
# Ejecutar en segundo plano con Gunicorn para producción
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8080 --daemon --log-level info --access-logfile deploy_api.log

if [ $? -eq 0 ]; then
    echo "✅ Backend activo en http://localhost:8080"
else
    echo "❌ Error al iniciar el Backend"
    exit 1
fi

# 3. Iniciar Frontend (Next.js Production)
echo "🎨 Iniciando Frontend (Next.js Start)..."
cd $BASE_DIR/frontend
# Ejecutar en segundo plano con nohup para que no se cierre la terminal
nohup npm run start > deploy_front.log 2>&1 &

echo "✅ Frontend activo en http://localhost:3000"

echo "------------------------------------------------"
echo "🎉 ¡JADE CAPITAL PRO ESTÁ DESPLEGADO!"
echo "Backend: http://localhost:8080"
echo "Frontend: http://localhost:3000"
echo "------------------------------------------------"
echo "Logs del Backend: $BASE_DIR/backend/deploy_api.log"
echo "Logs del Frontend: $BASE_DIR/frontend/deploy_front.log"
echo "------------------------------------------------"
