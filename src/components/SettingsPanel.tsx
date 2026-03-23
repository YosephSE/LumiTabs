import React, { ChangeEvent, useEffect, useRef, useState } from 'react';
import { FontId, LinkGroup, Settings, ThemeId } from '../types';

const FONT_OPTIONS: { id: FontId; label: string }[] = [
  { id: 'manrope', label: 'Manrope' },
  { id: 'source-sans', label: 'Source Sans 3' },
  { id: 'work-sans', label: 'Work Sans' }
];

const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: 'system', label: 'Match system' },
  { id: 'notebar-light', label: 'NoteBar Light' },
  { id: 'notebar-dark', label: 'NoteBar Dark' },
  { id: 'notebar-ocean', label: 'NoteBar Ocean' }
];

type Props = {
  settings: Settings;
  groups: LinkGroup[];
  linksCount: number;
  onUpdate: (patch: Partial<Settings>) => void;
  onShortcutRequest: (kind: 'toggle' | 'save', value: string) => void;
  onExportRequest: (format: 'csv' | 'json') => void;
  onImportRequest: (format: 'csv' | 'json', file: File) => Promise<void>;
  onCreateGroup: (name: string) => Promise<boolean>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onClearAll: () => Promise<void>;
};

export function SettingsPanel({
  settings,
  groups,
  linksCount,
  onUpdate,
  onShortcutRequest,
  onExportRequest,
  onImportRequest,
  onCreateGroup,
  onDeleteGroup,
  onClearAll
}: Props) {
  const [toggleKey, setToggleKey] = useState(settings.toggleShortcut);
  const [saveKey, setSaveKey] = useState(settings.saveShortcut);
  const [isImporting, setIsImporting] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setToggleKey(settings.toggleShortcut);
    setSaveKey(settings.saveShortcut);
  }, [settings.toggleShortcut, settings.saveShortcut]);

  const handleImport = async (format: 'csv' | 'json', event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || isImporting) return;

    setIsImporting(true);
    try {
      await onImportRequest(format, file);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroup.trim() || isCreatingGroup) return;

    setIsCreatingGroup(true);
    try {
      const didCreate = await onCreateGroup(newGroup);
      if (didCreate) {
        setNewGroup('');
      }
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (deletingGroupId) return;

    setDeletingGroupId(groupId);
    try {
      await onDeleteGroup(groupId);
    } finally {
      setDeletingGroupId(null);
    }
  };

  const handleClearAll = async () => {
    if (linksCount === 0 || isClearingAll) return;

    setIsClearingAll(true);
    try {
      await onClearAll();
    } finally {
      setIsClearingAll(false);
    }
  };

  return (
    <div className="section">
      <h2>Settings</h2>

      <div className="setting">
        <label>Theme</label>
        <div className="pill-group">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`pill ${settings.theme === opt.id ? 'active' : ''}`}
              onClick={() => onUpdate({ theme: opt.id })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting">
        <label>Font</label>
        <div className="pill-group">
          {FONT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`pill ${settings.font === opt.id ? 'active' : ''}`}
              onClick={() => onUpdate({ font: opt.id })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting">
        <label>Shortcuts</label>

        <div className="shortcut-row">
          <input
            className="input"
            value={toggleKey}
            onChange={(e) => setToggleKey(e.target.value)}
            onBlur={() => onShortcutRequest('toggle', toggleKey)}
          />
          <span className="hint">Toggle panel</span>
        </div>

        <div className="shortcut-row">
          <input
            className="input"
            value={saveKey}
            onChange={(e) => setSaveKey(e.target.value)}
            onBlur={() => onShortcutRequest('save', saveKey)}
          />
          <span className="hint">Save current page</span>
        </div>
      </div>

      <div className="setting">
        <label>Groups</label>

        <div className="group-create-row">
          <input
            className="input group-input"
            placeholder="Create group"
            value={newGroup}
            onChange={(event) => setNewGroup(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleCreateGroup();
              }
            }}
          />
          <button className="ghost" onClick={() => void handleCreateGroup()} disabled={!newGroup.trim() || isCreatingGroup}>
            {isCreatingGroup ? 'Creating...' : 'Create Group'}
          </button>
        </div>

        {groups.length === 0 ? (
          <span className="hint">No groups yet.</span>
        ) : (
          <div className="group-filters">
            {groups.map((group) => (
              <div className="group-chip" key={group.id}>
                <span className="pill">{group.name}</span>
                <button
                  className="group-chip-delete"
                  title={`Delete ${group.name}`}
                  onClick={() => void handleDeleteGroup(group.id)}
                  disabled={Boolean(deletingGroupId)}
                >
                  {deletingGroupId === group.id ? '...' : 'x'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="setting">
        <label>Data transfer</label>

        <div className="transfer-row">
          <button className="ghost" onClick={() => onExportRequest('csv')}>
            Export CSV
          </button>
          <button className="ghost" onClick={() => onExportRequest('json')}>
            Export JSON
          </button>
        </div>

        <div className="transfer-row">
          <button
            className="ghost"
            onClick={() => csvInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? 'Importing...' : 'Import CSV'}
          </button>
          <button
            className="ghost"
            onClick={() => jsonInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? 'Importing...' : 'Import JSON'}
          </button>
        </div>

        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="file-input"
          onChange={(event) => void handleImport('csv', event)}
        />
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          className="file-input"
          onChange={(event) => void handleImport('json', event)}
        />

        <span className="hint">Import merges links by URL and skips duplicates.</span>
      </div>

      <div className="setting">
        <label>Danger zone</label>
        <button className="ghost danger" onClick={() => void handleClearAll()} disabled={linksCount === 0 || isClearingAll}>
          {isClearingAll ? 'Clearing...' : 'Clear All Links'}
        </button>
      </div>
    </div>
  );
}

