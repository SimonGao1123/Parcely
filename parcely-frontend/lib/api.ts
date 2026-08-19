// wrapper around fetch to add auth header for clerk, if logged into clerk

'use client'

import { useAuth } from '@clerk/nextjs'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL

// hook returning fetch function that auto attaches clerk jwt must be called in a client component

export function useApi() {
    const { getToken } = useAuth()

    return async (path: string, init: RequestInit = {}) => {
        const token = await getToken()

        return fetch(`${BACKEND_URL}${path}`, {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...init.headers,
            }
        })
    }
}