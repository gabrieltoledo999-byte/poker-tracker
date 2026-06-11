import React, { useEffect, useState } from 'react';
import { PokerTableReplay } from '@/components/hand-reviewer/PokerTableReplay';
import type { ReplaySeatState, ReplayStep } from '@/utils/actionNormalizer';
import './GtoTrainer.css';

interface GtoHandStudyData {
  handCode: string;
  handType: 'pares' | 'suited' | 'offsuit';
  raisePctX10: number;
  limpCheckPctX10: number;
  foldPctX10: number;
  scenario: {
    slug: string;
    title: string;
    heroPosition: string;
    villainPosition: string;
    smallBlind: number;
    bigBlind: number;
    effectiveStackBb: number;
  };
  gtoAction: 'fold' | 'call' | 'raise';
}

function sanitizeScenarioTitle(title: string): string {
  return title.replace(/\bwizard\b/gi, 'Solver').replace(/\s{2,}/g, ' ').trim();
}

export const GtoStudyTable: React.FC = () => {
  const [studyData, setStudyData] = useState<GtoHandStudyData | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [userAction, setUserAction] = useState<'fold' | 'call' | 'raise' | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(0);
  const [step, setStep] = useState<ReplayStep | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('gto-study-hand');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setStudyData(data);
        buildReplayStep(data);
      } catch (e) {
        console.error('Failed to parse GTO study data:', e);
      }
    }
  }, []);

  const getHeroCardsFromHandCode = (handCode: string): [string, string] => {
    const clean = handCode.trim().toUpperCase();

    if (clean.length < 2) {
      return ['As', 'Kd'];
    }

    const rank1 = clean[0];
    const rank2 = clean[1];
    const suffix = clean[2] ?? '';

    if (rank1 === rank2) {
      return [`${rank1}h`, `${rank2}d`];
    }

    if (suffix === 'S') {
      return [`${rank1}s`, `${rank2}s`];
    }

    return [`${rank1}s`, `${rank2}d`];
  };

  const buildReplayStep = (data: GtoHandStudyData) => {
    const sb = data.scenario.smallBlind;
    const bb = data.scenario.bigBlind;
    const startingStack = data.scenario.effectiveStackBb * bb;
    const [heroCard1, heroCard2] = getHeroCardsFromHandCode(data.handCode);

    const seats: ReplaySeatState[] = [
      {
        seat: 0,
        name: 'Hero',
        position: data.scenario.heroPosition,
        startingStack,
        stackApprox: Math.max(startingStack - sb, 0),
        contributedCurrentRound: sb,
        forcedPosted: { smallBlind: sb },
        holeCards: [heroCard1, heroCard2],
        revealedCards: [],
        isHero: true,
        isButton: true,
        isSmallBlind: true,
        isBigBlind: false,
        status: 'active',
        lastAction: `SB ${sb}`,
      },
      {
        seat: 1,
        name: 'Villain',
        position: data.scenario.villainPosition,
        startingStack,
        stackApprox: Math.max(startingStack - bb, 0),
        contributedCurrentRound: bb,
        forcedPosted: { bigBlind: bb },
        holeCards: [],
        revealedCards: [],
        isHero: false,
        isButton: false,
        isSmallBlind: false,
        isBigBlind: true,
        status: 'active',
        lastAction: `BB ${bb}`,
      },
    ];

    const initialStep: ReplayStep = {
      stepIndex: 0,
      street: 'preflop',
      actingPlayer: 'Hero',
      action: null,
      actionLabel: `${data.scenario.heroPosition} to act`,
      actionAmount: 0,
      pot: sb + bb,
      board: [],
      seats,
    };

    setStep(initialStep);
  };

  if (!studyData) {
    return (
      <div className="gto-study-mode">
        <div className="study-loading">
          <p>Carregando dados da mão...</p>
        </div>
      </div>
    );
  }

  const getActionColor = (action: 'fold' | 'call' | 'raise'): string => {
    switch (action) {
      case 'fold': return '#ff6b6b';
      case 'call': return '#ffd93d';
      case 'raise': return '#4caf50';
    }
  };

  const getActionLabel = (action: 'fold' | 'call' | 'raise'): string => {
    switch (action) {
      case 'fold': return 'Fold';
      case 'call': return 'Call 3.5x';
      case 'raise': return 'Raise 3.5x';
    }
  };

  const percentageToDisplay = (pctX10: number): number => pctX10 / 10;

  return (
    <div className="gto-study-table">
      <div className="study-header">
        <h2>📚 GTO Study Table</h2>
        <p className="study-subtitle">{sanitizeScenarioTitle(studyData.scenario.title)}</p>
      </div>

      <div className="table-wrapper">
        <div className="poker-table-container">
          {/* Replayer Table */}
          <div className="replayer-area">
            {step && (
              <PokerTableReplay
                className="h-[520px] sm:h-[620px]"
                step={step}
                previousStep={null}
                maxPlayers={2}
                selectedSeat={selectedSeat}
                onSelectSeat={setSelectedSeat}
                displayUnit="chips"
                bigBlind={studyData.scenario.bigBlind}
              />
            )}
          </div>

          {/* GTO Overlay */}
          {showOverlay && (
            <div className="gto-overlay-table">
              <div className="overlay-panel-table">
                <h3>GTO Recomendação</h3>

                <div className="recommendation">
                  <div className="action-recommendation">
                    <span 
                      className="action-badge" 
                      style={{ background: getActionColor(studyData.gtoAction) }}
                    >
                      {getActionLabel(studyData.gtoAction)}
                    </span>
                    <span className="action-strength">Recomendado</span>
                  </div>
                </div>

                <div className="frequencies">
                  <div className="freq-item">
                    <span className="freq-label">Raise</span>
                    <span className="freq-bar">
                      <div
                        className="freq-fill raise-fill"
                        style={{ width: `${percentageToDisplay(studyData.raisePctX10)}%` }}
                      />
                    </span>
                    <span className="freq-value">{percentageToDisplay(studyData.raisePctX10)}%</span>
                  </div>

                  <div className="freq-item">
                    <span className="freq-label">Call</span>
                    <span className="freq-bar">
                      <div
                        className="freq-fill call-fill"
                        style={{ width: `${percentageToDisplay(studyData.limpCheckPctX10)}%` }}
                      />
                    </span>
                    <span className="freq-value">{percentageToDisplay(studyData.limpCheckPctX10)}%</span>
                  </div>

                  <div className="freq-item">
                    <span className="freq-label">Fold</span>
                    <span className="freq-bar">
                      <div
                        className="freq-fill fold-fill"
                        style={{ width: `${percentageToDisplay(studyData.foldPctX10)}%` }}
                      />
                    </span>
                    <span className="freq-value">{percentageToDisplay(studyData.foldPctX10)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Info Panel */}
        <div className="study-info-panel-table">
          <div className="info-card">
            <h4>📊 Sua Mão</h4>
            <p className="info-value">{studyData.handCode}</p>
            <p className="info-detail">
              {studyData.handType === 'pares' ? '👥 Par' :
                studyData.handType === 'suited' ? '♣ Suited' : '♦ Offsuit'}
            </p>
          </div>

          <div className="info-card">
            <h4>⚙️ Mesa</h4>
            <p className="info-value">{studyData.scenario.heroPosition} vs {studyData.scenario.villainPosition}</p>
            <p className="info-detail">
              {studyData.scenario.effectiveStackBb}bb deep<br/>
              Blinds: {studyData.scenario.smallBlind}/{studyData.scenario.bigBlind}
            </p>
          </div>

          <div className="info-card">
            <h4>🎯 GTO Decisão</h4>
            <p className="info-value" style={{ color: getActionColor(studyData.gtoAction) }}>
              {getActionLabel(studyData.gtoAction)}
            </p>
            <p className="info-detail">
              Frequência: {percentageToDisplay(
                studyData.gtoAction === 'raise' ? studyData.raisePctX10 :
                studyData.gtoAction === 'call' ? studyData.limpCheckPctX10 :
                studyData.foldPctX10
              )}%
            </p>
          </div>

          <div className="action-buttons-table">
            <button
              className="action-btn-table fold-action"
              onClick={() => setUserAction('fold')}
              disabled={userAction !== null}
            >
              Fold
            </button>
            <button
              className="action-btn-table call-action"
              onClick={() => setUserAction('call')}
              disabled={userAction !== null}
            >
              Call
            </button>
            <button
              className="action-btn-table raise-action"
              onClick={() => setUserAction('raise')}
              disabled={userAction !== null}
            >
              Raise
            </button>
          </div>

          {userAction && (
            <div className={`action-feedback-table ${userAction === studyData.gtoAction ? 'correct' : 'incorrect'}`}>
              <p>
                {userAction === studyData.gtoAction
                  ? `✅ Correto! GTO recomenda ${getActionLabel(studyData.gtoAction)}`
                  : `❌ GTO recomenda ${getActionLabel(studyData.gtoAction)}, você escolheu ${getActionLabel(userAction)}`}
              </p>
            </div>
          )}

          <label className="toggle-overlay-table">
            <input
              type="checkbox"
              checked={showOverlay}
              onChange={(e) => setShowOverlay(e.target.checked)}
            />
            Mostrar overlay GTO
          </label>
        </div>
      </div>
    </div>
  );
};

export default GtoStudyTable;
