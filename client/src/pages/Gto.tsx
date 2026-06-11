import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import GtoStudyLab from "@/components/GtoStudyLab";
import GtoTrainer from "@/components/GtoTrainer";
import GtoStudyMode from "@/components/GtoStudyMode";
import GtoActionFlow from "@/components/GtoActionFlow";

type GtoView = "inicio" | "trainer" | "estudo" | "estudo-avancado" | "fluxo";

export default function Gto() {
  const [, setLocation] = useLocation();
  const [view, setView] = useState<GtoView>("inicio");

  const subtitle = useMemo(() => {
    if (view === "trainer") return "Treino prático de decisão";
    if (view === "estudo") return "Modo estudo clássico";
    if (view === "estudo-avancado") return "Matriz e exploração de spots";
    if (view === "fluxo") return "Fluxo de ações preflop";
    return "Escolha um modo para estudar";
  }, [view]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050913] text-white">
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[#050913]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-black uppercase tracking-[0.2em] text-cyan-200">GTO</h1>
            <p className="truncate text-xs text-slate-400">{subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => setView("inicio")}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${
                view === "inicio"
                  ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
                  : "border-white/20 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              Início
            </button>
            <button
              onClick={() => setView("trainer")}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${
                view === "trainer"
                  ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
                  : "border-white/20 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              Trainer
            </button>
            <button
              onClick={() => setView("estudo")}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${
                view === "estudo"
                  ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
                  : "border-white/20 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              Modo estudo
            </button>
            <button
              onClick={() => setView("estudo-avancado")}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${
                view === "estudo-avancado"
                  ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
                  : "border-white/20 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              Estudo avançado
            </button>
            <button
              onClick={() => setView("fluxo")}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${
                view === "fluxo"
                  ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
                  : "border-white/20 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              Fluxo
            </button>
            <button
              onClick={() => setLocation("/sessions")}
              className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-white/10"
            >
              Sair do GTO
            </button>
          </div>
        </div>
      </div>

      <div className="h-[calc(100%-66px)] overflow-hidden">
        {view === "inicio" && (
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center gap-4 px-4">
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-5">
              <h2 className="text-xl font-black text-cyan-100">Hub de estudo GTO</h2>
              <p className="mt-2 text-sm text-slate-300">
                Aqui você alterna entre o treino de decisões e o modo estudo com matriz completa.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                onClick={() => setView("trainer")}
                className="rounded-2xl border border-emerald-300/30 bg-emerald-500/15 p-5 text-left transition hover:scale-[1.01]"
              >
                <h3 className="text-base font-black text-emerald-100">Abrir Trainer</h3>
                <p className="mt-1 text-sm text-emerald-50/80">Sessões de treino com feedback por decisão.</p>
              </button>

              <button
                onClick={() => setView("estudo")}
                className="rounded-2xl border border-purple-300/30 bg-purple-500/15 p-5 text-left transition hover:scale-[1.01]"
              >
                <h3 className="text-base font-black text-purple-100">Abrir Modo estudo</h3>
                <p className="mt-1 text-sm text-purple-50/80">Treino guiado de uma mão por vez.</p>
              </button>

              <button
                onClick={() => setView("estudo-avancado")}
                className="rounded-2xl border border-cyan-300/30 bg-cyan-500/15 p-5 text-left transition hover:scale-[1.01]"
              >
                <h3 className="text-base font-black text-cyan-100">Abrir Estudo avançado</h3>
                <p className="mt-1 text-sm text-cyan-50/80">Matriz completa com filtros e spots.</p>
              </button>

              <button
                onClick={() => setView("fluxo")}
                className="rounded-2xl border border-amber-300/30 bg-amber-500/15 p-5 text-left transition hover:scale-[1.01]"
              >
                <h3 className="text-base font-black text-amber-100">Abrir Fluxo</h3>
                <p className="mt-1 text-sm text-amber-50/80">Construção de linhas preflop por ação.</p>
              </button>
            </div>
          </div>
        )}

        {view === "trainer" && <GtoTrainer />}
        {view === "estudo" && <GtoStudyMode />}
        {view === "estudo-avancado" && <GtoStudyLab />}
        {view === "fluxo" && <GtoActionFlow />}
      </div>
    </div>
  );
}