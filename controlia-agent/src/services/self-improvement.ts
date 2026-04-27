/**
 * Sistema de Auto-Aprendizaje para ControlIA
 *
 * Este sistema permite al agente:
 * 1. Detectar cuando no puede hacer una tarea
 * 2. Investigar cómo hacerla en internet
 * 3. Generar el código necesario
 * 4. Integrarlo al sistema automáticamente
 * 5. Aprender de la experiencia
 */

import fs from "fs";
import path from "path";
import { generateText } from "ai";
import { getAIModel } from "../config/ai-provider.js";
import { prisma } from "../db/client.js";

export interface LearningTask {
	id: string;
	userRequest: string;
	detectedGap: string;
	researchQuery: string;
	solutionGenerated: boolean;
	codeLocation?: string;
	tested: boolean;
	active: boolean;
	createdAt: Date;
}

/**
 * Inventario de capacidades existentes del sistema.
 * El LLM usa esto para determinar si una solicitud ya está cubierta.
 */
const EXISTING_CAPABILITIES = `
CAPACIDADES EXISTENTES EN EL SISTEMA (NO necesitan implementarse):
- CRM: buscar clientes, crear cliente, listar clientes, agregar notas, historial
- Pedidos/Ventas: crear pedido, modificar estado, listar pendientes, historial
- Inventario: ver stock, actualizar cantidades, alertas de bajo stock
- Finanzas: estado de resultados, flujo de caja, cuentas por cobrar, cotizaciones
- Documentos: generar PDF (cotizaciones, facturas), generar Excel (inventario, clientes)
- Comunicación: mensajes Telegram, correos electrónicos (SMTP/nodemailer), transcripción de voz (Whisper), envío de mensajes de voz (TTS), análisis de imágenes (Vision)
- Memoria: guardar notas de clientes, búsqueda semántica, contexto de conversaciones
- Pronósticos: forecast de demanda 30 días, análisis de cartera vencida
- Notificaciones: alertas de clientes morosos, alertas de stock bajo
- Auto-curación: instalar módulos npm, detectar errores, reiniciar servidor
- Contenido: generar posts para redes sociales sobre aceite
- Búsqueda web: investigar precios de aceite, información de mercado
- CLI local: commandExecutor puede ejecutar comandos shell en el servidor donde corre el bot
`.trim();

/**
 * Analiza una solicitud usando LLM para detectar si requiere una capacidad nueva.
 * Estrategia en capas:
 *   1. Regex rápido: patrones de operaciones CRUD existentes → retorno inmediato sin API call
 *   2. Verificación en archivos + DB
 *   3. LLM (Gemini Flash) para análisis semántico con contexto del sistema
 */
