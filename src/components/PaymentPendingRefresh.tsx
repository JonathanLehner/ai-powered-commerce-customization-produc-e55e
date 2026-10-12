"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-reads the page while a payment is being confirmed, so the shopper sees it
 * land without reloading. It stops after a minute; the page stops rendering it
 * as soon as the payment is confirmed.
 */
export function PaymentPendingRefresh() {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 20) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
