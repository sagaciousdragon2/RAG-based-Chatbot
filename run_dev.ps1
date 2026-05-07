$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

Stop-Process -Name "ngrok" -ErrorAction SilentlyContinue
Start-Process powershell -WorkingDirectory "$root\backend" -ArgumentList "-NoExit", "-Command", "python main.py"
Start-Process powershell -WorkingDirectory "$root\frontend" -ArgumentList "-NoExit", "-Command", "npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http --domain=pterodactyloid-belkis-potted.ngrok-free.dev 8000"
