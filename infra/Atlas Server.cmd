@echo off
REM Double-click this to open the Atlas Server window.
REM
REM Deliberately NOT in the Startup folder. This machine is for games and life
REM first; the server runs when you say so and stops when you say so.
REM
REM `start ""` with no console: powershell is launched windowless so the only
REM thing on screen is the control panel itself.
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0atlas-server.ps1"
