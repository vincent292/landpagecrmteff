type MetaErrorBody = {
  error?: {
    code?: number | string;
    message?: string;
    type?: string;
  };
};

type SendWhatsAppTextMessageInput = {
  to: string;
  body: string;
};

function readRequiredEnv(key: string) {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required WhatsApp environment variable: ${key}`);
  }

  return value;
}

function readWhatsAppApiVersion() {
  return process.env.WHATSAPP_API_VERSION?.trim() || "v25.0";
}

async function readMetaResponse(response: Response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text) as MetaErrorBody;
  } catch {
    return null;
  }
}

function getMetaErrorDetails(body: MetaErrorBody | null) {
  return {
    code: body?.error?.code,
    message: body?.error?.message,
    type: body?.error?.type,
  };
}

export async function sendWhatsAppTextMessage({ to, body }: SendWhatsAppTextMessageInput) {
  const accessToken = readRequiredEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = readRequiredEnv("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = readWhatsAppApiVersion();

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body,
      },
    }),
  });

  if (!response.ok) {
    const responseBody = await readMetaResponse(response);
    const metaError = getMetaErrorDetails(responseBody);

    console.error("[whatsapp] Meta send failed", {
      status: response.status,
      errorCode: metaError.code,
      errorType: metaError.type,
      errorMessage: metaError.message,
    });

    throw new Error("Meta WhatsApp API request failed.");
  }

  return response.json().catch(() => null);
}
