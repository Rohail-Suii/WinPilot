import { create } from "zustand";

interface SidebarStore {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setMobileOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isCollapsed: false,
  isMobileOpen: false,
  toggle: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
  setMobileOpen: (open) => set({ isMobileOpen: open }),
}));

interface ExtensionStore {
  isConnected: boolean;
  currentTask: string | null;
  lastTaskError: string | null;
  aiQuotaStatus: {
    provider?: string;
    model?: string;
    remaining?: number;
    dailyLimit?: number;
    retryAfterSeconds?: number;
  } | null;
  setConnected: (connected: boolean) => void;
  setCurrentTask: (task: string | null) => void;
  setLastTaskError: (error: string | null) => void;
  setAiQuotaStatus: (status: {
    provider?: string;
    model?: string;
    remaining?: number;
    dailyLimit?: number;
    retryAfterSeconds?: number;
  } | null) => void;
}

export const useExtensionStore = create<ExtensionStore>((set) => ({
  isConnected: false,
  currentTask: null,
  lastTaskError: null,
  aiQuotaStatus: null,
  setConnected: (connected) => set({ isConnected: connected }),
  setCurrentTask: (task) => set({ currentTask: task }),
  setLastTaskError: (error) => set({ lastTaskError: error }),
  setAiQuotaStatus: (status) => set({ aiQuotaStatus: status }),
}));

interface NotificationItem {
  _id: string;
  type: string;
  title: string;
  message: string;
  module?: string;
  read: boolean;
  actionUrl?: string;
  createdAt: string;
}

interface NotificationStore {
  notifications: NotificationItem[];
  unreadCount: number;
  isOpen: boolean;
  setNotifications: (notifications: NotificationItem[]) => void;
  setUnreadCount: (count: number) => void;
  setOpen: (open: boolean) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  addNotification: (notification: NotificationItem) => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (count) => set({ unreadCount: count }),
  setOpen: (open) => set({ isOpen: open }),
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n._id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.read ? 0 : 1),
    })),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n._id !== id),
    })),
}));
