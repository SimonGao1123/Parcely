'use client'
import { useState } from "react"
import { getFileMetadata } from "@/lib/s3_metadata"
import { useApi } from "@/lib/api"
export default function FileUploadTest() {
    const [file, setFile] = useState<File | null>(null)
    const api = useApi()
    const handleFileUpload = async () => {
        if (!file) return
        const metadata = await getFileMetadata(file);
        const res = await api('/s3/presign/', {
            method: 'POST',
            body: JSON.stringify(metadata),
        })
        const data = await res.json();
        console.log(data);

        await fetch(data.upload_url, {
            method: 'PUT',
            body: file,
        })

        await api('/s3/confirm/', {
            method: 'POST',
            body: JSON.stringify({
                blob_id: data.blob_id,
            }),
        })

    }
    
    return (
        <div>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button onClick={handleFileUpload}>Upload</button>
        </div>
    )
}