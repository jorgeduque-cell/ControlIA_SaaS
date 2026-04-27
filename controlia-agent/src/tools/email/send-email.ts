/**
 * send_email — Envía correos electrónicos vía SMTP usando nodemailer
 *
 * Requiere en env:
 *   SMTP_HOST
 *   SMTP_PORT (default: 587)
 *   SMTP_USER
 *   SMTP_PASS
 *   SMTP_FROM
 */

import { createTool } from "@voltagent/core";
import nodemailer from "nodemailer";
import { z } from "zod";
import { config } from "../../config/env.js";

export const sendEmailTool = createTool({
	name: "send_email",
	description:
		"Envía un correo electrónico al destinatario vía SMTP. " +
		"Úsalo para notificaciones, recordatorios de pago, confirmaciones de pedido o reportes.",
	tags: ["email", "communication", "smtp", "notifications"],

	parameters: z.object({
		to: z.string().email().describe("Correo electrónico del destinatario"),
		subject: z.string().min(1).describe("Asunto del correo"),
		body: z
			.string()
			.min(1)
			.describe("Cuerpo del mensaje (puede ser HTML o texto plano)"),
		isHtml: z
			.boolean()
			.default(false)
			.describe("Si es true, el body se envía como HTML"),
		cc: z.string().email().optional().describe("Correo en copia (opcional)"),
		bcc: z
			.string()
			.email()
			.optional()
			.describe("Correo en copia oculta (opcional)"),
	}),

	execute: async (params) => {
		const host = config.SMTP_HOST;
		const port = config.SMTP_PORT;
		const user = config.SMTP_USER;
		const pass = config.SMTP_PASS;
		const from = config.SMTP_FROM;

		if (!host || !user || !pass || !from) {
			return {
				success: false,
				message:
					"❌ Email no configurado. Pide al admin agregar SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM.",
			};
		}

		const transporter = nodemailer.createTransport({
			host,
			port,
			secure: port === 465,
			auth: { user, pass },
			tls: {
				rejectUnauthorized: false,
			},
		});

		try {
			const info = await transporter.sendMail({
				from,
				to: params.to,
				cc: params.cc,
				bcc: params.bcc,
				subject: params.subject,
				text: params.isHtml ? undefined : params.body,
				html: params.isHtml ? params.body : undefined,
			});

			return {
				success: true,
				message: `✅ Correo enviado a ${params.to} (messageId: ${info.messageId ?? "N/A"})`,
				messageId: info.messageId,
			};
		} catch (error) {
			return {
				success: false,
				message: `❌ Error enviando correo: ${error instanceof Error ? error.message : "desconocido"}`,
			};
		}
	},
});
