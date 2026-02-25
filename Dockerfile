FROM php:8.3-apache

# Install curl for healthcheck and PHP sockets extension
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN docker-php-ext-install sockets

# Enable Apache mod_rewrite for .htaccess support
RUN a2enmod rewrite

# Enable AllowOverride for .htaccess support
RUN sed -i '/<Directory \/var\/www\/html>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

# Copy application files
COPY index.php /var/www/html/index.php
COPY includes/ /var/www/html/includes/
COPY assets/ /var/www/html/assets/
COPY .htaccess /var/www/html/.htaccess

# Remove default index.html
RUN rm -f /var/www/html/index.html

# Copy the entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Use the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]

# Healthcheck: verify Apache is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Expose Apache
EXPOSE 80

# Start Apache in the foreground
CMD ["apache2-foreground"]
