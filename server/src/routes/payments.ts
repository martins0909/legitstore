import express from 'express';
import Ercaspay from '@capitalsage/ercaspay-nodejs';

const router = express.Router();

// Validate Ercaspay configuration
const ECRS_SECRET_KEY = process.env.ECRS_SECRET_KEY;
if (!ECRS_SECRET_KEY || ECRS_SECRET_KEY.trim() === '') {
  console.error('FATAL: ECRS_SECRET_KEY is not set in environment variables!');
}

// Initialize Ercaspay client - MUST use baseURL (uppercase) not baseUrl
const ercaspay = new Ercaspay({
  baseURL: 'https://api.ercaspay.com',
  secretKey: ECRS_SECRET_KEY || '',
});

const normalizeGatewayReference = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const cleaned = value.split('?')[0].split('&')[0].trim();
  return cleaned.length > 0 ? cleaned : undefined;
};

const resolveGatewayReference = (payload: Record<string, any>): string | undefined => {
  return normalizeGatewayReference(
    payload.transactionReference
      || payload.transactionRef
      || payload.reference
      || payload.paymentReference
      || payload?.data?.transactionReference
      || payload?.data?.transactionRef
      || payload?.data?.reference
      || payload?.data?.paymentReference,
  );
};

const resolveCustomerEmail = (payload: Record<string, any>): string | undefined => {
  const email = payload.customerEmail || payload?.data?.customer?.email || payload?.data?.customerEmail;
  return typeof email === 'string' && email.trim().length > 0 ? email.trim() : undefined;
};

async function resolveUserRecord(userId?: string, email?: string, fallbackLocalId?: string) {
  const { User } = await import('../models');

  for (const candidate of [userId, fallbackLocalId]) {
    if (!candidate || typeof candidate !== 'string') {
      continue;
    }

    try {
      const foundUser = await User.findById(candidate).exec();
      if (foundUser) {
        return foundUser;
      }
    } catch {
      // Ignore malformed ids and continue to other strategies.
    }
  }

  if (email) {
    return User.findOne({ email }).exec();
  }

  return null;
}

/**
 * POST /api/payments/create-session
 * Creates a new payment checkout session with Ercaspay
 */
