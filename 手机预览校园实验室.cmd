@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LAB_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%LAB_NODE%" set "LAB_NODE=node"
echo 正在生成并启动手机预览，请保留此窗口。
"%LAB_NODE%" "%~dp0scripts\preview-phone.mjs"
pause
