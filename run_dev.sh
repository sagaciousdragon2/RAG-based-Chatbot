#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"

pkill -f ngrok 2>/dev/null
cd "$ROOT/backend" && python main.py &
cd "$ROOT/frontend" && npm run dev &
ngrok http --domain=pterodactyloid-belkis-potted.ngrok-free.dev 8000
