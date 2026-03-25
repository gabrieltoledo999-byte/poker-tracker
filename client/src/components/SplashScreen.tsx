export function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#1a0a2e] overflow-hidden">
      {/* Fundo com brilho radial roxo */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(139,92,246,0.25)_0%,_rgba(26,10,46,0)_70%)]" />

      {/* Partículas de brilho decorativas */}
      <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-cyan-400 rounded-full opacity-60 animate-ping" style={{ animationDelay: "0s", animationDuration: "2s" }} />
      <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-purple-400 rounded-full opacity-40 animate-ping" style={{ animationDelay: "0.7s", animationDuration: "2.5s" }} />
      <div className="absolute bottom-1/3 left-1/3 w-1 h-1 bg-cyan-300 rounded-full opacity-50 animate-ping" style={{ animationDelay: "1.2s", animationDuration: "3s" }} />
      <div className="absolute bottom-1/4 right-1/4 w-1 h-1 bg-blue-400 rounded-full opacity-40 animate-ping" style={{ animationDelay: "0.4s", animationDuration: "2.2s" }} />

      {/* Conteúdo central */}
      <div className="relative flex flex-col items-center gap-6 animate-fade-in">
        {/* Logo */}
        <div className="relative">
          {/* Brilho atrás do logo */}
          <div className="absolute inset-0 blur-2xl bg-cyan-400/20 rounded-full scale-150" />
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310419663029227103/D9ekUW97UoPRMShDJUiuZL/therail-logo-no-bg_405c3687.png"
            alt="The Rail"
            className="relative z-10 w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 object-contain drop-shadow-[0_0_24px_rgba(34,211,238,0.6)]"
          />
        </div>

        {/* Barra de loading */}
        <div className="w-32 sm:w-40 h-0.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full animate-loading-bar" />
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes loading-bar {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
        }
        .animate-loading-bar {
          animation: loading-bar 1.8s ease-in-out forwards;
        }
      `}</style>
    </div>
  );
}
