const { createDeck, deal, calcEnvit } = require('./deck');

// Truc Valencià - Game Engine
//
// 4 players, 2 teams (positions 0,2 = team1; positions 1,3 = team2)
// First to 24 points wins a "cama" (game)
// Each hand: up to 3 tricks (bazas); team winning 2+ tricks takes the hand
//
// Truc bet progression: truc(2) → retruc(3) → quatre-val(4) → joc-fora(24)
// Envit bet: envit(2) → torne(4) → falta(pts to win)
//
// Scoring: 1pt for winning a hand (base), more if truc/envit was played

const WINNING_SCORE = 24;

const TRUC_STEPS = [
  { label: 'Truc',       value: 2,  foldGives: 1 },
  { label: 'Retruc',     value: 3,  foldGives: 2 },
  { label: 'Quatre Val', value: 4,  foldGives: 3 },
  { label: 'Joc Fora',   value: 24, foldGives: 4 },
];

const ENVIT_STEPS = [
  { label: 'Envit', value: 2,  foldGives: 1 },
  { label: 'Torne', value: 4,  foldGives: 2 },
];

function getTeam(position) { return position % 2 === 0 ? 1 : 2; }
function oppTeam(team) { return team === 1 ? 2 : 1; }
function nextPos(pos) { return (pos + 1) % 4; }

function createInitialState(players) {
  return {
    players, // [{userId, position, team}]
    scores: { 1: 0, 2: 0 },
    currentHand: 0,
    hand: null,
    phase: 'waiting',
    winnerTeam: null,
  };
}

function newHand(state, dealerPosition) {
  const hands = deal(createDeck());
  const mano = nextPos(dealerPosition);
  return {
    ...state,
    currentHand: state.currentHand + 1,
    phase: 'playing',
    hand: {
      dealerPosition,
      manoPosition: mano,
      currentPlayer: mano,
      currentTrick: 0,
      currentTrickPlays: [],
      tricks: [],
      trickWinners: [],
      playerHands: Object.fromEntries(state.players.map((p) => [p.position, hands[p.position]])),
      handWinner: null,
      // Truc state
      truc: { step: -1, status: 'none', lastCaller: null, lastCallerTeam: null },
      // Envit state
      envit: { step: -1, status: 'none', lastCaller: null, lastCallerTeam: null, scores: null, winner: null },
      // Pending response
      waitingResponse: null, // { type:'truc'|'envit', toTeam, step }
      // Allowed actions for current player
      canEnvit: true, // only before first trick ends
    },
  };
}

function playCard(state, playerPosition, cardIndex) {
  const h = state.hand;
  if (h.waitingResponse) return { error: 'Esperant resposta al desafiament' };
  if (h.currentPlayer !== playerPosition) return { error: 'No és el teu torn' };
  if (h.handWinner !== null) return { error: 'La mà ja ha acabat' };

  const playerCards = h.playerHands[playerPosition];
  if (cardIndex < 0 || cardIndex >= playerCards.length) return { error: 'Carta invàlida' };

  const card = playerCards[cardIndex];
  const newCards = playerCards.filter((_, i) => i !== cardIndex);
  const newPlays = [...h.currentTrickPlays, { position: playerPosition, card }];

  if (newPlays.length === 4) {
    // Resolve trick
    const winner = resolveTrick(newPlays, h.manoPosition);
    const winnerTeam = getTeam(winner.position);
    const newTrickWinners = [...h.trickWinners, winnerTeam];
    const newTricks = [...h.tricks, newPlays];
    const handWinner = checkHandWinner(newTrickWinners, h.manoPosition, state.players);

    const updatedHand = {
      ...h,
      currentTrick: h.currentTrick + 1,
      tricks: newTricks,
      currentTrickPlays: [],
      currentPlayer: winner.position,
      playerHands: { ...h.playerHands, [playerPosition]: newCards },
      trickWinners: newTrickWinners,
      handWinner,
      canEnvit: false,
    };

    if (handWinner !== null) {
      return resolveHand({ ...state, hand: updatedHand });
    }
    return { ...state, hand: updatedHand };
  }

  return {
    ...state,
    hand: {
      ...h,
      currentTrickPlays: newPlays,
      currentPlayer: nextPos(playerPosition),
      playerHands: { ...h.playerHands, [playerPosition]: newCards },
      canEnvit: h.currentTrick === 0 && newPlays.length < 4,
    },
  };
}

