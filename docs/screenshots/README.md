# Screenshots

Every screen of wake-on-lan_plus, with demo hosts on documentation-only
addresses. `scripts/docs-screenshots.sh` makes them: it runs the tour in
[`e2e/docs/`](../../e2e/docs/) against a throwaway container (see the README's
[Screenshots](../../README.md#screenshots) section). The host status
("online"/"offline" and the open port) is mocked, because the demo hosts do not
exist. The rest is the real app.

## Host grid

Each configured host is a card: comment, IP or hostname, MAC, CIDR and port.
A green dot means one of the checked ports answers, and the card names that
port. A red dot means none answers. The header counts online and total hosts.

<img src="hosts-grid.png" alt="Host grid in the dark theme: six host cards, four online with their open port, two offline" width="800">

## Light theme

Settings › Theme switches between Dark (the default), Light, and Auto, which
follows the system.

<img src="hosts-grid.light.png" alt="The host grid in the light theme" width="800">

## Compact view

Settings › Compact view shows one host per row.

<img src="hosts-compact.png" alt="Compact view: the six hosts as a single-column list" width="800">

## Phone

Below 768 px the grid becomes one column, and the counter moves under the title.

<img src="hosts-grid.mobile.png" alt="The host grid on a 390 px wide phone screen" width="300">

## No hosts

The page with no hosts saved yet.

<img src="hosts-empty.png" alt="Empty state: No hosts configured" width="800">

## Waking a host

The power button sends the magic packet. A toast confirms that it was sent.
That only means the packet left the server, not that the host woke up. Watch
its dot turn green.

<img src="hosts-wake.png" alt="Success toast: Magic packet has been sent for 02-5E-10-00-00-11" width="800">

## Adding a host

The **+** button opens the Add Host dialog. CIDR and port are pre-filled with
the defaults from Settings. A MAC address may use `-`, `:` or no separators.

<img src="hosts-add.png" alt="Add Host dialog filled in with MAC, IP, CIDR 24, port 9 and the comment Office printer" width="800">

## Invalid input

Add Host checks the form and lists every problem in a warning toast.

<img src="hosts-add-invalid.png" alt="Add Host dialog with a warning toast: Host is required, Port must be 1-65535, Invalid MAC address format" width="800">

## Unsaved changes

Adding, removing or reordering cards changes only the page. The save bar at
the bottom stays until you **Save** to the server or **Cancel**, which reloads
the saved configuration.

<img src="hosts-unsaved.png" alt="A seventh host added; the save bar shows Unsaved changes with Cancel and Save" width="800">

## Settings

The gear opens the settings panel. Settings are stored per browser in
`localStorage`. This shows the defaults.

<img src="settings.png" alt="Settings panel: theme, compact view, check interval, auto-refresh, default port and CIDR, toast duration, language" width="800">

## Options menu

The menu next to the gear. **Save Configuration** appears there too while
there are unsaved changes.

<img src="options-menu.png" alt="Options menu: Download, Export, Import and Load Configuration" width="800">

## Export configuration

The configuration on the page as JSON, to copy.

<img src="config-export.png" alt="Export Configuration dialog showing the hosts as JSON" width="800">

## Import configuration

Paste JSON to append hosts, or tick **Overwrite existing configuration** to
replace them. Imported hosts count as unsaved changes.

<img src="config-import.png" alt="Import Configuration dialog with one host pasted as JSON" width="800">

## Import error

JSON that does not parse is rejected inside the dialog.

<img src="config-import-invalid.png" alt="Import Configuration dialog with a SyntaxError alert" width="800">

## Load configuration

Reloads the configuration from the server. Choose whether it replaces the
hosts on the page or is appended to them.

<img src="config-load.png" alt="Loading Configuration dialog: Cancel, Replace Existing, Append To Existing" width="800">
