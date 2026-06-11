import { Globe, MessageCircle, Users } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const socialItems = [
  { path: "/feed", label: "Feed", icon: Globe },
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
    <>
      <div className="social-shell sticky top-0 z-20 overflow-hidden p-1 backdrop-blur-xl">
        <div className="grid grid-cols-2 gap-1">
          {socialItems.map((item) => {
            const Icon = item.icon;
            const active = location === item.path;

            return (
              <button
                key={item.path}
                type="button"
                onClick={() => setLocation(item.path)}
                className={`relative flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-all ${
                  active
                    ? "bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(109,40,217,0.25)]"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {location !== "/chat" && (
        <button
          type="button"
          onClick={() => setLocation("/chat")}
          className="fixed bottom-5 right-5 z-40 inline-flex h-12 min-w-12 items-center justify-center gap-1 rounded-full border border-primary/35 bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-[0_12px_30px_rgba(109,40,217,0.45)] transition-transform hover:scale-[1.02]"
          aria-label="Abrir mensagens"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Mensagens</span>
          {unreadChatCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
              {unreadChatCount > 99 ? "99+" : unreadChatCount}
            </span>
          )}
        </button>
      )}
    </>
  );
}