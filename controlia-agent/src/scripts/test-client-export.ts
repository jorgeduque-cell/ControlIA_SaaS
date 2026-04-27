/**
 * 🧪 SCRIPT DE PRUEBA: Exportación de Clientes
 *
 * Ejecutar con: npx ts-node src/scripts/test-client-export.ts
 *
 * Verifica que:
 * 1. El servicio de clientes carga los datos correctamente
 * 2. La exportación a Excel funciona
 * 3. Los 2 clientes (Dumbo Salsa y Empanadas de Millos) están disponibles
 */

import {
	exportClientsToExcel,
	getExportableClientCount,
} from "../adapters/document-client-adapter";
import { clientDataService } from "../services/client-data-service";

async function runTest() {
	console.log("🧪 INICIANDO PRUEBA DE EXPORTACIÓN DE CLIENTES\n");
	console.log("=".repeat(50));

	try {
		// Test 1: Verificar servicio de clientes
		console.log("\n📋 Test 1: Verificando servicio de clientes...");
		const allClients = await clientDataService.getAllClients();
		console.log(`   ✅ Clientes encontrados: ${allClients.length}`);

		allClients.forEach((client, i) => {
			console.log(`   ${i + 1}. ${client.name} (${client.email})`);
		});

		// Test 2: Verificar conteo para exportación
		console.log("\n📊 Test 2: Verificando conteo exportable...");
		const count = await getExportableClientCount();
		console.log(`   ✅ Clientes exportables: ${count}`);

		// Test 3: Ejecutar exportación
		console.log("\n📄 Test 3: Ejecutando exportación a Excel...");
		const result = await exportClientsToExcel();

		if (result.success) {
			console.log(`   ✅ ${result.message}`);
			console.log(`   📁 Archivo: ${result.filePath}`);
		} else {
			console.log(`   ❌ ${result.message}`);
		}

		// Resumen
		console.log("\n" + "=".repeat(50));
		console.log("📊 RESUMEN DE PRUEBA:");
		console.log(`   • Clientes en sistema: ${allClients.length}`);
		console.log(
			`   • Exportación: ${result.success ? "✅ EXITOSA" : "❌ FALLIDA"}`,
		);
		console.log(`   • Clientes exportados: ${result.clientCount}`);

		if (result.success && result.clientCount === 2) {
			console.log("\n🎉 ¡PRUEBA COMPLETADA EXITOSAMENTE!");
			console.log("   El problema de sincronización ha sido CORREGIDO.");
		}
	} catch (error: any) {
		console.error("\n❌ ERROR EN PRUEBA:", error.message);
		console.error(error.stack);
	}
}

// Ejecutar
runTest();
