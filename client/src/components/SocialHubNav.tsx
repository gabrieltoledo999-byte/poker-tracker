import { MessageCircle, Users, Globe } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const socialItems = [
  { path: "/feed", label: "Feed", icon: Globe },
  { path: "/chat", label: "Mensagens", icon: MessageCircle },
  { path: "/invites", label: "Pessoas", icon: Users },
];

export default function SocialHubNav() {
  const [location, setLocation] = useLocation();
  const { data: unreadChatData } = trpc.chat.unreadCount.useQuery(undefined, {
    refetchInterval: 15000,
    staleTime: 8000,
  });
  const unreadChatCount = unreadChatData?.count ?? 0;

  return (
    <div className="social-shell sticky top-0 z-20 overflow-hidden p-1.5 backdrop-blur-xl">
      <div className="grid grid-cols-3 gap-1">
        {socialItems.map((item) => {
          const Icon = item.icon;
          const active = location === item.path;
          const showBadge = item.path === "/chat" && unreadChatCount > 0 && !active;

          return (
            <button
              key={item.path}
              type="button"
              onClick={() => setLocation(item.path)}
              className={`relative flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition-all ${
                active
                  ? "bg-primary text-primary-foreground shadow-[0_10px_35px_rgba(109,40,217,0.28)]"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              {showBadge && (
                <span className="absolute -top-0.5 right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm">
                  {unreadChatCount > 99 ? "99+" : unreadChatCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}