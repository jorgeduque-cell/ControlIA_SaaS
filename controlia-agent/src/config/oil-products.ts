// Configuración de Productos - Distribuidora Riosol / Oleosoberano
// Actualizado según especificaciones del cliente

export interface OilProduct {
	sku: string;
	marca: "Riosol" | "Oleosoberano";
	nombre: string;
	presentacion: string;
	tipo: "soya_liquido" | "palma_solido" | "palma_hidrogenado";
	capacidad: string; // "900ml", "2L", "15kg", etc.
	unidad: "ml" | "L" | "kg";
	cantidad: number;
}

// PRECIOS: El usuario da PRECIO DE COSTO, sistema agrega 8% automáticamente
// Ejemplo: Costo $122,500 → Venta $132,300

// ==========================================
// ACEITE DE SOYA - MARCA RIOSOL
// ==========================================
export const PRODUCTOS_RIOSOL: OilProduct[] = [
	{
		sku: "RIOSOL-900ML",
		marca: "Riosol",
		nombre: "Aceite de Soya Riosol",
		presentacion: "Botella 900 ml",
		tipo: "soya_liquido",
		capacidad: "900ml",
		unidad: "ml",
		cantidad: 900,
	},
	{
		sku: "RIOSOL-2L",
		marca: "Riosol",
		nombre: "Aceite de Soya Riosol",
		presentacion: "Botella 2 Litros",
		tipo: "soya_liquido",
		capacidad: "2L",
		unidad: "L",
		cantidad: 2,
	},
	{
		sku: "RIOSOL-3L",
		marca: "Riosol",
		nombre: "Aceite de Soya Riosol",
		presentacion: "Botella 3 Litros",
		tipo: "soya_liquido",
		capacidad: "3L",
		unidad: "L",
		cantidad: 3,
	},
	{
		sku: "RIOSOL-5L",
		marca: "Riosol",
		nombre: "Aceite de Soya Riosol",
		presentacion: "Garrafa 5 Litros",
		tipo: "soya_liquido",
		capacidad: "5L",
		unidad: "L",
		cantidad: 5,
	},
	{
		sku: "RIOSOL-18L",
		marca: "Riosol",
		nombre: "Aceite de Soya Riosol",
		presentacion: "Bidón 18 Litros",
		tipo: "soya_liquido",
		capacidad: "18L",
		unidad: "L",
		cantidad: 18,
	},
	{
		sku: "RIOSOL-20L",
		marca: "Riosol",
		nombre: "Aceite de Soya Riosol",
		presentacion: "Bidón 20 Litros",
		tipo: "soya_liquido",
		capacidad: "20L",
		unidad: "L",
		cantidad: 20,
	},
];

// ==========================================
// ACEITE DE PALMA - MARCA OLEOSOBERANO
// SÓLIDO (NO LÍQUIDO) - 15KG
// ==========================================
export const PRODUCTOS_OLEOSOBERANO: OilProduct[] = [
	{
		sku: "OLEOSOB-PALMA-15KG",
		marca: "Oleosoberano",
		nombre: "Aceite de Palma Oleosoberano",
		presentacion: "Bloque 15 Kg",
		tipo: "palma_solido",
		capacidad: "15kg",
		unidad: "kg",
		cantidad: 15,
	},
	{
		sku: "OLEOSOB-HIDRO-15KG",
		marca: "Oleosoberano",
		nombre: "Aceite Hidrogenado Oleosoberano",
		presentacion: "Bloque 15 Kg",
		tipo: "palma_hidrogenado",
		capacidad: "15kg",
		unidad: "kg",
		cantidad: 15,
	},
];

// Todos los productos
export const TODOS_LOS_PRODUCTOS = [
	...PRODUCTOS_RIOSOL,
	...PRODUCTOS_OLEOSOBERANO,
];

// ==========================================
// SISTEMA DE PRECIOS
// ==========================================

export interface PrecioProducto {
	sku: string;
	precioCosto: number;
	margenPorcentaje: number; // Default 8%
	precioVenta: number;
	fechaActualizacion: Date;
	notas?: string;
}

// Margen por defecto: 8%
export const MARGEN_DEFAULT = 0.08;

// Calcular precio de venta con margen
export function calcularPrecioVenta(
	precioCosto: number,
	margen: number = MARGEN_DEFAULT,
): number {
	return Math.round(precioCosto * (1 + margen));
}

// Formatear precio en pesos colombianos
export function formatearPrecio(precio: number): string {
	return new Intl.NumberFormat("es-CO", {
		style: "currency",
		currency: "COP",
		minimumFractionDigits: 0,
	}).format(precio);
}

