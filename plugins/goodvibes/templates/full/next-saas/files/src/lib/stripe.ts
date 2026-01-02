import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

export async function createCheckoutSession({
  userId,
  email,
  priceId,
}: {
  userId: string;
  email: string;
  priceId: string;
}) {
  const session = await stripe.checkout.sessions.create({
    customer_email: email,
    metadata: { userId },
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.NEXTAUTH_URL}/dashboard?success=true`,
    cancel_url: `${process.env.NEXTAUTH_URL}/pricing?canceled=true`,
  });

  return session;
}

export async function createBillingPortalSession(customerId: string) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXTAUTH_URL}/dashboard`,
  });

  return session;
}
