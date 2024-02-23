#!/bin/bash

# Fix permissions
chown -R www-data:www-data /var/www/html

# Execute the passed command
exec "$@"
