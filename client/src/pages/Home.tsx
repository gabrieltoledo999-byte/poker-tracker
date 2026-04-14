import { Button } from "@/components/ui/button";

/**
 * All content in this page are only for example, replace with your own feature implementation
 * When building pages, remember your instructions in Frontend Workflow, Frontend Best Practices, Design Guide and Common Pitfalls
 */
export default function Home() {
  return (
    <div
      className="min-h-screen flex flex-col justify-center bg-cover bg-center"
      style={{
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.64), rgba(0,0,0,0.64)), url('/TheRail_Primary_WITH-FX_SplashScreen_2000x2000.png')",
      }}
    >
      <main className="mx-auto w-full max-w-4xl px-4 py-12">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-8 md:p-12 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => (window.location.href = "/sessions")}
            className="group w-full rounded-2xl border border-cyan-300/35 bg-white/5 px-5 py-6 transition hover:bg-white/10 hover:border-cyan-300/60 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
            aria-label="Ir para sessões"
          >
            <img
              src="/TheRail_Primary_WITH-FX_navbar_400x120_V02.png"
              alt="The Rail"
              className="mx-auto h-24 md:h-32 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.03]"
            />
          </button>
          <p className="mt-3 text-base md:text-lg text-white/85 max-w-2xl">
            Registre sessoes, acompanhe ROI e mantenha sua evolucao no poker com uma visao clara da sua rotina.
          </p>
          <div className="mt-8">
            <Button size="lg" onClick={() => (window.location.href = "/sessions")}>
              Ir para Sessoes
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
