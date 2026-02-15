import { motion } from 'framer-motion';
import { HIGHLIGHTER_COLORS, HighlighterColor } from '../types';

interface HighlighterPickerProps {
  currentColor: HighlighterColor | null;
  onColorSelect: (color: HighlighterColor) => void;
  onClose: () => void;
}

const HIGHLIGHTER_DISPLAY_COLORS: Record<HighlighterColor, string> = {
  yellow: '#fff59d',
  pink: '#f8bbd9',
  green: '#a5d6a7',
  blue: '#90caf9',
  purple: '#ce93d8',
};

export function HighlighterPicker({ currentColor, onColorSelect, onClose }: HighlighterPickerProps) {
  return (
    <motion.div
      className="highlighter-picker"
      initial={{ opacity: 0, y: -8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.9 }}
      transition={{ duration: 0.12 }}
    >
      {(Object.keys(HIGHLIGHTER_COLORS) as HighlighterColor[]).map((color) => (
        <button
          key={color}
          className={`highlighter-option ${currentColor === color ? 'active' : ''}`}
          style={{ backgroundColor: HIGHLIGHTER_DISPLAY_COLORS[color] }}
          onClick={() => {
            onColorSelect(color);
            onClose();
          }}
          title={`${color.charAt(0).toUpperCase() + color.slice(1)} highlighter`}
        />
      ))}
    </motion.div>
  );
}