function resolveTrick(plays, manoPosition) {
  let best = null;
  for (const play of plays) {
    if (!best || play.card.rank > best.card.rank ||
        (play.card.rank === best.card.rank && play.position === manoPosition)) {
      best = play;
    }
  }
  return best;
}

function checkHandWinner(trickWinners, manoPosition, players) {
  const t1 = trickWinners.filter((t) => t === 1).length;
  const t2 = trickWinners.filter((t) => t === 2).length;
  const total = trickWinners.length;

  if (t1 >= 2) return 1;
  if (t2 >= 2) return 2;
  if (total === 3) {
    if (t1 > t2) return 1;
    if (t2 > t1) return 2;
    // All tied: mano wins
    return getTeam(manoPosition);
  }

  // After 1 trick: if first trick was a tie ("baza parda"), next trick winner takes all
  // After 2 tricks: if 1-1, third trick is decisive
  return null;
}

function resolveHand(state) {
  const h = state.hand;
  const trucPts = h.truc.status === 'accepted' ? TRUC_STEPS[h.truc.step].value : 1;
  const envitPts = h.envit.status === 'accepted' ? ENVIT_STEPS[Math.max(h.envit.step, 0)].value : 0;
  const winnerTeam = h.handWinner;

  const newScores = { ...state.scores };
  newScores[winnerTeam] += trucPts;
  if (h.envit.status === 'accepted' && h.envit.winner) {
    newScores[h.envit.winner] += envitPts;
  }

  const winner = newScores[1] >= WINNING_SCORE ? 1 : newScores[2] >= WINNING_SCORE ? 2 : null;

  return {
    ...state,
    scores: newScores,
    phase: winner ? 'finished' : 'playing',
    winnerTeam: winner,
    hand: { ...h },
  };
}

// --- Truc challenge ---

function challengeTruc(state, playerPosition) {
  const h = state.hand;
  if (h.waitingResponse) return { error: 'Ja hi ha un desafiament en curs' };
  if (h.truc.status === 'accepted' && h.truc.step >= TRUC_STEPS.length - 1) {
    return { error: 'No es pot pujar més el Truc' };
  }

  const team = getTeam(playerPosition);
  // Can't re-raise if last caller was same team
  if (h.truc.lastCallerTeam === team && h.truc.status === 'accepted') {
    return { error: 'El teu equip ja ha desafiat' };
  }

  const nextStep = h.truc.step + 1;
  if (nextStep >= TRUC_STEPS.length) return { error: 'No es pot pujar més' };
  const step = TRUC_STEPS[nextStep];

  return {
    ...state,
    hand: {
      ...h,
      truc: { step: nextStep, status: 'challenged', lastCaller: playerPosition, lastCallerTeam: team },
      waitingResponse: { type: 'truc', toTeam: oppTeam(team), step: nextStep, label: step.label },
    },
  };
}

function respondTruc(state, playerPosition, accept) {
  const h = state.hand;
  if (!h.waitingResponse || h.waitingResponse.type !== 'truc') return { error: 'No hi ha desafiament de Truc' };
  if (getTeam(playerPosition) !== h.waitingResponse.toTeam) return { error: 'No és el teu equip qui ha de respondre' };

  if (accept) {
    return {
      ...state,
      hand: {
        ...h,
        truc: { ...h.truc, status: 'accepted' },
        waitingResponse: null,
      },
    };
  }

  // Fold: challenger gets foldGives points
  const foldPts = TRUC_STEPS[h.truc.step].foldGives;
  const callerTeam = h.truc.lastCallerTeam;
  const newScores = { ...state.scores };
  newScores[callerTeam] += foldPts;
  const winner = newScores[1] >= WINNING_SCORE ? 1 : newScores[2] >= WINNING_SCORE ? 2 : null;

  return {
    ...state,
    scores: newScores,
    phase: winner ? 'finished' : 'playing',
    winnerTeam: winner,
    hand: {
      ...h,
      truc: { ...h.truc, status: 'folded' },
      handWinner: callerTeam,
      waitingResponse: null,
    },
  };
}

// --- Envit challenge ---

