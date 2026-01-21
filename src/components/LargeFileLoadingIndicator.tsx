import React from 'react';
import { useTranslation } from 'react-i18next';

interface LargeFileLoadingIndicatorProps {
  progress: number;
  message: string;
  isVisible: boolean;
  onCancel?: () => void;
}

const LargeFileLoadingIndicator: React.FC<LargeFileLoadingIndicatorProps> = ({
  progress,
  message,
  isVisible,
  onCancel,
}) => {
  const { t } = useTranslation();

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="rounded-lg bg-white p-6 shadow-xl max-w-md w-full mx-4">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t('history.processingLargeFile', 'Processing Large File')}
            </h3>
            <p className="text-sm text-gray-600 mb-4">{message}</p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-gray-500 mb-4">
            <span>{progress}%</span>
            <span>{t('history.pleaseWait', 'Please wait...')}</span>
          </div>

          {/* Cancel Button */}
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LargeFileLoadingIndicator;
