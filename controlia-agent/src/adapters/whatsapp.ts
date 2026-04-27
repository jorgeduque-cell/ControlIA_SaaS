import type { Agent } from "@voltagent/core";
import { Hono } from "hono";
import { config } from "../config/env.js";

interface WhatsAppMessage {
	from: string;
	id: string;
	timestamp: string;
	text?: { body: string };
	type: "text" | "image" | "voice" | "document" | "unknown";
}

interface WhatsAppWebhookPayload {
	object: "whatsapp_business_account";
	entry: Array<{
		id: string;
		changes: Array<{
			value: {
				messaging_product: "whatsapp";
				metadata: {
					display_phone_number: string;
					phone_number_id: string;
				};
				contacts?: Array<{
					profile: { name: string };
					wa_id: string;
				}>;
				messages?: WhatsAppMessage[];
				statuses?: unknown[];
			};
			field: "messages";
		}>;
	}>;
}

async function sendWhatsAppReply(to: string, text: string) {
	const token = config.WHATSAPP_ACCESS_TOKEN;
	const phoneNumberId = config.WHATSAPP_PHONE_NUMBER_ID;

	if (!token || !phoneNumberId) {
		console.error(
			"[WhatsApp] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID",
		);
		return;
	}

	const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

	try {
		const resp = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messaging_product: "whatsapp",
				recipient_type: "individual",
				to,
				type: "text",
				text: { body: text, preview_url: false },
			}),
		});

		if (!resp.ok) {
			const err = await resp.text();
			console.error(`[WhatsApp] Failed to send message: ${resp.status} ${err}`);
		} else {
			console.log(`[WhatsApp] Reply sent to ${to}`);
		}
	} catch (error) {
		console.error("[WhatsApp] Error sending reply:", error);
	}
}

function sanitizeWhatsAppText(text: string): string {
	return text
		.replace(/<b>/gi, "*")
		.replace(/<\/b>/gi, "*")
		.replace(/<i>/gi, "_")
		.replace(/<\/i>/gi, "_")
		.replace(/<code>/gi, "`")
		.replace(/<\/code>/gi, "`")
		.replace(/<pre>/gi, "```")
		.replace(/<\/pre>/gi, "```")
		.replace(/<[^>]+>/g, "")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

export function startWhatsAppBridge(supervisorAgent: Agent) {
	const verifyToken = config.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
	const port = config.WHATSAPP_WEBHOOK_PORT || 3142;

	if (
		!verifyToken ||
		!config.WHATSAPP_ACCESS_TOKEN ||
		!config.WHATSAPP_PHONE_NUMBER_ID
	) {
		console.log(
			"[WhatsApp] Bridge not started: missing WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_WEBHOOK_VERIFY_TOKEN in .env",
		);
		return;
	}

	const app = new Hono();

	app.get("/webhook/whatsapp", (c) => {
		const mode = c.req.query("hub.mode");
		const token = c.req.query("hub.verify_token");
		const challenge = c.req.query("hub.challenge");

		if (mode === "subscribe" && token === verifyToken) {
			console.log("[WhatsApp] Webhook verified successfully");
			return c.text(challenge || "OK");
		}

		console.warn("[WhatsApp] Webhook verification failed");
		return c.text("Forbidden", 403);
	});

	app.post("/webhook/whatsapp", async (c) => {
		try {
			const body = (await c.req.json()) as WhatsAppWebhookPayload;

			if (body.object !== "whatsapp_business_account") {
				return c.json({ status: "ignored" });
			}

			for (const entry of body.entry || []) {
				for (const change of entry.changes || []) {
					const value = change.value;
					const messages = value.messages || [];

					for (const message of messages) {
						const phone = message.from;
						const name = value.contacts?.[0]?.profile?.name || "Cliente";

						if (message.type !== "text" || !message.text?.body) {
							console.log(
								`[WhatsApp] Ignored non-text message from ${phone} (type: ${message.type})`,
							);
							continue;
						}

						const userText = message.text.body;
						console.log(`[WhatsApp] ${name} (${phone}): ${userText}`);

						const contextStore = new Map<string, unknown>();
						contextStore.set("vendedorId", phone);
						contextStore.set("userId", phone);
						contextStore.set("whatsappPhone", phone);
						contextStore.set("channel", "whatsapp");
						contextStore.set("vendedorNombre", "Distribuidora de Aceites");
						contextStore.set("vendedorPlan", "pro");
						contextStore.set("negocioNombre", "Distribuidora de Aceites");

						const result = await supervisorAgent.generateText(userText, {
							memory: {
								userId: phone,
								conversationId: `whatsapp-${phone}`,
								options: { contextLimit: 40 },
							},
							context: contextStore,
						});

						const replyText = sanitizeWhatsAppText(result.text);
						await sendWhatsAppReply(phone, replyText);
					}
				}
			}

			return c.json({ status: "received" });
		} catch (error) {
			console.error("[WhatsApp] Webhook error:", error);
			return c.json({ status: "error" }, 500);
		}
	});

	import("@hono/node-server").then(({ serve }) => {
		serve({ fetch: app.fetch, port });
		console.log(
			`✅ WhatsApp bridge listening on http://localhost:${port}/webhook/whatsapp`,
		);
	});
}
