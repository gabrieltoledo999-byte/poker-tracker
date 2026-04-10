import { MessageCircle, Users, Globe } from "lucide-react";
import { useLocation } from "wouter";

const socialItems = [
  { path: "/chat", label: "Mensagens", icon: MessageCircle },
  { path: "/invites", label: "Pessoas", icon: Users },
  { path: "/feed", label: "Feed", icon: Globe },
];

export default function SocialHubNav() {
  const [location, setLocation] = useLocation();

  return (
    <div className="social-shell sticky top-0 z-20 overflow-hidden p-1.5 backdrop-blur-xl">
      <div className="grid grid-cols-3 gap-1">
        {socialItems.map((item) => {
          const Icon = item.icon;
          const active = location === item.path;

          return (
            <button
              key={item.path}
              type="button"
              onClick={() => setLocation(item.path)}
              className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition-all ${
                active
                  ? "bg-primary text-primary-foreground shadow-[0_10px_35px_rgba(109,40,217,0.28)]"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}