'use client';

import { useEffect, useRef, useState } from "react";

// Reveals the navbar when the user scrolls up, sits near the top of the page,
// or moves the pointer into the top edge of the viewport.
export function useNavbarVisibility(topZone = 60) {
    const [visible, setVisible] = useState(true);
    const lastY = useRef(0);

    useEffect(() => {
        lastY.current = window.scrollY;
        let raf = 0;

        const onScroll = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                const y = window.scrollY;
                // 4px deadzone, otherwise trackpad jitter flickers the bar
                if (y <= topZone || y < lastY.current - 4) setVisible(true);
                else if (y > lastY.current + 4) setVisible(false);
                lastY.current = y;
            });
        };

        const onMove = (e: MouseEvent) => {
            if (e.clientY <= topZone) setVisible(true);
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("mousemove", onMove, { passive: true });

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("mousemove", onMove);
        };
    }, [topZone]);

    return visible;
}