function challengeEnvit(state, playerPosition) {
  const h = state.hand;
  if (!h.canEnvit) return { error: "L'Envit només es pot cantar abans de la primera baza" };
  if (h.waitingResponse) return { error: 'Ja hi ha un desafiament en curs' };
  if (h.envit.status !== 'none' && h.envit.status !== 'accepted') return { error: "L'Envit ja ha sigut cantat" };

  const team = getTeam(playerPosition);
  if (h.envit.lastCallerTeam === team && h.envit.status === 'accepted') {
    return { error: 'El teu equip ja ha desafiat' };
  }

  const nextStep = h.envit.step + 1;
  if (nextStep >= ENVIT_STEPS.length) return { error: 'No es pot pujar més l\'Envit' };
  const step = ENVIT_STEPS[nextStep];

  return {
    ...state,
    hand: {
      ...h,
      envit: { ...h.envit, step: nextStep, status: 'challenged', lastCaller: playerPosition, lastCallerTeam: team },
      waitingResponse: { type: 'envit', toTeam: oppTeam(team), step: nextStep, label: step.label },
    },
  };
}

function respondEnvit(state, playerPosition, accept) {
  const h = state.hand;
  if (!h.waitingResponse || h.waitingResponse.type !== 'envit') return { error: "No hi ha desafiament d'Envit" };
  if (getTeam(playerPosition) !== h.waitingResponse.toTeam) return { error: 'No és el teu equip qui ha de respondre' };

  if (accept) {
    // Compare envit scores
    const envitScores = {};
    for (const p of state.players) {
      const cards = h.playerHands[p.position];
      const score = calcEnvit(cards);
      envitScores[p.team] = Math.max(envitScores[p.team] || 0, score);
    }
    const envitWinner = envitScores[1] > envitScores[2] ? 1
      : envitScores[2] > envitScores[1] ? 2
      : getTeam(h.manoPosition); // tie: mano wins

    return {
      ...state,
      hand: {
        ...h,
        envit: { ...h.envit, status: 'accepted', scores: envitScores, winner: envitWinner },
        waitingResponse: null,
      },
    };
  }

  // Fold envit: challenger gets foldGives
  const foldPts = ENVIT_STEPS[h.envit.step].foldGives;
  const callerTeam = h.envit.lastCallerTeam;
  const newScores = { ...state.scores };
  newScores[callerTeam] += foldPts;
  const winner = newScores[1] >= WINNING_SCORE ? 1 : newScores[2] >= WINNING_SCORE ? 2 : null;

  return {
    ...state,
    scores: newScores,
    phase: winner ? 'finished' : 'playing',
    winnerTeam: winner,
    hand: {
      ...h,
      envit: { ...h.envit, status: 'folded' },
      waitingResponse: null,
    },
  };
}

// Timeout penalty: opponent team gets 3 points, hand ends
function penalizeTimeout(state) {
  const h = state.hand;
  const losingTeam = h.waitingResponse ? h.waitingResponse.toTeam : getTeam(h.currentPlayer);
  const winningTeam = oppTeam(losingTeam);

  const newScores = { ...state.scores };
  newScores[winningTeam] += 3;

  const winner = newScores[1] >= WINNING_SCORE ? 1 : newScores[2] >= WINNING_SCORE ? 2 : null;

  return {
    ...state,
    scores: newScores,
    phase: winner ? 'finished' : 'playing',
    winnerTeam: winner,
    hand: { ...h, handWinner: winningTeam, waitingResponse: null },
  };
}

// Returns state safe to send to a specific player (hides opponents' cards)
function getPublicState(state, forPosition) {
  if (!state.hand) return state;
  const { playerHands, ...publicHand } = state.hand;
  return {
    ...state,
    hand: {
      ...publicHand,
      myHand: playerHands[forPosition] || [],
      cardCounts: Object.fromEntries(
        Object.entries(playerHands).map(([pos, cards]) => [pos, cards.length])
      ),
    },
  };
}

module.exports = {
  createInitialState,
  newHand,
  playCard,
  challengeTruc,
  respondTruc,
  challengeEnvit,
  respondEnvit,
  penalizeTimeout,
  getPublicState,
  WINNING_SCORE,
  TRUC_STEPS,
  ENVIT_STEPS,
};
