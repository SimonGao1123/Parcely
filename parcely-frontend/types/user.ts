// Mirrors AppUserSerializer — clerk_id and username are deliberately not exposed.
export type User = {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    profile_picture: string | null;
    created_at: string;
    updated_at: string;
};
