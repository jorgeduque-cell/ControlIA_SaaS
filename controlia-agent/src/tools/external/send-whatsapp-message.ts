/**
 * send_whatsapp_message — Envía mensaje de WhatsApp vía Twilio
 *
 * Requiere en env:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM (ej: "whatsapp:+14155238886")
 *
 * Útil para recordatorios a clientes, confirmación de pedidos, cobros.
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { config } from "../../config/env.js";

function normalizeE164(phone: string): string {
	const clean = phone.replace(/[^\d+]/g, "");
	if (clean.startsWith("+")) return clean;
	// Colombia por defecto si tiene 10 dígitos
	if (clean.length === 10) return `+57${clean}`;
	return `+${clean}`;
}

export const sendWhatsappMessageTool = createTool({
	name: "send_whatsapp_message",
	description:
		"Envía un mensaje de WhatsApp al cliente vía Twilio. Úsalo para confirmar pedidos, " +
		"recordar pagos vencidos o notificar entregas. Requiere Twilio configurado.",
	tags: ["external", "whatsapp", "communication"],

	parameters: z.object({
		telefono: z
			.string()
			.describe("Teléfono destino (ej: '+573001234567' o '3001234567')"),
		mensaje: z.string().describe("Texto del mensaje"),
	}),

	execute: async (params) => {
		const sid = config.TWILIO_ACCOUNT_SID;
		const token = config.TWILIO_AUTH_TOKEN;
		const from = config.TWILIO_WHATSAPP_FROM;

		if (!sid || !token || !from) {
			return {
				success: false,
				message:
					"❌ WhatsApp no configurado. Pide al admin agregar TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_FROM.",
			};
		}

		const toE164 = normalizeE164(params.telefono);
		const toWhats = `whatsapp:${toE164}`;

		const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
		const body = new URLSearchParams({
			From: from,
			To: toWhats,
			Body: params.mensaje,
		});

		try {
			const auth = Buffer.from(`${sid}:${token}`).toString("base64");
			const resp = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Basic ${auth}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body,
				signal: AbortSignal.timeout(10000),
			});

			const data = (await resp.json()) as {
				sid?: string;
				status?: string;
				error_message?: string;
			};

			if (!resp.ok) {
				return {
					success: false,
					message: `❌ Twilio rechazó el envío: ${data.error_message ?? resp.statusText}`,
				};
			}

			return {
				success: true,
				message: `✅ WhatsApp enviado a ${toE164} (status: ${data.status ?? "queued"})`,
				sid: data.sid,
				status: data.status,
			};
		} catch (error) {
			return {
				success: false,
				message: `❌ Error enviando WhatsApp: ${error instanceof Error ? error.message : "desconocido"}`,
			};
		}
	},
});
