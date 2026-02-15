import { motion, AnimatePresence } from 'framer-motion';

interface DeleteModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteModal({ isOpen, onConfirm, onCancel }: DeleteModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="delete-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onCancel}
        >
          <motion.div
            className="delete-modal"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="delete-modal-icon">🗑️</div>
            <h3 className="delete-modal-title">Clear this note?</h3>
            <p className="delete-modal-message">
              Everything on this note will be erased and you'll get a fresh page.
            </p>
            <div className="delete-modal-buttons">
              <button
                className="delete-modal-btn cancel"
                onClick={onCancel}
              >
                Keep it
              </button>
              <button
                className="delete-modal-btn confirm"
                onClick={onConfirm}
              >
                Clear
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
