import React, { useState, useEffect } from 'react';
import './GtoStudyMode.css';

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

type Street = 'preflop' | 'flop' | 'turn' | 'river';

export const GtoStudyMode: React.FC = () => {
  const [studyData, setStudyData] = useState<GtoHandStudyData | null>(null);
  const [currentStreet, setCurrentStreet] = useState<Street>('preflop');
  const [showOverlay, setShowOverlay] = useState(true);
  const [actionTaken, setActionTaken] = useState<'fold' | 'call' | 'raise' | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('gto-study-hand');
    if (stored) {
      try {
        setStudyData(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse GTO study data:', e);
      }
    }
  }, []);

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

  const streets: Street[] = ['preflop', 'flop', 'turn', 'river'];

  return (
    <div className="gto-study-mode">
      <div className="study-header">
        <h2>📚 GTO Study Mode</h2>
        <p className="study-subtitle">{sanitizeScenarioTitle(studyData.scenario.title)}</p>
      </div>

      <div className="study-container">
        {/* Left Panel - Table & Action */}
        <div className="study-table-area">
          <div className="poker-table">
            {/* Mesa simplificada */}
            <div className="table-layout">
              <div className="table-felt">
                {/* Small Blind (sua posição) */}
                <div className="player-seat hero-seat">
                  <div className="player-info">
                    <span className="player-label">SB (You)</span>
                    <span className="player-hand">{studyData.handCode}</span>
                  </div>
                </div>

                {/* Big Blind (oponente) */}
                <div className="player-seat villain-seat">
                  <div className="player-info">
                    <span className="player-label">BB</span>
                    <span className="player-hand">?? ?</span>
                  </div>
                </div>

                {/* Pot center */}
                <div className="pot-center">
                  <div className="pot-amount">
                    ${studyData.scenario.smallBlind + studyData.scenario.bigBlind}
                  </div>
                </div>
              </div>
            </div>

            {/* GTO Overlay */}
            {showOverlay && (
              <div className="gto-overlay">
                <div className="overlay-panel">
                  <h3>GTO Recomendação</h3>
                  
                  <div className="recommendation">
                    <div className="action-recommendation">
                      <span className="action-badge" style={{ background: getActionColor(studyData.gtoAction) }}>
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

          {/* Action Buttons */}
          <div className="action-buttons">
            <button 
              className="action-btn fold-action"
              onClick={() => setActionTaken('fold')}
            >
              Fold
            </button>
            <button 
              className="action-btn call-action"
              onClick={() => setActionTaken('call')}
            >
              Call
            </button>
            <button 
              className="action-btn raise-action"
              onClick={() => setActionTaken('raise')}
            >
              Raise
            </button>
          </div>

          {/* Feedback after action */}
          {actionTaken && (
            <div className={`action-feedback ${actionTaken === studyData.gtoAction ? 'correct' : 'incorrect'}`}>
              <p>
                {actionTaken === studyData.gtoAction
                  ? `✅ Correto! GTO recomenda ${getActionLabel(studyData.gtoAction)}`
                  : `❌ GTO recomenda ${getActionLabel(studyData.gtoAction)}, você escolheu ${getActionLabel(actionTaken)}`}
              </p>
              <button 
                className="next-study-btn"
                onClick={() => {
                  setActionTaken(null);
                  setCurrentStreet('preflop');
                }}
              >
                Nova mão →
              </button>
            </div>
          )}
        </div>

        {/* Right Panel - Info */}
        <div className="study-info-panel">
          <div className="info-card">
            <h4>📊 Mão</h4>
            <p className="info-value">{studyData.handCode}</p>
            <p className="info-detail">
              {studyData.handType === 'pares' ? 'Par' : 
               studyData.handType === 'suited' ? 'Suited' : 'Offsuit'}
            </p>
          </div>

          <div className="info-card">
            <h4>⚙️ Cenário</h4>
            <p className="info-value">{studyData.scenario.heroPosition} vs {studyData.scenario.villainPosition}</p>
            <p className="info-detail">
              {studyData.scenario.effectiveStackBb}bb deep<br/>
              {studyData.scenario.smallBlind}/{studyData.scenario.bigBlind}
            </p>
          </div>

          <div className="info-card">
            <h4>🎯 Decisão</h4>
            <p className="info-value" style={{ color: getActionColor(studyData.gtoAction) }}>
              {getActionLabel(studyData.gtoAction)}
            </p>
            <p className="info-detail">
              Frequência GTO<br/>
              {percentageToDisplay(
                studyData.gtoAction === 'raise' ? studyData.raisePctX10 :
                studyData.gtoAction === 'call' ? studyData.limpCheckPctX10 :
                studyData.foldPctX10
              )}%
            </p>
          </div>

          <div className="toggle-overlay">
            <label>
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

      {/* Streets Navigation */}
      <div className="streets-nav">
        {streets.map(street => (
          <button 
            key={street}
            className={`street-btn ${currentStreet === street ? 'active' : ''}`}
            onClick={() => setCurrentStreet(street)}
          >
            {street === 'preflop' && '🎴 Pré-Flop'}
            {street === 'flop' && '🌳 Flop'}
            {street === 'turn' && '🔄 Turn'}
            {street === 'river' && '🏁 River'}
          </button>
        ))}
      </div>
    </div>
  );
};

export default GtoStudyMode;
