import React from 'react';
import { useTranslation } from 'react-i18next';

interface AvailabilityTimelineProps {
  timeRange: {
    start: string;
    end: string;
  };
  currentTime: string;
  isPlaying: boolean;
  onTimeChange: (time: string) => void;
  onPlayPause: () => void;
  onStop: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
  availableTimePoints?: string[];
}

const AvailabilityTimeline: React.FC<AvailabilityTimelineProps> = ({
  timeRange,
  currentTime,
  isPlaying,
  onTimeChange,
  onPlayPause,
  onStop,
  onStepForward,
  onStepBackward,
  playbackSpeed,
  onSpeedChange,
  availableTimePoints = [],
}) => {
  const { t } = useTranslation();

  const startTime = new Date(timeRange.start).getTime();
  const endTime = new Date(timeRange.end).getTime();
  const currentTimeMs = new Date(currentTime).getTime();
  const totalDuration = endTime - startTime;
  const progress =
    totalDuration > 0 ? ((currentTimeMs - startTime) / totalDuration) * 100 : 0;

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  // Find the nearest previous second for playback
  const findNearestPreviousSecond = (targetTime: string): string => {
    if (availableTimePoints.length === 0) return targetTime;

    const targetTimeMs = new Date(targetTime).getTime();
    const oneSecondMs = 1000; // 1 second in milliseconds

    // Find the nearest time point that is at least 1 second before the target time
    let nearestTime = availableTimePoints[0];
    let minDiff = Infinity;

    for (const timePoint of availableTimePoints) {
      const timePointMs = new Date(timePoint).getTime();
      const diff = targetTimeMs - timePointMs;

      // Only consider time points that are at least 1 second before the target
      if (diff >= oneSecondMs && diff < minDiff) {
        minDiff = diff;
        nearestTime = timePoint;
      }
    }

    // If no time point is found that's at least 1 second before,
    // return the first available time point
    if (minDiff === Infinity) {
      return availableTimePoints[0];
    }

    return nearestTime;
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const progress = parseFloat(e.target.value);
    const newTime = new Date(startTime + (progress / 100) * totalDuration);
    onTimeChange(newTime.toISOString());
  };

  // Enhanced slider with better precision for large datasets
  const handleSliderMouseDown = () => {
    // Pause playback when user starts dragging
    if (isPlaying) {
      onPlayPause();
    }
  };

  const handleSliderMouseUp = () => {
    // Optional: Resume playback if it was playing before
  };

  // Handle play button click with nearest previous second logic
  const handlePlayClick = () => {
    if (!isPlaying) {
      // When starting playback, find the nearest previous second
      const nearestPreviousSecond = findNearestPreviousSecond(currentTime);
      // console.log('Current time:', currentTime);
      // console.log('Nearest previous second:', nearestPreviousSecond);
      if (nearestPreviousSecond !== currentTime) {
        onTimeChange(nearestPreviousSecond);
      }
    }
    onPlayPause();
  };

  // Handle direct time input for random access
  const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputTime = e.target.value;
    if (inputTime) {
      try {
        const date = new Date(inputTime);
        if (!isNaN(date.getTime())) {
          onTimeChange(date.toISOString());
        }
      } catch (error) {
        console.warn('Invalid time input:', inputTime);
      }
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          {t('trace.timeline', 'Timeline')}
        </h3>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">
            {formatTime(timeRange.start)}
          </span>
          <span className="text-xs text-gray-400">-</span>
          <span className="text-xs text-gray-500">
            {formatTime(timeRange.end)}
          </span>
        </div>
      </div>

      {/* Timeline Slider */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="range"
            min="0"
            max="100"
            step="0.01"
            value={progress}
            onChange={handleSliderChange}
            onMouseDown={handleSliderMouseDown}
            onMouseUp={handleSliderMouseUp}
            className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progress}%, #e5e7eb ${progress}%, #e5e7eb 100%)`,
            }}
          />
          <div className="pointer-events-none absolute left-0 top-0 h-2 w-full">
            <div
              className="-mt-1 h-2 w-2 rounded-full bg-blue-600"
              style={{ marginLeft: `${progress}%` }}
            />
          </div>
        </div>
        <div className="mt-1 flex justify-between text-xs text-gray-500">
          <span>{formatTime(currentTime)}</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={onStepBackward}
            className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
            title={t('trace.stepBackward', 'Step Backward (1 second)')}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 9H17a1 1 0 110 2h-5.586l4.293 4.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          <button
            onClick={handlePlayClick}
            className="rounded-md bg-blue-600 p-2 text-white transition-colors hover:bg-blue-700"
            title={
              isPlaying ? t('trace.pause', 'Pause') : t('trace.play', 'Play')
            }
          >
            {isPlaying ? (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 00-1 1v2a1 1 0 001 1h6a1 1 0 001-1V9a1 1 0 00-1-1H7z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>

          <button
            onClick={onStepForward}
            className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
            title={t('history.stepForward', 'Step Forward (1 second)')}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 11-1.414-1.414L8.586 11H3a1 1 0 110-2h5.586l-4.293-4.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          <button
            onClick={onStop}
            className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
            title={t('history.stop', 'Stop')}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Playback Speed */}
        <div className="flex items-center space-x-2">
          <label className="text-xs text-gray-600">
            {t('history.speed', 'Speed:')}
          </label>
          <select
            value={playbackSpeed}
            onChange={e => onSpeedChange(Number(e.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={5}>5x</option>
            <option value={10}>10x</option>
          </select>
        </div>
      </div>

      {/* Current Time Display and Random Access */}
      <div className="mt-3 border-t border-gray-200 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-600">
            {t('history.currentTime', 'Current Time:')}
          </span>
          <span className="rounded bg-gray-100 px-2 py-1 font-mono text-sm">
            {formatTime(currentTime)}
          </span>
        </div>

        {/* Random Time Access */}
        <div className="flex items-center space-x-2">
          <label className="text-xs text-gray-600">
            {t('history.jumpToTime', 'Jump to:')}
          </label>
          <button
            onClick={() => onTimeChange(timeRange.start)}
            className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200"
            title="Jump to start"
          >
            Start
          </button>
          <button
            onClick={() => onTimeChange(timeRange.end)}
            className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200"
            title="Jump to end"
          >
            End
          </button>
        </div>
      </div>
    </div>
  );
};

export default AvailabilityTimeline;
