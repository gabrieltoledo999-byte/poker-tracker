export function SplashScreen() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        backgroundImage: `url(https://d2xsxph8kpxj0f.cloudfront.net/310419663029227103/D9ekUW97UoPRMShDJUiuZL/IMG_6444(1)_08b01db5.webp)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Overlay escuro leve para dar profundidade */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Logo grande centralizado */}
      <div className="relative z-10 flex flex-col items-center animate-fade-in">
        <img
          src="https://d2xsxph8kpxj0f.cloudfront.net/310419663029227103/D9ekUW97UoPRMShDJUiuZL/IMG_6443(1)_c98c5553.webp"
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
