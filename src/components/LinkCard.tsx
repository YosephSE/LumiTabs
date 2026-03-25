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
        <button
          className="ghost icon-button"
          onClick={() => onOpen(link.url)}
          aria-label="Open link"
          title="Open link"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 5h5v5" />
            <path d="M10 14 19 5" />
            <path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
          </svg>
        </button>
        <button
          className="ghost danger icon-button"
          onClick={() => onDelete(link.url)}
          aria-label="Delete link"
          title="Delete link"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
            <path d="M9 4h6l1 3H8l1-3Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
