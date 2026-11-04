import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../store/i18n';

interface DeleteModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteModal({ isOpen, onConfirm, onCancel }: DeleteModalProps) {
  const { t } = useI18n();
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
            <div className="delete-modal-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b71c1c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3,6 5,6 21,6" />
                <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
            <h3 className="delete-modal-title">{t('delete.title')}</h3>
            <p className="delete-modal-message">
              {t('delete.message')}
            </p>
            <div className="delete-modal-buttons">
              <button
                className="delete-modal-btn cancel"
                onClick={onCancel}
              >
                {t('delete.keep')}
              </button>
              <button
                className="delete-modal-btn confirm"
                onClick={onConfirm}
              >
                {t('delete.clear')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
