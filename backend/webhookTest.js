/**
 * webhookTest.js
 * Simula envio de webhook do Mercado Pago para testar seu backend local
 */

import crypto from "crypto";

// URL do seu backend (rota webhook)
const WEBHOOK_URL = "https://whorled-nonfluently-samiyah.ngrok-free.dev/webhook";

// Mesma secret do seu backend (.env)
const WEBHOOK_SECRET = "ece8df63184b3da487bf5b2ff07aec0bdacb0a9bb487c600e43cf16cc3f1647f"; // substitua pelo seu secret real

// Payload do webhook
const payload = {
  action: 'payment.updated',
  api_version: 'v1',
  data: { id: '123456' },
  date_created: new Date().toISOString(),
  id: '123456',
  live_mode: false,
  type: 'payment',
  user_id: 2489186444,
};

// Request ID e timestamp
const requestId = crypto.randomUUID();
const ts = Date.now().toString();

// Corpo como string
const rawBody = JSON.stringify(payload);

// Calcula assinatura HMAC SHA256
const signatureHash = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(`${ts}.${requestId}.${rawBody}`)
  .digest('hex');

const signatureHeader = `ts=${ts},v1=${signatureHash}`;

// Envia para o backend
(async () => {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': signatureHeader,
      'x-request-id': requestId,
    },
    body: rawBody,
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Resposta do backend:', text);
})();