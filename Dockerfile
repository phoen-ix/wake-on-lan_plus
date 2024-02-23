FROM ubuntu:jammy-20240212 as builder

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Combine add-apt-repository commands and cleanup in one RUN to reduce layers and ensure cleanup is effective
RUN apt-get update && \
    apt-get install -y software-properties-common && \
    add-apt-repository -y ppa:ondrej/apache2 && \
    add-apt-repository -y ppa:ondrej/php && \
    apt-get update && \
    apt-get install -y apache2=2.4.* php8.3=8.3.* libapache2-mod-php8.3 php8.3-mbstring php8.3-sockets && \
    a2enmod php8.3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm /var/www/html/index.html

# Redirect Apache logs to stdout and stderr
RUN ln -sf /dev/stdout /var/log/apache2/access.log && \
    ln -sf /dev/stdout /var/log/apache2/error.log

# Copying the application code
COPY wake-on-lan_plus.php /var/www/html/index.php

# Copy the entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Use the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]

# Expose Apache
EXPOSE 80

# Start Apache in the foreground
CMD ["apachectl", "-D", "FOREGROUND"]

