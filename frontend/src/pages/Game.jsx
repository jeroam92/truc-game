import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import Card, { FaceDownCard } from '../components/Card';
import LangToggle from '../components/LangToggle';

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
  const myPositionRef = useRef(null);

  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState([]);
  const [onlineIds, setOnlineIds] = useState([]);
  const [challengeFrom, setChallengeFrom] = useState(null);
  const [trickView, setTrickView] = useState(null);
  const [surrenderVote, setSurrenderVote] = useState(null); // { team, initiatorName }
  const [mySurrenderPending, setMySurrenderPending] = useState(false);
  const [playFaceDown, setPlayFaceDown] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatUnread, setChatUnread] = useState(0);
  const chatEndRef = useRef(null);
  const [toast, setToast] = useState(null);
  const [winner, setWinner] = useState(null);
  const [myPosition, setMyPosition] = useState(null);
  const [timerExpiresAt, setTimerExpiresAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  const showToast = useCallback((msg, duration = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }, []);

  function setPosition(pos) {
    myPositionRef.current = pos;
    setMyPosition(pos);
  }

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
    const socket = io('/', { auth: { token }, forceNew: true });
    socketRef.current = socket;

    // Emit immediately (buffered until connected) and re-emit on every reconnect
    socket.emit('room:join', { roomId });
    socket.on('connect', () => {
      socket.emit('room:join', { roomId });
    });

    socket.on('room:players', ({ players: p }) => {
      setPlayers(p);
      if (myPositionRef.current === null) {
        const me = p.find((pl) => pl.userId === user?.id);
        if (me) setPosition(me.position);
      }
    });

    socket.on('room:online', ({ onlineUserIds }) => setOnlineIds(onlineUserIds));

    socket.on('game:state', (state) => {
      setGameState(state);
      if (myPositionRef.current === null) {
        const me = state.players?.find((p) => p.userId === user?.id);
        if (me) setPosition(me.position);
      }
      if (!state.hand?.waitingResponse) setChallengeFrom(null);
    });

    socket.on('game:challenge', ({ from }) => setChallengeFrom(from));

    socket.on('game:fold', ({ type, who }) => {
      showToast(`${who} s'ha retirat del ${type === 'truc' ? 'Truc' : 'Envit'}`);
    });

    socket.on('game:timer', ({ expiresAt }) => setTimerExpiresAt(expiresAt));

    socket.on('game:timeout', () => {
      setTimerExpiresAt(null);
      showToast(t('game.timeout'), 4000);
    });

    socket.on('game:hand-end', ({ winnerTeam, scores }) => {
      setTimerExpiresAt(null);
      showToast(`${t('game.handWon', { team: winnerTeam })} (${scores[1]}-${scores[2]})`);
    });

    socket.on('game:new-hand', ({ hand }) => {
      setChallengeFrom(null);
      setTrickView(null);
      setSurrenderVote(null);
      setMySurrenderPending(false);
      showToast(`Mà ${hand}`);
    });

    socket.on('game:finished', ({ winnerTeam, scores, surrendered }) => {
      setTimerExpiresAt(null);
      setSurrenderVote(null);
      setMySurrenderPending(false);
      setWinner({ team: winnerTeam, scores, surrendered });
    });

    socket.on('game:surrender-vote', ({ team, initiatorName }) => {
      setSurrenderVote({ team, initiatorName });
    });

    socket.on('game:surrender-cancelled', () => {
      setSurrenderVote(null);
      setMySurrenderPending(false);
    });

    socket.on('room:chat', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      setChatUnread((n) => n + 1);
    });

    socket.on('error', ({ message }) => showToast(`Error: ${message}`, 4000));

    return () => socket.disconnect();
  }, [roomId, token, user, t, showToast]);

  function playCard(index) {
    socketRef.current?.emit('game:play-card', { roomId, cardIndex: index, faceDown: playFaceDown });
    setPlayFaceDown(false);
  }

  function challengeTruc() {
    socketRef.current?.emit('game:challenge-truc', { roomId });
  }

  function challengeEnvit() {
    socketRef.current?.emit('game:challenge-envit', { roomId });
  }

  function respondChallenge(accept) {
    if (!waitingResp) return;
    const event = waitingResp.type === 'truc' ? 'game:respond-truc' : 'game:respond-envit';
    socketRef.current?.emit(event, { roomId, accept });
    if (!accept) setChallengeFrom(null);
  }

  function raiseChallenge() {
    socketRef.current?.emit('game:challenge-truc', { roomId });
  }

  function requestSurrender() {
    setMySurrenderPending(true);
    socketRef.current?.emit('game:surrender-request', { roomId });
  }

  function cancelSurrender() {
    setMySurrenderPending(false);
    socketRef.current?.emit('game:surrender-cancel', { roomId });
  }

  function acceptSurrender() {
    socketRef.current?.emit('game:surrender-request', { roomId });
  }

  function sendChat(e) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    socketRef.current?.emit('room:chat', { roomId, message: text });
    setChatInput('');
  }

  function toggleChat() {
    setChatOpen((o) => {
      if (!o) setChatUnread(0);
      return !o;
    });
  }

  useEffect(() => {
    if (chatOpen) {
      setChatUnread(0);
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatOpen, chatMessages]);

  const hand = gameState?.hand;
  const waitingResp = hand?.waitingResponse ?? null;
  const isMyTurn = hand && hand.currentPlayer === myPosition && !waitingResp && !hand.handWinner;

  // Reset face-down toggle when it stops being my turn (declared after isMyTurn to avoid TDZ)
  useEffect(() => {
    if (!isMyTurn) setPlayFaceDown(false);
  }, [isMyTurn]);
  const myTeam = players.find((p) => p.position === myPosition)?.team;
  const seating = myPosition !== null ? getSeatingLayout(myPosition) : null;
  const isMyTeamResponding = waitingResp && myTeam === waitingResp.toTeam;
  const isSurrenderFromMyTeam = surrenderVote?.team === myTeam;
  const isTeammateRequestingSurrender = isSurrenderFromMyTeam && !mySurrenderPending;

  const trucLabel = () => {
    if (!hand) return t('game.truc');
    const step = hand.truc.step;
    if (hand.truc.status === 'none' || hand.truc.status === 'folded') return t('game.truc');
    if (step === 0) return 'Retruc';
    if (step === 1) return 'Quatre Val';
    if (step === 2) return 'Joc Fora';
    return t('game.truc');
  };

  const canTruc = hand && !hand.handWinner && hand.truc.step < 3 &&
    (!waitingResp || (waitingResp.type === 'truc' && waitingResp.toTeam === myTeam)) &&
    hand.truc.lastCallerTeam !== myTeam;

  const canEnvitInitial = hand && hand.canEnvit && !waitingResp &&
    hand.envit.status === 'none' && hand.truc.status === 'none';
  const canEnvitRaise = hand && hand.canEnvit && !waitingResp &&
    hand.envit.status === 'accepted' &&
    hand.envit.lastCallerTeam !== myTeam &&
    hand.envit.step < 2; // step 0 → Torne; step 1 → Falta
  const canEnvit = canEnvitInitial || canEnvitRaise;

  if (!gameState) {
    return (
      <div className="auth-page">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <p style={{ color: 'var(--text)', fontSize: '1.1rem', fontFamily: 'Cinzel, serif' }}>Carregant partida...</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>Connectant al servidor</p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-page">
      {/* Header */}
      <div className="game-header">
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <LangToggle />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{user?.username}</span>
        </div>

        <div className="score-board">
          <div className="score-team">
            <div className="team-name" style={{ color: 'rgba(196,30,58,0.8)' }}>{t('game.team1')}</div>
            <div className="score">{gameState.scores?.[1] ?? 0}</div>
            <div className="pierna-dots">
              {[0, 1].map((i) => (
                <span key={i} className={`pierna-dot${(gameState.piernas?.[1] ?? 0) > i ? ' won' : ''}`} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
            <span className="score-divider">–</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>/ 12</span>
          </div>
          <div className="score-team">
            <div className="team-name" style={{ color: 'rgba(26,100,180,0.8)' }}>{t('game.team2')}</div>
            <div className="score">{gameState.scores?.[2] ?? 0}</div>
            <div className="pierna-dots">
              {[0, 1].map((i) => (
                <span key={i} className={`pierna-dot${(gameState.piernas?.[2] ?? 0) > i ? ' won' : ''}`} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {hand?.truc.status !== 'none' && (
            <span style={{ fontSize: '0.8rem', color: 'var(--gold)' }}>
              Truc: {hand?.truc.status === 'accepted' ? `${['2','3','4','24'][hand.truc.step]} pts` : hand?.truc.status}
            </span>
          )}
          <button className="chat-toggle-btn" onClick={toggleChat}>
            💬 Xat{chatUnread > 0 && !chatOpen ? <span className="chat-badge">{chatUnread}</span> : null}
          </button>
        </div>
      </div>

      {/* Game area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0.75rem', gap: '0.5rem', overflow: 'hidden' }}>

        {/* Status bar */}
        <div className={`status-bar ${isMyTurn ? 'your-turn' : ''}`}>
          {hand?.handWinner ? t('game.handWon', { team: hand.handWinner }) :
           waitingResp ? `Esperant resposta de l'Equip ${waitingResp.toTeam}...` :
           isMyTurn ? t('game.yourTurn') :
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

        {/* Trick dots — clickable to view past tricks */}
        {hand && (
          <div className="tricks-indicator">
            {hand.trickWinners.map((team, i) => (
              <button
                key={i}
                className={`trick-dot team${team} trick-dot-btn`}
                title={`Baza ${i + 1}: Equip ${team} — clic per veure`}
                onClick={() => setTrickView(i)}
              />
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
            <div style={{ textAlign: 'center', minWidth: 75 }}>
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
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                    {getPlayerName(players, play.position)}
                    {play.faceDown && <span style={{ color: 'var(--gold)', marginLeft: 3 }}>↓</span>}
                  </div>
                  {play.card ? (
                    <div style={{ opacity: play.faceDown ? 0.75 : 1, position: 'relative' }}>
                      <Card card={play.card} disabled />
                      {play.faceDown && (
                        <div style={{
                          position: 'absolute', inset: 0, borderRadius: 8,
                          background: 'rgba(0,0,0,0.35)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '1.4rem', pointerEvents: 'none',
                        }}>🂠</div>
                      )}
                    </div>
                  ) : (
                    <FaceDownCard />
                  )}
                </div>
              ))}
              {(!hand?.currentTrickPlays?.length) && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Mà {gameState.currentHand}
                </span>
              )}
            </div>
          </div>

          {seating && (
            <div style={{ textAlign: 'center', minWidth: 75 }}>
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
            {user?.username}{isMyTurn ? ` — ${t('game.yourTurn')}` : ''}
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
          <button className="btn btn-primary" disabled={!canTruc} onClick={challengeTruc}>
            {trucLabel()}
          </button>
          <button className="btn btn-secondary" disabled={!canEnvit} onClick={challengeEnvit}>
            {hand?.envit?.status === 'accepted' && hand?.envit?.lastCallerTeam !== myTeam
              ? (hand.envit.step === 0 ? 'Torne' : 'Falta')
              : 'Envit'}
          </button>
          {isMyTurn && (
            <button
              className={`btn ${playFaceDown ? 'btn-gold' : 'btn-secondary'}`}
              style={{ fontSize: '0.8rem' }}
              onClick={() => setPlayFaceDown((v) => !v)}
              title="Juga la pròxima carta tapada (sense valor)"
            >
              {playFaceDown ? '🂠 Tapada ✓' : '🂠 Tapada'}
            </button>
          )}
          {gameState.phase === 'playing' && (
            mySurrenderPending ? (
              <button className="btn btn-secondary" style={{ fontSize: '0.8rem', opacity: 0.8 }} onClick={cancelSurrender}>
                Cancel·lar rendició
              </button>
            ) : (
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}
                disabled={!!surrenderVote && !isSurrenderFromMyTeam}
                onClick={requestSurrender}
              >
                Rendir-se
              </button>
            )
          )}
        </div>
      </div>

      {/* Challenge response modal */}
      {waitingResp && isMyTeamResponding && (
        <div className="challenge-overlay">
          <div className="challenge-modal">
            <h2>{waitingResp.label}</h2>
            <p>
              {challengeFrom ? `${challengeFrom} ha cantat` : "L'equip contrari ha cantat"}{' '}
              <strong>{waitingResp.label}</strong>.
              <br />L'Equip {waitingResp.toTeam} ha de respondre.
            </p>
            <div className="challenge-actions">
              <button className="btn btn-primary" onClick={() => respondChallenge(true)}>
                {t('game.accept')}
              </button>
              {waitingResp.type === 'truc' && waitingResp.label !== 'Joc Fora' && (
                <button className="btn btn-gold" onClick={raiseChallenge}>
                  Pujar
                </button>
              )}
              {waitingResp.type === 'envit' && waitingResp.label !== 'Falta' && (
                <button className="btn btn-gold" onClick={() => socketRef.current?.emit('game:challenge-envit', { roomId })}>
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

      {/* Surrender vote modal (teammate requesting surrender) */}
      {isTeammateRequestingSurrender && (
        <div className="challenge-overlay">
          <div className="challenge-modal">
            <h2 style={{ color: 'var(--text-muted)' }}>Votació de rendició</h2>
            <p>
              <strong>{surrenderVote.initiatorName}</strong> vol rendir-se.<br />
              Si acceptes, l'Equip {surrenderVote.team} perdrà la partida.
            </p>
            <div className="challenge-actions">
              <button className="btn btn-primary" onClick={acceptSurrender}>
                Acceptar
              </button>
              <button className="btn btn-secondary" onClick={cancelSurrender}>
                Rebutjar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trick history modal */}
      {trickView !== null && hand?.tricks?.[trickView] && (
        <div className="challenge-overlay" onClick={() => setTrickView(null)}>
          <div className="challenge-modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: '0.25rem' }}>Baza {trickView + 1}</h2>
            <p style={{
              color: hand.trickWinners[trickView] === 1 ? 'rgba(196,30,58,0.9)' : 'rgba(100,160,255,0.9)',
              marginBottom: '1.25rem',
              fontSize: '0.95rem',
            }}>
              Guanya Equip {hand.trickWinners[trickView]}
            </p>
            <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {hand.tricks[trickView].map((play, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 5 }}>
                    {getPlayerName(players, play.position)}
                    {play.faceDown && <span style={{ color: 'var(--gold)', marginLeft: 3 }} title="Jugada tapada">↓</span>}
                  </div>
                  <div style={{ opacity: play.faceDown ? 0.65 : 1 }}>
                    <Card card={play.card} disabled />
                  </div>
                  {play.faceDown && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--gold)', marginTop: 3 }}>tapada</div>
                  )}
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" style={{ marginTop: '1.5rem' }} onClick={() => setTrickView(null)}>
              Tancar
            </button>
          </div>
        </div>
      )}

      {/* Winner banner */}
      {winner && (
        <div className="winner-banner">
          <div className="winner-card">
            <h1>🏆</h1>
            <h2 style={{ color: 'var(--gold)' }}>{t('game.gameWon', { team: winner.team })}</h2>
            {winner.surrendered && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>per rendició</p>
            )}
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

      {/* In-game chat panel */}
      {chatOpen && (
        <div className="ingame-chat">
          <div className="ingame-chat-header">
            <span>Xat</span>
            <button className="ingame-chat-close" onClick={toggleChat}>✕</button>
          </div>
          <div className="ingame-chat-messages">
            {chatMessages.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem' }}>
                Sense missatges...
              </p>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-msg${msg.username === user?.username ? ' mine' : ''}`}>
                <span className="chat-author">{msg.username}</span>
                <span className="chat-text">{msg.message}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form className="chat-form" onSubmit={sendChat}>
            <input
              className="chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Missatge..."
              maxLength={200}
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
              disabled={!chatInput.trim()}>
              ➤
            </button>
          </form>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
