'use client';

import { useApi } from "@/lib/api";
import { getFileMetadata, PresignFileInput } from "@/lib/s3_metadata";
import { useState } from "react";

// A hook rather than a plain function: the whole flow has to run in the browser
// (getFileMetadata needs the DOM, and the file itself only exists client-side),
// so the Clerk token has to come from useApi rather than the server helper.
export function useUploadFile() {
    const api = useApi();
    const [uploading, setUploading] = useState(false);

    const upload = async (file: File): Promise<number> => {
        setUploading(true);
        let metadata: PresignFileInput;
        try {
            metadata = await getFileMetadata(file);
        } catch (error) {
            setUploading(false);
            throw new Error(`Failed to get file metadata: ${error}`);
        }

        const res = await api(`/s3/presign/`, {
            method: 'POST',
            body: JSON.stringify(metadata),
        })

        if (!res.ok) {
            setUploading(false);
            throw new Error(`Failed to presign upload: ${res.statusText}`);
        }

        const { blob_id, upload_url } = await res.json();

        const upload_s3 = await fetch(upload_url, {
            method: 'PUT',
            body: file,
            headers: {
                // the presigned URL is signed with ContentType, and /s3/confirm/
                // rejects a mismatch, so this header is not optional
                'Content-Type': metadata.mime,
            },
        })

        if (!upload_s3.ok) {
            setUploading(false);
            throw new Error(`Failed to upload file to S3: ${upload_s3.statusText}`);
        }

        const confirm_res = await api(`/s3/confirm/`, {
            method: 'POST',
            body: JSON.stringify({
                blob_id,
            }),
        })

        if (!confirm_res.ok) {
            setUploading(false);
            throw new Error(`Failed to confirm upload: ${confirm_res.statusText}`);
        }

        setUploading(false);
        return blob_id;
    };

    return { upload, uploading };
}
