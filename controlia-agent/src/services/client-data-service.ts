import { EventEmitter } from "events";
import { promises as fs } from "fs";
import path from "path";

/**
 * Interface para representar un cliente completo.
 */
export interface Client {
	id: string;
	name: string;
	email?: string;
	phone?: string;
	address?: string;
	notes?: string[];
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Interface para exportación a Excel
 */
export interface ClientExportData {
	id: string;
	nombre: string;
	email: string;
	telefono: string;
	direccion: string;
	notas: string;
	fechaCreacion: string;
}

/**
 * 🏢 SERVICIO CENTRALIZADO DE DATOS DE CLIENTES
 *
 * Actúa como ÚNICA FUENTE DE VERDAD para todos los agentes:
 * - CRM Agent: usa este servicio para CRUD de clientes
 * - Document Agent: usa este servicio para exportaciones
 *
 * Implementa patrón Singleton para garantizar consistencia.
 */
class ClientDataService {
	private static instance: ClientDataService;
	private clients: Map<string, Client> = new Map();
	private filePath: string;
	private eventEmitter: EventEmitter;
	private initialized = false;

	private constructor() {
		this.filePath = path.resolve(process.cwd(), "data", "clients.json");
		this.eventEmitter = new EventEmitter();
	}

	/**
	 * Obtiene la instancia única del servicio.
	 */
	public static getInstance(): ClientDataService {
		if (!ClientDataService.instance) {
			ClientDataService.instance = new ClientDataService();
		}
		return ClientDataService.instance;
	}

	/**
	 * Inicializa el servicio cargando datos existentes o creando defaults.
	 */
	public async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Asegurar que existe el directorio data
			const dataDir = path.dirname(this.filePath);
			await fs.mkdir(dataDir, { recursive: true });

			// Intentar cargar datos existentes
			const data = await fs.readFile(this.filePath, "utf-8");
			const parsed = JSON.parse(data);

			for (const client of parsed) {
				this.clients.set(client.id, {
					...client,
					createdAt: new Date(client.createdAt),
					updatedAt: new Date(client.updatedAt),
				});
			}

			console.log(
				`✅ ClientDataService: Cargados ${this.clients.size} clientes desde archivo`,
			);
		} catch (error) {
			// Si no existe el archivo, crear con clientes iniciales
			console.log(
				"📝 ClientDataService: Inicializando con clientes predeterminados...",
			);

			const defaultClients: Client[] = [
				{
					id: "client_001",
					name: "Dumbo Salsa",
					email: "contacto@dumbosalsa.com",
					phone: "+57 300 123 4567",
					address: "Calle 45 #23-10, Bogotá",
					notes: ["Cliente frecuente", "Prefiere entregas los martes"],
					createdAt: new Date("2024-01-15"),
					updatedAt: new Date("2024-01-15"),
				},
				{
					id: "client_002",
					name: "Empanadas de Millos",
					email: "ventas@empanadasmillos.co",
					phone: "+57 311 987 6543",
					address: "Carrera 7 #82-15, Bogotá",
					notes: ["Pedidos grandes los fines de semana"],
					createdAt: new Date("2024-02-20"),
					updatedAt: new Date("2024-02-20"),
				},
			];

			for (const client of defaultClients) {
				this.clients.set(client.id, client);
			}

			await this.saveToFile();
			console.log(
				`✅ ClientDataService: Creados ${this.clients.size} clientes iniciales`,
			);
		}

		this.initialized = true;
	}

	/**
	 * Guarda los clientes en el archivo JSON.
	 */
	private async saveToFile(): Promise<void> {
		try {
			const dataDir = path.dirname(this.filePath);
			await fs.mkdir(dataDir, { recursive: true });

			const clientsArray = Array.from(this.clients.values());
			await fs.writeFile(this.filePath, JSON.stringify(clientsArray, null, 2));
		} catch (error) {
			console.error("❌ Error guardando clientes:", error);
			throw error;
		}
	}

	/**
	 * Añade un nuevo cliente.
	 */
	public async addClient(
		clientData: Omit<Client, "id" | "createdAt" | "updatedAt">,
	): Promise<Client> {
		await this.initialize();

		const client: Client = {
			...clientData,
			id: `client_${Date.now()}`,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		this.clients.set(client.id, client);
		await this.saveToFile();
		this.eventEmitter.emit("clientAdded", client);

		return client;
	}

	/**
	 * Obtiene un cliente por ID.
	 */
	public async getClient(id: string): Promise<Client | undefined> {
		await this.initialize();
		return this.clients.get(id);
	}

	/**
	 * Busca clientes por nombre (búsqueda parcial).
	 */
	public async searchByName(name: string): Promise<Client[]> {
		await this.initialize();
		const searchTerm = name.toLowerCase();
		return Array.from(this.clients.values()).filter((client) =>
			client.name.toLowerCase().includes(searchTerm),
		);
	}

	/**
	 * Obtiene todos los clientes.
	 */
	public async getAllClients(): Promise<Client[]> {
		await this.initialize();
		return Array.from(this.clients.values());
	}

	/**
	 * Obtiene el conteo de clientes.
	 */
	public async getClientCount(): Promise<number> {
		await this.initialize();
		return this.clients.size;
	}

	/**
	 * Actualiza un cliente existente.
	 */
	public async updateClient(
		id: string,
		updates: Partial<Client>,
	): Promise<Client | null> {
		await this.initialize();

		const existing = this.clients.get(id);
		if (!existing) return null;

		const updated: Client = {
			...existing,
			...updates,
			id: existing.id, // No permitir cambiar ID
			createdAt: existing.createdAt, // No permitir cambiar fecha creación
			updatedAt: new Date(),
		};

		this.clients.set(id, updated);
		await this.saveToFile();
		this.eventEmitter.emit("clientUpdated", updated);

		return updated;
	}

	/**
	 * Elimina un cliente por ID.
	 */
	public async deleteClient(id: string): Promise<boolean> {
		await this.initialize();

		if (!this.clients.has(id)) return false;

		this.clients.delete(id);
		await this.saveToFile();
		this.eventEmitter.emit("clientDeleted", id);

		return true;
	}

	/**
	 * 📊 MÉTODO PARA DOCUMENT AGENT
	 * Retorna datos formateados para exportación a Excel.
	 */
	public async getClientsForExport(): Promise<ClientExportData[]> {
		await this.initialize();

		return Array.from(this.clients.values()).map((client) => ({
			id: client.id,
			nombre: client.name,
			email: client.email || "",
			telefono: client.phone || "",
			direccion: client.address || "",
			notas: client.notes?.join("; ") || "",
			fechaCreacion: client.createdAt.toISOString().split("T")[0],
		}));
	}

	/**
	 * Suscribe a eventos de cambios en los clientes.
	 */
	public on(
		event: "clientAdded" | "clientUpdated" | "clientDeleted",
		listener: (data: any) => void,
	): void {
		this.eventEmitter.on(event, listener);
	}

	/**
	 * Refresca los datos desde el archivo (útil si otro proceso modificó el archivo).
	 */
	public async refresh(): Promise<void> {
		this.initialized = false;
		this.clients.clear();
		await this.initialize();
	}
}

// Exportar instancia singleton
export const clientDataService = ClientDataService.getInstance();

// Exportar clase para testing
export { ClientDataService };
