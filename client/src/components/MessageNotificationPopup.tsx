import { useEffect, useState } from "react";
import { X, MessageCircle, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MessageNotification {
  id: string;
  friendName: string;
  friendAvatar: string;
  friendId: number;
  message: string;
  timestamp: number;
  unreadCount?: number;
}

interface MessageNotificationPopupProps {
  notification: MessageNotification | null;
  onDismiss: () => void;
  onNavigate: (friendId: number) => void;
  autoHideDuration?: number;
}

export function MessageNotificationPopup({
  notification,
  onDismiss,
  onNavigate,
  autoHideDuration = 8000,
}: MessageNotificationPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [soundPlayed, setSoundPlayed] = useState(false);

  useEffect(() => {
    if (notification) {
      setIsVisible(true);
      setSoundPlayed(false);

      // Play sound quando notificação aparece
      if (!soundPlayed) {
        playNotificationSound();
        setSoundPlayed(true);
      }

      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onDismiss(), 300);
      }, autoHideDuration);

      return () => clearTimeout(timer);
    }
  }, [notification, onDismiss, autoHideDuration, soundPlayed]);

  if (!notification) return null;

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => onDismiss(), 300);
  };

  const handleNavigate = () => {
    onNavigate(notification.friendId);
    handleDismiss();
  };

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 transform transition-all duration-300 ease-out",
        isVisible
          ? "translate-x-0 opacity-100"
          : "translate-x-[400px] opacity-0"
      )}
    >
      {/* Background blur effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-lg blur-xl -z-10" />

      {/* Main notification card */}
      <div className="bg-card border border-primary/30 rounded-lg shadow-2xl overflow-hidden w-80 max-w-[calc(100vw-2rem)]">
        {/* Header with color indicator */}
        <div className="h-1 bg-gradient-to-r from-primary via-primary/80 to-primary/60" />

        <div className="p-4 space-y-3">
          {/* Top section: avatar + name + close */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative flex-shrink-0">
                <img
                  src={notification.friendAvatar}
                  alt={notification.friendName}
                  className="h-12 w-12 rounded-full object-cover border-2 border-primary/30"
                />
                <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-green-500 rounded-full border-2 border-card animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">
                  {notification.friendName}
                </p>
                <p className="text-xs text-muted-foreground">Está online agora</p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Message preview */}
          <div className="bg-muted/40 rounded-md p-3 border border-border/50">
            <div className="flex items-start gap-2">
              <MessageCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-foreground line-clamp-2 break-words flex-1">
                {notification.message || "Enviou uma mensagem"}
              </p>
            </div>
          </div>

          {/* Unread count if multiple */}
          {notification.unreadCount && notification.unreadCount > 1 && (
            <div className="flex items-center justify-between bg-primary/10 rounded px-3 py-2 border border-primary/20">
              <span className="text-xs font-medium text-primary">
                +{notification.unreadCount - 1} mensagens não lidas
              </span>
              <Volume2 className="h-3.5 w-3.5 text-primary" />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleDismiss}
              className="flex-1 px-3 py-2 text-xs font-medium rounded-md border border-border/50 bg-background hover:bg-muted transition-colors"
            >
              Fechar
            </button>
            <button
              onClick={handleNavigate}
              className="flex-1 px-3 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Abrir chat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Play notification sound with fallback
 */
function playNotificationSound() {
  try {
    // Use Web Audio API for better cross-browser support
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioContext.currentTime;

    // Create a simple beep sound using oscillator
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Set frequency (C5 = 523.25 Hz)
    oscillator.frequency.value = 523.25;

    // Quick fade in and out
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    oscillator.start(now);
    oscillator.stop(now + 0.1);

    // Second beep for better notification feel
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();

    osc2.connect(gain2);
    gain2.connect(audioContext.destination);

    osc2.frequency.value = 659.25; // E5
    gain2.gain.setValueAtTime(0.3, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc2.start(now + 0.15);
    osc2.stop(now + 0.25);
  } catch (e) {
    console.error("Failed to play sound:", e);
    // Fallback: try using audio file if available
    try {
      const audio = new Audio(
        "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA=="
      );
      audio.volume = 0.5;
      audio.play().catch(() => {
        // Silent failure
      });
    } catch (_) {
      // Silent failure
    }
  }
}
