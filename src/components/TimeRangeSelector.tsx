import React from 'react';
import { useTranslation } from 'react-i18next';

interface TimeRangeSelectorProps {
  startTime: string;
  endTime: string;
  onTimeRangeChange: (start: string, end: string) => void;
  disabled?: boolean;
}

const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  startTime,
  endTime,
  onTimeRangeChange,
  disabled = false,
}) => {
  const { t } = useTranslation();

  const formatDisplayTime = (timeString: string) => {
    if (!timeString) return 'Not set';
    try {
      return new Date(timeString).toLocaleString();
    } catch {
      return 'Invalid time';
    }
  };

  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-700">
        {t('history.timeRange', 'Time Range')}
      </h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Start Time Display */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('history.startTime', 'Start Time')}
          </label>
          <div className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
            {formatDisplayTime(startTime)}
          </div>
        </div>

        {/* End Time Display */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {t('history.endTime', 'End Time')}
          </label>
          <div className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
            {formatDisplayTime(endTime)}
          </div>
        </div>
      </div>

      {/* Duration Display */}
      {startTime && endTime && (
        <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
          <div className="rounded bg-green-50 p-2 text-xs text-green-600">
            Duration:{' '}
            {Math.round(
              (new Date(endTime).getTime() - new Date(startTime).getTime()) /
                1000
            )}{' '}
            seconds
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeRangeSelector;