export async function analyzeCapabilityGap(userRequest: string): Promise<{
	hasGap: boolean;
	gapDescription: string;
	suggestedSolution: string;
	researchQuery: string;
}> {
	const lower = userRequest.toLowerCase().trim();

	// ── Capa 1: Regex rápido para operaciones CRUD existentes (sin API call) ──
	const existingPatterns = [
		/^(busca|lista|muestra|dame|cu[aá]l|cu[aá]nto|ver|consulta|dime)/,
		/^(crea|agrega|actualiza|elimina|registra|anota).*(cliente|pedido|producto|venta|factura|inventario)/,
		/^(estado|reporte|resumen|total|balance).*(cuenta|inventario|cliente|caja|ventas)/,
		/^(genera|hacer|crear).*(cotizaci[oó]n|factura|pdf|excel)/,
		/^(env[ií]a?|manda?).*(mensaje|notificaci[oó]n|correo|email).*(telegram|email|smtp|correo)/,
		/^(env[ií]a?|manda?).*(correo|email)/,
		/^(transcrib|escuchar|audio|voz)/,
	];

	if (existingPatterns.some((p) => p.test(lower))) {
		return {
			hasGap: false,
			gapDescription: "",
			suggestedSolution: "",
			researchQuery: "",
		};
	}

	// ── Capa 2: Diccionario de gaps conocidos (sin API call — respuesta inmediata) ──
	const knownGaps: Record<
		string,
		{ description: string; solution: string; query: string }
	> = {
		qr: {
			description: "Lectura de códigos QR",
			solution: "Usar librería qrcode/jsQR",
			query: "nodejs qrcode jsqr typescript",
		},
		"codigo qr": {
			description: "Lectura de códigos QR",
			solution: "Usar librería qrcode/jsQR",
			query: "nodejs qrcode jsqr typescript",
		},
		barcode: {
			description: "Lectura de códigos de barras",
			solution: "Usar zxing o quagga2",
			query: "nodejs barcode scanner typescript",
		},
		sms: {
			description: "Envío de mensajes SMS",
			solution: "Usar Twilio o AWS SNS",
			query: "nodejs twilio sms typescript",
		},
		whatsapp: {
			description: "Integración con WhatsApp Business",
			solution: "Usar WhatsApp Business API",
			query: "nodejs whatsapp business api typescript",
		},
		"machine learning": {
			description: "Predicción con ML",
			solution: "Usar TensorFlow.js o brain.js",
			query: "nodejs machine learning tensorflow typescript",
		},
		prediccion: {
			description: "Predicción de ventas con ML",
			solution: "Usar regresión lineal o ML",
			query: "nodejs sales prediction machine learning typescript",
		},
		"ml ": {
			description: "Machine Learning",
			solution: "Usar TensorFlow.js",
			query: "nodejs tensorflow machine learning",
		},
		ocr: {
			description: "Reconocimiento óptico de caracteres",
			solution: "Usar tesseract.js",
			query: "nodejs tesseract ocr typescript",
		},
		maps: {
			description: "Integración con mapas",
			solution: "Usar Google Maps API",
			query: "nodejs google maps api typescript",
		},
		stripe: {
			description: "Pagos con Stripe",
			solution: "Usar Stripe SDK",
			query: "nodejs stripe payment typescript",
		},
		paypal: {
			description: "Pagos con PayPal",
			solution: "Usar PayPal SDK",
			query: "nodejs paypal payment typescript",
		},
		"push notification": {
			description: "Notificaciones push",
			solution: "Usar Firebase FCM",
			query: "nodejs firebase push notification typescript",
		},
		grafic: {
			description: "Visualización de gráficas",
			solution: "Generar charts con chart.js",
			query: "nodejs chartjs generate chart typescript",
		},
		"excel avanzado": {
			description: "Manipulación avanzada de Excel",
			solution: "Usar exceljs",
			query: "nodejs exceljs advanced typescript",
		},
		blockchain: {
			description: "Integración con blockchain",
			solution: "Usar web3.js o ethers.js",
			query: "nodejs blockchain web3 typescript",
		},
		socket: {
			description: "WebSockets en tiempo real",
			solution: "Usar Socket.IO",
			query: "nodejs socketio typescript",
		},
		redis: {
			description: "Cache con Redis",
			solution: "Usar ioredis",
			query: "nodejs ioredis cache typescript",
		},
	};

	for (const [keyword, gap] of Object.entries(knownGaps)) {
		if (lower.includes(keyword)) {
			const existsInFiles = await checkIfCapabilityExists(keyword.trim());
			if (!existsInFiles) {
				return {
					hasGap: true,
					gapDescription: `El sistema no tiene capacidad de ${gap.description}`,
					suggestedSolution: gap.solution,
					researchQuery: gap.query,
				};
			}
		}
	}

	// ── Capa 3: Análisis semántico con LLM (Gemini Flash — para casos ambiguos) ──
	try {
		const { text } = await generateText({
			model: getAIModel("fast"), // Gemini Flash: $0.30/1M → costo despreciable
			system:
				`Eres el detector de capacidades de ControlIA.\n` +
				`Determina si la solicitud del usuario requiere implementar algo NUEVO o ya está cubierto.\n\n` +
				EXISTING_CAPABILITIES,
			prompt:
				`Solicitud: "${userRequest}"\n\n` +
				`Responde SOLO con este JSON (sin markdown):\n` +
				`{\n` +
				`  "hasGap": true/false,\n` +
				`  "gapDescription": "descripción concisa de la capacidad faltante (si hasGap=true)",\n` +
				`  "suggestedSolution": "cómo implementarlo en Node.js/TypeScript",\n` +
				`  "researchQuery": "query para buscar en npm/docs (en inglés)",\n` +
				`  "confidence": "high/medium/low"\n` +
				`}`,
			maxOutputTokens: 300,
			temperature: 0.1,
		});

		const jsonMatch = text.match(/\{[\s\S]+\}/);
		if (!jsonMatch) throw new Error("No JSON");

		const result = JSON.parse(jsonMatch[0]) as {
			hasGap: boolean;
			gapDescription: string;
			suggestedSolution: string;
			researchQuery: string;
			confidence: string;
		};

		// Si la confianza es baja, ser conservador y no implementar
		if (result.confidence === "low") {
			return {
				hasGap: false,
				gapDescription: "",
				suggestedSolution: "",
				researchQuery: "",
			};
		}

		return {
			hasGap: result.hasGap ?? false,
			gapDescription: result.gapDescription || "",
			suggestedSolution: result.suggestedSolution || "",
			researchQuery:
				result.researchQuery || `nodejs ${lower} typescript implementation`,
		};
	} catch (err) {
		console.warn(
			"[SelfImprovement] LLM gap detection falló, usando fallback conservador:",
			err,
		);
		// Fallback: si el LLM falla, no implementar nada (evitar código basura)
		return {
			hasGap: false,
			gapDescription: "",
			suggestedSolution: "",
			researchQuery: "",
		};
	}
}

