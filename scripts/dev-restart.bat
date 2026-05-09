@echo off
REM Dev-server start/restart helper (cmd shim — calls the PowerShell version).
REM Usage:  C:\dev\repos\acc-website\scripts\dev-restart.bat

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-restart.ps1"
