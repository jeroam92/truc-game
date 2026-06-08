const { createDeck, deal, calcEnvit } = require('./deck');

// Truc Valencià - Game Engine
//
// 4 players, 2 teams (positions 0,2 = team1; positions 1,3 = team2)
// Match: first to win 2 piernes (legs)
// Each pierna: first team to reach 12 piedres (points)
//
// Truc: truc(2) → retruc(3) → quatre-val(4) → joc-fora(24)
// Envit: envit(2) → torne(4) → falta(12 - winner's pierna score)
//
// Scoring: 1pt for winning a hand (base), more if truc/envit was played

const WINNING_PIERNA_SCORE = 12;
const WINNING_LEGS = 2;

const TRUC_STEPS = [
  { label: 'Truc',       value: 2,  foldGives: 1 },
  { label: 'Retruc',     value: 3,  foldGives: 2 },
  { label: 'Quatre Val', value: 4,  foldGives: 3 },
  { label: 'Joc Fora',   value: 24, foldGives: 4 },
];

const ENVIT_STEPS = [
  { label: 'Envit', value: 2, foldGives: 1 },
  { label: 'Torne', value: 4, foldGives: 2 },
  { label: 'Falta', value: null, foldGives: 3 }, // value computed dynamically
];

function getTeam(position) { return position % 2 === 0 ? 1 : 2; }
function oppTeam(team) { return team === 1 ? 2 : 1; }
function nextPos(pos) { return (pos + 1) % 4; }

// Add points to a team, handling pierna completion and match end
function addPointsToTeam(state, team, pts) {
  const newScores = { 1: state.scores[1], 2: state.scores[2] };
  const newPiernas = { 1: state.piernas[1], 2: state.piernas[2] };

  newScores[team] += pts;

  if (newScores[team] >= WINNING_PIERNA_SCORE) {
    newPiernas[team] += 1;
    newScores[1] = 0;
    newScores[2] = 0;
  }

  const gameWinner = newPiernas[1] >= WINNING_LEGS ? 1 : newPiernas[2] >= WINNING_LEGS ? 2 : null;

  return {
    ...state,
    scores: newScores,
    piernas: newPiernas,
    phase: gameWinner ? 'finished' : 'playing',
    winnerTeam: gameWinner,
  };
}

// Compute envit prize value; for Falta, based on scores at time of acceptance
function computeEnvitValue(step, scores, winner) {
  if (step === ENVIT_STEPS.length - 1) {
    return Math.max(1, WINNING_PIERNA_SCORE - scores[winner]);
  }
  return ENVIT_STEPS[step].value;
}

function createInitialState(players) {
  return {
    players, // [{userId, position, team}]
    scores: { 1: 0, 2: 0 },
    piernas: { 1: 0, 2: 0 },
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
      truc: { step: -1, status: 'none', lastCaller: null, lastCallerTeam: null },
      envit: { step: -1, status: 'none', lastCaller: null, lastCallerTeam: null, scores: null, winner: null, points: 0 },
      waitingResponse: null,
      canEnvit: true,
    },
  };
}

function playCard(state, playerPosition, cardIndex, faceDown = false) {
  const h = state.hand;
  if (h.waitingResponse) return { error: 'Esperant resposta al desafiament' };
  if (h.currentPlayer !== playerPosition) return { error: 'No és el teu torn' };
  if (h.handWinner !== null) return { error: 'La mà ja ha acabat' };

  const playerCards = h.playerHands[playerPosition];
  if (cardIndex < 0 || cardIndex >= playerCards.length) return { error: 'Carta invàlida' };

  const card = playerCards[cardIndex];
  const newCards = playerCards.filter((_, i) => i !== cardIndex);
  const newPlays = [...h.currentTrickPlays, { position: playerPosition, card, faceDown: !!faceDown }];

  if (newPlays.length === 4) {
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
    if (play.faceDown) continue; // face-down cards never win
    if (!best || play.card.rank > best.card.rank ||
        (play.card.rank === best.card.rank && play.position === manoPosition)) {
      best = play;
    }
  }
  // If all cards are face-down, the mano player wins
  if (!best) best = plays.find((p) => p.position === manoPosition) || plays[0];
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
    return getTeam(manoPosition);
  }
  return null;
}

// Pay out the points of an accepted Envit to its winner (independent of who
// wins the hand). Called by every terminal path so the Envit is never lost,
// e.g. when the opponents fold the Truc after accepting the Envit.
function settleAcceptedEnvit(state) {
  const h = state.hand;
  if (h.envit.status === 'accepted' && !h.envit.settled && h.envit.winner && h.envit.points > 0) {
    const newState = addPointsToTeam(state, h.envit.winner, h.envit.points);
    return { ...newState, hand: { ...newState.hand, envit: { ...h.envit, settled: true } } };
  }
  return state;
}

