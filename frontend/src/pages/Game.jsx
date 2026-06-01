import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import Card, { FaceDownCard } from '../components/Card';
import LangToggle from '../components/LangToggle';

// Seating layout: player at bottom (position=myPos), partners/opponents around
function getSeatingLayout(myPosition) {
  return {
    bottom: myPosition,
    left: (myPosition + 1) % 4,
    top: (myPosition + 2) % 4,
    right: (myPosition + 3) % 4,
  };
}

function getPlayerName(players, position) {
  return players.find((p) => p.position === position)?.username || `J${position + 1}`;
}

export default function Game() {
  const { roomId } = useParams();
  const { t } = useTranslation();
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState([]);
  const [onlineIds, setOnlineIds] = useState([]);
  const [challenge, setChallenge] = useState(null);
  const [toast, setToast] = useState(null);
  const [winner, setWinner] = useState(null);
  const [myPosition, setMyPosition] = useState(null);
  const [timerExpiresAt, setTimerExpiresAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  const showToast = useCallback((msg, duration = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }, []);

  useEffect(() => {
    if (!timerExpiresAt) { setTimeLeft(null); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((timerExpiresAt - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) setTimerExpiresAt(null);
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [timerExpiresAt]);

  useEffect(() => {
    const socket = io('/', { auth: { token } });
    socketRef.current = socket;

    socket.emit('room:join', { roomId });

    socket.on('room:players', ({ players: p }) => {
      setPlayers(p);
      const me = p.find((pl) => pl.userId === user?.id);
      if (me) setMyPosition(me.position);
    });
    socket.on('room:online', ({ onlineUserIds }) => setOnlineIds(onlineUserIds));

    socket.on('game:state', (state) => {
      setGameState(state);
      if (myPosition === null) {
        const me = state.players?.find((p) => p.userId === user?.id);
        if (me) setMyPosition(me.position);
      }
    });

    socket.on('game:challenge', ({ type, from, label, toTeam }) => {
      setChallenge({ type, from, label, toTeam });
    });

    socket.on('game:fold', ({ type, who }) => {
      showToast(`${who} s'ha retirat del ${type === 'truc' ? 'Truc' : 'Envit'}`);
    });

    socket.on('game:timer', ({ expiresAt }) => {
      setTimerExpiresAt(expiresAt);
    });

    socket.on('game:timeout', () => {
      setTimerExpiresAt(null);
      showToast(t('game.timeout'), 4000);
    });

    socket.on('game:hand-end', ({ winnerTeam, scores }) => {
      setTimerExpiresAt(null);
      showToast(`${t('game.handWon', { team: winnerTeam })} (${scores[1]}-${scores[2]})`);
    });

    socket.on('game:new-hand', ({ hand }) => {
      setChallenge(null);
      showToast(`Mà ${hand}`);
    });

    socket.on('game:finished', ({ winnerTeam, scores }) => {
      setTimerExpiresAt(null);
      setWinner({ team: winnerTeam, scores });
    });

    socket.on('error', ({ message }) => showToast(`Error: ${message}`, 4000));

    return () => socket.disconnect();
  }, [roomId, token, user, myPosition, t, showToast]);

  function playCard(index) {
    socketRef.current?.emit('game:play-card', { roomId, cardIndex: index });
  }

  function challengeTruc() {
    socketRef.current?.emit('game:challenge-truc', { roomId });
  }

  function challengeEnvit() {
    socketRef.current?.emit('game:challenge-envit', { roomId });
  }

  function respondChallenge(accept) {
    if (!challenge) return;
    const event = challenge.type === 'truc' ? 'game:respond-truc' : 'game:respond-envit';
    socketRef.current?.emit(event, { roomId, accept });
    setChallenge(null);
  }

  const hand = gameState?.hand;
  const isMyTurn = hand && hand.currentPlayer === myPosition && !hand.waitingResponse && !hand.handWinner;
  const myTeam = players.find((p) => p.position === myPosition)?.team;
  const seating = myPosition !== null ? getSeatingLayout(myPosition) : null;
  const isMyTeamResponding = challenge && myTeam === challenge.toTeam;

  const trucLabel = () => {
    if (!hand) return t('game.truc');
    const step = hand.truc.step;
    if (hand.truc.status === 'none' || hand.truc.status === 'folded') return t('game.truc');
    if (step === 0) return t('game.retruc');
    if (step === 1) return 'Quatre Val';
    if (step === 2) return 'Joc Fora';
    return t('game.truc');
  };

  const canTruc = hand && !hand.waitingResponse && !hand.handWinner &&
    hand.truc.lastCallerTeam !== myTeam &&
    hand.truc.step < 3;

  const canEnvit = hand && hand.canEnvit && !hand.waitingResponse &&
    (hand.envit.status === 'none') && hand.truc.status === 'none';

  if (!gameState) {
    return (
      <div className="auth-page">
        <p style={{ color: 'var(--text-muted)' }}>Carregant partida...</p>
      </div>
    );
  }

  return (
    <div className="game-page">
      {/* Header */}
      <div className="game-header">
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <LangToggle />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user?.username}</span>
        </div>

        <div className="score-board">
          <div className="score-team">
            <div className="team-name" style={{ color: 'rgba(196,30,58,0.8)' }}>{t('game.team1')}</div>
            <div className="score">{gameState.scores?.[1] ?? 0}</div>
          </div>
          <span className="score-divider">–</span>
          <div className="score-team">
            <div className="team-name" style={{ color: 'rgba(26,100,180,0.8)' }}>{t('game.team2')}</div>
            <div className="score">{gameState.scores?.[2] ?? 0}</div>
          </div>
          <div style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ 24</div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {hand?.truc.status !== 'none' && (
            <span style={{ color: 'var(--gold)' }}>
              Truc: {hand?.truc.status === 'accepted' ? `${['2','3','4','24'][hand.truc.step]} pts` : hand?.truc.status}
            </span>
          )}
        </div>
      </div>

      {/* Game area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0.75rem', gap: '0.5rem', overflow: 'hidden' }}>

        {/* Status bar */}
        <div className={`status-bar ${isMyTurn ? 'your-turn' : ''}`}>
          {hand?.handWinner ? t('game.handWon', { team: hand.handWinner }) :
           isMyTurn ? t('game.yourTurn') :
           hand?.waitingResponse ? `Esperant resposta de l'Equip ${hand.waitingResponse.toTeam}...` :
           `Torn de ${seating ? getPlayerName(players, hand?.currentPlayer) : '...'}`}
        </div>

        {/* Turn timer */}
        {timeLeft !== null && (
          <div className="turn-timer-wrap">
            <div className="turn-timer-bar-bg">
              <div
                className={`turn-timer-bar${timeLeft <= 30 ? ' urgent' : ''}${timeLeft <= 10 ? ' critical' : ''}`}
                style={{ width: `${(timeLeft / 120) * 100}%` }}
              />
            </div>
            <span className={`turn-timer-label${isMyTurn ? ' my-turn' : ''}`}>
              {timeLeft}s
            </span>
          </div>
        )}

        {/* Trick dots */}
        {hand && (
          <div className="tricks-indicator">
            {hand.trickWinners.map((team, i) => (
              <div key={i} className={`trick-dot team${team}`} title={`Baza ${i + 1}: Equip ${team}`} />
            ))}
            {Array.from({ length: 3 - hand.trickWinners.length }).map((_, i) => (
              <div key={`empty-${i}`} className="trick-dot" />
            ))}
          </div>
        )}

        {/* Opponent top */}
        {seating && (
          <div>
            <div className={`player-label ${hand?.currentPlayer === seating.top ? 'active' : ''}`}>
              {getPlayerName(players, seating.top)}
              {onlineIds.includes(players.find((p) => p.position === seating.top)?.userId) ? ' 🟢' : ' ⚫'}
            </div>
            <div className="opponent-zone">
              {Array.from({ length: hand?.cardCounts?.[seating.top] ?? 0 }).map((_, i) => (
                <FaceDownCard key={i} small />
              ))}
            </div>
          </div>
        )}

        {/* Middle row: left opponent, table, right opponent */}
        <div style={{ display: 'flex', flex: 1, gap: '0.5rem', alignItems: 'center' }}>
          {seating && (
            <div style={{ textAlign: 'center', minWidth: 70 }}>
              <div className={`player-label ${hand?.currentPlayer === seating.left ? 'active' : ''}`}>
                {getPlayerName(players, seating.left)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'center' }}>
                {Array.from({ length: hand?.cardCounts?.[seating.left] ?? 0 }).map((_, i) => (
                  <FaceDownCard key={i} small />
                ))}
              </div>
            </div>
          )}

          {/* Table (played cards this trick) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="played-cards">
              {hand?.currentTrickPlays?.map((play, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                    {getPlayerName(players, play.position)}
                  </div>
                  <Card card={play.card} disabled />
                </div>
              ))}
              {(!hand?.currentTrickPlays?.length) && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Mà {gameState.currentHand}
                </span>
              )}
            </div>
          </div>

          {seating && (
            <div style={{ textAlign: 'center', minWidth: 70 }}>
              <div className={`player-label ${hand?.currentPlayer === seating.right ? 'active' : ''}`}>
                {getPlayerName(players, seating.right)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'center' }}>
                {Array.from({ length: hand?.cardCounts?.[seating.right] ?? 0 }).map((_, i) => (
                  <FaceDownCard key={i} small />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* My hand */}
        <div>
          <div className={`player-label ${isMyTurn ? 'active' : ''}`}>
            {user?.username} {t('game.yourTurn') && isMyTurn ? `— ${t('game.yourTurn')}` : ''}
          </div>
          <div className="hand-zone">
            {hand?.myHand?.map((card, i) => (
              <Card
                key={i}
                card={card}
                onClick={isMyTurn ? () => playCard(i) : undefined}
                disabled={!isMyTurn}
              />
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="action-panel">
          <button
            className="btn btn-primary"
            disabled={!canTruc}
            onClick={challengeTruc}
          >
            {trucLabel()}
          </button>
          <button
            className="btn btn-secondary"
            disabled={!canEnvit}
            onClick={challengeEnvit}
          >
            Envit
          </button>
        </div>
      </div>

      {/* Challenge response modal */}
      {challenge && isMyTeamResponding && (
        <div className="challenge-overlay">
          <div className="challenge-modal">
            <h2>{challenge.label}</h2>
            <p>
              {challenge.from} ha cantat <strong>{challenge.label}</strong>.
              <br />L'Equip {challenge.toTeam} ha de respondre.
            </p>
            <div className="challenge-actions">
              <button className="btn btn-primary" onClick={() => respondChallenge(true)}>
                {t('game.accept')}
              </button>
              {challenge.type === 'truc' && (
                <button
                  className="btn btn-gold"
                  onClick={() => {
                    setChallenge(null);
                    if (challenge.label === 'Truc') socketRef.current?.emit('game:challenge-truc', { roomId });
                    else if (challenge.label === 'Retruc') socketRef.current?.emit('game:challenge-truc', { roomId });
                    else if (challenge.label === 'Quatre Val') socketRef.current?.emit('game:challenge-truc', { roomId });
                  }}
                >
                  Pujar
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => respondChallenge(false)}>
                {t('game.fold')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Winner banner */}
      {winner && (
        <div className="winner-banner">
          <div className="winner-card">
            <h1>🏆</h1>
            <h2 style={{ color: 'var(--gold)' }}>{t('game.gameWon', { team: winner.team })}</h2>
            <p style={{ marginTop: '0.5rem' }}>{winner.scores[1]} – {winner.scores[2]}</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                {t('game.newGame')}
              </button>
              <button className="btn btn-secondary" onClick={() => navigate('/lobby')}>
                {t('game.backLobby')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
