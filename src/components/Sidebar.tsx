import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  FaBars,
  FaTimes,
  FaNetworkWired,
  FaChartLine,
  FaHistory,
} from 'react-icons/fa';
import { PiRankingDuotone } from 'react-icons/pi';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onShowFlowPanel?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggle,
  onShowFlowPanel,
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const [activeItem, setActiveItem] = useState(location.pathname);

  useEffect(() => {
    setActiveItem(location.pathname);
  }, [location.pathname]);

  return (
    <div
      className={`fixed left-0 top-0 h-screen border-r border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc]
      to-[#e3e9f3] text-[#222] transition-all duration-300 ease-out ${
        collapsed ? 'w-20' : 'w-72'
      } z-50`}
    >
      <div className="flex items-center justify-between border-b border-[#e0e0e0] p-4">
        <div
          className={`flex items-center overflow-hidden transition-all duration-300 ${
            collapsed ? 'w-0 opacity-0' : 'w-full opacity-100'
          }`}
        >
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: '#1976d2' }}
          >
            NDT<span className="text-[#FF7F50]">win</span>
          </h1>
        </div>
        <button
          onClick={onToggle}
          className={`rounded-md border border-[#e0e0e0] bg-[#fff] p-2 transition-all duration-200 hover:bg-[#e3e9f3] ${
            collapsed ? 'ml-auto mr-auto' : ''
          }`}
        >
          {collapsed ? (
            <FaBars size={20} style={{ color: '#1976d2' }} />
          ) : (
            <FaTimes size={20} style={{ color: '#1976d2' }} />
          )}
        </button>
      </div>

      <div className="mt-4 px-3">
        <div
          className={`mb-3 pl-3 text-xs font-semibold uppercase tracking-wider text-[#1976d2] transition-opacity duration-300 ${
            collapsed ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {t('navigation.dashboard')}
        </div>
        <ul className="space-y-1.5">
          <NavItem
            icon={<FaChartLine style={{ color: '#1976d2' }} />}
            text={t('navigation.dashboard')}
            path="/NetworkTopology"
            collapsed={collapsed}
            active={activeItem === '/NetworkTopology' || activeItem === '/'}
            onClick={() => setActiveItem('/NetworkTopology')}
          />
          <NavItem
            icon={<FaNetworkWired style={{ color: '#1976d2' }} />}
            text={t('navigation.trafficEngineering')}
            path="/SwitchFlowTable"
            collapsed={collapsed}
            active={activeItem === '/SwitchFlowTable'}
            onClick={() => setActiveItem('/SwitchFlowTable')}
          />
          <NavItem
            icon={<FaHistory style={{ color: '#1976d2' }} />}
            text={t('navigation.tracePlayback')}
            path="/AvailabilityStatus"
            collapsed={collapsed}
            active={activeItem === '/AvailabilityStatus'}
            onClick={() => setActiveItem('/AvailabilityStatus')}
          />
        </ul>
      </div>

      <div className="absolute bottom-4 w-full px-3">
        <div className="border-t border-[#e0e0e0] pt-4">
          <button
            className={`mb-2 flex w-full items-center rounded-lg border border-blue-300 bg-blue-100 p-3 transition-all duration-200 hover:bg-blue-200 ${collapsed ? 'justify-center' : ''}`}
            onClick={onShowFlowPanel}
          >
            <PiRankingDuotone style={{ color: '#1976d2' }} />
            <span
              className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${
                collapsed ? 'ml-0 w-0 opacity-0' : 'ml-3 w-full opacity-100'
              }`}
            >
              {t('dashboard.flows')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface NavItemProps {
  icon: React.ReactNode;
  text: string;
  path: string;
  collapsed: boolean;
  active: boolean;
  onClick: () => void;
}

function NavItem({
  icon,
  text,
  path,
  collapsed,
  active,
  onClick,
}: NavItemProps) {
  return (
    <li className="group relative flex flex-row">
      <Link
        to={path}
        className={`flex items-center rounded-lg px-3 py-2.5 transition-all duration-200 ${
          active
            ? 'border-l-2 border-[#1976d2] bg-[#fff] text-[#1976d2]'
            : 'border-l-2 border-transparent text-[#222] hover:bg-[#fff] hover:text-[#1976d2]'
        }`}
        onClick={onClick}
      >
        <div className="flex items-center justify-center">{icon}</div>

        <span
          className={`overflow-hidden whitespace-nowrap font-medium transition-all duration-300 ${
            collapsed ? 'ml-0 w-0 opacity-0' : 'ml-3 w-full opacity-100'
          }`}
        >
          {text}
        </span>
        {active && collapsed && (
          <div className="absolute right-2 h-1.5 w-1.5 rounded-full bg-[#1976d2]"></div>
        )}
      </Link>
      {collapsed && (
        <div className="pointer-events-none absolute z-10 ml-16 rounded-lg bg-[#fff] px-3 py-2 text-[#1976d2] opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100">
          <span className="whitespace-nowrap font-semibold">{text}</span>
        </div>
      )}
    </li>
  );
}

export default Sidebar;