function resolveHand(state) {
  const h = state.hand;
  const trucPts = h.truc.status === 'accepted' ? TRUC_STEPS[h.truc.step].value : 1;
  const winnerTeam = h.handWinner;

  let newState = addPointsToTeam(state, winnerTeam, trucPts);
  newState = settleAcceptedEnvit(newState);

  return { ...newState, hand: { ...newState.hand } };
}

// --- Truc challenge ---

function challengeTruc(state, playerPosition) {
  const h = state.hand;
  const team = getTeam(playerPosition);
  const isRaisingResponse = h.waitingResponse?.type === 'truc' && h.waitingResponse.toTeam === team;
  if (h.waitingResponse && !isRaisingResponse) return { error: 'Ja hi ha un desafiament en curs' };
  if (h.truc.status === 'accepted' && h.truc.step >= TRUC_STEPS.length - 1) {
    return { error: 'No es pot pujar més el Truc' };
  }
  if (h.truc.lastCallerTeam === team && h.truc.status === 'accepted' && !isRaisingResponse) {
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
      hand: { ...h, truc: { ...h.truc, status: 'accepted' }, waitingResponse: null },
    };
  }

  const foldPts = TRUC_STEPS[h.truc.step].foldGives;
  const callerTeam = h.truc.lastCallerTeam;
  let newState = addPointsToTeam(state, callerTeam, foldPts);
  newState = settleAcceptedEnvit(newState);

  return {
    ...newState,
    hand: {
      ...newState.hand,
      truc: { ...newState.hand.truc, status: 'folded' },
      handWinner: callerTeam,
      waitingResponse: null,
    },
  };
}

// --- Envit challenge ---

function challengeEnvit(state, playerPosition) {
  const h = state.hand;
  const team = getTeam(playerPosition);
  const isRaisingResponse = h.waitingResponse?.type === 'envit' && h.waitingResponse.toTeam === team;

  if (!h.canEnvit) return { error: "L'Envit només es pot cantar abans de la primera baza" };
  if (h.waitingResponse && !isRaisingResponse) return { error: 'Ja hi ha un desafiament en curs' };
  if (h.envit.status !== 'none' && h.envit.status !== 'accepted' && !isRaisingResponse) {
    return { error: "L'Envit ja ha sigut cantat" };
  }
  if (h.envit.lastCallerTeam === team && h.envit.status === 'accepted' && !isRaisingResponse) {
    return { error: 'El teu equip ja ha desafiat' };
  }

  const nextStep = h.envit.step + 1;
  if (nextStep >= ENVIT_STEPS.length) return { error: "No es pot pujar més l'Envit" };
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
    const envitScores = {};
    for (const p of state.players) {
      const cards = h.playerHands[p.position];
      const score = calcEnvit(cards);
      envitScores[p.team] = Math.max(envitScores[p.team] || 0, score);
    }
    const envitWinner = envitScores[1] > envitScores[2] ? 1
      : envitScores[2] > envitScores[1] ? 2
      : getTeam(h.manoPosition);

    const envitPts = computeEnvitValue(h.envit.step, state.scores, envitWinner);

    return {
      ...state,
      hand: {
        ...h,
        envit: { ...h.envit, status: 'accepted', scores: envitScores, winner: envitWinner, points: envitPts },
        waitingResponse: null,
      },
    };
  }

  const foldPts = ENVIT_STEPS[h.envit.step].foldGives;
  const callerTeam = h.envit.lastCallerTeam;
  const newState = addPointsToTeam(state, callerTeam, foldPts);

  return {
    ...newState,
    hand: { ...h, envit: { ...h.envit, status: 'folded' }, waitingResponse: null },
  };
}

// Timeout penalty: opponent team gets 3 points, hand ends
function penalizeTimeout(state) {
  const h = state.hand;
  const losingTeam = h.waitingResponse ? h.waitingResponse.toTeam : getTeam(h.currentPlayer);
  const winningTeam = oppTeam(losingTeam);

  let newState = addPointsToTeam(state, winningTeam, 3);
  newState = settleAcceptedEnvit(newState);

  return {
    ...newState,
    hand: { ...newState.hand, handWinner: winningTeam, waitingResponse: null },
  };
}

// Returns state safe to send to a specific player (hides opponents' cards)
function getPublicState(state, forPosition) {
  if (!state.hand) return state;
  const { playerHands, ...publicHand } = state.hand;

  // In the current trick, hide face-down cards played by opponents
  const maskedTrickPlays = (publicHand.currentTrickPlays || []).map((play) =>
    play.faceDown && play.position !== forPosition
      ? { ...play, card: null }
      : play
  );

  return {
    ...state,
    hand: {
      ...publicHand,
      currentTrickPlays: maskedTrickPlays,
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
  WINNING_PIERNA_SCORE,
  WINNING_LEGS,
  TRUC_STEPS,
  ENVIT_STEPS,
};
