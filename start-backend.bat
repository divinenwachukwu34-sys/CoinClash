@echo off
title CoinClash - Backend Server
echo.
echo  ==========================================
echo   CoinClash Backend Starting...
echo  ==========================================
echo.
cd /d "C:\Users\DIVINE BOI\Desktop\My project\coinclash\coinclash-backend"
call .\venv\Scripts\activate
echo  [OK] Virtual environment activated
echo  [OK] Starting FastAPI on http://localhost:8000
echo.
uvicorn main:app --host 0.0.0.0 --port 8000
pause
