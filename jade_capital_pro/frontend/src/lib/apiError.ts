type AnyRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is AnyRecord =>
    typeof v === 'object' && v !== null;

export const getApiErrorMessage = (err: unknown, fallback = 'Error al conectar con el servidor') => {
    if (!isRecord(err)) return fallback;

    // Axios-style shape: err.response.data
    const response = err['response'];
    if (isRecord(response)) {
        const data = response['data'];
        if (isRecord(data)) {
            const detail = data['detail'];
            if (typeof detail === 'string' && detail.trim()) return detail;
            const error = data['error'];
            if (typeof error === 'string' && error.trim()) return error;
            const message = data['message'];
            if (typeof message === 'string' && message.trim()) return message;
        }
    }

    const message = err['message'];
    if (typeof message === 'string' && message.trim()) return message;

    return fallback;
};
