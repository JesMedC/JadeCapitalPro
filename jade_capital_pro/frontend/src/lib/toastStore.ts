import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export type Toast = {
    id: string;
    type: ToastType;
    title?: string;
    message: string;
    createdAt: number;
};

type ToastInput = Omit<Toast, 'id' | 'createdAt'> & { timeoutMs?: number };

type ToastState = {
    toasts: Toast[];
    push: (toast: ToastInput) => void;
    remove: (id: string) => void;
    clear: () => void;
};

const makeId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const useToastStore = create<ToastState>((set, get) => ({
    toasts: [],
    push: (input) => {
        const id = makeId();
        const toast: Toast = {
            id,
            type: input.type,
            title: input.title,
            message: input.message,
            createdAt: Date.now(),
        };

        set((s) => ({ toasts: [toast, ...s.toasts].slice(0, 5) }));

        const timeoutMs = input.timeoutMs ?? (input.type === 'error' ? 8000 : 4500);
        window.setTimeout(() => get().remove(id), timeoutMs);
    },
    remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    clear: () => set({ toasts: [] }),
}));
