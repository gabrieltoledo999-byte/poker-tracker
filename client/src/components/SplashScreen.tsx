export function SplashScreen() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(rgba(0,0,0,0.62), rgba(0,0,0,0.62)), url('/TheRail_Primary_WITH-FX_SplashScreen_2000x2000.png') center/cover no-repeat",
      }}
    >
      {/* Overlay escuro leve para dar profundidade */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Logo grande centralizado */}
      <div className="relative z-10 flex flex-col items-center animate-fade-in">
        <img
          src="/TheRail_Primary_WITH-FX_navbar_400x120_V02.png"
          alt="The Rail"
          className="w-[82vw] max-w-[560px] sm:w-[68vw] md:w-[52vw] object-contain drop-shadow-[0_0_38px_rgba(34,211,238,0.75)]"
        />

        {/* Barra de loading */}
        <div className="mt-6 w-40 sm:w-52 h-0.5 bg-white/15 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full animate-loading-bar" />
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes loading-bar {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        .animate-fade-in {
          animation: fade-in 0.7s ease-out forwards;
        }
        .animate-loading-bar {
          animation: loading-bar 2s ease-in-out forwards;
        }
      `}</style>
    </div>
  );
}
