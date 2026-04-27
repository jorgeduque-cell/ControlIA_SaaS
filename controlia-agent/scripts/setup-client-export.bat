@echo off
echo ========================================
echo  CONFIGURACION DE EXPORTACION CLIENTES
echo ========================================
echo.

echo [1/3] Instalando dependencia exceljs...
call npm install exceljs --save

echo.
echo [2/3] Creando directorio de exports...
if not exist "exports" mkdir exports

echo.
echo [3/3] Verificando instalacion...
call npx ts-node src/scripts/test-client-export.ts

echo.
echo ========================================
echo  CONFIGURACION COMPLETADA
echo ========================================
pause
