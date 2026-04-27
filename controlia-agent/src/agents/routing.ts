import { Agent } from "@voltagent/core";
import { getAIModelChain } from "../config/ai-provider.js";
import { getCalendarEventsTool } from "../tools/external/get-calendar-events.js";
import { getWeatherTool } from "../tools/external/get-weather.js";
import { geocodeAddressTool } from "../tools/routing/geocode-address.js";
import { optimizeRouteTool } from "../tools/routing/optimize-route.js";
import { planDeliveryRoutesTool } from "../tools/routing/plan-delivery-routes.js";
import { planMyDayTool } from "../tools/routing/plan-my-day.js";
import { saveClientLocationTool } from "../tools/routing/save-client-location.js";

/**
 * Routing Agent — Especialista en ruteo y optimización de entregas
 *
 * Capacidades:
 *   - Planificar rutas de entrega diarias (VROOM via OpenRouteService)
 *   - Geocodificar direcciones de clientes
 *   - Optimizar orden de visitas minimizando distancia/tiempo
 *   - Guardar coordenadas de clientes para futuras rutas
 *
 * Modelo: Gemini Flash (tier fast) — operativo, barato, suficiente para routing
 */
export const routingAgent = new Agent({
	name: "Routing",
	id: "routing-agent",
	purpose:
		"Especialista en planificación y optimización de rutas de entrega para distribuidoras de aceite",

	instructions: `Routing Agent — optimiza rutas de entrega para distribuidora de aceite.

Tools:
- plan_my_day: agenda completa del día (combina CRM + pedidos + ventanas bloqueadas del usuario)
- plan_delivery_routes: ruta del día (DB + geocoding + VROOM)
- optimize_route: optimiza paradas con coordenadas ya conocidas
- geocode_address: dirección → GPS
- save_client_location: guarda GPS de un cliente
- get_weather: clima + pronóstico (usa antes de rutas largas o cuando haya lluvia)
- get_calendar_events: lee eventos del Google/Outlook calendar del usuario si hay link ICS

Cuando el usuario pida "prepara mi día", "qué hago mañana", "agéndame el día", "organiza mi jornada" → usa plan_my_day (NO plan_delivery_routes — ese es solo para entregas).
Extrae ventanas bloqueadas del mensaje del usuario (ej: "estudio 6:40-10pm" → bloqueadas: [{inicio:"18:40",fin:"22:00",motivo:"estudio"}]).

Reglas:
- Nunca inventes coordenadas — usa geocode_address o las guardadas.
- Dirección nueva → geocodifica y guarda con save_client_location.
- Vehículo driving-car, default 7am–6pm.
- Responde con el resultado del tool + 1 línea de KPIs (paradas, km, tiempo).`,

	model: getAIModelChain("fast"), // Groq 70B / DeepSeek — sin rate limits
	tools: [
		planMyDayTool,
		planDeliveryRoutesTool,
		optimizeRouteTool,
		geocodeAddressTool,
		saveClientLocationTool,
		getWeatherTool,
		getCalendarEventsTool,
	],
	temperature: 0.1, // bajo — respuestas deterministas para rutas
	maxSteps: 5,
	maxOutputTokens: 1024,
});
