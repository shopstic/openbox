export const debugLog = Deno.env.get("DEBUG") === "1" ? console.error.bind(console) : undefined;
