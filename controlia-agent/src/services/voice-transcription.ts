import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import OpenAI from "openai";
import { config } from "../config/env.js";

// OpenAI client for Whisper (can be different from the AI provider)
const openai = new OpenAI({
	apiKey: config.OPENAI_API_KEY || config.MOONSHOT_API_KEY || "",
});

/**
 * Downloads a file from a URL to a local path
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
	const response = await axios({
		method: "GET",
		url: url,
		responseType: "stream",
	});

	const writer = fs.createWriteStream(outputPath);
	response.data.pipe(writer);

	return new Promise((resolve, reject) => {
		writer.on("finish", resolve);
		writer.on("error", reject);
	});
}

/**
 * Transcribes an audio file using OpenAI Whisper
 *
 * @param audioUrl - URL of the audio file (from Telegram)
 * @param fileUniqueId - Unique ID for caching/temp file naming
 * @returns Transcribed text
 */
export async function transcribeVoice(
	audioUrl: string,
	fileUniqueId: string,
): Promise<string> {
	if (!config.OPENAI_API_KEY && !config.MOONSHOT_API_KEY) {
		throw new Error(
			"No hay API key configurada para transcripción de voz. Configura OPENAI_API_KEY o MOONSHOT_API_KEY.",
		);
	}

	const tempDir = path.join(process.cwd(), ".temp");

	// Ensure temp directory exists
	if (!fs.existsSync(tempDir)) {
		fs.mkdirSync(tempDir, { recursive: true });
	}

	const tempFilePath = path.join(tempDir, `${fileUniqueId}.ogg`);

	try {
		console.log(`[Voice] Downloading audio from: ${audioUrl}`);
		await downloadFile(audioUrl, tempFilePath);
		console.log(`[Voice] Audio saved to: ${tempFilePath}`);

		// Check if file exists and has content
		const stats = fs.statSync(tempFilePath);
		if (stats.size === 0) {
			throw new Error("El archivo de audio descargado está vacío");
		}

		console.log(`[Voice] Transcribing with Whisper... (${stats.size} bytes)`);

		// Transcribe with Whisper
		const transcription = await openai.audio.transcriptions.create({
			file: fs.createReadStream(tempFilePath),
			model: "whisper-1",
			language: "es", // Spanish
			response_format: "json",
		});

		const text = transcription.text;

		console.log(`[Voice] Transcription: "${text}"`);

		// Clean up temp file
		fs.unlinkSync(tempFilePath);

		return text || "No se pudo transcribir el audio";
	} catch (error) {
		// Clean up on error
		if (fs.existsSync(tempFilePath)) {
			fs.unlinkSync(tempFilePath);
		}

		console.error("[Voice] Transcription error:", error);
		throw new Error(
			`Error al transcribir el audio: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Transcribes audio using Moonshot API (alternative to Whisper)
 * Moonshot also supports audio transcription
 */
export async function transcribeVoiceWithMoonshot(
	audioUrl: string,
	fileUniqueId: string,
): Promise<string> {
	// For now, use the same OpenAI client with Moonshot base URL
	// Moonshot API is compatible with OpenAI's audio API
	return transcribeVoice(audioUrl, fileUniqueId);
}
