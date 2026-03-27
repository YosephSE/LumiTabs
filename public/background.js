const extensionApi = globalThis.browser || globalThis.chrome;

const STORAGE_KEYS = {
  savedLinks: 'savedLinks'
};

const COMMAND_NAMES = {
  activateAction: '_execute_action',
  saveCurrent: 'save_current'
};

let feedbackResetTimer = null;
const FEEDBACK_DURATION_MS = 3500;
const isFirefox = extensionApi.runtime.getURL('').startsWith('moz-extension://');

extensionApi.runtime.onInstalled.addListener(async () => {
  await configurePanelBehavior();
  await notifyMissingShortcuts();
});

extensionApi.runtime.onStartup.addListener(async () => {
  await configurePanelBehavior();
  await notifyMissingShortcuts();
});

if (isFirefox && extensionApi.action?.onClicked && extensionApi.sidebarAction?.open) {
  extensionApi.action.onClicked.addListener(async () => {
    await openFirefoxSidebar();
  });
}

extensionApi.commands.onCommand.addListener(async (command) => {
  if (command === COMMAND_NAMES.saveCurrent) {
    const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
    const result = await saveActiveTab(tab);
    notifyPanels({
      type: 'shortcut_save_result',
      status: result.status
    });
    await showSaveFeedback(result.status);
    return;
  }

  if (isFirefox && command === COMMAND_NAMES.activateAction) {
    await openFirefoxSidebar();
  }
});

async function configurePanelBehavior() {
  if (!isFirefox && extensionApi.sidePanel?.setPanelBehavior) {
    try {
      await extensionApi.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (err) {
      console.warn('setPanelBehavior failed', err);
    }
  }

  await extensionApi.action.setBadgeText({ text: '' });
}

async function openFirefoxSidebar() {
  if (!extensionApi.sidebarAction?.open) {
    return;
  }

  try {
    await extensionApi.sidebarAction.open();
  } catch (err) {
    console.warn('Failed to open Firefox sidebar', err);
  }
}

async function saveActiveTab(tab) {
  if (!tab?.url) {
    return { status: 'unavailable' };
  }

  try {
    const result = await extensionApi.storage.local.get([STORAGE_KEYS.savedLinks]);
    const storedLinks = Array.isArray(result[STORAGE_KEYS.savedLinks]) ? result[STORAGE_KEYS.savedLinks] : [];

    const alreadySaved = storedLinks.some((entry) => (
      entry && typeof entry === 'object' && entry.url === tab.url
    ));

    if (alreadySaved) {
      return { status: 'duplicate' };
    }

    const nextLink = {
      url: tab.url,
      title: tab.title || tab.url,
      createdAt: Date.now()
    };

    await extensionApi.storage.local.set({
      [STORAGE_KEYS.savedLinks]: [nextLink, ...storedLinks]
    });

    return { status: 'saved' };
  } catch (err) {
    console.warn('Save current shortcut failed', err);
    return { status: 'failed' };
  }
}

function notifyPanels(message) {
  try {
    const result = extensionApi.runtime.sendMessage(message);
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  } catch (_err) {
    // No panel listeners is an expected state.
  }
}

async function showSaveFeedback(status) {
  let badgeText = 'OK';
  let badgeColor = '#2d8a4f';

  if (status === 'duplicate') {
    badgeText = 'DUP';
    badgeColor = '#8a6d1f';
  } else if (status === 'unavailable') {
    badgeText = 'NO';
    badgeColor = '#8a3d2d';
  } else if (status === 'failed') {
    badgeText = 'ERR';
    badgeColor = '#8a2d2d';
  }

  try {
    await extensionApi.action.setBadgeBackgroundColor({ color: badgeColor });
    await extensionApi.action.setBadgeText({ text: badgeText });

    if (feedbackResetTimer) {
      clearTimeout(feedbackResetTimer);
    }

    feedbackResetTimer = setTimeout(() => {
      feedbackResetTimer = null;
      void extensionApi.action.setBadgeText({ text: '' });
    }, FEEDBACK_DURATION_MS);
  } catch (err) {
    console.warn('Action badge feedback failed', err);
  }
}

async function getCommands() {
  const getAll = extensionApi.commands?.getAll;

  if (!getAll) {
    return [];
  }

  try {
    const result = getAll.call(extensionApi.commands);

    if (result && typeof result.then === 'function') {
      const entries = await result;
      return Array.isArray(entries) ? entries : [];
    }

    return Array.isArray(result) ? result : [];
  } catch (_err) {
    return new Promise((resolve) => {
      try {
        getAll.call(extensionApi.commands, (commands) => {
          resolve(commands || []);
        });
      } catch (_innerErr) {
        resolve([]);
      }
    });
  }
}

function getShortcutSettingsHint() {
  if (isFirefox) {
    return 'Open Add-ons Manager and use Manage Extension Shortcuts.';
  }

  return 'Open extension shortcut settings.';
}

async function notifyMissingShortcuts() {
  try {
    const commands = await getCommands();
    const targets = new Set([COMMAND_NAMES.saveCurrent]);

    const missing = commands.filter((command) => {
      if (!command.name || !targets.has(command.name)) {
        return false;
      }

      return !command.shortcut;
    });

    if (missing.length === 0) {
      return;
    }

    await extensionApi.notifications.create('shortcut-assignment-warning', {
      type: 'basic',
      iconUrl: extensionApi.runtime.getURL('assets/img/icon.png'),
      title: 'Tabs shortcut not set',
      message: `Assign shortcuts in your browser settings. ${getShortcutSettingsHint()}`
    });
  } catch (err) {
    console.warn('Shortcut availability check failed', err);
  }
}