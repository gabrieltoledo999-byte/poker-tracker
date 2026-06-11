const DEFAULT_ICON = "/android-icon-192x192.png";
const DEFAULT_BADGE = "/android-icon-96x96.png";

let permissionPromptRequested = false;

export type BrowserNotificationPayload = {
  title: string;
  body?: string;
  tag?: string;
  route?: string;
  icon?: string;
};

function canUseNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function ensureBrowserNotificationPermission(requestIfNeeded = false): Promise<NotificationPermission | "unsupported"> {
  if (!canUseNotifications()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  if (!requestIfNeeded || permissionPromptRequested) return Notification.permission;

  permissionPromptRequested = true;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showBrowserNotification(payload: BrowserNotificationPayload): Promise<boolean> {
  if (!canUseNotifications()) return false;
  if (Notification.permission !== "granted") return false;

  const options: NotificationOptions = {
    body: payload.body,
    icon: payload.icon || DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    tag: payload.tag,
    renotify: true,
    data: {
      route: payload.route,
    },
  };

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(payload.title, options);
        return true;
      }
    }

    const notification = new Notification(payload.title, options);
    if (payload.route) {
      notification.onclick = () => {
        try {
          window.focus();
          window.location.href = payload.route as string;
        } catch {
          // noop
        }
      };
    }

    return true;
  } catch {
    return false;
  }
}
