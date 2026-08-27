import {auth} from "@clerk/nextjs/server";

export async function apiFetch(path: string, init: RequestInit = {}) {
    const {getToken} = await auth();
    const token = await getToken();

    return fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...init.headers,
        }
    })
}