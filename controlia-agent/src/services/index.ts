/**
 * 📦 ÍNDICE DE SERVICIOS CENTRALIZADOS
 *
 * Exporta todos los servicios compartidos del sistema ControlIA.
 * Usar este índice para importaciones limpias.
 */

// Servicio de datos de clientes (fuente única de verdad)
export {
	clientDataService,
	ClientDataService,
	type Client,
	type ClientExportData,
} from "./client-data-service";

// Agregar más servicios aquí conforme se creen:
// export { productDataService } from './product-data-service';
// export { orderDataService } from './order-data-service';
