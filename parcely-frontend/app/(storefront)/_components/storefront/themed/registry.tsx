import type { Theme } from "@/types/storefront";
import type { ThemedHeaderProps, ThemedNavbarProps } from "./types";
import { ArtistHeader, ArtistNavbar } from "./artist";
import { TimelessNavbar } from "./timeless";
import { ContemporaryHeader, ContemporaryNavbar } from "./contemporary";
import { MinimalistHeader, MinimalistNavbar } from "./minimalist";
import { ProfessionalNavbar } from "./professional";

// Dispatch happens in JSX rather than through a lookup map — resolving a
// component into a variable during render trips react-hooks/static-components.
// Adding a theme is one case per switch.

export function ThemedNavbar({ theme, ...props }: ThemedNavbarProps & { theme: Theme }) {
    switch (theme) {
        case "timeless":
            return <TimelessNavbar {...props} />;
        case "contemporary":
            return <ContemporaryNavbar {...props} />;
        case "minimalist":
            return <MinimalistNavbar {...props} />;
        case "professional":
            return <ProfessionalNavbar {...props} />;
        case "artist":
        default:
            return <ArtistNavbar {...props} />;
    }
}

export function ThemedHeader({ theme, ...props }: ThemedHeaderProps & { theme: Theme }) {
    switch (theme) {
        // no header — these themes fold the banner into the navbar instead
        case "timeless":
        case "professional":
            return null;
        case "contemporary":
            return <ContemporaryHeader {...props} />;
        case "minimalist":
            return <MinimalistHeader {...props} />;
        case "artist":
        default:
            return <ArtistHeader {...props} />;
    }
}
