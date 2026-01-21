import { NETWORK_CONSTANTS } from './constants';

export const getEdgeColorByUsage = (usagePercent: number): string => {
  const { USAGE_COLORS } = NETWORK_CONSTANTS;

  if (usagePercent >= 100) return USAGE_COLORS.CRITICAL;

  // 0%: blue (#2196F3), 33%: green (#4CAF50), 66%: yellow (#FFEB3B), 100%: red (#F44336)
  if (usagePercent <= 33) {
    // blue to green
    const ratio = usagePercent / 33;
    const r = Math.round(33 + (76 - 33) * ratio);
    const g = Math.round(150 + (175 - 150) * ratio);
    const b = Math.round(243 + (80 - 243) * ratio);
    return `rgb(${r},${g},${b})`;
  } else if (usagePercent <= 66) {
    // green to yellow
    const ratio = (usagePercent - 33) / 33;
    const r = Math.round(76 + (255 - 76) * ratio);
    const g = Math.round(175 + (235 - 175) * ratio);
    const b = Math.round(80 + (59 - 80) * ratio);
    return `rgb(${r},${g},${b})`;
  } else {
    // yellow to red
    const ratio = (usagePercent - 66) / 34;
    const r = Math.round(255 + (244 - 255) * ratio);
    const g = Math.round(235 + (67 - 235) * ratio);
    const b = Math.round(59 + (54 - 59) * ratio);
    return `rgb(${r},${g},${b})`;
  }
};

export const getDeviceStatusColor = (isUp: boolean): string => {
  return isUp ? '#4CAF50' : '#F44336';
};

export const getDeviceTypeColor = (type: string): string => {
  const colorMap: Record<string, string> = {
    switch: '#2196F3',
    host: '#FF9800',
    router: '#9C27B0',
    server: '#607D8B',
  };

  return colorMap[type] || '#757575';
};

export const generateGradientColor = (
  startColor: string,
  endColor: string,
  ratio: number
): string => {
  const start = hexToRgb(startColor);
  const end = hexToRgb(endColor);

  if (!start || !end) return startColor;

  const r = Math.round(start.r + (end.r - start.r) * ratio);
  const g = Math.round(start.g + (end.g - start.g) * ratio);
  const b = Math.round(start.b + (end.b - start.b) * ratio);

  return `rgb(${r},${g},${b})`;
};

export const hexToRgb = (
  hex: string
): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

export const rgbToHex = (r: number, g: number, b: number): string => {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

// export const getContrastColor = (backgroundColor: string): string => {
//   const rgb = hexToRgb(backgroundColor);
//   if(!rgb) return '#000000';

//   const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
//   return brightness > 128 ? '#000000' : '#FFFFFF';
// };
