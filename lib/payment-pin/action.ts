export const PAYMENT_PIN_ACTIONS = ["withdraw", "supply", "redeem"] as const;

export type PaymentPinAction = (typeof PAYMENT_PIN_ACTIONS)[number];

export function isPaymentPinAction(value: unknown): value is PaymentPinAction {
  return typeof value === "string" && (PAYMENT_PIN_ACTIONS as readonly string[]).includes(value);
}

export function isSixDigitPin(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}
