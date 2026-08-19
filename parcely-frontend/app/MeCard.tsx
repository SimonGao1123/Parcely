'use client'

import { useApi } from '@/lib/api'
import { useEffect, useState } from 'react'
import { User } from '@/types/user'

export default function MeCard() {
    const api = useApi()

    const [user, setUser] = useState<User | null>(null)

    useEffect(() => {
        api('/accounts/me/').then(response => response.json()).then(data => {
            setUser(data)
        }).catch(error => {
            setUser(null)
        })
    }, [])
    console.log(user)

    return (
        <div>
            <h1>{user?.first_name} {user?.last_name}</h1>
            <p>{user?.email}</p>
            <img src={user?.profile_picture} alt="Profile Picture" />
        </div>
    )
}