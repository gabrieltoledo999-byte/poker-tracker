export function SplashScreen() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background: "radial-gradient(1200px 600px at 30% 20%, rgba(109,40,217,0.35), transparent 60%), radial-gradient(900px 500px at 80% 80%, rgba(6,182,212,0.25), transparent 60%), #050816",
      }}
    >
      {/* Overlay escuro leve para dar profundidade */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Logo grande centralizado */}
      <div className="relative z-10 flex flex-col items-center animate-fade-in">
        <img
          src="/favicon-symbol-large.png"
          alt="The Rail"
          className="w-[85vw] h-[85vw] max-w-[600px] max-h-[600px] sm:w-[70vw] sm:h-[70vw] md:w-[60vw] md:h-[60vw] object-contain drop-shadow-[0_0_40px_rgba(34,211,238,0.8)]"
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
