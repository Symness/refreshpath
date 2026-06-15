plugin.loadMainCSS();
plugin.loadLang(true);

(function () {
  'use strict';

  const BUTTON_ID = 'refreshPathButton';
  const CONCURRENCY = 8;
  const TIMEOUT_MS = 10000;

  let running = false;

  function tr(langKey, fallback) {
    return theUILang[langKey] || fallback;
  }

  function format2(template, a, b) {
    return String(template).replace('%s', a).replace('%s', b);
  }

  function notify(message, type) {
    if (typeof noty === 'function') {
      noty(message, type || 'success');
    } else {
      log('[refreshpath] ' + message);
    }
  }

  function getUI() {
    return window.theWebUI;
  }

  function getTable() {
    const ui = getUI();
    return ui && typeof ui.getTable === 'function' ? ui.getTable('trt') : null;
  }

  function getSelectedHashes() {
    const table = getTable();
    if (!table) return [];

    if (typeof table.getSelected === 'function') {
      return table.getSelected().filter((hash) => hash && hash.length === 40);
    }

    const rowSel = table.rowSel || {};
    return Object.keys(rowSel).filter((hash) => rowSel[hash] && hash.length === 40);
  }

  function setButtonBusy(isBusy) {
    const $button = $('#' + BUTTON_ID);
    if (!$button.length) return;

    $button.toggleClass('refreshpath-running', !!isBusy);
    $button.attr(
      'title',
      isBusy
        ? tr('refreshpathRunning', 'Refreshing path column...')
        : tr('refreshpathButton', 'Refresh path column')
    );
  }

  function syncPathColumn(hash, savePath) {
    const ui = getUI();
    const table = getTable();
    if (!ui || !table || !ui.torrents || !ui.torrents[hash]) return;

    const value = savePath || ui.torrents[hash].save_path || '';

    if (typeof table.setValueById === 'function') {
      table.setValueById(hash, 'save_path', value);
    }

    if (typeof table.syncDOM === 'function') {
      table.syncDOM();
    }
  }

  function refreshOne(hash) {
    const ui = getUI();

    return new Promise((resolve) => {
      if (!ui || typeof ui.request !== 'function') {
        resolve(false);
        return;
      }

      let done = false;

      const finish = (ok) => {
        if (done) return;
        done = true;
        resolve(!!ok);
      };

      const timeout = setTimeout(() => {
        log('[refreshpath] Timeout for ' + hash);
        finish(false);
      }, TIMEOUT_MS);

      try {
        ui.request(
          '?action=refreshsavepath&hash=' + encodeURIComponent(hash),
          [
            function (data) {
              clearTimeout(timeout);

              try {
                syncPathColumn(hash, data && data.savepath ? data.savepath : '');
                finish(true);
              } catch (e) {
                log('[refreshpath] Callback error for ' + hash + ': ' + e);
                finish(false);
              }
            },
            ui
          ]
        );
      } catch (e) {
        clearTimeout(timeout);
        log('[refreshpath] Request error for ' + hash + ': ' + e);
        finish(false);
      }
    });
  }

  async function runPool(items, limit, worker) {
    let index = 0;
    let okCount = 0;

    async function next() {
      while (index < items.length) {
        const item = items[index++];
        if (await worker(item)) okCount++;
      }
    }

    const workers = [];
    const count = Math.min(limit, items.length);
    for (let i = 0; i < count; i++) workers.push(next());

    await Promise.all(workers);
    return okCount;
  }

  // Dedicated action for this plugin. It mirrors datadir's getsavepath action,
  // but avoids opening the datadir dialog and avoids any dependency on datadir.
  rTorrentStub.prototype.refreshsavepath = function () {
    let cmd = new rXMLRPCCommand('d.open');
    cmd.addParameter('string', this.hashes[0]);
    this.commands.push(cmd);

    cmd = new rXMLRPCCommand('d.get_base_path');
    cmd.addParameter('string', this.hashes[0]);
    this.commands.push(cmd);

    cmd = new rXMLRPCCommand('d.close');
    cmd.addParameter('string', this.hashes[0]);
    this.commands.push(cmd);
  };

  rTorrentStub.prototype.refreshsavepathResponse = function (xml) {
    const datas = xml.getElementsByTagName('data');
    const data = datas[0];
    const values = data.getElementsByTagName('value');
    const hash = this.hashes[0];
    const torrent = theWebUI.torrents[hash];
    let savePath = '';

    if (torrent) {
      torrent.base_path = this.getXMLValue(values, 3);

      const pos = torrent.base_path.lastIndexOf('/');
      torrent.save_path =
        torrent.base_path.substring(pos + 1) === torrent.name
          ? torrent.base_path.substring(0, pos)
          : torrent.base_path;

      savePath = torrent.save_path;
    }

    return { hash: hash, savepath: savePath };
  };

  theWebUI.refreshSelectedPaths = async function () {
    if (running) {
      notify(tr('refreshpathBusy', 'Path refresh already running.'), 'warning');
      return;
    }

    const ui = getUI();
    const table = getTable();

    if (!ui || !table) {
      notify(tr('refreshpathUnavailable', 'ruTorrent is not ready yet.'), 'warning');
      return;
    }

    const hashes = getSelectedHashes();

    if (!hashes.length) {
      notify(tr('refreshpathNoSelection', 'No torrents selected.'), 'warning');
      return;
    }

    running = true;
    setButtonBusy(true);

    try {
      const okCount = await runPool(hashes, CONCURRENCY, refreshOne);

      if (typeof table.syncDOM === 'function') {
        table.syncDOM();
      }

      notify(
        format2(
          tr('refreshpathReady', 'Path column refreshed for %s/%s torrent(s).'),
          okCount,
          hashes.length
        ),
        okCount === hashes.length ? 'success' : 'warning'
      );
    } finally {
      running = false;
      setButtonBusy(false);
    }
  };

  plugin.onLangLoaded = function () {
    this.addButtonToToolbar(
      BUTTON_ID,
      tr('refreshpathButton', 'Refresh path column'),
      'theWebUI.refreshSelectedPaths()',
      'help'
    );
    this.addSeparatorToToolbar('help');
  };

  plugin.onRemove = function () {
    this.removeSeparatorFromToolbar(BUTTON_ID);
    this.removeButtonFromToolbar(BUTTON_ID);
    delete theWebUI.refreshSelectedPaths;
  };
}());
