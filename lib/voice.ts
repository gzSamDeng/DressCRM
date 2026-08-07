import "server-only";

export function voiceConfig() {
  return {
    provider: "DIDWW phone.systems",
    enabled: process.env.DIDWW_PHONE_SYSTEMS_ENABLED?.trim().toLowerCase() === "true",
    callerNumber: process.env.DIDWW_CALLER_NUMBER?.trim() || "",
  };
}

export function voiceConfigured() {
  return voiceConfig().enabled;
}
