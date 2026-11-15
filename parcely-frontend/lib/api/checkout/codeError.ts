import { formatErrors } from "../formatErrors";

export type CodeError = {
    error: string;
    // The address belongs to a Parcely account, so only its owner, signed in, may
    // verify it. The caller answers with a sign-in prompt rather than an error.
    signInRequired?: boolean;
};

// Shared by sendCode and verifyCode: both endpoints run the same account gate and
// answer it with a 403 carrying `detail`, unlike the other 403, which carries `error`.
// Kept out of the 'use server' files, which would publish it as a callable action.
export async function codeErrorFrom(response: Response, fallback: string): Promise<CodeError> {
    const body = await response.json().catch(() => null);
    const signInRequired =
        response.status === 403 && typeof body === "object" && body !== null && "detail" in body;
    return { error: formatErrors(body, fallback), signInRequired };
}
