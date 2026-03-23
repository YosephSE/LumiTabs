import React, { useMemo, useState } from 'react';
import { LinkGroup, SavedLink } from '../types';
import { LinkCard } from './LinkCard';

type Props = {
  links: SavedLink[];
  groups: LinkGroup[];
  activeGroup: string;
  allGroupKey: string;
  ungroupedGroupKey: string;
  onOpen: (url: string) => void;
  onDelete: (url: string) => void;
  onAdd: (value: string) => Promise<boolean>;
  onMove: (url: string, groupId?: string) => void;
  onGroupChange: (groupKey: string) => void;
};

export function LinkList({
  links,
  groups,
  activeGroup,
  allGroupKey,
  ungroupedGroupKey,
  onOpen,
  onDelete,
  onAdd,
  onMove,
  onGroupChange
}: Props) {
  const [query, setQuery] = useState('');
  const [newLink, setNewLink] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();

    return links.filter((link) => {
      const matchesGroup =
        activeGroup === allGroupKey
          ? true
          : activeGroup === ungroupedGroupKey
            ? !link.groupId
            : link.groupId === activeGroup;

      if (!matchesGroup) return false;

      return link.title.toLowerCase().includes(q) || link.url.toLowerCase().includes(q);
    });
  }, [links, query, activeGroup, allGroupKey, ungroupedGroupKey]);

  const handleAdd = async () => {
    if (!newLink.trim() || isAdding) return;

    setIsAdding(true);
    const didAccept = await onAdd(newLink);
    setIsAdding(false);

    if (didAccept) {
      setNewLink('');
    }
  };

  return (
    <div className="section">
      <div className="add-link-row">
        <input
          className="input add-link-input"
          placeholder="Paste a link and press Enter"
          value={newLink}
          onChange={(e) => setNewLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
        />
        <button className="btn" onClick={() => void handleAdd()} disabled={!newLink.trim() || isAdding}>
          {isAdding ? 'Adding...' : 'Add Link'}
        </button>
      </div>

      <div className="group-toolbar">
        <div className="group-filters">
          <button
            className={`pill ${activeGroup === allGroupKey ? 'active' : ''}`}
            onClick={() => onGroupChange(allGroupKey)}
          >
            All
          </button>
          <button
            className={`pill ${activeGroup === ungroupedGroupKey ? 'active' : ''}`}
            onClick={() => onGroupChange(ungroupedGroupKey)}
          >
            Ungrouped
          </button>

          {groups.map((group) => (
            <button
              key={group.id}
              className={`pill ${activeGroup === group.id ? 'active' : ''}`}
              onClick={() => onGroupChange(group.id)}
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>

      <div className="section-header">
        <h2>Saved Links</h2>

        <div className="section-actions">
          <input
            className="input"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="list" role="list">
        {filtered.map((link) => (
          <LinkCard
            key={link.url}
            link={link}
            groups={groups}
            onOpen={onOpen}
            onDelete={onDelete}
            onMove={onMove}
          />
        ))}
        {filtered.length === 0 && <div className="empty">No links match this view.</div>}
      </div>
    </div>
  );
}
