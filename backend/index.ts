// backend/index.ts
import express, { Request, Response } from "express";
import fetch from "node-fetch";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Variáveis de ambiente obrigatórias
const MP_TOKEN = process.env.MP_ACCESS_TOKEN||"APP_USR-4177315219522434-100421-3eb0e994536916dcc3f38066337e2b31-2489253900";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET|| "f3de438b9d02950a7684c31beddec76e69f04bd4d59b0bea6c25bd0972ed7fb1";

if (!MP_TOKEN || !WEBHOOK_SECRET) {
  throw new Error("MP_ACCESS_TOKEN e WEBHOOK_SECRET são obrigatórios no .env");
}

// Middleware para receber o body **bruto** (necessário para validar assinatura)
app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// --- Banco em memória apenas para teste ---
interface Order {
  paymentId: string;
  amount: number;
  description: string;
  status: string;
  qrCode?: string;
  qrCodeBase64?: string;
  paymentUrl?: string;
  updatedAt?: string;
  createdAt: string;
}
const orders: Map<string, Order> = new Map();

// --- Função para criar cobrança PIX ---
app.post("/create_charge", async (req: Request, res: Response) => {
  try {
    const { amount, description } = req.body as { amount: number; description?: string };

    if (!amount) return res.status(400).json({ error: "amount é obrigatório" });

    const payload = {
      transaction_amount: Number(amount),
      description: description || "Pagamento via PIX",
      payment_method_id: "pix",
      payer: { email: "payer@example.com" },
    };

    // Cria pagamento via API do Mercado Pago
    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });

    const mpJson = await mpRes.json();

    if (!mpRes.ok) {
      console.error("Erro Mercado Pago:", mpJson);
      return res.status(500).json({ error: "mercadopago error", detail: mpJson });
    }

    const paymentId: string = String(mpJson.id);
    const qrCode: string | undefined = mpJson.point_of_interaction?.transaction_data?.qr_code;
    const qrCodeBase64: string | undefined = mpJson.point_of_interaction?.transaction_data?.qr_code_base64;
    const paymentUrl: string | undefined = mpJson.point_of_interaction?.transaction_data?.ticket_url;

    const order: Order = {
      paymentId,
      amount,
      description: description || "Pagamento via PIX",
      status: mpJson.status || "PENDING",
      qrCode,
      qrCodeBase64,
      paymentUrl,
      createdAt: new Date().toISOString(),
    };
    orders.set(paymentId, order);

    res.json({ paymentId, status: order.status, qrCode, qrCodeBase64, paymentUrl });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Erro interno", detail: err.message });
  }
});

// --- Função para validar assinatura do webhook ---
function validateWebhookSignature(req: Request & { rawBody?: Buffer }): boolean {
  const signatureHeader = req.headers["x-signature"] as string;
  const requestId = req.headers["x-request-id"] as string;

  if (!signatureHeader || !requestId || !req.rawBody) return false;

  const [ts, signatureHash] = signatureHeader.split(",").map((x) => x.split("=")[1]);
  const payload = `${ts}.${requestId}.${req.rawBody.toString("utf8")}`;
  const expectedHash = crypto.createHmac("sha256", WEBHOOK_SECRET!).update(payload).digest("hex");

  return expectedHash === signatureHash;
}

// --- Webhook do Mercado Pago ---
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const rawBody = req.body.toString('utf8'); // 🔹 declare antes de usar

  const signatureHeader = req.headers['x-signature'] as string;
  const requestId = req.headers['x-request-id'] as string;

  console.log("=== WEBHOOK RECEIVED ===");
  console.log("rawBody:", rawBody);
  console.log("signatureHeader:", signatureHeader);
  console.log("requestId:", requestId);

  if (!signatureHeader || !requestId) return res.status(400).send('Headers ausentes');

  const [ts, signatureHash] = signatureHeader.split(',').map(x => x.split('=')[1]);
  const payload = `${ts}.${requestId}.${rawBody}`;

  const expectedHash = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(payload)
    .digest('hex');

  if (expectedHash !== signatureHash) {
    console.log('❌ Assinatura inválida', { expectedHash, signatureHash });
    return res.status(401).send('Unauthorized');
  }

  const paymentId = JSON.parse(rawBody).data.id;
if (orders.has(paymentId)) {
  const order = orders.get(paymentId)!;
  order.status = 'APPROVED'; // ou use JSON.parse(rawBody).status se disponível
  order.updatedAt = new Date().toISOString();
  orders.set(paymentId, order);
  console.log('Order updated:', order);
} else {
  console.log('Pedido não encontrado:', paymentId);
}

  console.log('✅ Assinatura válida!', JSON.parse(rawBody));
  res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro interno", detail: error.message });
  }
});


// --- Consultar status do pagamento ---
app.get("/status/:paymentId", (req: Request, res: Response) => {
  const { paymentId } = req.params;
  const order = orders.get(paymentId);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado" });

  res.json(order);
});

// --- Ping ---
app.get("/ping", (_, res) => res.send("pong"));

// --- Start server ---
app.listen(3000, () => console.log("Servidor rodando na porta 3000 🚀"));
