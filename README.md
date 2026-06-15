# refreshpath for ruTorrent

Adds a toolbar button that refreshes the `Chemin` / `Save path` column for the selected torrents without opening the datadir popup.

## Install

Copy the `refreshpath` directory into your ruTorrent `plugins/` directory, then reload ruTorrent in your browser.

Example:

```bash
cd /var/www/rutorrent/plugins
unzip /path/to/refreshpath.zip
```

If your ruTorrent setup uses `conf/plugins.ini`, make sure the plugin is enabled:

```ini
[refreshpath]
enabled = yes
```

## Usage

Select one or more torrents, then click the toolbar button titled **Actualiser la colonne Chemin**.
