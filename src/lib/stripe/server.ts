import Stripe from "stripe";
import { IS_PAYMENTS_LIVE } from "@/lib/config";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!IS_PAYMENTS_LIVE) {
    throw new Error(
      "Stripe is not enabled. Set NEXT_PUBLIC_IS_PAYMENTS_LIVE=true and STRIPE_SECRET_KEY.",
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      // Pin to whatever the installed Stripe SDK supports.
      apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion,
    });
  }
  return _stripe;
}
