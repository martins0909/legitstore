import express from 'express';
import { randomUUID } from 'crypto';

const router = express.Router();
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
 * ErcasPay Checkout Initialization
 */
router.post('/create-session', async (req, res) => {
  try {
    const { amount, currency, userId, email, callbackUrl, phone } = req.body;

    if (!userId || !email || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields: userId, email, amount' });
    }

    const { User, Payment } = await import('../models');
    let resolvedUser = await resolveUserRecord(userId, email, userId);
    
    if (!resolvedUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const paymentReference = `ERCAS_${Date.now()}_${randomUUID().substring(0, 8)}`;
    const redirectUrl = callbackUrl || process.env.FRONTEND_URL || "https://legitstorez.com";

    const ercasPayload = {
      amount: Number(amount),
      paymentReference: paymentReference,
      paymentMethods: "card,bank-transfer,ussd,qrcode",
      customerName: resolvedUser.name || 'Joy Buy Customer',
      customerEmail: email,
      customerPhoneNumber: phone || resolvedUser.phone || "08000000000",
      currency: "NGN",
      redirectUrl: redirectUrl,
      description: "Wallet Funding",
      metadata: {
        userId: String(resolvedUser._id)
      }
    };

    const ercasSecret = process.env.ERCASPAY_SECRET_KEY?.trim() || "";

    const fetchResponse = await fetch('https://api.ercaspay.com/api/v1/payment/initiate', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ercasSecret}`
      },
      body: JSON.stringify(ercasPayload)
    });

    const responseText = await fetchResponse.text();
    let parsedData;

    try {
      parsedData = JSON.parse(responseText);
    } catch {
      console.error('ErcasPay Invalid Response:', responseText.substring(0, 300));
      return res.status(500).json({ success: false, error: 'Invalid response from ErcasPay gateway.' });
    }

    if (parsedData.requestSuccessful === true && parsedData.responseBody?.checkoutUrl) {
      // Record payment as pending
      await Payment.create({
        user: resolvedUser._id,
        userLocalId: userId,
        email: email,
        amount: Number(amount),
        method: 'ercaspay',
        status: 'pending',
        reference: paymentReference,
        transactionReference: parsedData.responseBody?.transactionReference || paymentReference,
        isCredited: false
      });

      return res.status(200).json({
        success: true,
        checkoutUrl: parsedData.responseBody.checkoutUrl,
        paymentReference: paymentReference,
        transactionReference: parsedData.responseBody?.transactionReference || null
      });
    } else {
      return res.status(400).json({ success: false, error: parsedData.responseMessage || 'Failed to initiate payment on ErcasPay' });
    }
  } catch (error: any) {
    console.error('Error creating payment session:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
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

    return res.status(200).json({ success: true, status: 'pending', amount: 0, reference: cleanReference });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/payments/webhook
 */
router.get('/webhook', (_req, res) => {
  return res.status(200).json({ ok: true, message: 'Webhook endpoint is active for ErcasPay.' });
});

/**
 * POST /api/payments/webhook
 * Handles ErcasPay Webhook Payload
 */
router.post('/webhook', async (req, res) => {
  try {
    const dataObj = req.body || {};
    
    // ErcasPay payload
    const { transaction_reference, payment_reference, status, amount, metadata } = dataObj;

    if (!transaction_reference && !payment_reference) {
      return res.status(400).json({ message: 'No reference found in payload' });
    }

    if (status !== 'SUCCESSFUL') {
      return res.status(200).json({ requestSuccessful: true, responseMessage: 'ignored' });
    }

    const { Payment, User } = await import('../models');

    // Find the pending payment
    let existingPayment = await Payment.findOne({ 
      $or: [
        { transactionReference: transaction_reference }, 
        { reference: payment_reference }
      ] 
    }).exec();

    if (existingPayment) {
      if (existingPayment.status === 'completed' || existingPayment.isCredited) {
        return res.status(200).json({ requestSuccessful: true, responseMessage: 'success' });
      }

      existingPayment.status = 'completed';
      const resolvedUser = await resolveUserRecord(existingPayment.userLocalId, existingPayment.email, String(existingPayment.user));
      
      if (resolvedUser && !existingPayment.isCredited) {
        await User.findByIdAndUpdate(resolvedUser._id, { $inc: { balance: Number(amount) || existingPayment.amount } }).exec();
        existingPayment.isCredited = true;
      }
      
      await existingPayment.save();
      return res.status(200).json({ requestSuccessful: true, responseMessage: 'success' });
    }

    // Unmapped transfer tracking fallback
    if (metadata && metadata.userId) {
       const fallbackUser = await User.findById(metadata.userId).exec();
       if (fallbackUser && amount > 0) {
         await User.findByIdAndUpdate(fallbackUser._id, { $inc: { balance: Number(amount) } }).exec();
         await Payment.create({
            user: fallbackUser._id,
            email: fallbackUser.email,
            amount: Number(amount),
            method: 'ercaspay',
            status: 'completed',
            reference: payment_reference,
            transactionReference: transaction_reference,
            isCredited: true,
         });
         return res.status(200).json({ requestSuccessful: true, responseMessage: 'wallet funded successfully' });
       }
    }

    return res.status(200).json({ requestSuccessful: true, responseMessage: 'success, but unmapped' });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ message: 'server error' });
  }
});

export default router;