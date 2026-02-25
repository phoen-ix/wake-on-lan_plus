#!/bin/bash

# Fix permissions
chown -R www-data:www-data /var/www/html

# Backup existing config.json (keep last 5)
CONFIG_FILE="/var/www/html/config.json"
BACKUP_DIR="/var/www/html/config_backups"

if [ -f "$CONFIG_FILE" ]; then
    mkdir -p "$BACKUP_DIR"
    cp "$CONFIG_FILE" "$BACKUP_DIR/config.json.$(date +%Y%m%d-%H%M%S)"
    # Keep only the 5 most recent backups
    ls -t "$BACKUP_DIR"/config.json.* 2>/dev/null | tail -n +6 | xargs -r rm -f
    chown -R www-data:www-data "$BACKUP_DIR"
fi

# Execute the passed command
exec "$@"