// ==========================================
// TERMINOS Y CONDICIONES DE COTIZACIÓN
// ==========================================
export const TERMINOS_CONDICIONES = `
TÉRMINOS Y CONDICIONES DE VENTA

1. PRECIOS: Los precios están sujetos a cambio según fluctuación del mercado internacional del aceite.

2. VALIDEZ: Esta cotización tiene una validez de 3 días hábiles a partir de la fecha de emisión.

3. PAGO: Se aceptan pagos en efectivo, transferencia bancaria o consignación.

4. DOMICILIOS: El costo de transporte corre por cuenta del cliente, salvo acuerdo especial.

5. ENTREGA: El tiempo de entrega es de 24-48 horas hábiles después de confirmado el pedido y pago.

6. DEVOLUCIONES: No se aceptan devoluciones de productos una vez entregados, salvo defecto de fábrica.

7. PEDIDO MÍNIMO: $500.000 para domicilios gratuitos en zona urbana.

8. DESCUENTOS: Consulte por descuentos por volumen en compras mayores a 10 unidades por referencia.

Gracias por preferirnos.
`;

// ==========================================
// DATOS DE LA EMPRESA (Personalizar con tu info)
// ==========================================
export const EMPRESA_INFO = {
	nombre: "Distribuidora de Aceites", // Cambiar por tu nombre real
	nit: "", // Tu NIT
	direccion: "", // Tu dirección
	telefono: "", // Tu teléfono
	email: "", // Tu email
	whatsapp: "", // Tu WhatsApp
	logo: "", // URL o base64 del logo
};

// ==========================================
// HISTORIAL DE PRECIOS
// ==========================================
export interface HistorialPrecio {
	sku: string;
	precioCosto: number;
	precioVenta: number;
	fecha: Date;
	variacionPorcentaje?: number; // vs precio anterior
}

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

// Buscar producto por SKU
export function buscarProductoPorSKU(sku: string): OilProduct | undefined {
	return TODOS_LOS_PRODUCTOS.find(
		(p) => p.sku.toLowerCase() === sku.toLowerCase(),
	);
}

// Buscar productos por marca
export function buscarProductosPorMarca(
	marca: "Riosol" | "Oleosoberano",
): OilProduct[] {
	return TODOS_LOS_PRODUCTOS.filter((p) => p.marca === marca);
}

// Buscar productos por tipo
export function buscarProductosPorTipo(
	tipo: "soya_liquido" | "palma_solido" | "palma_hidrogenado",
): OilProduct[] {
	return TODOS_LOS_PRODUCTOS.filter((p) => p.tipo === tipo);
}

// Obtener nombre completo del producto
export function getNombreCompleto(producto: OilProduct): string {
	return `${producto.nombre} ${producto.presentacion}`;
}

// ==========================================
// DATOS CURIOSOS SOBRE ACEITE (Para Marketing)
// ==========================================
export const DATOS_CURIOSOS = [
	"El aceite de soya Riosol es 100% vegetal y libre de colesterol.",
	"La palma Oleosoberano es ideal para repostería por su textura sólida estable.",
	"Un litro de aceite de soya equivale aproximadamente a 2.5 kg de semilla de soya.",
	"El aceite hidrogenado Oleosoberano tiene mayor vida útil que el líquido.",
	"La palma de aceite es el cultivo oleaginoso más productivo del mundo.",
	"El aceite de soya contiene omega-3, 6 y 9 beneficiosos para la salud cardiovascular.",
	"Riosol mantiene la calidad del aceite gracias a procesos de refinación modernos.",
	"El bloque de 15kg de palma equivale a aproximadamente 16.5 litros.",
	"El aceite de palma es ideal para freír por su alta resistencia a la oxidación.",
	"Riosol y Oleosoberano son marcas colombianas de alta calidad.",
];

// Obtener dato curioso aleatorio
export function getDatoCurioso(): string {
	return DATOS_CURIOSOS[Math.floor(Math.random() * DATOS_CURIOSOS.length)];
}

// ==========================================
// RECETAS Y USOS
// ==========================================
export const USOS_RECOMENDADOS = {
	riosol: [
		"Freír carnes y verduras",
		"Cocinar arroz y pastas",
		"Preparar aderezos y vinagretas",
		"Hornear tortas y panes",
	],
	oleosoberano_palma: [
		"Repostería (tortas, galletas, ponqués)",
		"Chocolatería",
		"Elaboración de margarinas",
		"Fritura industrial",
	],
	oleosoberano_hidrogenado: [
		"Alta temperatura (freír papas, empanadas)",
		"Panadería industrial",
		"Elaboración de snacks",
		"Cocción prolongada",
	],
};

// ==========================================
// TIPS DE ALMACENAMIENTO
// ==========================================
export const TIPS_ALMACENAMIENTO = [
	"Aceite Riosol líquido: Almacenar en lugar fresco, seco y alejado de la luz solar directa.",
	"Palma Oleosoberano sólida: Mantener en temperatura ambiente. Se derrite aproximadamente a 35°C.",
	"Una vez abierto, consumir el aceite Riosol en máximo 3 meses para mantener frescura.",
	"Los bloques de palma pueden refrigerarse para mayor durabilidad.",
	"Evitar exponer el aceite a temperaturas extremas para preservar sus propiedades.",
	"Cerrar bien el envase después de cada uso para evitar oxidación.",
];
