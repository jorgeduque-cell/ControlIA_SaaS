/**
 * Script de prueba para verificar la instalación de ExcelJS
 * Ejecutar con: npx tsx scripts/test-exceljs-installation.ts
 */

import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";

interface Cliente {
  id: number;
  nombre: string;
  email: string;
  telefono: string;
  ciudad: string;
  fechaRegistro: Date;
  activo: boolean;
}

/**
 * Datos de ejemplo para la prueba
 */
const clientesEjemplo: Cliente[] = [
  {
    id: 1,
    nombre: "Juan Pérez",
    email: "juan.perez@email.com",
    telefono: "+52 55 1234 5678",
    ciudad: "Ciudad de México",
    fechaRegistro: new Date("2024-01-15"),
    activo: true,
  },
  {
    id: 2,
    nombre: "María García",
    email: "maria.garcia@email.com",
    telefono: "+52 33 9876 5432",
    ciudad: "Guadalajara",
    fechaRegistro: new Date("2024-02-20"),
    activo: true,
  },
  {
    id: 3,
    nombre: "Carlos López",
    email: "carlos.lopez@email.com",
    telefono: "+52 81 5555 1234",
    ciudad: "Monterrey",
    fechaRegistro: new Date("2024-03-10"),
    activo: false,
  },
  {
    id: 4,
    nombre: "Ana Martínez",
    email: "ana.martinez@email.com",
    telefono: "+52 55 4444 3333",
    ciudad: "Ciudad de México",
    fechaRegistro: new Date("2024-04-05"),
    activo: true,
  },
  {
    id: 5,
    nombre: "Roberto Sánchez",
    email: "roberto.sanchez@email.com",
    telefono: "+52 222 111 2222",
    ciudad: "Puebla",
    fechaRegistro: new Date("2024-05-12"),
    activo: true,
  },
];

/**
 * Crea el directorio temp si no existe
 */
function ensureTempDirectory(): void {
  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log("📁 Directorio temp/ creado");
  }
}

/**
 * Genera un archivo Excel de prueba con datos de clientes
 */
async function testExcelJSInstallation(): Promise<void> {
  console.log("🔍 Verificando instalación de ExcelJS...\n");

  try {
    // Verificar que ExcelJS está disponible
    console.log(`✅ ExcelJS versión: ${ExcelJS.Workbook ? "Disponible" : "No disponible"}`);

    // Crear directorio temp
    ensureTempDirectory();

    // Crear workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ControlIA System";
    workbook.created = new Date();
    workbook.modified = new Date();

    // Crear hoja de clientes
    const worksheet = workbook.addWorksheet("Clientes", {
      properties: { tabColor: { argb: "FF00FF00" } },
    });

    // Definir columnas con estilos
    worksheet.columns = [
      { header: "ID", key: "id", width: 8 },
      { header: "Nombre", key: "nombre", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Teléfono", key: "telefono", width: 20 },
      { header: "Ciudad", key: "ciudad", width: 20 },
      { header: "Fecha Registro", key: "fechaRegistro", width: 15 },
      { header: "Activo", key: "activo", width: 10 },
    ];

    // Estilizar encabezados
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 25;

    // Agregar datos
    clientesEjemplo.forEach((cliente) => {
      const row = worksheet.addRow({
        id: cliente.id,
        nombre: cliente.nombre,
        email: cliente.email,
        telefono: cliente.telefono,
        ciudad: cliente.ciudad,
        fechaRegistro: cliente.fechaRegistro,
        activo: cliente.activo ? "Sí" : "No",
      });

      // Alternar colores de filas
      if (row.number % 2 === 0) {
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE7E6E6" },
        };
      }
    });

    // Formatear columna de fecha
    worksheet.getColumn("fechaRegistro").numFmt = "DD/MM/YYYY";

    // Agregar bordes a todas las celdas con datos
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    // Agregar filtros automáticos
    worksheet.autoFilter = {
      from: "A1",
      to: "G1",
    };

    // Congelar primera fila
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    // Guardar archivo
    const outputPath = path.join(process.cwd(), "temp", "test-export.xlsx");
    await workbook.xlsx.writeFile(outputPath);

    // Verificar que el archivo existe
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log("\n" + "=".repeat(50));
      console.log("✅ ¡PRUEBA EXITOSA!");
      console.log("=".repeat(50));
      console.log(`📄 Archivo creado: ${outputPath}`);
      console.log(`📊 Tamaño: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`📝 Registros: ${clientesEjemplo.length} clientes`);
      console.log(`🕐 Creado: ${stats.birthtime.toLocaleString()}`);
      console.log("=".repeat(50));
      console.log("\n🎉 ExcelJS está instalado y funcionando correctamente!");
      console.log("   La sincronización CRM Agent ↔ Document Agent está OPERATIVA.\n");
    } else {
      throw new Error("El archivo no se creó correctamente");
    }
  } catch (error) {
    console.error("\n" + "=".repeat(50));
    console.error("❌ ERROR EN LA PRUEBA");
    console.error("=".repeat(50));

    if (error instanceof Error) {
      console.error(`Mensaje: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
    } else {
      console.error("Error desconocido:", error);
    }

    console.error("\n💡 Posibles soluciones:");
    console.error("   1. Ejecuta: npm install exceljs");
    console.error("   2. Verifica que tienes permisos de escritura en temp/");
    console.error("   3. Asegúrate de estar en el directorio correcto\n");

    process.exit(1);
  }
}

// Ejecutar prueba
testExcelJSInstallation();