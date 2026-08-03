import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer, EmailAccount } from "@/types/database";

export const gmailScopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export type GmailMessageSummary = {
  id: string;
  threadId: string;
  customerId: string;
  company: string;
  customerEmail: string;
  direction: "received" | "sent";
  from: string;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
  date: string;
};

type GmailListResponse = { messages?: Array<{ id: string; threadId: string }> };
type GmailMessageResponse = {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
};

export function gmailConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function gmailRedirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI || `${origin}/api/gmail/callback`;
}

export async function getGmailAccount(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as EmailAccount | null;
}

async function googleError(response: Response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; error_description?: string };
    if (typeof parsed.error === "string") return parsed.error_description || parsed.error;
    return parsed.error?.message || text;
  } catch {
    return text || `Google API ${response.status}`;
  }
}

export async function getGmailAccessToken(supabase: SupabaseClient, account: EmailAccount) {
  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;
  if (account.access_token && expiresAt > Date.now() + 60_000) return account.access_token;
  if (!account.refresh_token) throw new Error("Google 授权已过期，请重新连接邮箱。");
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new Error("Google 邮箱尚未完成系统配置。");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await googleError(response));
  const token = await response.json() as { access_token: string; expires_in?: number; scope?: string };
  const expires_at = new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString();
  const { error } = await supabase.from("email_accounts").update({
    access_token: token.access_token,
    expires_at,
    scopes: token.scope || account.scopes,
    updated_at: new Date().toISOString(),
  }).eq("id", account.id).eq("user_id", account.user_id);
  if (error) throw new Error(error.message);
  return token.access_token;
}

async function gmailJson<T>(accessToken: string, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await googleError(response));
  return await response.json() as T;
}

function headerValue(message: GmailMessageResponse, name: string) {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";
}

export async function listCustomerMessages(
  supabase: SupabaseClient,
  account: EmailAccount,
  customers: Customer[],
) {
  const customerContacts = customers
    .filter((customer) => customer.contact_email)
    .map((customer) => ({ customer, email: customer.contact_email!.trim().toLowerCase() }))
    .filter((item, index, items) => item.email && items.findIndex((candidate) => candidate.email === item.email) === index)
    .slice(0, 50);
  if (!customerContacts.length) return [] as GmailMessageSummary[];

  const accessToken = await getGmailAccessToken(supabase, account);
  const searchTerms = customerContacts.flatMap((item) => [`from:${item.email}`, `to:${item.email}`]);
  const params = new URLSearchParams({ maxResults: "30", q: `newer_than:2y {${searchTerms.join(" ")}}` });
  const list = await gmailJson<GmailListResponse>(accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
  const messages = await Promise.all((list.messages ?? []).map(({ id }) => {
    const detailParams = new URLSearchParams({ format: "metadata" });
    ["From", "To", "Cc", "Subject", "Date"].forEach((header) => detailParams.append("metadataHeaders", header));
    return gmailJson<GmailMessageResponse>(accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?${detailParams}`);
  }));

  const accountEmail = account.email.toLowerCase();
  return messages.flatMap((message) => {
    const from = headerValue(message, "From");
    const to = headerValue(message, "To");
    const cc = headerValue(message, "Cc");
    const participants = `${from} ${to} ${cc}`.toLowerCase();
    const match = customerContacts.find((item) => participants.includes(item.email));
    if (!match) return [];
    const headerDate = headerValue(message, "Date");
    const internalDate = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : "";
    return [{
      id: message.id,
      threadId: message.threadId,
      customerId: match.customer.id,
      company: match.customer.company,
      customerEmail: match.email,
      direction: from.toLowerCase().includes(accountEmail) ? "sent" as const : "received" as const,
      from,
      to,
      cc,
      subject: headerValue(message, "Subject") || "（无主题）",
      snippet: message.snippet || "",
      date: internalDate || (headerDate ? new Date(headerDate).toISOString() : new Date().toISOString()),
    }];
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function safeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodedSubject(subject: string) {
  return `=?UTF-8?B?${Buffer.from(safeHeader(subject), "utf8").toString("base64")}?=`;
}

function base64Lines(value: Buffer) {
  return value.toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
}

export function buildRawEmail(input: {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
  attachment?: { name: string; type: string; bytes: Buffer };
}) {
  const headers = [
    `From: ${safeHeader(input.from)}`,
    `To: ${safeHeader(input.to)}`,
    ...(input.cc ? [`Cc: ${safeHeader(input.cc)}`] : []),
    `Subject: ${encodedSubject(input.subject)}`,
    "MIME-Version: 1.0",
  ];

  if (!input.attachment) {
    const raw = [
      ...headers,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(Buffer.from(input.body, "utf8")),
    ].join("\r\n");
    return Buffer.from(raw, "utf8").toString("base64url");
  }

  const boundary = `dresscrm_${crypto.randomUUID().replaceAll("-", "")}`;
  const raw = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(input.body, "utf8")),
    `--${boundary}`,
    `Content-Type: ${safeHeader(input.attachment.type || "application/octet-stream")}; name="${safeHeader(input.attachment.name)}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${safeHeader(input.attachment.name)}"`,
    "",
    base64Lines(input.attachment.bytes),
    `--${boundary}--`,
  ].join("\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
}

export async function sendGmailMessage(supabase: SupabaseClient, account: EmailAccount, raw: string) {
  const accessToken = await getGmailAccessToken(supabase, account);
  return gmailJson<{ id: string; threadId: string }>(accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
}
