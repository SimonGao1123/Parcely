'use server'

import { refresh } from 'next/cache';
import { cookies } from 'next/headers';
import {errorFrom} from '../formatErrors';
import { apiFetch } from "../../api.server";
import type { Cart } from "@/types/cart";
type CreateCartInput = {
    plan_id: number;
    quantity: number;
}
// Errors come back as data rather than thrown: Next redacts anything thrown
// inside a Server Action before it reaches the browser, so a thrown message
// would reach the shopper as a generic digest.
export const createCartItem = async (
    storefrontSlug: string,
    input: CreateCartInput,
): Promise<Cart | { error: string }> => {
    const store = await cookies()
    const token = store.get('public_session_id')?.value

    const response = await apiFetch(`/storefronts/${storefrontSlug}/cart/items/create/`, {
        method: 'POST',
        
        body: JSON.stringify(input),

        ...(token ? {headers: { 'X-Public-Cart-ID': token }} : {}),
    });
    if (!response.ok) {
        return { error: await errorFrom(response, 'Failed to create cart item') };
    }

    const cart: Cart = await response.json();

    // Only ever written, never cleared. A null id means this storefront's cart
    // was claimed on sign-in, but the same session still owns carts at other
    // storefronts — deleting the cookie here would orphan every one of them.
    if (cart.public_session_id) {
        store.set('public_session_id', cart.public_session_id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 30,
            sameSite: 'lax',
            path: '/',
        });
    }

    // Setting a cookie already re-renders, but only the first anonymous add gets
    // an id back — every later add, and every signed-in one, needs this for the
    // navbar badge to follow.
    refresh();

    return cart;
}