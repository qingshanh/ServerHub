@echo off
chcp 65001 >nul
title ServerHub - 我的服务器项目聚合
cd /d "%~dp0"

echo ========================================================
echo   🚀 ServerHub (多服务器项目聚合平台) 正在启动...
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js 环境，请先安装 Node.js (建议 18 及以上版本)。
    echo 官方下载: https://nodejs.org/
    pause
    exit /b
)

:: 启动 1 秒后自动在默认浏览器中打开页面
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:3000"

:: 运行主服务
node server.js
pause
