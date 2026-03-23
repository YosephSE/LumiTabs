// Background service worker for LumiPanel (MV3)
const DEFAULT_SHORTCUTS = {
  toggle: ['Alt+Shift+L', 'Alt+Shift+K', 'Alt+Shift+U'],
  save: ['Alt+Shift+S', 'Alt+Shift+D', 'Alt+Shift+P']
};

async function ensureSidePanel(windowId) {
  try {
    await chrome.sidePanel.open({ windowId });
  } catch (err) {
    console.warn('Side panel open failed', err);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await setDefaultCommands();
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('setPanelBehavior failed', err);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await setDefaultCommands();
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (command === 'toggle_panel' && tab?.windowId !== undefined) {
    await ensureSidePanel(tab.windowId);
    return;
  }

  if (command === 'save_current') {
    if (!tab?.url) return;
    const payload = { type: 'save_current', url: tab.url, title: tab.title || tab.url };
    const sent = await emitToPanels(payload);

    if (!sent) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/img/icon.png'),
        title: 'LumiPanel',
        message: 'Saved link'
      });
    }
  }
});

async function emitToPanels(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function setDefaultCommands() {
  await trySetCommand('toggle_panel', DEFAULT_SHORTCUTS.toggle);
  await trySetCommand('save_current', DEFAULT_SHORTCUTS.save);
}

async function trySetCommand(name, combos) {
  for (const shortcut of combos) {
    try {
      await chrome.commands.update({ name, shortcut });
      return;
    } catch (err) {
      console.warn(`Shortcut ${shortcut} failed for ${name}`, err);
    }
  }

  console.warn(`No available shortcuts for ${name}`);
}
