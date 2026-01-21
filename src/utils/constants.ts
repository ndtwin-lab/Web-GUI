// Network constants
export const NETWORK_CONSTANTS = {
  COMMON_PORTS: [
    { port: 7, protocol: 'TCP/UDP', description: 'Echo Protocol' },
    {
      port: 20,
      protocol: 'FTP-DATA',
      description: 'File Transfer Protocol (Data)',
    },
    {
      port: 21,
      protocol: 'FTP',
      description: 'File Transfer Protocol (Control)',
    },
    { port: 22, protocol: 'SSH', description: 'Secure Shell' },
    { port: 23, protocol: 'TELNET', description: 'Telnet' },
    {
      port: 25,
      protocol: 'SMTP',
      description: 'Simple Mail Transfer Protocol',
    },
    { port: 53, protocol: 'DNS', description: 'Domain Name System' },
    {
      port: 67,
      protocol: 'DHCP',
      description: 'Dynamic Host Configuration Protocol (Server)',
    },
    {
      port: 68,
      protocol: 'DHCP',
      description: 'Dynamic Host Configuration Protocol (Client)',
    },
    {
      port: 69,
      protocol: 'TFTP',
      description: 'Trivial File Transfer Protocol',
    },
    { port: 80, protocol: 'HTTP', description: 'Hypertext Transfer Protocol' },
    { port: 123, protocol: 'NTP', description: 'Network Time Protocol' },
    {
      port: 143,
      protocol: 'IMAP',
      description: 'Internet Message Access Protocol',
    },
    {
      port: 161,
      protocol: 'SNMP',
      description: 'Simple Network Management Protocol',
    },
    {
      port: 389,
      protocol: 'LDAP',
      description: 'Lightweight Directory Access Protocol',
    },
    { port: 443, protocol: 'HTTPS', description: 'HTTP Secure' },
    { port: 587, protocol: 'SMTP', description: 'SMTP with STARTTLS' },
    { port: 636, protocol: 'LDAPS', description: 'LDAP over SSL' },
    { port: 1433, protocol: 'MSSQL', description: 'Microsoft SQL Server' },
    { port: 1521, protocol: 'ORACLE', description: 'Oracle Database' },
    { port: 3306, protocol: 'MYSQL', description: 'MySQL Database' },
    { port: 5432, protocol: 'POSTGRESQL', description: 'PostgreSQL Database' },
    { port: 5900, protocol: 'VNC', description: 'Virtual Network Computing' },
    { port: 27017, protocol: 'MONGODB', description: 'MongoDB Database' },
  ],

  BANDWIDTH_THRESHOLDS: {
    GBPS: 1_000_000_000,
    MBPS: 1_000_000,
    KBPS: 1_000,
  },

  USAGE_COLORS: {
    LOW: '#2196F3', // Blue (0-33%)
    MEDIUM: '#4CAF50', // Green (33-66%)
    HIGH: '#FFEB3B', // Yellow (66-100%)
    CRITICAL: '#F44336', // Red (100%+)
  },

  DEVICE_LAYERS: {
    CORE: 0,
    AGGREGATION: 1,
    EDGE: 2,
    HOST: 3,
  },

  TOPOLOGY_LAYOUT: {
    X_SPACING_HOST: 80,
    Y_CORE: -600,
    Y_AGG: 400,
    Y_EDGE: 900,
    Y_HOST: 1200,
  },
} as const;

// UI constants
export const UI_CONSTANTS = {
  ANIMATION_DURATION: 300,
  SIDEBAR_WIDTH: {
    COLLAPSED: 80,
    EXPANDED: 288,
  },
  PANEL_TYPES: {
    DEVICE: 'device',
    LINK: 'link',
    FLOW: 'flow',
  },
  OPERATION_TYPES: {
    INSTALL: 'install',
    DELETE: 'delete',
    MODIFY: 'modify',
  },
} as const;

// API constants
export const API_CONSTANTS = {
  POLLING_INTERVAL: 5000,
  RETRY_ATTEMPTS: 3,
  TIMEOUT: 10000,
} as const;

// Local storage keys
export const STORAGE_KEYS = {
  NODE_POSITIONS: 'nodePositions',
  USER_PREFERENCES: 'userPreferences',
} as const;
