import React, { useState, useRef, useEffect } from 'react';

export interface FilterRule {
  id: string;
  field:
    | 'src_ip'
    | 'dst_ip'
    | 'src_port'
    | 'dst_port'
    | 'protocol'
    | 'rate'
    | 'time';
  operator:
    | 'equals'
    | 'contains'
    | 'starts_with'
    | 'ends_with'
    | 'greater_than'
    | 'less_than'
    | 'in_range';
  value: string;
  enabled: boolean;
}

export interface FilterGroup {
  id: string;
  name: string;
  rules: FilterRule[];
  operator: 'AND' | 'OR';
  enabled: boolean;
  parentGroupId?: string;
}

export interface FilterCriteria {
  groups: FilterGroup[];
  expressionFilter: string;
  useExpression: boolean;
  filterMode: 'gui' | 'expression';
}

interface FilterPanelProps {
  filterCriteria: FilterCriteria;
  setFilterCriteria: React.Dispatch<React.SetStateAction<FilterCriteria>>;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  filterCriteria,
  setFilterCriteria,
}) => {
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const addTopLevelGroup = () => {
    const newGroup: FilterGroup = {
      id: `group-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      name: `Filter Group ${filterCriteria.groups.filter(g => !g.parentGroupId).length + 1}`,
      rules: [],
      operator: 'AND',
      enabled: true,
    };
    setFilterCriteria(prev => ({
      ...prev,
      groups: [...prev.groups, newGroup],
    }));
  };

  const addSubGroup = (parentGroupId: string) => {
    const newGroup: FilterGroup = {
      id: `group-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      name: `Sub Group`,
      rules: [],
      operator: 'AND',
      enabled: true,
      parentGroupId,
    };
    setFilterCriteria(prev => ({
      ...prev,
      groups: [...prev.groups, newGroup],
    }));
  };

  const removeFilterGroup = (groupId: string) => {
    setFilterCriteria(prev => ({
      ...prev,
      groups: prev.groups.filter(
        group => group.id !== groupId && group.parentGroupId !== groupId
      ),
    }));
  };

  const addFilterRule = (groupId: string) => {
    const newRule: FilterRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      field: 'src_ip',
      operator: 'contains',
      value: '',
      enabled: true,
    };
    setFilterCriteria(prev => ({
      ...prev,
      groups: prev.groups.map(group =>
        group.id === groupId
          ? { ...group, rules: [...group.rules, newRule] }
          : group
      ),
    }));
  };

  const removeFilterRule = (groupId: string, ruleId: string) => {
    setFilterCriteria(prev => ({
      ...prev,
      groups: prev.groups.map(group =>
        group.id === groupId
          ? { ...group, rules: group.rules.filter(rule => rule.id !== ruleId) }
          : group
      ),
    }));
  };

  const updateFilterRule = (
    groupId: string,
    ruleId: string,
    updates: Partial<FilterRule>
  ) => {
    setFilterCriteria(prev => ({
      ...prev,
      groups: prev.groups.map(group =>
        group.id === groupId
          ? {
              ...group,
              rules: group.rules.map(rule =>
                rule.id === ruleId ? { ...rule, ...updates } : rule
              ),
            }
          : group
      ),
    }));
  };

  const updateFilterGroup = (
    groupId: string,
    updates: Partial<FilterGroup>
  ) => {
    setFilterCriteria(prev => ({
      ...prev,
      groups: prev.groups.map(group => {
        if (group.id === groupId) {
          return { ...group, ...updates };
        }
        return group;
      }),
    }));
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [filterCriteria.groups]);

  useEffect(() => {
    const checkScrollIndicator = () => {
      if (scrollContainerRef.current) {
        const { scrollHeight, clientHeight } = scrollContainerRef.current;
        setShowScrollIndicator(scrollHeight > clientHeight);
      }
    };

    checkScrollIndicator();
    window.addEventListener('resize', checkScrollIndicator);
    return () => window.removeEventListener('resize', checkScrollIndicator);
  }, [filterCriteria.groups]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (filterCriteria.filterMode === 'gui' && scrollContainerRef.current) {
        if (e.key === 'Home') {
          e.preventDefault();
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (e.key === 'End') {
          e.preventDefault();
          scrollContainerRef.current.scrollTo({
            top: scrollContainerRef.current.scrollHeight,
            behavior: 'smooth',
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [filterCriteria.filterMode]);

  const renderFilterGroup = (group: FilterGroup, level: number = 0) => {
    const subGroups = filterCriteria.groups.filter(
      g => g.parentGroupId === group.id
    );

    return (
      <div
        key={group.id}
        className={`rounded-lg border border-[#e0e0e0] bg-[#f8fafc] p-3 ${level > 0 ? 'ml-4' : ''} max-height-48 overflow-y-auto`}
        style={{ marginTop: level === 0 ? '0' : '0.5rem' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={group.enabled}
              onChange={e =>
                updateFilterGroup(group.id, { enabled: e.target.checked })
              }
              className="text-[#1976d2] focus:ring-[#1976d2]"
            />
            <input
              type="text"
              value={group.name}
              onChange={e =>
                updateFilterGroup(group.id, { name: e.target.value })
              }
              className="w-32 rounded border border-[#e0e0e0] bg-[#fff] px-2 py-1 text-sm"
            />
            <select
              value={group.operator}
              onChange={e =>
                updateFilterGroup(group.id, {
                  operator: e.target.value as 'AND' | 'OR',
                })
              }
              className="rounded border border-[#e0e0e0] bg-[#fff] px-2 py-1 text-sm"
            >
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
            {level === 0 && (
              <span className="text-xs text-gray-500">(Top Level)</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => addFilterRule(group.id)}
              className="rounded bg-[#1976d2] px-2 py-1 text-xs text-white hover:bg-[#1565c0]"
            >
              Add Rule
            </button>
            {level === 0 && (
              <button
                onClick={() => addSubGroup(group.id)}
                className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
              >
                Add Sub Group
              </button>
            )}
            <button
              onClick={() => removeFilterGroup(group.id)}
              className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
            >
              Remove
            </button>
          </div>
        </div>

        {/* Filter Rules */}
        <div className="mb-3 space-y-1">
          {group.rules.map(rule => (
            <div
              key={rule.id}
              className="flex items-center space-x-2 rounded border bg-[#fff] p-2 shadow-sm"
            >
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={e =>
                  updateFilterRule(group.id, rule.id, {
                    enabled: e.target.checked,
                  })
                }
                className="text-[#1976d2] focus:ring-[#1976d2]"
              />
              <select
                value={rule.field}
                onChange={e =>
                  updateFilterRule(group.id, rule.id, {
                    field: e.target.value as any,
                  })
                }
                className="w-32 rounded border border-[#e0e0e0] bg-[#fff] px-2 py-1 text-sm"
              >
                <option value="src_ip">Source IP</option>
                <option value="dst_ip">Destination IP</option>
                <option value="src_port">Source Port</option>
                <option value="dst_port">Destination Port</option>
                <option value="protocol">Protocol</option>
                <option value="rate">Rate</option>
              </select>
              <select
                value={rule.operator}
                onChange={e =>
                  updateFilterRule(group.id, rule.id, {
                    operator: e.target.value as any,
                  })
                }
                className="w-24 rounded border border-[#e0e0e0] bg-[#fff] px-2 py-1 text-sm"
              >
                <option value="contains">Contains</option>
                <option value="equals">Equals</option>
                <option value="starts_with">Starts With</option>
                <option value="ends_with">Ends With</option>
                <option value="greater_than">Greater Than</option>
                <option value="less_than">Less Than</option>
              </select>
              <input
                type="text"
                value={rule.value}
                onChange={e =>
                  updateFilterRule(group.id, rule.id, { value: e.target.value })
                }
                placeholder="Enter value..."
                className="flex-1 rounded border border-[#e0e0e0] bg-[#fff] px-2 py-1 text-sm"
              />
              <button
                onClick={() => removeFilterRule(group.id, rule.id)}
                className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {subGroups.map(subGroup => renderFilterGroup(subGroup, level + 1))}
      </div>
    );
  };

  return (
    <div className="border-b border-[#e0e0e0] bg-[#fff] px-6 py-4">
      {/* Filter Mode Toggle */}
      <div className="mb-4 flex items-center space-x-4">
        <label className="flex items-center space-x-2">
          <input
            type="radio"
            checked={filterCriteria.filterMode === 'gui'}
            onChange={() =>
              setFilterCriteria(prev => ({ ...prev, filterMode: 'gui' }))
            }
            className="text-[#1976d2] focus:ring-[#1976d2]"
          />
          <span className="text-sm font-medium text-[#1976d2]">GUI Filter</span>
        </label>
        <label className="flex items-center space-x-2">
          <input
            type="radio"
            checked={filterCriteria.filterMode === 'expression'}
            onChange={() =>
              setFilterCriteria(prev => ({ ...prev, filterMode: 'expression' }))
            }
            className="text-[#1976d2] focus:ring-[#1976d2]"
          />
          <span className="text-sm font-medium text-[#1976d2]">
            Expression Filter
          </span>
        </label>
      </div>

      {filterCriteria.filterMode === 'expression' ? (
        /* Expression Filter Mode */
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#1976d2]">
              Filter Expression
            </label>
            <input
              type="text"
              value={filterCriteria.expressionFilter}
              onChange={e =>
                setFilterCriteria(prev => ({
                  ...prev,
                  expressionFilter: e.target.value,
                }))
              }
              placeholder='(src_ip == "192.168.1.1" AND dst_ip == "192.168.1.2") OR src_ip == "192.168.1.3"'
              className="w-full rounded-lg border border-[#e0e0e0] bg-[#fff] px-3 py-2 font-mono text-sm text-[#222] focus:border-transparent focus:ring-2 focus:ring-[#1976d2]"
            />
            <div className="mt-2 text-xs text-gray-600">
              <p>
                Supported format: field operator value [AND|OR field operator
                value]
              </p>
              <p>
                Supports parentheses: (condition1 AND condition2) OR condition3
              </p>
              <p>Fields: src_ip, dst_ip, src_port, dst_port, protocol, rate</p>
              <p>Operators: ==, &gt;, &lt;, contains</p>
              <p>Examples:</p>
              <ul className="ml-4 list-inside list-disc space-y-1">
                <li>src_ip == "192.168.1.1"</li>
                <li>
                  (src_ip == "192.168.1.1" AND dst_ip == "192.168.1.2") OR
                  src_ip == "192.168.1.3"
                </li>
                <li>src_port == 80 OR dst_port == 443</li>
                <li>protocol == "TCP" AND rate &gt; 1000000</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        /* GUI Filter Mode */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[#1976d2]">
              GUI Filter Groups
            </h3>
            <button
              onClick={addTopLevelGroup}
              className="rounded bg-[#1976d2] px-3 py-1 text-sm text-white hover:bg-[#1565c0]"
            >
              + Add Top Level Group
            </button>
          </div>

          {/* Filter Groups with Scroll */}
          <div className="rounded-lg border border-[#e0e0e0] bg-[#f8fafc]">
            <div className="rounded-t-lg border-b border-[#e0e0e0] bg-[#fff] px-4 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#1976d2]">
                  Filter Condition List
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">
                    {
                      filterCriteria.groups.filter(
                        group => !group.parentGroupId
                      ).length
                    }{' '}
                    top-level groups
                  </span>
                  <div className="flex items-center space-x-1">
                    <span className="text-xs text-gray-400">|</span>
                    <span className="text-xs text-gray-400">
                      Home/End for quick scrolling
                    </span>
                    <div className="flex space-x-1">
                      <button
                        onClick={() =>
                          scrollContainerRef.current?.scrollTo({
                            top: 0,
                            behavior: 'smooth',
                          })
                        }
                        className="rounded bg-[#f0f0f0] p-1 text-xs transition-colors hover:bg-[#e0e0e0]"
                        title="Scroll to top (Home)"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() =>
                          scrollContainerRef.current?.scrollTo({
                            top: scrollContainerRef.current.scrollHeight,
                            behavior: 'smooth',
                          })
                        }
                        className="rounded bg-[#f0f0f0] p-1 text-xs transition-colors hover:bg-[#e0e0e0]"
                        title="Scroll to bottom (End)"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div
              ref={scrollContainerRef}
              className="scrollbar-thin scrollbar-thumb-[#c1c1c1] scrollbar-track-[#f1f1f1] hover:scrollbar-thumb-[#a8a8a8] relative max-h-80 space-y-4 overflow-y-auto p-4"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#c1c1c1 #f1f1f1',
              }}
            >
              {showScrollIndicator && (
                <div className="absolute right-2 top-2 z-10">
                  <div className="animate-pulse rounded-full bg-[#1976d2] px-2 py-1 text-xs text-white shadow-lg">
                    Scrollable
                  </div>
                </div>
              )}
              {filterCriteria.groups.filter(group => !group.parentGroupId)
                .length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <div className="mb-2">
                    <svg
                      className="mx-auto h-8 w-8 text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm">No filter conditions yet</p>
                  <p className="mt-1 text-xs">
                    Click the button above to add the first filter group
                  </p>
                </div>
              ) : (
                filterCriteria.groups
                  .filter(group => !group.parentGroupId)
                  .map(group => renderFilterGroup(group))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterPanel;