router.post('/create-session', async (req, res) => {
  try {
    const { amount, currency, userId, email, callbackUrl } = req.body;

    // Validate required fields
    if (!amount || !currency || !userId || !email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: amount, currency, userId, email',
      });
    }

    // Generate unique payment reference
    const paymentReference = ercaspay.generatePaymentReferenceUuid();

    // Build redirect URL to return customer to /shop with our paymentReference in query
    const baseRedirect = (callbackUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/shop`).toString();
    const redirectUrlWithRef = baseRedirect.includes('?')
      ? `${baseRedirect}&pref=${encodeURIComponent(paymentReference)}`
      : `${baseRedirect}?pref=${encodeURIComponent(paymentReference)}`;

    // Prepare transaction data
    const transactionData = {
      amount: String(amount),
      paymentReference,
      paymentMethods: 'card,bank-transfer,ussd',
      customerName: 'Customer', // You can enhance this by getting actual customer name
      customerEmail: email,
      currency: currency.toUpperCase(),
      customerPhoneNumber: '', // Optional - can be added to frontend form
      redirectUrl: redirectUrlWithRef,
      description: `Wallet top-up for user ${userId}`,
      feeBearer: 'merchant',
      metadata: {
        userId,
        type: 'wallet-topup',
      },
    };

    // Optional: light debug for transaction (avoid logging secrets)
    console.log('Ercaspay initiateTransaction called', {
      paymentReference,
      amount: String(amount),
      currency: currency.toUpperCase(),
      hasSecretKey: Boolean(ECRS_SECRET_KEY && ECRS_SECRET_KEY.length > 0)
    });

  // Initiate transaction with Ercaspay
  const response = await ercaspay.initiateTransaction(transactionData);

    // Check if transaction was successful
    if (response.requestSuccessful && response.responseBody) {
      const { checkoutUrl } = response.responseBody;
      
      // Log full response to see what Ercaspay returns
      console.log('Ercaspay response body:', JSON.stringify(response.responseBody, null, 2));
      
      // Ercaspay verifyTransaction expects the paymentReference we sent, not a separate transactionReference
      // We'll return our paymentReference for verification
      const transactionReference = response.responseBody.transactionReference
        || response.responseBody.transactionRef
        || response.responseBody.reference
        || null;

      // Try to record a pending payment in DB (best-effort; don't block response)
      try {
        const { Payment } = await import('../models');
        const resolvedUser = await resolveUserRecord(userId, email, userId);
        await Payment.create({
          user: resolvedUser?._id,
          userLocalId: (transactionData as any).metadata?.userId,
          email: transactionData.customerEmail,
          amount: Number(transactionData.amount) || 0,
          method: 'ercaspay',
          status: 'pending',
          reference: paymentReference,
          transactionReference: transactionReference || undefined,
          isCredited: false,
        });
      } catch (e) {
        console.warn('Payment DB record (pending) failed:', (e as Error).message);
      }

      return res.status(200).json({
        success: true,
        checkoutUrl,
        paymentReference, // our internally generated UUID
        transactionReference, // gateway provided reference for verification
      });
    } else {
      return res.status(400).json({
        success: false,
        error: response.responseMessage || 'Failed to create payment session',
      });
    }
  } catch (error: any) {
    console.error('Error creating payment session:', error);
    console.error('Error details:', {
      message: error.message,
      responseData: error.responseData,
      stack: error.stack?.split('\n').slice(0, 5).join('\n')
    });
    return res.status(500).json({
      success: false,
      error: error.responseData?.responseMessage || error.message || 'Internal server error',
    });
  }
});

/**
 * GET /api/payments/verify
 * Verifies a payment transaction status
 */
router.get('/verify', async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference || typeof reference !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Payment reference is required',
      });
    }

    // Sanitize reference in case provider appended their own query after our value
    const cleanReference = String(reference).split('?')[0].split('&')[0].trim();

    console.log('=== Verify Payment ===');
    console.log('Verifying reference:', cleanReference);

  // Verify transaction with Ercaspay
  const response = await ercaspay.verifyTransaction(cleanReference);

    console.log('Ercaspay verify response:', JSON.stringify({
      requestSuccessful: response.requestSuccessful,
      responseCode: response.responseCode,
      responseMessage: response.responseMessage,
      responseBody: response.responseBody,
    }, null, 2));

    // Check verification response
    if (response.requestSuccessful && response.responseBody) {
      const transactionData = response.responseBody;

      // Map Ercaspay response codes to our status
      let status = 'pending';
      if (response.responseCode === 'success') {
        status = 'success';
      } else if (response.responseCode === 'failed') {
        status = 'failed';
      }

      return res.status(200).json({
        success: true,
        status,
        amount: transactionData.amount || 0,
  reference: cleanReference,
        data: transactionData,
      });
    } else {
      console.log('Ercaspay verify failed, checking DB fallback...');
      // Fallback: if gateway says not found, check DB if webhook already marked it completed
      try {
        const { Payment } = await import('../models');
        const paid = await Payment.findOne({
          $or: [{ transactionReference: cleanReference }, { reference: cleanReference }],
          status: 'completed',
        }).lean();
        if (paid) {
          console.log('Found completed payment in DB:', paid._id);
          return res.status(200).json({
            success: true,
            status: 'success',
            amount: paid.amount,
            reference: cleanReference,
            data: { source: 'webhook-cache' },
          });
        } else {
          console.log('No completed payment found in DB for reference:', reference);
        }
      } catch (e) {
        console.warn('DB lookup fallback failed:', (e as Error).message);
      }

      return res.status(400).json({
        success: false,
        error: response.responseMessage || 'Failed to verify payment',
        status: 'failed',
      });
    }
  } catch (error: any) {
    console.error('Error verifying payment:', error);
    return res.status(500).json({
      success: false,
      error: error.responseData?.responseMessage || error.message || 'Internal server error',
      status: 'failed',
    });
  }
});

/**
 * GET /api/payments/webhook
 * Browser-friendly health response for the webhook endpoint
 */
router.get('/webhook', (_req, res) => {
  return res.status(200).json({
    ok: true,
    message: 'Webhook endpoint is active. Ercaspay should send POST requests to this URL.',
  });
});

/**
 * POST /api/payments/webhook
 * Ercaspay webhook endpoint to receive transaction updates
 * Note: For production, verify signatures if the provider supports it.
 */
router.post('/webhook', async (req, res) => {
  try {
    const evt = req.body || {};
    const reference = resolveGatewayReference(evt);
    const metadata = evt.metadata || evt?.data?.metadata || {};
    const email = resolveCustomerEmail(evt);

    if (!reference) {
      console.warn('Webhook without reference:', evt);
      return res.status(200).json({ received: true });
    }

    // Confirm with gateway to avoid spoofing
    const verifyResp = await ercaspay.verifyTransaction(reference);
    if (verifyResp.requestSuccessful && verifyResp.responseBody) {
      const code = verifyResp.responseCode;
      const success = code === 'success';
      const responseBody = verifyResp.responseBody as Record<string, any>;
      const amt = Number(responseBody.amount || 0);
      const paymentReference = normalizeGatewayReference(responseBody.paymentReference || responseBody.reference || reference);
      const transactionReference = normalizeGatewayReference(
        responseBody.transactionReference || responseBody.transactionRef || reference,
      );

      try {
        const { Payment, User } = await import('../models');
        const existingPayment = await Payment.findOne({
          $or: [
            { transactionReference: transactionReference },
            { reference: transactionReference },
            { transactionReference: paymentReference },
            { reference: paymentReference },
          ],
        }).exec();

        const resolvedUser = await resolveUserRecord(
          metadata?.userId,
          email,
          existingPayment?.userLocalId,
        );

        const payment = existingPayment || new Payment({
          method: 'ercaspay',
          status: 'pending',
          isCredited: false,
        });

        payment.user = resolvedUser?._id;
        payment.userLocalId = metadata?.userId || payment.userLocalId;
        payment.email = email || payment.email;
        payment.amount = isNaN(amt) ? payment.amount || 0 : amt;
        payment.method = 'ercaspay';
        payment.status = success ? 'completed' : 'failed';
        payment.transactionReference = transactionReference || payment.transactionReference;
        payment.reference = paymentReference || payment.reference;

        if (success && resolvedUser && !payment.isCredited) {
          await User.findByIdAndUpdate(
            resolvedUser._id,
            { $inc: { balance: payment.amount } },
            { new: true },
          ).exec();
          payment.isCredited = true;
          console.log('Webhook credited wallet', {
            userId: String(resolvedUser._id),
            amount: payment.amount,
            reference: payment.reference,
            transactionReference: payment.transactionReference,
          });
        }

        await payment.save();
      } catch (e) {
        console.error('Failed to upsert Payment from webhook:', (e as Error).message);
      }
    } else {
      console.warn('Gateway verification failed in webhook:', verifyResp.responseMessage);
    }

    // Always acknowledge to prevent retries storms; adjust if provider expects different codes
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ received: true });
  }
});

/**
 * GET /api/payments/status/:reference
 * Fetches detailed transaction status (alternative to verify)
 */
router.get('/status/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        error: 'Payment reference is required',
      });
    }

    // Fetch transaction details
    const response = await ercaspay.fetchTransactionDetails(reference);

    if (response.requestSuccessful && response.responseBody) {
      return res.status(200).json({
        success: true,
        data: response.responseBody,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: response.responseMessage || 'Failed to fetch transaction status',
      });
    }
  } catch (error: any) {
    console.error('Error fetching transaction status:', error);
    return res.status(500).json({
      success: false,
      error: error.responseData?.responseMessage || error.message || 'Internal server error',
    });
  }
});

export default router;
