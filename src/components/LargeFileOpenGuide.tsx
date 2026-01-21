import React from 'react';
import { useTranslation } from 'react-i18next';
import { LargeFileProcessor } from '../utils/LargeFileProcessor';

interface LargeFileOpenGuideProps {
  onClose: () => void;
}

const LargeFileOpenGuide: React.FC<LargeFileOpenGuideProps> = ({ onClose }) => {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {t('trace.largeFileGuide', 'Large File Open Guide')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">
              {t('trace.supportedFileSizes', 'Supported File Sizes')}
            </h3>
            <ul className="list-disc list-inside space-y-1">
              <li>{t('trace.maxFileSize', 'Maximum file size: 5GB')}</li>
              <li>
                {t(
                  'trace.recommendedSize',
                  'Recommended: Under 2GB for optimal performance'
                )}
              </li>
              <li>
                {t(
                  'trace.supportedFormats',
                  'Supported formats: JSON, JSON Lines (.jsonl)'
                )}
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">
              {t('trace.performanceTips', 'Performance Tips')}
            </h3>
            <ul className="list-disc list-inside space-y-1">
              <li>
                {t(
                  'trace.closeOtherTabs',
                  'Close other browser tabs to free up memory'
                )}
              </li>
              <li>
                {t(
                  'trace.ensureStableConnection',
                  'Ensure stable internet connection'
                )}
              </li>
              <li>
                {t(
                  'trace.avoidInterrupting',
                  'Do not interrupt the open process once started'
                )}
              </li>
              <li>
                {t(
                  'trace.useModernBrowser',
                  'Use a modern browser (Chrome, Firefox, Safari, Edge)'
                )}
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">
              {t('trace.openProcess', 'Open Process')}
            </h3>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                {t('trace.selectFile', 'Select your JSON file (up to 5GB)')}
              </li>
              <li>
                {t(
                  'trace.confirmOpen',
                  'Confirm open when prompted for large files'
                )}
              </li>
              <li>
                {t(
                  'trace.monitorProgress',
                  'Monitor progress bar and status messages'
                )}
              </li>
              <li>
                {t(
                  'trace.waitCompletion',
                  'Wait for completion - do not close browser'
                )}
              </li>
              <li>
                {t('trace.verifyData', 'Verify data was processed correctly')}
              </li>
            </ol>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">
              {t('trace.troubleshooting', 'Troubleshooting')}
            </h3>
            <div className="space-y-2">
              <div>
                <strong>
                  {t(
                    'trace.browserCrash',
                    'Browser crashes or becomes unresponsive:'
                  )}
                </strong>
                <p className="text-xs text-gray-600 mt-1">
                  {t(
                    'trace.browserCrashSolution',
                    'Try opening smaller files or use a different browser. Close other applications to free up system memory.'
                  )}
                </p>
              </div>
              <div>
                <strong>{t('trace.openFails', 'Open fails or stops:')}</strong>
                <p className="text-xs text-gray-600 mt-1">
                  {t(
                    'trace.openFailsSolution',
                    'Check your internet connection. Try opening during off-peak hours. Consider splitting large files into smaller chunks.'
                  )}
                </p>
              </div>
              <div>
                <strong>
                  {t('trace.slowProcessing', 'Very slow processing:')}
                </strong>
                <p className="text-xs text-gray-600 mt-1">
                  {t(
                    'trace.slowProcessingSolution',
                    'This is normal for very large files. The system processes files in chunks to avoid memory issues. Please be patient.'
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h4 className="font-semibold text-blue-900 mb-2">
              {t('trace.importantNote', 'Important Note')}
            </h4>
            <p className="text-blue-800 text-xs">
              {t(
                'trace.importantNoteText',
                'Large file opening uses advanced streaming technology to handle files up to 5GB without crashing your browser. The system automatically manages memory usage and provides real-time progress updates.'
              )}
            </p>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('common.ok', 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LargeFileOpenGuide;
