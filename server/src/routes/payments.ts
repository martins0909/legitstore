import express from 'express';
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
 * We piggyback on this endpoint to provide the Virtual Account Funding
 */
router.post('/create-session', async (req, res) => {
  try {
      const { amount, currency, userId, email, callbackUrl, phone } = req.body;
  
      if (!userId || !email) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, email',
        });
      }
  
      const { User } = await import('../models');
      let resolvedUser = await resolveUserRecord(userId, email, userId);
      
      if (!resolvedUser) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const finalPhone = resolvedUser.phone || phone;
    // Return existing static account if already created
    if (resolvedUser.pocketfiVirtualAccount && resolvedUser.pocketfiVirtualAccount.accountNumber) {
      const q = new URLSearchParams({
        accountNumber: resolvedUser.pocketfiVirtualAccount.accountNumber,
        bankName: resolvedUser.pocketfiVirtualAccount.bankName,
        accountName: resolvedUser.pocketfiVirtualAccount.accountName || 'Joy Buy Plaza',
        amount: amount || '0',
        redirect: callbackUrl || ''
      });
      const checkoutUrl = `${req.protocol}://${req.get('host')}/api/payments/pocketfi-checkout?${q.toString()}`;
      return res.status(200).json({ 
        success: true, 
        checkoutUrl,
        paymentReference: 'STATIC_VA_' + resolvedUser.pocketfiVirtualAccount.accountNumber,
        transactionReference: 'STATIC_VA_' + resolvedUser.pocketfiVirtualAccount.accountNumber
      });
    }

    // Ensure we have a valid 11-digit phone number before creating VA
    if (!finalPhone || finalPhone.length !== 11) {
      return res.status(400).json({ success: false, error: 'Phone number is required and must be exactly 11 digits.' });
    }

    // Save it to user profile if it was missing
    if (!resolvedUser.phone) {
      resolvedUser.phone = finalPhone;
      await resolvedUser.save();
    }

    // Create a new static Virtual Account for this user
    const transactionData = {
      email: email,
      first_name: resolvedUser.name?.split(' ')[0] || 'Customer',
      last_name: resolvedUser.name?.split(' ')[1] || 'User',
      phone: finalPhone,
      bank: 'palmpay', // Explicitly use palmpay as tested
      businessId: process.env.POCKETFI_BUSINESS_ID || '29793',
      metadata: { userId }
    };

    const fetchResponse = await fetch('https://api.pocketfi.ng/api/v1/virtual-accounts/create', {
      method: 'POST',
      headers: {
          'Authorization': `Bearer ${POCKETFI_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transactionData),
      });

      const responseText = await fetchResponse.text();      let parsedData;
      
      try {
        parsedData = JSON.parse(responseText);
      } catch {
        console.error('PocketFi Invalid Response:', responseText.substring(0, 300));
        return res.status(500).json({ success: false, error: 'Invalid response from gateway.' });
      }
    if (parsedData.status && parsedData.banks && parsedData.banks.length > 0) {
      const bankInfo = parsedData.banks[0];
      
      resolvedUser.pocketfiVirtualAccount = {
        accountNumber: bankInfo.accountNumber,
        bankName: bankInfo.bankName,
        accountName: bankInfo.accountName,
      };
      await resolvedUser.save();

      const q = new URLSearchParams({
        accountNumber: bankInfo.accountNumber,
        bankName: bankInfo.bankName,
        accountName: bankInfo.accountName || 'Joy Buy Plaza',
        amount: amount || '0',
        redirect: callbackUrl || ''
      });
      const checkoutUrl = `${req.protocol}://${req.get('host')}/api/payments/pocketfi-checkout?${q.toString()}`;

      return res.status(200).json({ 
        success: true, 
        checkoutUrl,
        paymentReference: 'STATIC_VA_' + bankInfo.accountNumber,
        transactionReference: 'STATIC_VA_' + bankInfo.accountNumber
      });
    } else {
      return res.status(400).json({ success: false, error: parsedData.message || 'Failed to create virtual account' });
    }
  } catch (error: any) {
    console.error('Error creating virtual account:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/payments/pocketfi-checkout
 */
router.get('/pocketfi-checkout', (req, res) => {
  const { accountNumber, bankName, accountName, amount, redirect } = req.query;
  const goBackUrl = redirect || '/';

  res.send(`<!DOCTYPE html>
  <html>
  <head>
    <title>Fund Wallet</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #f9fafb; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
      .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 400px; width: 100%; text-align: center; }
      h1 { color: #111827; font-size: 1.5rem; margin-bottom: 0.5rem; }
      .subtitle { color: #6b7280; font-size: 0.875rem; margin-bottom: 1.5rem; }
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
      <h1>Your Funding Account</h1>
      <p class="subtitle">Transfer to this account to automatically fund your wallet. This account is dedicated to you and can be reused anytime.</p>
      
      <div class="details">
        <div class="detail-row"><span class="label">Bank</span><span class="value">${bankName}</span></div>
        <div class="detail-row"><span class="label">Account Number</span><span class="value">${accountNumber}</span></div>
        <div class="detail-row"><span class="label">Account Name</span><span class="value">${accountName}</span></div>
      </div>
      <p style="color: #4b5563; font-size: 0.875rem;">Funds are credited automatically. You can go back whenever you are done.</p>
      <a href="${goBackUrl}" class="btn">Return to Shop</a>
    </div>
  </body>
  </html>`);
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
    console.log('Pocketfi Webhook Received:', JSON.stringify(evt, null, 2));

    const dataObj = evt?.data || evt || {};
    const order = dataObj.order || {};
    const transaction = dataObj.transaction || {};
    const customer = dataObj.customer || {};
    const reference = transaction.reference;
    const amount = Number(order.amount) || Number(dataObj.amount) || 0;

    if (!reference) return res.status(400).json({ message: 'No reference' });

    const { Payment, User } = await import('../models');
    
    // First, try to find an existing payment
    let existingPayment = await Payment.findOne({ $or: [{ transactionReference: reference }, { reference: reference }] }).exec();

    if (existingPayment) {
      if (existingPayment.status === 'completed' || existingPayment.isCredited) return res.status(200).json({ message: 'success' });
      existingPayment.status = 'completed';
      
      const resolvedUser = await resolveUserRecord(existingPayment.userLocalId, existingPayment.email, String(existingPayment.user));
      if (resolvedUser && !existingPayment.isCredited) {
        await User.findByIdAndUpdate(resolvedUser._id, { $inc: { balance: amount || existingPayment.amount } }, { new: true }).exec();
        existingPayment.isCredited = true;
      }
      await existingPayment.save();
      return res.status(200).json({ message: 'success' });
    }

    // It's a static virtual account transfer.
    let targetUser = null;

    // Try finding via account_number in the webhook if pocketfi passes it
    const possibleStrings = [
      dataObj.account_number, dataObj.virtual_account,
      order.description, dataObj.description,
      customer.email
    ].filter(Boolean).join(' ');

    const acctMatch = possibleStrings.match(/(\d{10})/);
    if (acctMatch) {
      targetUser = await User.findOne({ 'pocketfiVirtualAccount.accountNumber': acctMatch[1] }).exec();
    }
    
    // Check by email
    if (!targetUser && customer.email) {
      targetUser = await User.findOne({ email: customer.email }).exec();
    }
    
    if (targetUser && amount > 0) {
      // Top up the balance
      await User.findByIdAndUpdate(targetUser._id, { $inc: { balance: amount } }, { new: true }).exec();
      
      // Record the payment
      await Payment.create({
        user: targetUser._id,
        email: targetUser.email,
        amount: amount,
        method: 'pocketfi',
        status: 'completed',
        reference: reference, 
        transactionReference: reference,
        isCredited: true,
      });

      return res.status(200).json({ message: 'wallet funded successfully' });
    }

    console.warn('PocketFi webhook unmapped transfer:', reference);
    return res.status(200).json({ message: 'success, but Unmapped or Ignored' });
  } catch (err) {
    console.error('PocketFi Webhook error:', err);
    return res.status(500).json({ message: 'server error' });
  }
});

export default router;
