'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 2000;
const GIVE_UP_MS = 30_000;

// The buyer usually lands back here before Stripe's webhook has reached us, so
// the page re-asks the server until the purchase is recorded. A page that becomes
// fulfilled stops rendering this, which unmounts it and ends the polling.
export default function PendingRefresher() {
    const router = useRouter();
    const [gaveUp, setGaveUp] = useState(false);

    useEffect(() => {
        const started = Date.now();
        const timer = setInterval(() => {
            if (Date.now() - started > GIVE_UP_MS) {
                clearInterval(timer);
                setGaveUp(true);
                return;
            }
            router.refresh();
        }, INTERVAL_MS);
        return () => clearInterval(timer);
    }, [router]);

    return gaveUp ? (
        <p className="text-sm opacity-70">
            This is taking longer than usual. Your payment went through — it will appear in
            Purchases shortly.
        </p>
    ) : (
        <p className="text-sm opacity-70">Confirming your payment…</p>
    );
}
