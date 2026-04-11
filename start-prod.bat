@echo off
setlocal

cd /d "%~dp0"

start "Music Theory Prod Server" cmd /k "cd /d %~dp0 && npm start"

for /l %%i in (1,1,20) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000 -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
  if not errorlevel 1 (
    start "" http://127.0.0.1:3000
    goto :done
  )
  timeout /t 1 /nobreak >nul
)

echo Server did not become ready in time.

:done
endlocal
