export function isMissingWhatsAppMessageTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message || "").toLowerCase();
  return error.code === "42P01"
    || error.code === "PGRST205"
    || (message.includes("whatsapp_messages") && (message.includes("not find") || message.includes("does not exist")));
}

