// Mirrors DRF's PageNumberPagination envelope (core/settings.py REST_FRAMEWORK).
export type Paginated<T> = {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
};
