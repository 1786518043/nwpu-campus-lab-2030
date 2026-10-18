@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LAB_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%LAB_NODE%" set "LAB_NODE=node"
echo 正在启动 2030 校园实验室，请保留此窗口。
echo 若服务已启动，请直接访问 http://127.0.0.1:5173/
"%LAB_NODE%" "%~dp0node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 5173 --strictPort --open
pause
