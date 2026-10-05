@echo off
rem ============================================================
rem  Menjalankan LMS SMKS Nurul Jadid (mode pengembangan).
rem  Klik dua kali file ini, atau jalankan: start-app.bat
rem  Saat pertama kali, script ini juga menyiapkan venv, paket,
rem  file .env, dan database secara otomatis.
rem ============================================================
setlocal
cd /d "%~dp0"

where python >nul 2>nul || (echo [GAGAL] Python belum terpasang. Pasang Python 3.12+ dulu. & pause & exit /b 1)
where npm >nul 2>nul || (echo [GAGAL] Node.js belum terpasang. Pasang Node.js 22+ dulu. & pause & exit /b 1)

rem ---------- Backend ----------
echo [1/4] Menyiapkan backend...
if not exist "backend\.venv\Scripts\python.exe" (
    echo       Membuat virtual environment...
    python -m venv backend\.venv || (echo [GAGAL] venv tidak bisa dibuat. & pause & exit /b 1)
    "backend\.venv\Scripts\python.exe" -m pip install -r backend\requirements.txt -r backend\requirements-dev.txt || (echo [GAGAL] Instal paket Python gagal. & pause & exit /b 1)
)
if not exist "backend\.env" copy "backend\.env.example" "backend\.env" >nul

rem Migrasi selalu dijalankan: cepat dan aman jika tidak ada perubahan.
echo [2/4] Memperbarui database...
pushd backend
".venv\Scripts\python.exe" manage.py migrate --noinput || (popd & echo [GAGAL] Migrasi database gagal. & pause & exit /b 1)
popd

rem ---------- Frontend ----------
echo [3/4] Menyiapkan frontend...
if not exist "frontend\.env" copy "frontend\.env.example" "frontend\.env" >nul
if not exist "frontend\node_modules" (
    echo       Menginstal paket npm, mohon tunggu...
    pushd frontend
    call npm install || (popd & echo [GAGAL] npm install gagal. & pause & exit /b 1)
    popd
)

rem ---------- Jalankan ----------
echo [4/4] Menjalankan server...
start "LMS Backend (8000)" /d "%~dp0backend" cmd /k ".venv\Scripts\python.exe manage.py runserver"
start "LMS Frontend (5173)" /d "%~dp0frontend" cmd /k "npm run dev"

rem Beri waktu server menyala sebelum membuka browser.
timeout /t 5 /nobreak >nul
start "" http://localhost:5173

echo.
echo Aplikasi berjalan:
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:8000/api/
echo Tutup jendela "LMS Backend" dan "LMS Frontend" untuk menghentikan server.
echo Data contoh (opsional): backend\.venv\Scripts\python.exe backend\manage.py seed_demo
echo.
pause
