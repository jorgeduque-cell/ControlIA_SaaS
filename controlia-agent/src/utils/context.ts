/**
 * Safely reads a value from VoltAgent context.
 * Context may be passed as a Map<string, unknown> or a plain Record<string, unknown>
 * depending on the lifecycle stage (tools vs guardrails vs instructions).
 */
export function getContextValue(context: unknown, key: string): unknown {
	if (context instanceof Map) {
		return context.get(key);
	}
	if (typeof context === "object" && context !== null) {
		return (context as Record<string, unknown>)[key];
	}
	return undefined;
}
