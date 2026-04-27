import { createTool } from "@voltagent/core";
import { z } from "zod";
import cron from "node-cron";

interface Reminder {
  id: string;
  message: string;
  time: Date;
}

const reminders: Reminder[] = [];

export const reminderTool = createTool({
  name: "reminder-tool",
  description: "Gestiona recordatorios y envía notificaciones cada 30 minutos utilizando un heartbeat.",
  tags: ["recordatorios", "notificaciones", "cron"],
  parameters: z.object({
    id: z.string(),
    message: z.string(),
    time: z.date(),
  }),
  execute: async (params, opts) => {
    try {
      const { id, message, time } = params;
      reminders.push({ id, message, time });
      return { success: true, message: "Recordatorio agregado exitosamente.", data: null };
    } catch (error) {
      return { success: false, message: "Error al agregar el recordatorio.", data: null };
    }
  },
});

cron.schedule("*/30 * * * *", () => {
  const now = new Date();
  reminders.forEach((reminder) => {
    if (reminder.time <= now) {
      console.log(`Notificación: ${reminder.message}`);
      // Aquí se podría integrar un servicio de notificación real, como enviar un correo electrónico.
    }
  });
});