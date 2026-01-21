import React from 'react';
import { useLanguage } from '../hooks/useLanguage';

interface LanguageSwitcherProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  className = '',
  size = 'md',
}) => {
  const { currentLanguage, changeLanguage, availableLanguages } = useLanguage();

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-2',
    lg: 'text-base px-4 py-3',
  };

  return (
    <select
      value={currentLanguage}
      onChange={e => changeLanguage(e.target.value)}
      className={`rounded-lg border border-[#e0e0e0] bg-[#f8fafc] text-[#1976d2] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#1976d2] ${sizeClasses[size]} ${className}`}
    >
      {availableLanguages.map(lang => (
        <option key={lang.code} value={lang.code}>
          {lang.nativeName}
        </option>
      ))}
    </select>
  );
};

export default LanguageSwitcher;
