@echo off
rem One-command launcher for IMBERE DATA on Windows: starts the API and the web app.
rem Double-click this file, or run `run` from a terminal in this folder.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
