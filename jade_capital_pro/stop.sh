#!/bin/bash

echo "🛑 Deteniendo sistema JADE CAPITAL PRO..."

# Detener procesos por puerto
fuser -k 8080/tcp 2>/dev/null
fuser -k 3000/tcp 2>/dev/null

# Detener gunicorn específicamente si queda alguno
pkill gunicorn

echo "✅ Sistema detenido con éxito."
