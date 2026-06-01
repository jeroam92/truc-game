// Renders a Spanish Truc card with suit icons
const SUIT_ICONS = { oros: '⊙', copes: '♥', espases: '⚔', bastons: '⌘' };
const SUIT_NAMES = { oros: 'Ors', copes: 'Copes', espases: 'Espases', bastons: 'Bastons' };

export default function Card({ card, onClick, disabled = false, small = false }) {
  if (!card) return null;

  const suitClass = `suit-${card.suit}`;
  const icon = SUIT_ICONS[card.suit] || '?';
  const isClickable = !!onClick && !disabled;

  return (
    <div
      className={`playing-card ${suitClass} ${disabled ? 'disabled' : ''} ${small ? 'small-card' : ''}`}
      style={small ? { width: 50, height: 75 } : {}}
      onClick={isClickable ? onClick : undefined}
      title={`${card.value} de ${SUIT_NAMES[card.suit]}`}
    >
      <span className={`card-corner ${suitClass}`}>{card.value}</span>
      <span className={`card-value ${suitClass}`}>{card.value}</span>
      <span className={`card-suit-icon ${suitClass}`}>{icon}</span>
      <span className={`card-corner bottom-right ${suitClass}`}>{card.value}</span>
    </div>
  );
}

export function FaceDownCard({ small = false }) {
  return (
    <div
      className="playing-card face-down"
      style={small ? { width: 50, height: 75 } : {}}
    />
  );
}
