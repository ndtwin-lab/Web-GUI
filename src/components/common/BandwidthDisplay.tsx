import React from 'react';
import { formatBandwidth } from '../../utils/formatters';

interface BandwidthDisplayProps {
  bps: number;
  className?: string;
}

const BandwidthDisplay: React.FC<BandwidthDisplayProps> = ({
  bps,
  className = '',
}) => {
  if (bps === undefined || bps === null) {
    return <span className={className}>N/A</span>;
  }

  const formattedValue = formatBandwidth(bps);
  const [value, unit] = formattedValue.split(' ');

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'baseline' }}
    >
      <span style={{ minWidth: '6ch', textAlign: 'left' }}>{value}</span>
      <span style={{ marginLeft: '0.5ch', minWidth: '4ch', textAlign: 'left' }}>
        {unit}
      </span>
    </span>
  );
};

export default BandwidthDisplay;
