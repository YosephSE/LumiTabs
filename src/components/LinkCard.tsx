import React from 'react';
import { LinkGroup, SavedLink } from '../types';
import { formatDistanceToNow } from '../utils/time';

export type LinkCardProps = {
  link: SavedLink;
  groups: LinkGroup[];
  onOpen: (url: string) => void;
  onDelete: (url: string) => void;
  onMove: (url: string, groupId?: string) => void;
};

export function LinkCard({ link, groups, onOpen, onDelete, onMove }: LinkCardProps) {
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}&sz=64`;
  const groupName = groups.find((group) => group.id === link.groupId)?.name || 'Ungrouped';

  return (
    <div className="card" role="listitem">
      <div className="card-header">
        <img className="favicon" src={favicon} alt="favicon" />
        <div className="card-title" title={link.title}>
          {link.title}
        </div>
        <div className="card-time">{formatDistanceToNow(link.createdAt)}</div>
      </div>

      <div className="card-group">{groupName}</div>

      <div className="card-url" title={link.url}>
        {link.url}
      </div>

      <div className="card-actions">
        <select
          className="group-select"
          value={link.groupId || ''}
          onChange={(event) => onMove(link.url, event.target.value || undefined)}
        >
          <option value="">Ungrouped</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <button className="ghost" onClick={() => onOpen(link.url)}>
          Open
        </button>
        <button className="ghost danger" onClick={() => onDelete(link.url)}>
          Delete
        </button>
      </div>
    </div>
  );
}
