import { useState, useCallback, useRef, useEffect } from "react";
import type { MessageNotification } from "@/components/MessageNotificationPopup";

export function useMessageNotifications() {
  const [activeNotification, setActiveNotification] = useState<MessageNotification | null>(null);
  const notificationQueueRef = useRef<MessageNotification[]>([]);
  const isProcessingRef = useRef(false);

  const dismissNotification = useCallback(() => {
    setActiveNotification(null);
    isProcessingRef.current = false;

    // Process next in queue after current is gone
    if (notificationQueueRef.current.length > 0) {
      const next = notificationQueueRef.current.shift();
      if (next) {
        showNotification(next);
      }
    }
  }, []);

  const showNotification = useCallback((notification: MessageNotification) => {
    if (isProcessingRef.current) {
      notificationQueueRef.current.push(notification);
    } else {
      isProcessingRef.current = true;
      setActiveNotification(notification);
    }
  }, []);

  return {
    activeNotification,
    showNotification,
    dismissNotification,
  };
}
