// Renders a Spanish Truc card with suit icons
import { useTranslation } from 'react-i18next';
import SuitIcon from './SuitIcon';

export default function Card({ card, onClick, disabled = false, small = false }) {
  const { t } = useTranslation();
  if (!card) return null;

  const suitClass = `suit-${card.suit}`;
  const isClickable = !!onClick && !disabled;
  const suitName = t(`game.suits.${card.suit}`, card.suit);

  return (
    <div
      className={`playing-card ${suitClass} ${disabled ? 'disabled' : ''} ${small ? 'small-card' : ''}`}
      style={small ? { width: 58, height: 87 } : {}}
      onClick={isClickable ? onClick : undefined}
      title={`${card.value} de ${suitName}`}
    >
      <span className={`card-corner ${suitClass}`}>{card.value}<SuitIcon suit={card.suit} className="card-pip" /></span>
      <span className="card-center">
        <span className={`card-value ${suitClass}`}>{card.value}</span>
        <SuitIcon suit={card.suit} className={`card-suit-icon ${suitClass}`} />
      </span>
      <span className={`card-corner bottom-right ${suitClass}`}>{card.value}<SuitIcon suit={card.suit} className="card-pip" /></span>
    </div>
  );
}

export function FaceDownCard({ small = false }) {
  return (
    <div
      className="playing-card face-down"
      style={small ? { width: 58, height: 87 } : {}}
    />
  );
}
