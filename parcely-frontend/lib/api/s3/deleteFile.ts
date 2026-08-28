import { apiFetch } from "@/lib/api.server";
export async function deleteFile(blob_id: string): Promise<boolean> {
    const res = await apiFetch(`/s3/delete/`, {
        method: 'DELETE',
        body: JSON.stringify({
            blob_id,
        }),
    })

    if (!res.ok) {
        throw new Error(`Failed to delete file: ${res.statusText}`);
    }

    return true;
}