import { createTool } from "@voltagent/core";
import { z } from "zod";
import cron from "node-cron";

interface Task {
  id: string;
  description: string;
  schedule: string;
}

const tasks: Task[] = [];

export const taskManager = createTool({
  name: "task-manager",
  description: "Permite crear, gestionar y eliminar recordatorios y tareas personales utilizando node-cron.",
  tags: ["tareas", "recordatorios", "cron"],
  parameters: z.object({
    action: z.enum(["create", "delete", "list"]),
    id: z.string().optional(),
    description: z.string().optional(),
    schedule: z.string().optional(),
  }),
  execute: async (params, opts) => {
    try {
      const { action, id, description, schedule } = params;

      switch (action) {
        case "create":
          if (!description || !schedule) {
            return { success: false, message: "Descripción y programación son requeridas para crear una tarea.", data: null };
          }
          const newTask: Task = {
            id: Math.random().toString(36).substring(7),
            description,
            schedule,
          };
          tasks.push(newTask);
          cron.schedule(schedule, () => {
            console.log(`Recordatorio: ${description}`);
          });
          return { success: true, message: "Tarea creada exitosamente.", data: newTask };

        case "delete":
          if (!id) {
            return { success: false, message: "ID es requerido para eliminar una tarea.", data: null };
          }
          const index = tasks.findIndex(task => task.id === id);
          if (index === -1) {
            return { success: false, message: "Tarea no encontrada.", data: null };
          }
          tasks.splice(index, 1);
          return { success: true, message: "Tarea eliminada exitosamente.", data: null };

        case "list":
          return { success: true, message: "Listado de tareas.", data: tasks };

        default:
          return { success: false, message: "Acción no válida.", data: null };
      }
    } catch (error) {
      return { success: false, message: "Error al ejecutar la acción.", data: null };
    }
  }
});