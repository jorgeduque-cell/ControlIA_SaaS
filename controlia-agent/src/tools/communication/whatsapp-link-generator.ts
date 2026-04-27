import { createTool } from "@voltagent/core";
import { z } from "zod";

export const whatsappLinkGenerator = createTool({
  name: "whatsapp-link-generator",
  description: "Genera links de WhatsApp con números de clientes y permite adjuntar un mensaje introductorio.",
  tags: ["whatsapp", "link", "mensaje"],
  parameters: z.object({
    phoneNumber: z.string().min(10, "El número de teléfono debe tener al menos 10 dígitos."),
    message: z.string().optional(),
    pdfLink: z.string().url().optional()
  }),
  execute: async (params, opts) => {
    try {
      const { phoneNumber, message, pdfLink } = params;
      let whatsappLink = `https://wa.me/${phoneNumber}`;

      if (message || pdfLink) {
        const fullMessage = [message, pdfLink].filter(Boolean).join(' ');
        whatsappLink += `?text=${encodeURIComponent(fullMessage)}`;
      }

      return {
        success: true,
        message: "Link de WhatsApp generado exitosamente.",
        data: whatsappLink
      };
    } catch (error) {
      return {
        success: false,
        message: "Error al generar el link de WhatsApp.",
        data: null
      };
    }
  }
});