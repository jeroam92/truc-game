// Truc Valencià deck: 22 cards
// Removed from full 40-card Spanish deck: 10 (sota), 11 (cavall), 12 (rei), 2s, 1-oros, 1-copes
// Remaining: 1-espases, 1-bastons, 3-7 (all suits)

const SUITS = ['oros', 'copes', 'espases', 'bastons'];

const DECK_CARDS = [
  // Special aces kept
  { suit: 'espases', value: 1 },
  { suit: 'bastons', value: 1 },
  // 3s through 7s in all suits
  ...SUITS.flatMap((suit) => [3, 4, 5, 6, 7].map((value) => ({ suit, value }))),
];
// Total: 2 + 5×4 = 22 cards

// Truc ranking (higher = stronger):
// 1-espases > 1-bastons > 7-espases > 7-oros > 3s > 7-copes/bastons > 6 > 5 > 4
function getTrucRank(value, suit) {
  if (value === 1 && suit === 'espases') return 9;
  if (value === 1 && suit === 'bastons') return 8;
  if (value === 7 && suit === 'espases') return 7;
  if (value === 7 && suit === 'oros')    return 6;
  if (value === 3)                       return 5;
  if (value === 7)                       return 4; // copes or bastons (sietes falsos)
  if (value === 6)                       return 3;
  if (value === 5)                       return 2;
  if (value === 4)                       return 1;
  return 0;
}

// Envit value: card face value
function getEnvitValue(value) {
  return value;
}

function createDeck() {
  return DECK_CARDS.map((c) => ({
    ...c,
    rank: getTrucRank(c.value, c.suit),
    envit: getEnvitValue(c.value),
  }));
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function deal(deck) {
  const shuffled = shuffle(deck);
  return [
    shuffled.slice(0, 3),
    shuffled.slice(3, 6),
    shuffled.slice(6, 9),
    shuffled.slice(9, 12),
  ];
}

// Calculate envit score for a hand of 3 cards
// If 2+ same suit: top 2 of same suit + 20
// If all different: highest card value
function calcEnvit(cards) {
  const bySuit = {};
  for (const c of cards) {
    if (!bySuit[c.suit]) bySuit[c.suit] = [];
    bySuit[c.suit].push(c.envit);
  }
  let best = Math.max(...cards.map((c) => c.envit));
  for (const vals of Object.values(bySuit)) {
    if (vals.length >= 2) {
      const sorted = [...vals].sort((a, b) => b - a);
      const score = sorted[0] + sorted[1] + 20;
      if (score > best) best = score;
    }
  }
  return best;
}

module.exports = { createDeck, shuffle, deal, getTrucRank, getEnvitValue, calcEnvit, SUITS, DECK_CARDS };
