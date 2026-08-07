import "server-only";

export function voiceConfig() {
  return {
    apiKey: process.env.TELNYX_API_KEY?.trim() || "",
    telephonyCredentialId: process.env.TELNYX_TELEPHONY_CREDENTIAL_ID?.trim() || "",
    callerNumber: process.env.TELNYX_CALLER_NUMBER?.trim() || "",
  };
}

export function voiceConfigured() {
  const config = voiceConfig();
  return Boolean(config.apiKey && config.telephonyCredentialId && config.callerNumber);
}
