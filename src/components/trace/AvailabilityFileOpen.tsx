import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LargeFileProcessor } from '../../utils/LargeFileProcessor';
import LargeFileOpenGuide from '../LargeFileOpenGuide';

interface AvailabilityFileOpenProps {
  onFlowDataOpen: (file: File) => Promise<void>;
  onGraphDataOpen: (file: File) => Promise<void>;
  flowDataFile: File | null;
  graphDataFile: File | null;
  onRemoveFlowData: () => void;
  onRemoveGraphData: () => void;
  disabled?: boolean;
  openProgress?: {
    loaded: number;
    total: number;
    percentage: number;
    status: 'reading' | 'parsing' | 'complete' | 'error';
    message?: string;
  } | null;
  isOpening?: boolean;
  onAbortOpen?: () => void;
}

const AvailabilityFileOpen: React.FC<AvailabilityFileOpenProps> = ({
  onFlowDataOpen,
  onGraphDataOpen,
  flowDataFile,
  graphDataFile,
  onRemoveFlowData,
  onRemoveGraphData,
  disabled = false,
  openProgress,
  isOpening = false,
  onAbortOpen,
}) => {
  const { t } = useTranslation();
  const flowInputRef = useRef<HTMLInputElement>(null!);
  const graphInputRef = useRef<HTMLInputElement>(null!);
  const [dragOverType, setDragOverType] = useState<'flow' | 'graph' | null>(
    null
  );
  const [showGuide, setShowGuide] = useState(false);

  const handleFileOpen = async (file: File, type: 'flow' | 'graph') => {
    try {
      // Check file size and show warning for large files
      const maxSizeMB = 5000; // 5GB
      const fileSizeMB = file.size / (1024 * 1024);

      if (fileSizeMB > maxSizeMB) {
        alert(
          `File too large (${LargeFileProcessor.formatFileSize(file.size)}). Maximum supported size is 5GB.`
        );
        return;
      }

      if (fileSizeMB > 100) {
        // Show warning for files > 100MB
        const proceed = confirm(
          `You are about to open a large file (${LargeFileProcessor.formatFileSize(file.size)}).\n` +
            `This may take several minutes and use a significant amount of memory.\n` +
            `Do you want to continue?`
        );
        if (!proceed) return;
      }

      if (type === 'flow') {
        await onFlowDataOpen(file);
      } else {
        await onGraphDataOpen(file);
      }
    } catch (error) {
      console.error(`Error opening ${type} data:`, error);
    }
  };

  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: 'flow' | 'graph'
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileOpen(file, type);
    }
  };

  const handleFileDrop = (e: React.DragEvent, type: 'flow' | 'graph') => {
    e.preventDefault();
    setDragOverType(null);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileOpen(files[0], type);
    }
  };

  const handleDragOver = (e: React.DragEvent, type: 'flow' | 'graph') => {
    e.preventDefault();
    setDragOverType(type);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverType(null);
  };

  const FileOpenArea: React.FC<{
    type: 'flow' | 'graph';
    title: string;
    file: File | null;
    onRemove: () => void;
    inputRef: React.RefObject<HTMLInputElement>;
  }> = ({ type, title, file, onRemove, inputRef }) => {
    const isDragOver = dragOverType === type;

    return (
      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-medium text-gray-900">{title}</h4>
        </div>

        <div
          className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-all duration-200 ${
            file
              ? 'border-green-300 bg-green-50'
              : isDragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          onDrop={e => !disabled && handleFileDrop(e, type)}
          onDragOver={e => !disabled && handleDragOver(e, type)}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && inputRef.current?.click()}
        >
          {file ? (
            <div className="space-y-2">
              <div className="text-green-600">
                <svg
                  className="mx-auto h-8 w-8"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-green-800">
                  {file.name}
                </p>
                <p className="text-xs text-green-600">
                  {Math.round(file.size / 1024)} KB
                </p>
              </div>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="text-xs text-green-600 underline hover:text-green-800"
                disabled={disabled}
              >
                {t('trace.removeFile', 'Remove')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <svg
                className="mx-auto h-8 w-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <div>
                <p className="text-sm text-gray-600">
                  {t('trace.dragDrop', 'Drag and drop a file here, or')}
                </p>
                <button
                  className="font-medium text-blue-600 underline hover:text-blue-800"
                  disabled={disabled}
                >
                  {t('trace.browse', 'browse')}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {type === 'flow' ? 'JSON Lines format' : 'JSON Lines format'}
              </p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={type === 'flow' ? '.json,.txt' : '.json'}
            onChange={e => handleFileInputChange(e, type)}
            className="hidden"
            disabled={disabled}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-medium text-gray-900">
          {t('trace.dataOpen', 'Data Open')}
        </h3>
        {/* <button
          onClick={() => setShowGuide(true)}
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          {t('trace.openGuide', 'Open Guide')}
        </button> */}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Flow Data Open */}
        <FileOpenArea
          type="flow"
          title={t('trace.flowData', 'Flow Data')}
          file={flowDataFile}
          onRemove={onRemoveFlowData}
          inputRef={flowInputRef}
        />

        {/* Graph Data Open */}
        <FileOpenArea
          type="graph"
          title={t('trace.graphData', 'Topology Data')}
          file={graphDataFile}
          onRemove={onRemoveGraphData}
          inputRef={graphInputRef}
        />
      </div>

      {/* Open Status */}
      <div className="rounded-lg bg-gray-50 p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">
          {t('trace.openStatus', 'Open Status')}
        </h4>

        {/* Open Progress */}
        {isOpening && openProgress && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900">
                {openProgress.message || 'Processing...'}
              </span>
              {onAbortOpen && (
                <button
                  onClick={onAbortOpen}
                  className="text-xs text-red-600 hover:text-red-800 underline"
                >
                  {t('trace.cancel', 'Cancel')}
                </button>
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${openProgress.percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>
                {LargeFileProcessor.formatFileSize(openProgress.loaded)}
              </span>
              <span>
                {LargeFileProcessor.formatFileSize(openProgress.total)}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex items-center space-x-2">
            <div
              className={`h-2 w-2 rounded-full ${flowDataFile ? 'bg-green-500' : 'bg-gray-300'}`}
            />
            <span className="text-gray-700">
              {t('trace.flowData', 'Flow Data')}:{' '}
              {flowDataFile
                ? t('trace.opened', 'Opened')
                : t('trace.notOpened', 'Not opened')}
              {flowDataFile &&
                ` (${LargeFileProcessor.formatFileSize(flowDataFile.size)})`}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div
              className={`h-2 w-2 rounded-full ${graphDataFile ? 'bg-green-500' : 'bg-gray-300'}`}
            />
            <span className="text-gray-700">
              {t('trace.graphData', 'Graph Data')}:{' '}
              {graphDataFile
                ? t('trace.opened', 'Opened')
                : t('trace.notOpened', 'Not opened')}
              {graphDataFile &&
                ` (${LargeFileProcessor.formatFileSize(graphDataFile.size)})`}
            </span>
          </div>
        </div>
      </div>

      {/* Large File Open Guide Modal */}
      {showGuide && <LargeFileOpenGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
};

export default AvailabilityFileOpen;