/**
 * Verifica si una capacidad ya existe en el sistema
 */
async function checkIfCapabilityExists(keyword: string): Promise<boolean> {
	// Verificar en archivos existentes
	const toolsDir = path.join(process.cwd(), "src", "tools");

	if (!fs.existsSync(toolsDir)) {
		return false;
	}

	// Buscar archivos que puedan contener esta funcionalidad
	const files = fs.readdirSync(toolsDir, { recursive: true }) as string[];

	for (const file of files) {
		if (file.endsWith(".ts")) {
			const content = fs.readFileSync(path.join(toolsDir, file), "utf-8");
			if (content.toLowerCase().includes(keyword.toLowerCase())) {
				return true;
			}
		}
	}

	// Verificar en base de datos de capacidades aprendidas
	try {
		const learnedCapability = await prisma.context_memory?.findFirst?.({
			where: {
				tipo: "learned_capability",
				contenido: { contains: keyword },
			},
		});

		return !!learnedCapability;
	} catch {
		return false;
	}
}

/**
 * Guarda una nueva capacidad aprendida en la base de datos.
 * Si no se provee vendedorId, busca el primer vendedor disponible en DB.
 * Si no hay ninguno, lo guarda como capacidad del sistema (sin vendedor).
 */
export async function saveLearnedCapability(
	userRequest: string,
	capabilityName: string,
	codeLocation: string,
	implementationDetails: string,
	vendedorId?: bigint,
): Promise<void> {
	try {
		// Resolver vendedor_id dinámicamente si no se provee
		let resolvedVendedorId = vendedorId;

		if (!resolvedVendedorId) {
			// Buscar el primer vendedor disponible en DB
			const firstVendedor = await (prisma as any).vendedores?.findFirst?.({
				select: { id: true },
				orderBy: { id: "asc" },
			});
			if (firstVendedor?.id) {
				resolvedVendedorId = BigInt(firstVendedor.id);
			}
		}

		if (!resolvedVendedorId) {
			// Sin vendedor disponible — guardar como capacidad del sistema usando $executeRaw
			await prisma.$executeRaw`
        INSERT INTO context_memory (vendedor_id, tipo, contenido, metadata, created_at)
        VALUES (
          (SELECT id FROM vendedores ORDER BY id ASC LIMIT 1),
          'system_capability',
          ${`Capacidad aprendida: ${capabilityName}\nSolicitud: ${userRequest}\nImplementación: ${implementationDetails}\nArchivo: ${codeLocation}`},
          ${JSON.stringify({ capabilityName, codeLocation, userRequest, learnedAt: new Date().toISOString() })}::jsonb,
          NOW()
        )
        ON CONFLICT DO NOTHING
      `;
			console.log(
				`[SelfImprovement] Capacidad guardada como system_capability: ${capabilityName}`,
			);
			return;
		}

		// Guardar con vendedor_id resuelto
		await prisma.context_memory?.create?.({
			data: {
				vendedor_id: resolvedVendedorId,
				tipo: "learned_capability",
				contenido: `Capacidad aprendida: ${capabilityName}\nSolicitud original: ${userRequest}\nImplementación: ${implementationDetails}\nArchivo: ${codeLocation}`,
				metadata: {
					capabilityName,
					codeLocation,
					userRequest,
					learnedAt: new Date().toISOString(),
				},
			},
		});
		console.log(
			`[SelfImprovement] Capacidad guardada para vendedor ${resolvedVendedorId}: ${capabilityName}`,
		);
	} catch (error) {
		console.error("[SelfImprovement] Error saving capability:", error);
	}
}

/**
 * Genera el plan de implementación para una nueva capacidad
 */
export function generateImplementationPlan(
	gapDescription: string,
	researchResults: any,
): {
	steps: string[];
	filesToCreate: { name: string; description: string }[];
	dependencies: string[];
	estimatedTime: string;
} {
	return {
		steps: [
			`1. Investigar librerías para: ${gapDescription}`,
			`2. Diseñar estructura del código`,
			`3. Implementar funcionalidad base`,
			`4. Integrar con sistema existente`,
			`5. Probar funcionalidad`,
			`6. Documentar uso`,
		],
		filesToCreate: [
			{
				name: "src/tools/new-capability/index.ts",
				description: "Tool principal",
			},
			{
				name: "src/services/new-service.ts",
				description: "Servicio auxiliar si es necesario",
			},
		],
		dependencies: researchResults.libraries || [],
		estimatedTime: "5-10 minutos",
	};
}

/**
 * Lista las capacidades que el sistema ha aprendido
 */
export async function listLearnedCapabilities(): Promise<string[]> {
	try {
		const capabilities = await prisma.context_memory?.findMany?.({
			where: { tipo: "learned_capability" },
			orderBy: { created_at: "desc" },
		});

		return capabilities?.map((cap: any) => cap.contenido) || [];
	} catch {
		return [];
	}
}
