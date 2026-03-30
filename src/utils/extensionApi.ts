type ExtensionApi = typeof chrome;

export type ExtensionCommand = {
  name?: string;
  shortcut?: string;
  description?: string;
};

const runtimeGlobal = globalThis as typeof globalThis & {
  browser?: ExtensionApi;
  chrome?: ExtensionApi;
};

export const extensionApi: ExtensionApi = runtimeGlobal.browser ?? runtimeGlobal.chrome;
export const isFirefox = extensionApi.runtime.getURL('').startsWith('moz-extension://');

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in value;
}

export async function getAllCommands(): Promise<ExtensionCommand[]> {
  const commandsApi = extensionApi.commands as unknown as {
    getAll?: (...args: unknown[]) => unknown;
  };
  const getAll = commandsApi.getAll;

  if (!getAll) {
    return [];
  }

  try {
    const result = getAll.call(commandsApi);
    if (isPromiseLike<unknown>(result)) {
      const entries = await result;
      return Array.isArray(entries) ? (entries as ExtensionCommand[]) : [];
    }

    if (Array.isArray(result)) {
      return result as ExtensionCommand[];
    }

    return [];
  } catch (_err) {
    return new Promise((resolve) => {
      try {
        (getAll as (callback: (entries?: ExtensionCommand[]) => void) => void).call(
          commandsApi,
          (entries?: ExtensionCommand[]) => {
            resolve(Array.isArray(entries) ? entries : []);
          }
        );
      } catch (_innerErr) {
        resolve([]);
      }
    });
  }
}

export async function openShortcutSettings(): Promise<boolean> {
  const commandsApi = extensionApi.commands as unknown as {
    openShortcutSettings?: (...args: unknown[]) => unknown;
  };
  const open = commandsApi.openShortcutSettings;

  if (!open) {
    return false;
  }

  try {
    const result = open.call(commandsApi);
    if (isPromiseLike<unknown>(result)) {
      await result;
    }

    return true;
  } catch (_err) {
    return new Promise((resolve) => {
      try {
        (open as (callback: () => void) => void).call(commandsApi, () => {
          const runtime = extensionApi.runtime as unknown as {
            lastError?: { message?: string };
          };
          resolve(!runtime.lastError);
        });
      } catch (_innerErr) {
        resolve(false);
      }
    });
  }
}

export function getShortcutSettingsHint() {
  if (isFirefox) {
    return 'Open Add-ons Manager and use Manage Extension Shortcuts.';
  }

  return 'Open extension shortcut settings.';
}

export function getShortcutSettingsFallbackUrl() {
  if (isFirefox) {
    return 'about:addons';
  }

  return 'chrome://extensions/shortcuts';
}