#!/bin/bash

# config.json and its backups live in WOL_CONFIG_DIR (the image sets /data),
# outside the web root. Apache (www-data) has to be able to write there.
CONFIG_DIR="${WOL_CONFIG_DIR:-/data}"
mkdir -p "$CONFIG_DIR"
chown -R www-data:www-data "$CONFIG_DIR"

# Backup existing config.json (keep last 5)
CONFIG_FILE="$CONFIG_DIR/config.json"
BACKUP_DIR="$CONFIG_DIR/config_backups"

if [ -f "$CONFIG_FILE" ]; then
    mkdir -p "$BACKUP_DIR"
    cp "$CONFIG_FILE" "$BACKUP_DIR/config.json.$(date +%Y%m%d-%H%M%S)"
    # Keep only the 5 most recent backups
    ls -t "$BACKUP_DIR"/config.json.* 2>/dev/null | tail -n +6 | xargs -r rm -f
    chown -R www-data:www-data "$BACKUP_DIR"
fi

# Execute the passed command
exec "$@"
