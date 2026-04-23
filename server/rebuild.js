const fs = require('fs');

const fileContent = `import express from 'express';
import { randomUUID, createHmac } from 'crypto';

const router = express.Router();

const POCKETFI_SECRET = process.env.POCKETFI_SECRET_KEY || 'c3ce3fdbed6b8e28bde2852eda980991cec8df55aa1272c8c562ce7d08fea7d1';
const POCKETFI_PUBLIC = process.env.POCKETFI_PUBLIC_KEY || '18762|JECTGW9AbwI8HXz0Beed9mcOyK1DAajSIF832xP9a1b4c2e5';

async function resolveUserRecord(userId?: string, email?: string, fallbackLocalId?: string) {
  const { User } = await import('../models');
  for (const candidate of [userId, fallbackLocalId]) {
    if (!candidate || typeof candidate !== 'string') continue;
    try {
      const foundUser = await User.findById(candidate).exec();
      if (foundUser) return foundUser;
    } catch {}
  }
  if (email) return User.findOne({ email }).exec();
  return null;
}

/**
 * POST /api/payments/create-session
 */
router.post('/create-session', async (req, res) => {
  try {
    const { amount, currency, userId, email, callbackUrl } = req.body;

    if (!amount || !currency || !userId || !email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: amount, currency, userId, email',
      });
    }

    const paymentReference = randomUUID();
    const baseRedirect = (callbackUrl || \`\${process.env.FRONTEND_URL || 'http://localhost:5173'}/shop\`).toString();

    const transactionData = {
      amount: Number(amount),
      currency: currency.toUpperCase(),
      customerEmail: email,
      customerName: 'Customer',
      customerPhoneNumber: '+2340000000000',
      description: \`Wallet top-up for user \${userId}\`,
      reference: paymentReference,
      metadata: { userId, type: 'wallet-topup' },
    };

    console.log('PocketFi initiate called', { paymentReference, amount });

    const fetchResponse = await fetch('https://api.pocketfi.ng/api/v1/checkout/virtual-account', {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${POCKETFI_PUBLIC}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transactionData),
    });

    const parsedData = await fetchResponse.json();

    if (parsedData.status === true && parsedData.accountNumber) {
      const transactionReference = parsedData.sessionReference || null;
      try {
        const { Payment } = await import('../models');
        const resolvedUser = await resolveUserRecord(userId, email, userId);
        await Payment.create({
          user: resolvedUser?._id,
          userLocalId: userId,
          email: transactionData.customerEmail,
          amount: Number(transactionData.amount) || 0,
          method: 'pocketfi',
          status: 'pending',
          reference: paymentReference,
          transactionReference: transactionReference || undefined,
          isCredited: false,
        });
      } catch (e) {}

      const q = new URLSearchParams({
        accountNumber: parsedData.accountNumber,
        bankName: parsedData.bankName,
        accountName: parsedData.accountName || 'Joy Buy Plaza',
        amount: parsedData.amount.toString(),
        ref: paymentReference,
        redirect: baseRedirect
      });
      const checkoutUrl = \`\${req.protocol}://\${req.get('host')}/api/payments/pocketfi-checkout?\${q.toString()}\`;

      return res.status(200).json({ success: true, checkoutUrl, paymentReference, transactionReference });
    } else {
      return res.status(400).json({ success: false, error: parsedData.message || parsedData.error || 'Failed to create payment session' });
    }
  } catch (error: any) {
    console.error('Error creating session:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/payments/pocketfi-checkout
 */
router.get('/pocketfi-checkout', (req, res) => {
  const { accountNumber, bankName, accountName, amount, ref, redirect } = req.query;
  const backParams = new URLSearchParams({ pref: (ref as string) || '', status: 'PAID', transRef: (ref as string) || '' }).toString();
  const goBackUrl = redirect ? \`\${redirect}\${redirect.toString().includes('?') ? '&' : '?'}\${backParams}\` : '/';

  res.send(\`<!DOCTYPE html>
  <html>
  <head>
    <title>Make Payment</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #f9fafb; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
      .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 400px; width: 100%; text-align: center; }
      h1 { color: #111827; font-size: 1.5rem; margin-bottom: 1rem; }
      .amount { font-size: 2rem; font-weight: bold; color: #059669; margin: 1rem 0; }
      .details { background: #f3f4f6; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; text-align: left; }
      .detail-row { display: flex; justify-content: space-between; margin-bottom: 0.75rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.75rem; }
      .detail-row:last-child { border: none; margin-bottom: 0; padding-bottom: 0; }
      .label { color: #6b7280; font-size: 0.875rem; }
      .value { font-weight: 600; color: #1f2937; }
      .btn { display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 500; width: 100%; box-sizing: border-box; margin-top: 1rem; }
      .btn:hover { background: #1d4ed8; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Transfer to Top Up</h1>
      <div class="amount">NGN \${amount}</div>
      <p style="color: #6b7280; font-size: 0.875rem; margin: 0;">This account is valid for this transaction only.</p>
      <div class="details">
        <div class="detail-row"><span class="label">Bank</span><span class="value">\${bankName}</span></div>
        <div class="detail-row"><span class="label">Account Number</span><span class="value">\${accountNumber}</span></div>
        <div class="detail-row"><span class="label">Account Name</span><span class="value">\${accountName}</span></div>
      </div>
      <p style="color: #4b5563; font-size: 0.875rem;">Make sure you transfer the exact amount within 30 minutes.</p>
      <a href="\${goBackUrl}" class="btn">I have made the transfer</a>
    </div>
  </body>
  </html>\`);
});

/**
 * GET /api/payments/verify
 */
router.get('/verify', async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference || typeof reference !== 'string') return res.status(400).json({ success: false, error: 'Payment reference is required' });

    const cleanReference = String(reference).split('?')[0].split('&')[0].trim();
    const { Payment } = await import('../models');
    const payment = await Payment.findOne({ $or: [{ transactionReference: cleanReference }, { reference: cleanReference }] }).lean();

    if (payment) {
      return res.status(200).json({
        success: true,
        status: payment.status === 'completed' ? 'success' : payment.status,
        amount: payment.amount,
        reference: cleanReference,
        data: payment,
      });
    }

    return res.status(200).json({ success: true, status: 'pending', amount: 0, reference: cleanReference, data: { source: 'not-yet-finished' } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Internal server error', status: 'failed' });
  }
});

/**
 * GET /api/payments/webhook
 */
router.get('/webhook', (_req, res) => {
  return res.status(200).json({ ok: true, message: 'Webhook endpoint is active for PocketFi.' });
});

/**
 * POST /api/payments/webhook
 */
router.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const rawPayload = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
    const pocketfiSignature = req.header('POCKETFI-SIGNATURE') || req.header('HTTP-POCKETFI-SIGNATURE') || '';

    if (!pocketfiSignature) return res.status(400).json({ message: 'Missing PocketFi signature' });

    const expectedHash = createHmac('sha512', POCKETFI_SECRET).update(rawPayload).digest('hex');

    if (pocketfiSignature.toLowerCase() !== expectedHash.toLowerCase()) {
      console.warn('PocketFi webhook permission denied, invalid hash');
    }

    const evt = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? JSON.parse(rawPayload) : req.body;
    const order = evt?.order || {};
    const transaction = evt?.transaction || {};
    const reference = transaction.reference;
    // const amount = Number(order.amount) || Number(evt?.amount) || 0;

    if (!reference) return res.status(400).json({ message: 'No reference' });

    const { Payment, User } = await import('../models');
    
    const existingPayment = await Payment.findOne({ $or: [{ transactionReference: reference }, { reference: reference }] }).exec();

    if (!existingPayment) return res.status(200).json({ message: 'payment not found' });
    if (existingPayment.status === 'completed' || existingPayment.isCredited) return res.status(200).json({ message: 'success' });

    existingPayment.status = 'completed';
    const resolvedUser = await resolveUserRecord(existingPayment.userLocalId, existingPayment.email, String(existingPayment.user));

    if (resolvedUser && !existingPayment.isCredited) {
      await User.findByIdAndUpdate(resolvedUser._id, { $inc: { balance: existingPayment.amount } }, { new: true }).exec();
      existingPayment.isCredited = true;
    }

    await existingPayment.save();
    return res.status(200).json({ message: 'success' });
  } catch (err) {
    console.error('PocketFi Webhook error:', err);
    return res.status(500).json({ message: 'server error' });
  }
});

export default router;
`;

fs.writeFileSync('server/src/routes/payments.ts', fileContent);
