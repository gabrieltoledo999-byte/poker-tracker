import { useEffect, useState } from "react";

interface SplashScreenProps {
  progress?: number; // 0-100
}

const FINAL_MESSAGES = [
  "Finalizando painel",
  "Verificando permissoes",
  "Preparando interface",
  "Quase pronto",
  "Sincronizando dados finais",
];

export function SplashScreen({ progress: externalProgress }: SplashScreenProps = {}) {
  const [internalProgress, setInternalProgress] = useState(5);
  const [typedDescription, setTypedDescription] = useState("");
  const [finalMsgIndex, setFinalMsgIndex] = useState(0);

  // Simula progresso se não for fornecido externamente
  useEffect(() => {
    if (externalProgress !== undefined) {
      setInternalProgress(externalProgress);
      return;
    }

    // Animação progressiva do carregamento
    const interval = setInterval(() => {
      setInternalProgress((prev) => {
        if (prev >= 95) {
          // Oscila entre 92 e 97 para não parecer travado
          const delta = (Math.random() - 0.5) * 4;
          return Math.min(97, Math.max(92, prev + delta));
        }
        const increment = Math.random() * 15 + 5;
        return Math.min(95, prev + increment);
      });
    }, 800);

    return () => clearInterval(interval);
  }, [externalProgress]);

  // Rotaciona mensagens finais quando chega a 92%+
  useEffect(() => {
    if (internalProgress < 92) return;
    const cycle = setInterval(() => {
      setFinalMsgIndex((i) => (i + 1) % FINAL_MESSAGES.length);
    }, 2200);
    return () => clearInterval(cycle);
  }, [internalProgress >= 92]);

  const loadingDescription =
    internalProgress < 15
      ? "Iniciando servicos e validando sessao"
      : internalProgress < 35
        ? "Lendo perfil do jogador"
        : internalProgress < 55
          ? "Carregando historico e estatisticas"
          : internalProgress < 75
            ? "Calculando indicadores e ABI"
            : internalProgress < 92
              ? "Atualizando cache e sincronizando dados"
              : FINAL_MESSAGES[finalMsgIndex];

  useEffect(() => {
    let index = 0;
    setTypedDescription("");

    const typeInterval = setInterval(() => {
      index += 1;
      setTypedDescription(loadingDescription.slice(0, index));
      if (index >= loadingDescription.length) clearInterval(typeInterval);
    }, 28);

    return () => clearInterval(typeInterval);
  }, [loadingDescription]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-slate-950/92 backdrop-blur-sm">
      <div className="relative z-10 flex flex-col items-center animate-fade-in gap-8">
        <img
          src="/all-in-edge-logo-horizontal.webp"
          alt="All in Edge"
          className="w-[82vw] max-w-[560px] sm:w-[68vw] md:w-[52vw] object-contain drop-shadow-[0_0_38px_rgba(34,211,238,0.75)]"
        />

        {/* Spinner Circular */}
        <div className="relative h-16 w-16 sm:h-20 sm:w-20">
          <div className="absolute inset-0 rounded-full border-4 border-cyan-400/20" />
          <div
            className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-r-blue-500 border-t-cyan-400"
            style={{ animation: "spin 2s linear infinite" }}
          />

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center">
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-lg font-bold text-transparent sm:text-xl">
                {Math.round(internalProgress)}%
              </span>
              <span className="text-xs text-cyan-400/60">carregando</span>
            </div>
          </div>
        </div>

        <div className="min-h-[32px] px-2 text-center">
          <p className="text-[11px] tracking-wide text-cyan-200/55 sm:text-xs">
            {typedDescription}
            <span className="ml-0.5 inline-block animate-pulse text-cyan-300/60">|</span>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-fade-in {
          animation: fade-in 0.7s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
