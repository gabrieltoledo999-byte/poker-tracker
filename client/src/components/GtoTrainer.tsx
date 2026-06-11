import React, { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { PokerTableReplay } from '@/components/hand-reviewer/PokerTableReplay';
import type { ReplaySeatState, ReplayStep } from '@/utils/actionNormalizer';
import type { DisplayUnit } from '@/utils/displayUnit';

// ===== Types =====
interface Hand {
  code: string;
  type: 'pares' | 'suited' | 'offsuit';
  combos: number;
  raisePctX10: number;
  limpCheckPctX10: number;
  foldPctX10: number;
  bucket?: string;
}

interface ScenarioMeta {
  id: number;
  slug: string;
  title: string;
  heroPosition: string;
  villainPosition: string;
  effectiveStackBb: number;
  smallBlind: number;
  bigBlind: number;
}

type UserAction = 'fold' | 'call' | 'raise' | 'allin' | null;
type SizingOption = '2.2x' | '2.5x' | '3x' | '3.5x' | 'Pot';

interface MatrixCell {
  code: string;
  hand: Hand | undefined;
  raise: number;
  call: number;
  fold: number;
  dominant: Exclude<UserAction, null>;
}

interface TrainingConfig {
  scenarioSlug: string;
  stackBb: number;
  duration: 'unlimited' | 'short' | 'medium' | 'long'; // hands
  format: 'ChipEV' | 'ICM';
}

interface SessionSummary {
  total: number;
  correct: number;
  wrong: number;
  evLost: number;
  durationMs: number;
  worstHands: Array<{ code: string; errors: number }>;
}

// ===== Constants =====
const RANK_ORDER = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
const SIZING_OPTIONS: SizingOption[] = ['2.2x', '2.5x', '3x', '3.5x', 'Pot'];
const DURATION_TO_HANDS: Record<TrainingConfig['duration'], number | null> = {
  unlimited: null,
  short: 25,
  medium: 50,
  long: 100,
};

// ===== Helpers =====
function normalizeHandCode(code: string): string {
  return String(code || '').trim().toUpperCase();
}

function matrixHandCode(rowRank: string, colRank: string, rowIndex: number, colIndex: number): string {
  if (rowIndex === colIndex) return `${rowRank}${colRank}`;
  if (rowIndex < colIndex) return `${rowRank}${colRank}S`;
  return `${colRank}${rowRank}O`;
}

function sanitizeScenarioTitle(title: string): string {
  return title.replace(/\bwizard\b/gi, 'Solver').replace(/\s{2,}/g, ' ').trim();
}

function spotLabel(meta: ScenarioMeta): string {
  return `${meta.heroPosition} vs ${meta.villainPosition}`;
}

function getActionLabel(action: UserAction): string {
  switch (action) {
    case 'fold': return 'Fold';
    case 'call': return 'Call';
    case 'raise': return 'Raise';
    case 'allin': return 'All-in';
    default: return '';
  }
}

function pct(pctX10: number): number {
  return pctX10 / 10;
}

function getGtoAction(hand: Hand): Exclude<UserAction, null> {
  if (hand.raisePctX10 >= hand.foldPctX10 && hand.raisePctX10 >= hand.limpCheckPctX10) return 'raise';
  if (hand.limpCheckPctX10 >= hand.foldPctX10) return 'call';
  return 'fold';
}

function getHeroCardsFromHandCode(handCode: string): string[] {
  const clean = handCode.trim().toUpperCase();
  if (clean.length < 2) return ['As', 'Kd'];
  const r1 = clean[0];
  const r2 = clean[1];
  const suffix = clean[2] ?? '';
  if (r1 === r2) return [`${r1}h`, `${r2}s`];
  if (suffix === 'S') return [`${r1}s`, `${r2}s`];
  return [`${r1}s`, `${r2}h`];
}

function mixedCellBackground(cell: MatrixCell): string {
  if (!cell.hand) return '#0F172A';
  const r = cell.raise;
  const c = cell.call;
  const f = cell.fold;
  const total = r + c + f;
  if (total <= 0) return '#0F172A';

  type Stop = { color: string; value: number };
  const segs: Stop[] = [];
  if (r > 0) segs.push({ color: '#22C55E', value: r });
  if (c > 0) segs.push({ color: '#7C3AED', value: c });
  if (f > 0) segs.push({ color: '#3B82F6', value: f });

  if (segs.length === 1) return segs[0].color;

  let pos = 0;
  const parts: string[] = [];
  const blend = 4;
  segs.forEach((s, idx) => {
    const start = pos;
    const end = pos + s.value;
    const softStart = idx === 0 ? start : Math.max(start - blend / 2, 0);
    const softEnd = idx === segs.length - 1 ? 100 : Math.min(end + blend / 2, 100);
    parts.push(`${s.color} ${softStart.toFixed(1)}% ${softEnd.toFixed(1)}%`);
    pos = end;
  });

  return `linear-gradient(135deg, ${parts.join(', ')})`;
}

// =====================================================================
// ENTRY POINT — switches between setup screen and active session
// =====================================================================
export const GtoTrainer: React.FC<{ scenarioSlug?: string }> = ({ scenarioSlug }) => {
  const { data: scenarioList = [], isLoading: listLoading } = trpc.gto.listScenarios.useQuery();
  const [config, setConfig] = useState<TrainingConfig | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  if (listLoading) {
    return <LoadingShell label="Carregando biblioteca de soluções..." />;
  }

  if (!scenarioList.length) {
    return (
      <ErrorShell
        title="Biblioteca vazia"
        message="Nenhuma solução cadastrada no banco. Importe pelo menos um cenário para iniciar o treino."
      />
    );
  }

  // 1. SUMMARY screen
  if (summary) {
    return (
      <SessionSummaryScreen
        summary={summary}
        onRestart={() => {
          setSummary(null);
          setConfig(null);
        }}
      />
    );
  }

  // 2. SETUP screen
  if (!config) {
    return (
      <TrainingSetupScreen
        scenarioList={scenarioList as ScenarioMeta[]}
        defaultSlug={scenarioSlug}
        onStart={(c) => setConfig(c)}
      />
    );
  }

  // 3. SESSION
  return (
    <TrainingSession
      config={config}
      onEnd={(s) => setSummary(s)}
      onBack={() => setConfig(null)}
    />
  );
};

export default GtoTrainer;

// =====================================================================
// SETUP SCREEN — choose modality, format, stack, spot
// =====================================================================
const TrainingSetupScreen: React.FC<{
  scenarioList: ScenarioMeta[];
  defaultSlug?: string;
  onStart: (config: TrainingConfig) => void;
}> = ({ scenarioList, defaultSlug, onStart }) => {
  // Group scenarios by stack depth (derived from DB)
  const stackDepths = useMemo(() => {
    const set = new Set<number>();
    scenarioList.forEach((s) => set.add(s.effectiveStackBb));
    return [...set].sort((a, b) => b - a);
  }, [scenarioList]);

  const [selectedStack, setSelectedStack] = useState<number>(() => {
    if (defaultSlug) {
      const sc = scenarioList.find((s) => s.slug === defaultSlug);
      if (sc) return sc.effectiveStackBb;
    }
    return stackDepths[0] ?? 100;
  });

  const [format, setFormat] = useState<'ChipEV' | 'ICM'>('ChipEV');
  const [duration, setDuration] = useState<TrainingConfig['duration']>('medium');

  const availableSpots = useMemo(
    () => scenarioList.filter((s) => s.effectiveStackBb === selectedStack),
    [scenarioList, selectedStack]
  );

  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => {
    return defaultSlug && availableSpots.some((s) => s.slug === defaultSlug)
      ? defaultSlug
      : availableSpots[0]?.slug || null;
  });

  // If stack changes and selected slug isn't available, pick first
  useEffect(() => {
    if (selectedSlug && !availableSpots.some((s) => s.slug === selectedSlug)) {
      setSelectedSlug(availableSpots[0]?.slug || null);
    }
  }, [availableSpots, selectedSlug]);

  // For symmetric HU display: SB and BB seats both at stack depth
  const positions = ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

  const handleStart = () => {
    if (!selectedSlug) return;
    onStart({
      scenarioSlug: selectedSlug,
      stackBb: selectedStack,
      duration,
      format,
    });
  };

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-y-auto text-slate-100"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(34,211,238,0.12), transparent 30%), linear-gradient(135deg,#050816 0%,#070B18 50%,#020617 100%)',
      }}
    >
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5">
        {/* Header */}
        <div className="rounded-2xl border p-4" style={{ background: 'rgba(15,23,42,0.85)', borderColor: 'rgba(148,163,184,0.18)' }}>
          <h1 className="text-lg font-black uppercase tracking-widest text-cyan-200">Configurar treino GTO</h1>
          <p className="mt-1 text-xs text-slate-400">
            Escolha modalidade, formato, profundidade de stack e o spot. Apenas soluções disponíveis na biblioteca aparecem como opção.
          </p>
        </div>

        {/* Modalidade + Formato + Duração */}
        <div className="grid gap-3 md:grid-cols-3">
          <SetupCard title="Modalidade">
            <ChipRow>
              <ChipBtn active>MTT</ChipBtn>
              <ChipBtn disabled>Cash</ChipBtn>
              <ChipBtn disabled>Spin</ChipBtn>
            </ChipRow>
            <div className="mt-2 text-[10px] text-slate-400">Apenas MTT está disponível na biblioteca atual.</div>
          </SetupCard>

          <SetupCard title="Formato">
            <ChipRow>
              <ChipBtn active={format === 'ChipEV'} onClick={() => setFormat('ChipEV')}>ChipEV</ChipBtn>
              <ChipBtn active={format === 'ICM'} onClick={() => setFormat('ICM')} disabled>ICM</ChipBtn>
            </ChipRow>
            <div className="mt-2 text-[10px] text-slate-400">ICM em breve. Por ora todos os spots são ChipEV.</div>
          </SetupCard>

          <SetupCard title="Duração da sessão">
            <ChipRow>
              <ChipBtn active={duration === 'short'} onClick={() => setDuration('short')}>25 mãos</ChipBtn>
              <ChipBtn active={duration === 'medium'} onClick={() => setDuration('medium')}>50 mãos</ChipBtn>
              <ChipBtn active={duration === 'long'} onClick={() => setDuration('long')}>100 mãos</ChipBtn>
              <ChipBtn active={duration === 'unlimited'} onClick={() => setDuration('unlimited')}>Livre</ChipBtn>
            </ChipRow>
          </SetupCard>
        </div>

        {/* Stack depth table — solver-style layout */}
        <SetupCard title="Profundidade de Stack (Symmetric)">
          <div className="overflow-x-auto">
            <table className="min-w-full text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-widest text-slate-400">
                  <th className="px-2 py-1 text-left">Linha</th>
                  <th className="px-2 py-1">Avg</th>
                  {positions.map((p) => (
                    <th key={p} className="px-2 py-1">{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stackDepths.length === 0 ? (
                  <tr><td colSpan={positions.length + 2} className="px-2 py-3 text-center text-slate-500">Nenhuma stack disponível.</td></tr>
                ) : stackDepths.map((depth) => {
                  const active = depth === selectedStack;
                  return (
                    <tr
                      key={depth}
                      onClick={() => setSelectedStack(depth)}
                      className="cursor-pointer transition hover:bg-cyan-500/5"
                      style={{
                        background: active ? 'rgba(34,211,238,0.10)' : 'transparent',
                        outline: active ? '1px solid rgba(34,211,238,0.4)' : 'none',
                      }}
                    >
                      <td
                        className="px-2 py-1.5 font-black"
                        style={{ color: active ? '#67E8F9' : '#E2E8F0' }}
                      >
                        {depth}bb
                      </td>
                      <td className="px-2 py-1.5 text-center font-bold text-slate-200">{depth}</td>
                      {positions.map((p) => (
                        <td key={p} className="px-2 py-1.5 text-center text-slate-300">{depth}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[10px] text-slate-400">
            Cada linha representa uma profundidade de stack disponível. No modo Symmetric todos os assentos têm o mesmo stack.
          </div>
        </SetupCard>

        {/* Spots disponíveis para o stack */}
        <SetupCard title={`Spots disponíveis (${selectedStack}bb)`}>
          {availableSpots.length === 0 ? (
            <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-[11px] text-rose-200">
              Nenhuma solução cadastrada para {selectedStack}bb. Selecione outra profundidade.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {availableSpots.map((s) => {
                const active = s.slug === selectedSlug;
                return (
                  <button
                    key={s.slug}
                    onClick={() => setSelectedSlug(s.slug)}
                    className="flex flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition hover:scale-[1.01]"
                    style={{
                      background: active ? 'rgba(34,211,238,0.10)' : 'rgba(15,23,42,0.85)',
                      borderColor: active ? '#22D3EE' : 'rgba(148,163,184,0.18)',
                      boxShadow: active ? '0 0 18px rgba(34,211,238,0.22)' : 'none',
                    }}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/80">{spotLabel(s)}</div>
                    <div className="text-sm font-bold text-white">{sanitizeScenarioTitle(s.title)}</div>
                    <div className="text-[10px] text-slate-400">Blinds {s.smallBlind}/{s.bigBlind} · {s.effectiveStackBb}bb</div>
                  </button>
                );
              })}
            </div>
          )}
        </SetupCard>

        {/* Iniciar */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <button
            disabled={!selectedSlug}
            onClick={handleStart}
            className="rounded-xl border px-6 py-3 text-sm font-extrabold uppercase tracking-widest transition disabled:cursor-not-allowed disabled:opacity-50 hover:scale-105"
            style={{
              background: 'linear-gradient(180deg,#A855F7,#6D28D9)',
              borderColor: 'rgba(168,85,247,0.5)',
              color: '#FFFFFF',
              boxShadow: '0 0 24px rgba(124,58,237,0.45)',
            }}
          >
            Iniciar treino →
          </button>
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// ACTIVE SESSION — table + actions + error modal
// =====================================================================
const TrainingSession: React.FC<{
  config: TrainingConfig;
  onEnd: (summary: SessionSummary) => void;
  onBack: () => void;
}> = ({ config, onEnd, onBack }) => {
  const { data, isLoading, error } = trpc.gto.getScenario.useQuery({ slug: config.scenarioSlug });

  const [currentHand, setCurrentHand] = useState<Hand | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const [evLost, setEvLost] = useState(0);
  const [sizing, setSizing] = useState<SizingOption>('3x');
  const [sliderValue, setSliderValue] = useState(300);
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>('bb');
  const [feedback, setFeedback] = useState<{ type: 'correct' | 'incorrect'; message: string } | null>(null);
  const [errorModal, setErrorModal] = useState<null | {
    handCode: string;
    userAction: UserAction;
    gtoAction: Exclude<UserAction, null>;
    raise: number;
    call: number;
    fold: number;
    evLost: number;
  }>(null);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(0);
  const [startedAt] = useState(Date.now());
  const [errorsByHand, setErrorsByHand] = useState<Record<string, number>>({});

  const filteredHands = useMemo(() => (data?.handList || []) as Hand[], [data?.handList]);
  const handMapByCode = useMemo(() => {
    const map = new Map<string, Hand>();
    filteredHands.forEach((h) => map.set(normalizeHandCode(h.code), h));
    return map;
  }, [filteredHands]);

  const handsLimit = DURATION_TO_HANDS[config.duration];

  const pickRandomHand = (excludeCode?: string): Hand | null => {
    if (!filteredHands.length) return null;
    if (filteredHands.length === 1) return filteredHands[0];
    const exclude = normalizeHandCode(excludeCode || '');
    const pool = filteredHands.filter((h) => normalizeHandCode(h.code) !== exclude);
    const source = pool.length ? pool : filteredHands;
    return source[Math.floor(Math.random() * source.length)] || null;
  };

  const buildSummary = (): SessionSummary => {
    const worst = Object.entries(errorsByHand)
      .map(([code, errors]) => ({ code, errors }))
      .sort((a, b) => b.errors - a.errors)
      .slice(0, 5);
    return {
      total: score.total,
      correct: score.correct,
      wrong: score.total - score.correct,
      evLost,
      durationMs: Date.now() - startedAt,
      worstHands: worst,
    };
  };

  const moveToNextHand = () => {
    // Check if session ended
    if (handsLimit !== null && score.total >= handsLimit) {
      onEnd(buildSummary());
      return;
    }
    const next = pickRandomHand(currentHand?.code);
    if (!next) return;
    setCurrentHand(next);
    setShowResult(false);
    setFeedback(null);
    setErrorModal(null);
  };

  useEffect(() => {
    if (!filteredHands.length) return;
    setCurrentHand((prev) => {
      if (prev && handMapByCode.has(normalizeHandCode(prev.code))) return prev;
      return pickRandomHand();
    });
    setShowResult(false);
    setFeedback(null);
    setErrorModal(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredHands, handMapByCode]);

  useEffect(() => {
    if (!data) return;
    const bb = data.scenario.bigBlind;
    if (sizing === 'Pot') {
      setSliderValue(data.scenario.smallBlind + bb);
    } else {
      const mult = parseFloat(sizing.replace('x', ''));
      setSliderValue(Math.round(bb * mult));
    }
  }, [sizing, data]);

  const handleAction = (action: UserAction) => {
    if (!currentHand || !action || showResult) return;
    const gto = getGtoAction(currentHand);
    const correct = action === gto;

    setShowResult(true);
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));

    if (correct) {
      setStreak((s) => s + 1);
      setFeedback({ type: 'correct', message: `Correto! ${currentHand.code} → ${getActionLabel(gto)}` });
      window.setTimeout(() => moveToNextHand(), 650);
      return;
    }

    setStreak(0);
    const gtoFreqValue = pct(
      gto === 'raise' ? currentHand.raisePctX10
        : gto === 'call' ? currentHand.limpCheckPctX10
        : currentHand.foldPctX10
    );
    const userFreqValue = pct(
      action === 'raise' ? currentHand.raisePctX10
        : action === 'call' ? currentHand.limpCheckPctX10
        : action === 'fold' ? currentHand.foldPctX10
        : 0
    );
    const evLossBb = Math.max(0, gtoFreqValue - userFreqValue) / 100 * 1.5;
    setEvLost((v) => v + evLossBb);
    setErrorsByHand((prev) => ({ ...prev, [currentHand.code]: (prev[currentHand.code] || 0) + 1 }));

    setErrorModal({
      handCode: currentHand.code,
      userAction: action,
      gtoAction: gto,
      raise: pct(currentHand.raisePctX10),
      call: pct(currentHand.limpCheckPctX10),
      fold: pct(currentHand.foldPctX10),
      evLost: evLossBb,
    });
  };

  const matrixGrid: MatrixCell[][] = useMemo(() => {
    return RANK_ORDER.map((rowRank, rowIndex) =>
      RANK_ORDER.map((colRank, colIndex) => {
        const code = matrixHandCode(rowRank, colRank, rowIndex, colIndex);
        const hand = handMapByCode.get(code);
        const raise = hand ? pct(hand.raisePctX10) : 0;
        const call = hand ? pct(hand.limpCheckPctX10) : 0;
        const fold = hand ? pct(hand.foldPctX10) : 0;
        const dominant: Exclude<UserAction, null> = raise >= call && raise >= fold
          ? 'raise'
          : call >= fold ? 'call' : 'fold';
        return { code, hand, raise, call, fold, dominant };
      })
    );
  }, [handMapByCode]);

  const accuracyPct = score.total > 0 ? (score.correct / score.total) * 100 : 0;
  const errors = score.total - score.correct;

  if (isLoading) return <LoadingShell label="Carregando spot..." />;
  if (error || !data) return <ErrorShell title="Erro" message={error?.message || 'Sem dados'} />;
  if (!currentHand) return <LoadingShell label="Sorteando mão..." />;

  const scenario = data.scenario;
  const sb = scenario.smallBlind;
  const bb = scenario.bigBlind;
  const potPre = sb + bb;
  const startingStack = scenario.effectiveStackBb * bb;
  const callAmount = Math.max(bb - sb, 0);

  // Formata valor em fichas para a unidade ativa (BB ou chips)
  const fmtAmount = (chips: number): string => {
    if (displayUnit === 'bb') {
      const bbVal = chips / bb;
      const rounded = Number.isInteger(bbVal) ? bbVal : Number(bbVal.toFixed(bbVal < 10 ? 2 : 1));
      return `${rounded}bb`;
    }
    return `${Math.round(chips)}`;
  };
  const heroCards = getHeroCardsFromHandCode(currentHand.code);

  // Determina quem é SB (botão em HU) e quem é BB com base no scenario.
  const heroIsSB = scenario.heroPosition.toUpperCase() === 'SB' || scenario.heroPosition.toUpperCase() === 'BTN';
  const heroPosted = heroIsSB ? sb : bb;
  const villainPosted = heroIsSB ? bb : sb;

  const replayStep: ReplayStep = {
    stepIndex: 0,
    street: 'preflop',
    actingPlayer: 'Hero',
    action: null,
    actionLabel: `${scenario.heroPosition} to act`,
    actionAmount: 0,
    pot: potPre,
    board: [],
    seats: [
      {
        seat: 0,
        name: 'Hero',
        position: scenario.heroPosition,
        startingStack,
        stackApprox: Math.max(startingStack - heroPosted, 0),
        contributedCurrentRound: heroPosted,
        forcedPosted: heroIsSB ? { smallBlind: sb } : { bigBlind: bb },
        holeCards: heroCards,
        revealedCards: [],
        isHero: true,
        isButton: heroIsSB,
        isSmallBlind: heroIsSB,
        isBigBlind: !heroIsSB,
        status: 'active',
        lastAction: heroIsSB ? `SB ${sb}` : `BB ${bb}`,
      } satisfies ReplaySeatState,
      {
        seat: 1,
        name: 'Villain',
        position: scenario.villainPosition,
        startingStack,
        stackApprox: Math.max(startingStack - villainPosted, 0),
        contributedCurrentRound: villainPosted,
        forcedPosted: heroIsSB ? { bigBlind: bb } : { smallBlind: sb },
        holeCards: [],
        revealedCards: [],
        isHero: false,
        isButton: !heroIsSB,
        isSmallBlind: !heroIsSB,
        isBigBlind: heroIsSB,
        status: 'active',
        lastAction: heroIsSB ? `BB ${bb}` : `SB ${sb}`,
      } satisfies ReplaySeatState,
    ],
  };

  const handsRemaining = handsLimit !== null ? Math.max(handsLimit - score.total, 0) : null;

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden text-slate-100"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(34,211,238,0.12), transparent 30%), linear-gradient(135deg,#050816 0%,#070B18 50%,#020617 100%)',
      }}
    >
      {/* TOP STRIP — compacto */}
      <div className="flex items-center gap-3 px-3 pt-3">
        <button
          onClick={onBack}
          className="rounded-lg border border-white/20 bg-slate-900/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-200 hover:bg-slate-800"
        >
          ← Setup
        </button>

        <div className="flex items-center gap-2 text-[11px] text-slate-300">
          <span className="rounded-md border border-cyan-300/30 bg-slate-950/60 px-2 py-1 font-semibold text-cyan-100">
            {scenario.heroPosition} vs {scenario.villainPosition}
          </span>
          <span className="rounded-md border border-white/15 bg-slate-950/60 px-2 py-1 font-semibold">
            {scenario.effectiveStackBb}bb
          </span>
          <span className="rounded-md border border-white/15 bg-slate-950/60 px-2 py-1 font-semibold">
            Pot {fmtAmount(potPre)}
          </span>
        </div>

        {handsRemaining !== null && (
          <span className="ml-auto rounded-md border border-purple-300/30 bg-slate-950/60 px-2 py-1 text-[11px] font-semibold text-purple-200">
            {handsRemaining} mãos restantes
          </span>
        )}
      </div>

      {feedback && feedback.type === 'correct' && (
        <div
          className="mx-3 mt-2 rounded-lg border border-emerald-400/45 bg-emerald-500/12 px-3 py-1.5 text-xs font-semibold text-emerald-200"
          style={{ boxShadow: '0 0 18px rgba(34,197,94,0.22)' }}
        >
          {feedback.message}
        </div>
      )}

      {/* TABLE — proporção próxima de mesa real (4:3) */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pt-2">
        <div
          className="relative"
          style={{
            height: 'min(100%, calc((100vw - 60px) * 0.62))',
            aspectRatio: '4 / 3',
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        >
        <PokerTableReplay
          className="h-full w-full"
          step={replayStep}
          previousStep={null}
          maxPlayers={2}
          selectedSeat={selectedSeat}
          onSelectSeat={setSelectedSeat}
          displayUnit={displayUnit}
          bigBlind={bb}
          topLeftPanel={(
            <div className="flex items-center gap-2.5 rounded-xl border border-cyan-300/40 bg-slate-950/90 px-2.5 py-1.5 backdrop-blur">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-black"
                style={{
                  background: 'linear-gradient(180deg,#22D3EE,#0E7490)',
                  borderColor: 'rgba(34,211,238,0.7)',
                  color: '#03131A',
                  boxShadow: '0 0 14px rgba(34,211,238,0.5)',
                }}
                title="Sua posição"
              >
                {scenario.heroPosition}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">Hero</span>
                <span className="text-xs font-black text-white">{scenario.heroPosition}</span>
                <span className="text-[9px] text-slate-400">vs {scenario.villainPosition}</span>
              </div>
            </div>
          )}
          unitToggle={(
            <button
              onClick={() => setDisplayUnit((u) => (u === 'chips' ? 'bb' : 'chips'))}
              className="rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition"
              style={{
                background: displayUnit === 'bb' ? 'rgba(34,211,238,0.22)' : 'rgba(15,23,42,0.75)',
                borderColor: displayUnit === 'bb' ? '#22D3EE' : 'rgba(148,163,184,0.3)',
                color: displayUnit === 'bb' ? '#67E8F9' : '#CBD5E1',
                boxShadow: displayUnit === 'bb' ? '0 0 12px rgba(34,211,238,0.4)' : 'none',
              }}
              title="Alternar BB / Fichas"
            >
              {displayUnit === 'bb' ? 'BB' : 'Fichas'}
            </button>
          )}
        />
        </div>
      </div>

      {/* ACTION PANEL (abaixo da mesa, sem sobrepor cartas) */}
      <div
        className="mx-3 mt-2 shrink-0 rounded-2xl border px-3 py-2"
        style={{
          background: 'linear-gradient(180deg, rgba(7,11,24,0.92), rgba(2,6,23,0.92))',
          borderColor: 'rgba(34,211,238,0.18)',
          boxShadow: '0 -4px 24px rgba(34,211,238,0.08)',
        }}
      >
        <div className="flex w-full flex-col items-center gap-2">
          <div className="flex w-full max-w-[960px] gap-3">
            <ActionButton
              label="FOLD"
              sub={fmtAmount(0)}
              gradient="linear-gradient(180deg,#FB7185,#E11D48)"
              glow="rgba(239,68,68,0.45)"
              onClick={() => handleAction('fold')}
              disabled={showResult}
            />
            <ActionButton
              label="CALL"
              sub={fmtAmount(callAmount)}
              gradient="linear-gradient(180deg,#34D399,#059669)"
              glow="rgba(34,197,94,0.45)"
              onClick={() => handleAction('call')}
              disabled={showResult}
            />
            <ActionButton
              label="RAISE"
              sub={fmtAmount(sliderValue)}
              gradient="linear-gradient(180deg,#FBBF24,#D97706)"
              glow="rgba(245,158,11,0.45)"
              onClick={() => handleAction('raise')}
              disabled={showResult}
              textDark
            />
            <ActionButton
              label="ALL-IN"
              sub={fmtAmount(startingStack)}
              gradient="linear-gradient(180deg,#A855F7,#6D28D9)"
              glow="rgba(124,58,237,0.45)"
              onClick={() => handleAction('allin')}
              disabled={showResult}
            />
          </div>

          <div className="flex w-full max-w-[960px] flex-wrap items-center justify-center gap-2">
            {SIZING_OPTIONS.map((opt) => {
              const active = sizing === opt;
              return (
                <button
                  key={opt}
                  onClick={() => setSizing(opt)}
                  className="rounded-lg border px-2.5 py-1 text-[11px] font-bold transition hover:scale-105"
                  style={{
                    background: active ? 'rgba(34,211,238,0.18)' : 'rgba(15,23,42,0.7)',
                    borderColor: active ? '#22D3EE' : 'rgba(148,163,184,0.25)',
                    color: active ? '#67E8F9' : '#CBD5E1',
                    boxShadow: active ? '0 0 14px rgba(34,211,238,0.35)' : 'none',
                  }}
                >
                  {opt}
                </button>
              );
            })}
            <div className="flex flex-1 items-center gap-2 min-w-[180px]">
              <input
                type="range"
                min={bb}
                max={startingStack}
                step={bb}
                value={sliderValue}
                onChange={(e) => setSliderValue(Number(e.target.value))}
                className="flex-1 accent-cyan-400"
              />
              <span className="min-w-[56px] rounded-md border border-white/15 bg-slate-900/70 px-2 py-0.5 text-center text-[11px] font-bold text-cyan-200">
                {fmtAmount(sliderValue)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer
        className="mt-2 flex h-[52px] shrink-0 items-center justify-between border-t px-5 text-xs"
        style={{ background: 'rgba(2,6,23,0.85)', borderColor: 'rgba(148,163,184,0.14)' }}
      >
        <div className="flex items-center gap-5">
          <Stat label="Mãos" value={String(score.total)} color="#F8FAFC" />
          <Stat label="Acertos" value={String(score.correct)} color="#34D399" />
          <Stat label="Erros" value={String(errors)} color="#F87171" />
          <Stat label="Accuracy" value={`${accuracyPct.toFixed(1)}%`} color="#22D3EE" />
          <Stat label="Streak" value={String(streak)} color="#FBBF24" />
          <Stat label="EV Perdido" value={`-${evLost.toFixed(2)}bb`} color="#FB923C" />
        </div>
        <button
          onClick={() => onEnd(buildSummary())}
          className="rounded-xl border px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition hover:scale-105"
          style={{
            background: 'linear-gradient(180deg,#EF4444,#B91C1C)',
            borderColor: 'rgba(239,68,68,0.5)',
            color: '#FEE2E2',
            boxShadow: '0 0 16px rgba(239,68,68,0.35)',
          }}
        >
          ⏻ Encerrar sessão
        </button>
      </footer>

      {/* ERROR MODAL */}
      {errorModal && (
        <ErrorModal
          errorModal={errorModal}
          scenario={scenario}
          scenarioSlug={config.scenarioSlug}
          matrixGrid={matrixGrid}
          onClose={() => setErrorModal(null)}
          onNext={moveToNextHand}
        />
      )}
    </div>
  );
};

// =====================================================================
// SUMMARY SCREEN
// =====================================================================
const SessionSummaryScreen: React.FC<{ summary: SessionSummary; onRestart: () => void }> = ({ summary, onRestart }) => {
  const accuracy = summary.total > 0 ? (summary.correct / summary.total) * 100 : 0;
  const avgRespMs = summary.total > 0 ? summary.durationMs / summary.total : 0;
  const mins = Math.floor(summary.durationMs / 60000);
  const secs = Math.floor((summary.durationMs % 60000) / 1000);

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-y-auto p-5 text-slate-100"
      style={{
        background:
          'radial-gradient(circle at top, rgba(124,58,237,0.16), transparent 40%), linear-gradient(135deg,#050816 0%,#070B18 50%,#020617 100%)',
      }}
    >
      <div className="w-full max-w-3xl space-y-4">
        <div className="rounded-2xl border p-5 text-center" style={{ background: 'rgba(15,23,42,0.85)', borderColor: 'rgba(124,58,237,0.4)' }}>
          <h1 className="text-xl font-black uppercase tracking-widest text-purple-200">Resumo da sessão</h1>
          <p className="mt-1 text-xs text-slate-400">Estatísticas completas do seu treino.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryStat label="Mãos" value={String(summary.total)} color="#F8FAFC" />
          <SummaryStat label="Acertos" value={String(summary.correct)} color="#34D399" />
          <SummaryStat label="Erros" value={String(summary.wrong)} color="#F87171" />
          <SummaryStat label="Accuracy" value={`${accuracy.toFixed(1)}%`} color="#22D3EE" />
          <SummaryStat label="EV Perdido" value={`-${summary.evLost.toFixed(2)}bb`} color="#FB923C" />
          <SummaryStat label="Duração" value={`${mins}m ${secs}s`} color="#A78BFA" />
          <SummaryStat label="Tempo médio" value={`${(avgRespMs / 1000).toFixed(1)}s`} color="#67E8F9" />
          <SummaryStat label="Streak final" value="—" color="#FBBF24" />
        </div>

        <div className="rounded-2xl border p-4" style={{ background: 'rgba(15,23,42,0.85)', borderColor: 'rgba(148,163,184,0.18)' }}>
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-cyan-300/85">Mãos mais erradas</h3>
          {summary.worstHands.length === 0 ? (
            <div className="text-xs text-slate-400">Nenhum erro registrado. ✨</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {summary.worstHands.map((h) => (
                <span
                  key={h.code}
                  className="rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] font-bold text-rose-200"
                >
                  {h.code} · {h.errors} erro{h.errors > 1 ? 's' : ''}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-center gap-3 pb-4">
          <button
            onClick={onRestart}
            className="rounded-xl border px-6 py-2.5 text-sm font-extrabold uppercase tracking-widest transition hover:scale-105"
            style={{
              background: 'linear-gradient(180deg,#A855F7,#6D28D9)',
              borderColor: 'rgba(168,85,247,0.5)',
              color: '#FFFFFF',
              boxShadow: '0 0 24px rgba(124,58,237,0.45)',
            }}
          >
            Novo treino →
          </button>
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// PRESENTATIONAL COMPONENTS
// =====================================================================
const LoadingShell: React.FC<{ label: string }> = ({ label }) => (
  <div
    className="flex h-full w-full items-center justify-center"
    style={{ background: 'linear-gradient(135deg,#050816 0%,#070B18 50%,#020617 100%)' }}
  >
    <div className="flex flex-col items-center gap-3 text-cyan-100">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500/30 border-t-cyan-400" />
      <p className="text-sm font-semibold uppercase tracking-widest">{label}</p>
    </div>
  </div>
);

const ErrorShell: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div className="flex h-full w-full items-center justify-center text-rose-200" style={{ background: '#050816' }}>
    <div className="rounded-2xl border border-rose-500/40 bg-rose-950/40 p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm">{message}</p>
    </div>
  </div>
);

const SetupCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div
    className="rounded-2xl border p-4"
    style={{ background: 'rgba(15,23,42,0.85)', borderColor: 'rgba(148,163,184,0.18)' }}
  >
    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">{title}</h3>
    {children}
  </div>
);

const ChipRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-wrap gap-2">{children}</div>
);

const ChipBtn: React.FC<{
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}> = ({ active, disabled, onClick, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
    style={{
      background: active ? 'rgba(34,211,238,0.16)' : '#0F172A',
      borderColor: active ? '#22D3EE' : 'rgba(148,163,184,0.25)',
      color: active ? '#67E8F9' : '#CBD5E1',
      boxShadow: active ? '0 0 12px rgba(34,211,238,0.3)' : 'none',
    }}
  >
    {children}
  </button>
);

const Stat: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="flex flex-col leading-tight">
    <span className="text-[9px] uppercase tracking-widest text-slate-500">{label}</span>
    <span className="text-sm font-bold" style={{ color }}>{value}</span>
  </div>
);

const SummaryStat: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div
    className="rounded-xl border p-3 text-center"
    style={{ background: 'rgba(15,23,42,0.85)', borderColor: 'rgba(148,163,184,0.18)' }}
  >
    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
    <div className="mt-1 text-lg font-black" style={{ color }}>{value}</div>
  </div>
);

const ActionButton: React.FC<{
  label: string;
  sub?: string;
  gradient: string;
  glow: string;
  onClick: () => void;
  disabled?: boolean;
  textDark?: boolean;
}> = ({ label, sub, gradient, glow, onClick, disabled, textDark }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="flex h-[60px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl border font-extrabold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-50 hover:-translate-y-0.5 hover:scale-[1.02]"
    style={{
      background: gradient,
      borderColor: 'rgba(255,255,255,0.18)',
      color: textDark ? '#1F2937' : '#FFFFFF',
      boxShadow: `0 10px 30px ${glow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
    }}
  >
    <span className="text-base">{label}</span>
    {sub && <span className="text-[10px] opacity-80">{sub}</span>}
  </button>
);

const MatrixCellBtn: React.FC<{ cell: MatrixCell; isCurrent: boolean }> = ({ cell, isCurrent }) => (
  <div
    title={`${cell.code} · R ${cell.raise.toFixed(0)}% · C ${cell.call.toFixed(0)}% · F ${cell.fold.toFixed(0)}%`}
    className="relative aspect-square rounded-[4px] text-[9px] font-bold flex items-center justify-center"
    style={{
      background: mixedCellBackground(cell),
      border: `1px solid ${isCurrent ? '#FACC15' : 'rgba(255,255,255,0.08)'}`,
      color: 'rgba(255,255,255,0.95)',
      textShadow: '0 1px 2px rgba(0,0,0,0.6)',
      boxShadow: isCurrent
        ? '0 0 14px rgba(250,204,21,0.55), inset 0 0 0 1px rgba(250,204,21,0.8)'
        : 'inset 0 0 6px rgba(0,0,0,0.25)',
      outline: isCurrent ? '2px solid #FACC15' : undefined,
    }}
  >
    {cell.code}
  </div>
);

const ErrorModal: React.FC<{
  errorModal: {
    handCode: string;
    userAction: UserAction;
    gtoAction: Exclude<UserAction, null>;
    raise: number;
    call: number;
    fold: number;
    evLost: number;
  };
  scenario: { effectiveStackBb: number; heroPosition: string; villainPosition: string };
  scenarioSlug: string;
  matrixGrid: MatrixCell[][];
  onClose: () => void;
  onNext: () => void;
}> = ({ errorModal, scenario, scenarioSlug, matrixGrid, onClose, onNext }) => {
  const gtoFreq = errorModal.gtoAction === 'raise' ? errorModal.raise
    : errorModal.gtoAction === 'call' ? errorModal.call
    : errorModal.fold;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-5xl rounded-2xl border p-5 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
        style={{
          background: 'linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))',
          borderColor: 'rgba(239,68,68,0.45)',
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500/20 text-lg text-rose-200">✕</div>
            <div>
              <h3 className="text-lg font-bold text-rose-100">Resposta incorreta</h3>
              <p className="text-xs text-slate-300">
                A ação correta para <span className="font-bold text-cyan-200">{errorModal.handCode}</span> é{' '}
                <span className="font-bold text-emerald-200">{getActionLabel(errorModal.gtoAction)}</span>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-white/25 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr_220px]">
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-rose-300">Sua escolha</div>
              <div className="mt-1 text-sm font-extrabold uppercase text-rose-100">{getActionLabel(errorModal.userAction)}</div>
              <div className="mt-2 text-[10px] text-rose-200/80">EV da sua ação</div>
              <div className="text-sm font-bold text-rose-100">-{errorModal.evLost.toFixed(2)}bb</div>
            </div>

            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-300">Ação correta</div>
              <div className="mt-1 text-sm font-extrabold uppercase text-emerald-100">{getActionLabel(errorModal.gtoAction)}</div>
              <div className="mt-2 text-[10px] text-emerald-200/80">Frequência GTO</div>
              <div className="text-sm font-bold text-emerald-100">{gtoFreq.toFixed(0)}%</div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/55 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/85">
                Range GTO — {sanitizeScenarioTitle(scenarioSlug.replace(/-/g, ' '))} ({scenario.effectiveStackBb}bb)
              </h4>
              <div className="flex items-center gap-2 text-[9px] text-slate-300">
                <LegendDot color="#22C55E" label="Raise" />
                <LegendDot color="#7C3AED" label="Call" />
                <LegendDot color="#3B82F6" label="Fold" />
              </div>
            </div>
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(13, 1fr)' }}>
              {matrixGrid.flatMap((row) => row).map((cell) => {
                const isCurrent = normalizeHandCode(errorModal.handCode) === normalizeHandCode(cell.code);
                return <MatrixCellBtn key={cell.code} cell={cell} isCurrent={isCurrent} />;
              })}
            </div>
          </div>

          <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/5 p-3 text-[11px]">
            <div className="text-[9px] font-bold uppercase tracking-widest text-cyan-300/85">Detalhes da mão</div>
            <div className="mt-1 text-base font-black text-white">{errorModal.handCode}</div>
            <div className="mt-2 space-y-1 text-slate-200">
              <div className="flex justify-between"><span className="text-slate-400">Raise</span><span className="font-bold text-emerald-200">{errorModal.raise.toFixed(0)}%</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Call</span><span className="font-bold text-purple-200">{errorModal.call.toFixed(0)}%</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Fold</span><span className="font-bold text-blue-200">{errorModal.fold.toFixed(0)}%</span></div>
              <div className="flex justify-between"><span className="text-slate-400">All-in</span><span className="font-bold text-rose-200">0%</span></div>
            </div>
            <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-500/10 p-2 text-[10px] leading-snug text-amber-100">
              {errorModal.gtoAction === 'fold'
                ? `${errorModal.handCode} não tem valor suficiente para raise. Foldar preserva EV.`
                : errorModal.gtoAction === 'call'
                  ? `${errorModal.handCode} tem playability para call. Mantém range balanceada OOP.`
                  : `${errorModal.handCode} tem equity e leverage para abrir lucrativamente.`}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/25 bg-slate-900/70 px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-200 hover:bg-slate-800"
          >
            Voltar ao Spot
          </button>
          <button
            onClick={onNext}
            className="rounded-xl border px-5 py-2 text-xs font-bold uppercase tracking-wider transition hover:scale-105"
            style={{
              background: 'linear-gradient(180deg,#A855F7,#6D28D9)',
              borderColor: 'rgba(168,85,247,0.6)',
              color: '#FFFFFF',
              boxShadow: '0 0 18px rgba(124,58,237,0.45)',
            }}
          >
            Próximo Spot →
          </button>
        </div>
      </div>
    </div>
  );
};

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="flex items-center gap-1">
    <span className="inline-block h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
    <span>{label}</span>
  </span>
);
