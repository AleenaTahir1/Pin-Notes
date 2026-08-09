import { motion } from 'framer-motion';
import { NOTE_COLORS } from '../types';
import { useI18n, type MessageKey } from '../store/i18n';

interface ColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function ColorPicker({ currentColor, onColorChange, isOpen, onClose }: ColorPickerProps) {
  const { t } = useI18n();
  if (!isOpen) return null;

  return (
    <motion.div
      className="color-picker"
      initial={{ opacity: 0, scale: 0.9, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -8 }}
      transition={{ duration: 0.12 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="color-picker-grid">
        {Object.entries(NOTE_COLORS).map(([name, color]) => (
          <button
            key={name}
            className={`color-option ${currentColor === color ? 'active' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => {
              onColorChange(color);
              onClose();
            }}
            title={t(`color.${name}` as MessageKey)}
          />
        ))}
      </div>
    </motion.div>
  );
}
