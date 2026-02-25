/*!
 * mini-i18n.js JavaScript Library v1.0.0
 * http://github.com/AndiSHFR/mini-i18n/
 *
 * Copyright 2017 Andreas Schaefer
 * Licensed under the MIT license
 *
 * @file
 * JavaScript module to switch text elements in a web page on the fly.
 * The intended use is for switching display language on a web page.
 * For language IDs see http://www.localeplanet.com/icu/iso639.html
 *                   or https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
 */

if ('undefined' === typeof jQuery) {
    throw new Error('mini-i18n\'s JavaScript requires jQuery.')
}

+function ($) {
    'use strict';
    var version = $.fn.jquery.split(' ')[0].split('.')
    if ((version[0] < 2 && version[1] < 9) || (version[0] === 1 && version[1] === 9 && version[2] < 1) || (version[0] > 3)) {
        throw new Error('mini-i18n\'s JavaScript requires jQuery version 1.9.1 or higher, but lower than version 4. You are using version ' + $.fn.jquery);
    }
}(jQuery);


+function (window, $, undefined) {
    "use strict";

    // PRIVATE
    var
        err = undefined,
        languageData = {},
        options = {
            debug: false,
            language: '',
            notFound: 'lang-not-found',
            source: undefined,
            onItem: undefined,
            changed: undefined,
            data: undefined
        },

        debug = function (args_) {
            if (console && options.debug) {
                var args = [].slice.call(arguments);
                args.unshift('** MINI-I18N: ');
                console.log.apply(null, args);
            }
        },

        deepValue = function (obj, path) {
            if (!path) return null;
            if ('' === path) return obj;
            path = path.replace(/\[(\w+)]/g, '.$1');
            path = path.replace(/^\./, '').split('.');
            var i = 0, len = path.length;
            while (obj && i < len) {
                obj = obj[path[i++]];
            }
            return obj;
        },

        explainAjaxError = function (jqXHR) {
            var
                knownErrors = {
                    0: 'Not connected. Please verify your network connection.',
                    404: '404 - The requested page could not be found.',
                    500: '500 - Internal Server Error.',
                    'parseerror': 'Parsing requested JSON result failed.',
                    'timeout': 'Time out error.',
                    'abort': 'Ajax request aborted.'
                }
            ;

            return {
                error: knownErrors[jqXHR.status] || 'Unknown Error Reason ' + jqXHR.status,
                details: jqXHR.responseText
            };
        },

        parseIniString = function (data) {
            var regex = {
                section: /^\s*\[\s*([^\]]*)\s*]\s*$/,
                param: /^\s*([^=]+?)\s*=\s*(.*?)\s*$/,
                comment: /^\s*;.*$/
            };
            var value = {};
            var lines = data.split(/[\r\n]+/);
            var section = null;
            lines.forEach(function (line) {
                if (regex.comment.test(line)) {

                } else if (regex.param.test(line)) {
                    var match = line.match(regex.param);
                    if (section) {
                        value[section][match[1]] = match[2];
                    } else {
                        value[match[1]] = match[2];
                    }
                } else if (regex.section.test(line)) {
                    var match = line.match(regex.section);
                    value[match[1]] = {};
                    section = match[1];
                } else if (line.length === 0 && section) {
                    section = null;
                }
            });
            return value;
        },

        updateElements = function (lang, data) {
            debug('Updating elements with language: ' + lang, data, languageData);

            var missing = [];

            $('[data-lang-ckey],[data-lang-tkey],[data-lang-pkey]').each(function () {
                var
                    $this = $(this),
                    ckey = $this.attr('data-lang-ckey'),
                    tkey = $this.attr('data-lang-tkey'),
                    pkey = $this.attr('data-lang-pkey'),
                    vkey = $this.attr('data-lang-vkey'),
                    cval = deepValue(data, ckey),
                    tval = deepValue(data, tkey),
                    pval = deepValue(data, pkey),
                    vval = deepValue(data, vkey)
                ;

                if (!options.onItem ||
                    !options.onItem.apply(
                        null,
                        [lang,
                            {
                                content: {key: ckey, val: cval},
                                title: {key: tkey, val: tval},
                                placeholder: {key: pkey, val: pval},
                                value: {key: vkey, val: vval}
                            }
                        ]
                    )
                ) {

                    if (ckey) {
                        if (!cval) missing.push(this);
                        $this
                            .removeClass(options.notFound)
                            .html(cval)
                            .addClass((cval ? undefined : options.notFound));
                    }

                    if (tkey) {
                        if (!tval) missing.push(this);
                        $this
                            .removeClass(options.notFound)
                            .attr('title', (tval || $this.attr('title')))
                            .addClass((tval ? undefined : options.notFound));
                    }

                    if (pkey) {
                        if (!pval) missing.push(this);
                        $this
                            .removeClass(options.notFound)
                            .attr('placeholder', (pval || $this.attr('placeholder')))
                            .addClass((pval ? undefined : options.notFound));
                    }

                    if (vkey) {
                        if (!vval) missing.push(this);
                        $this
                            .removeClass(options.notFound)
                            .attr('value', (vval || $this.attr('value')))
                            .addClass((vval ? undefined : options.notFound));
                    }

                }
            });

            if (missing.length) debug('Missing values for elements:', missing);

            if (data) $("html").attr("lang", lang.split('-')[0]);
            options.changed && options.changed.apply(null, [err, lang, data]);
        },

        switchLanguage = function (lang, cb) {

            var
                data = languageData[lang],
                source = undefined
            ;

            if (!data) {

                if ('string' == typeof options.source) {
                    debug('Prepare source from string:', options.source);
                    source = options.source.replace('{{LANG}}', lang);
                } else if ('function' == typeof options.source) {
                    debug('Prepare source by calling:', options.source);
                    source = options.source.apply(null, [lang]);
                }

                if (source) {
                    debug('Will load language data for "' + lang + '" from source:', source);
                    $.ajax({
                        type: 'GET',
                        url: source,
                        cache: false,
                        success: function (data_) {
                            debug('Received language data:', data_);
                            if ('string' == typeof data_) {
                                languageData[lang] = parseIniString(data_);
                            } else {
                                languageData[lang] = data_;
                            }
                            data = languageData[lang];
                            cb && cb.apply(null, [lang, data]);
                        },
                        error: function (jqXHR) {
                            err = explainAjaxError(jqXHR);
                            cb.apply(null, [lang, data]);
                        }
                    });
                } else {
                    debug('No language data and no source for language:', lang);
                    cb && cb.apply(null, [lang, data]);
                }

            } else {
                cb && cb.apply(null, [lang, data]);
            }
        },

        language = function (lang) {
            err = undefined;
            debug('Switching to language: ', lang);
            switchLanguage(lang, updateElements);
        },

        configure = function (options_) {
            debug('Configuring with: ', options_);
            options = $.extend({}, options, options_);
            languageData = options.data || {};
        }

    ;

    // PUBLIC
    $.fn.extend({
        miniI18n: function (p) {
            if ('string' === typeof p) return language(p);
            if ('object' === typeof p) return configure(p);
            throw new Error('Argument must be a string or an object with configuration values.');
        }
    });


    $(function () {
        $('[data-lang-switch]').on('click.mini-i18n', function () {
            var lang = $(this).attr('data-lang-switch');
            if (lang) $.fn.miniI18n(lang);
        });
    });

}(window, jQuery);


/**
 * Bootstrap Choice jQuery plugin
 */
$(function () {
    'use strict'

    $.fn.bootstrapChoice = function (options) {
        var
            defaults = {
                modal: null
                , onClick: function () {
                    return false;
                }
                , getChoice: function (button) {
                    return $(button).data('choice');
                }
                , onShow: function () {
                }
                , onShown: function () {
                }
                , onHide: function () {
                }
                , onHidden: function () {
                }
            }
        ;

        return this.each(function () {
            var
                settings = $.extend({}, defaults, options)
                , $this = $(this)
                , $modal = $(settings.modal);


            if (!settings.modal) alert('No modal set (.modal == null). This is not allowed!');

            $modal.on('show.bs.modal', function () {
                settings.onShow.apply(null, []);
            });
            $modal.on('shown.bs.modal', function () {
                settings.onShown.apply(null, []);
            });
            $modal.on('hide.bs.modal', function () {
                settings.onHide.apply(null, []);
            });
            $modal.on('hidden.bs.modal', function () {
                settings.onHidden.apply(null, []);
            });

            $modal.on('click', 'button', function () {
                var choice = null;
                var closeModal = false;
                if ('modal' === $(this).data('bs-dismiss')) return;
                if (settings.getChoice) choice = settings.getChoice.apply(null, [this])
                if (settings.onClick) closeModal = settings.onClick.apply(null, [choice, this]);
                if (closeModal) $modal.modal('hide');
            });

            $this.on('click', function () {
                $modal.modal('show');
            });

        });
    }

});


/* ============================================================
   Settings Manager — localStorage persistence
   ============================================================ */
var WolSettings = (function () {
    var STORAGE_KEY = 'wol_settings';

    var defaults = {
        theme: 'dark',
        compact: false,
        checkInterval: 2000,
        autoRefresh: true,
        defaultPort: 9,
        defaultCidr: 24,
        toastDuration: 5000,
        language: 'en-US'
    };

    function load() {
        try {
            var stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return $.extend({}, defaults, stored || {});
        } catch (e) {
            return $.extend({}, defaults);
        }
    }

    function save(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            // localStorage unavailable
        }
    }

    function get(key) {
        var s = load();
        return s.hasOwnProperty(key) ? s[key] : defaults[key];
    }

    function set(key, value) {
        var s = load();
        s[key] = value;
        save(s);
    }

    return {
        load: load,
        save: save,
        get: get,
        set: set,
        defaults: defaults
    };
})();


/* ============================================================
   Main Wake-on-LAN Application
   ============================================================ */
$(function () {
    'use strict'
    var
        isSocketExtensionLoaded = window.WOL_CONFIG.isSocketExtensionLoaded
        , isDebugEnabled = window.WOL_CONFIG.isDebugEnabled
        , csrfToken = window.WOL_CONFIG.csrfToken
        , baseAddress = window.WOL_CONFIG.baseAddress

        , debugPrint = function () {
            if (console && isDebugEnabled) {
                var args = [].slice.call(arguments);
                args.unshift('*** WOL: ');
                console.log.apply(null, args);
            }
        }

        /* ---- Toast Notification System ---- */
        , showToast = function (message, style, autoClose) {
            var $container = $('#toastContainer');
            style = style || 'danger';

            var duration = autoClose;
            if (typeof duration === 'undefined') {
                duration = WolSettings.get('toastDuration');
            }

            var iconMap = {
                success: 'fa-check-circle',
                danger: 'fa-exclamation-circle',
                warning: 'fa-exclamation-triangle',
                info: 'fa-info-circle'
            };

            var $toast = $([
                '<div class="wol-toast toast-' + style + '">',
                '  <i class="fas ' + (iconMap[style] || iconMap.info) + ' wol-toast__icon"></i>',
                '  <div class="wol-toast__body">' + message + '</div>',
                '  <button class="wol-toast__close"><i class="fas fa-times"></i></button>',
                '</div>'
            ].join(''));

            $container.append($toast);

            var removeToast = function () {
                $toast.addClass('is-leaving');
                setTimeout(function () { $toast.remove(); }, 260);
            };

            $toast.find('.wol-toast__close').on('click', removeToast);

            if (duration > 0) {
                setTimeout(removeToast, duration);
            }
        }

        /* Keep legacy showNotification wired to toast */
        , showNotification = function (message, style, autoClose) {
            if (!message || '' === message) return;
            showToast(message, style, autoClose || WolSettings.get('toastDuration'));
        }

        , renderTemplate = function (html, data, rowCallback) {
            var
                re = /\{\{([\s\S]+?(}?)+)}}/g,
                reExp = /(^( )?(var|if|for|else|switch|case|break|{|}|;))(.*)?/g,
                code = 'with(obj) { var r=[];\n',
                cursor = 0,
                result = [],
                match
            ;

            var
                isArray = function (o) {
                    return ('[object Array]' === Object.prototype.toString.call(o));
                },
                add = function (line, js) {
                    js ?
                        (code += line.match(reExp) ? line + '\n' : 'r.push(' + line + ');\n') :
                        (code += line !== '' ?
                                'r.push("' + line.replace(/"/g, '\\"') + '");\n' :
                                ''
                        );
                    return add;
                };

            while ((match = re.exec(html))) {
                add(html.slice(cursor, match.index))(match[1], true);
                cursor = match.index + match[0].length;
            }
            add(html.substr(cursor, html.length - cursor));
            code = (code + 'return r.join(""); }').replace(/[\r\t\n]/g, ' ');
            try {
                if (!isArray(data)) data = [data];
                for (var i = 0; i < data.length; i++) {

                    var
                        item = JSON.parse(JSON.stringify(data[i])),
                        ignore = rowCallback && rowCallback.apply(null, [item, i])
                    ;
                    if (!ignore) result.push(new Function('obj', code).apply(item, [item]));
                }
            } catch (err) {
                console && console.error("'" + err.message + "'");
            }
            return result;
        }

        , unsavedChangesCount = 0
        , cardIndex = 0

        , makeClean = function () {
            unsavedChangesCount = 0;
            updateUi();
        }

        , makeDirty = function () {
            unsavedChangesCount++;
            updateUi();
        }

        /* Get configuration from the hidden table (source of truth) */
        , getConfiguration = function () {
            return $('#hostTable tbody tr').map(function () {
                return $(this).data('wol');
            }).get();
        }

        /* ---- Card Rendering ---- */
        , escHtml = function (str) {
            var div = document.createElement('div');
            div.appendChild(document.createTextNode(str || ''));
            return div.innerHTML;
        }

        , renderCard = function (mac, host, cidr, port, comment, index) {
            var dataWol = JSON.stringify({ mac: mac, host: host, cidr: cidr, port: port, comment: comment });
            var displayName = comment || host || mac;
            var displayHost = host || '';

            return [
                '<div class="wol-card is-checking" data-card-index="' + index + '" data-wol-card=\'' + escHtml(dataWol) + '\' style="animation-delay:' + (index * 0.05) + 's">',
                '  <div class="wol-card__top">',
                '    <div class="wol-card__status" title="Checking..."></div>',
                '    <div class="wol-card__info">',
                '      <div class="wol-card__name">' + escHtml(displayName) + '</div>',
                '      <div class="wol-card__host">' + escHtml(displayHost) + '</div>',
                '      <div class="wol-card__port-info"></div>',
                '    </div>',
                '    <div class="wol-card__actions">',
                '      <button class="wol-card-btn btn-wake btnWakeUpHost" title="Wake"><i class="fas fa-power-off"></i></button>',
                '      <button class="wol-card-btn btn-delete btnRemoveHost" title="Delete"><i class="fas fa-trash-alt"></i></button>',
                '    </div>',
                '  </div>',
                '  <div class="wol-card__meta">',
                '    <span class="wol-card__tag"><span class="wol-card__tag-label">MAC</span> ' + escHtml(mac) + '</span>',
                '    <span class="wol-card__tag"><span class="wol-card__tag-label">CIDR</span> /' + escHtml(String(cidr)) + '</span>',
                '    <span class="wol-card__tag"><span class="wol-card__tag-label">Port</span> ' + escHtml(String(port)) + '</span>',
                '  </div>',
                '</div>'
            ].join('\n');
        }

        , syncCardsFromTable = function () {
            var $grid = $('#hostGrid');
            $grid.empty();
            cardIndex = 0;
            $('#hostTable tbody tr').each(function () {
                var wol = $(this).data('wol');
                if (wol) {
                    $grid.append(renderCard(wol.mac, wol.host, wol.cidr, wol.port, wol.comment, cardIndex));
                    cardIndex++;
                }
            });
            updateStats();
            updateEmptyState();
        }

        , updateStats = function () {
            var total = $('#hostGrid .wol-card').length;
            var online = $('#hostGrid .wol-card.is-online').length;
            $('#statTotal').text(total);
            $('#statOnline').text(online);
        }

        , updateEmptyState = function () {
            var total = $('#hostGrid .wol-card').length;
            if (total === 0) {
                $('#emptyState').show();
                $('#hostGrid').hide();
            } else {
                $('#emptyState').hide();
                $('#hostGrid').show();
            }
        }

        , addHost = function (mac, host, cidr, port, comment) {
            var hostConfig = {
                mac: mac,
                host: host,
                cidr: cidr,
                port: port,
                comment: comment
            };
            hostConfig['dataWol'] = JSON.stringify(hostConfig);
            var tr = renderTemplate($('#tableRowTemplate').html(), hostConfig);
            $('#hostTable tbody').append(tr);

            // Add card to grid
            $('#hostGrid').append(renderCard(mac, host, cidr, port, comment, cardIndex));
            cardIndex++;
            updateStats();
            updateEmptyState();
        }

        , saveConfigToServer = function () {
            $.ajax({
                url: baseAddress + '?aop=CONFIG.SET' + (isDebugEnabled ? '&debug=1' : '')
                , type: 'POST'
                , data: JSON.stringify(getConfiguration())
                , contentType: 'application/json; charset=utf-8'
                , dataType: 'json'
                , headers: {'X-CSRF-TOKEN': csrfToken}
                , beforeSend: function () {
                    $('#ajaxLoader').fadeIn();
                }
                , complete: function () {
                    $('#ajaxLoader').fadeOut();
                }
                , error: function (jqXHR) {
                    showToast('Error ' + jqXHR.status + ': ' + jqXHR.statusText, 'danger');
                }
                , success: function (resp) {
                    if ('string' == typeof resp) {
                        showToast(resp, 'danger');
                    } else {
                        if (resp.csrfToken) csrfToken = resp.csrfToken;
                        makeClean();
                        showToast($('#textConfigSavedSuccessfully').html(), 'success');
                    }
                }
            });
            document.getElementById('mac').value = '';
            document.getElementById('host').value = '';
            document.getElementById('cidr').value = '';
            document.getElementById('port').value = '';
            document.getElementById('comment').value = '';
        }

        , loadConfigFromServer = function (doNotMakeClean) {
            $.ajax({
                url: baseAddress
                , type: 'GET'
                , data: {debug: isDebugEnabled, aop: 'CONFIG.GET'}
                , beforeSend: function () {
                    $('#ajaxLoader').fadeIn();
                }
                , complete: function () {
                    $('#ajaxLoader').fadeOut();
                }
                , error: function (jqXHR) {
                    showToast('Error ' + jqXHR.status + ': ' + jqXHR.statusText, 'danger');
                }
                , success: function (resp) {
                    if ('string' == typeof resp) {
                        showToast(resp, 'danger');
                    } else {
                        for (var i = 0; i < resp.length; i++) {
                            addHost(resp[i].mac, resp[i].host, resp[i].cidr, resp[i].port, resp[i].comment);
                        }
                        if (!doNotMakeClean) makeClean();
                    }
                }
            });
        }

        , uiEventsBound = false

        , updateUi = function () {
            var $saveBar = $('#saveBar');
            if (unsavedChangesCount) {
                $saveBar.addClass('is-visible');
                if (!uiEventsBound) {
                    document.getElementById('saveButton').addEventListener('click', saveConfigToServer);
                    document.getElementById('cancelButton').addEventListener('click', function () {
                        makeClean();
                        location.reload();
                    });
                    uiEventsBound = true;
                }
                document.getElementById('saveConfigToServer').closest('li').style.display = 'list-item';
            } else {
                $saveBar.removeClass('is-visible');
                document.getElementById('saveConfigToServer').closest('li').style.display = 'none';
            }
        }

        , checkIntervalTimer = null
        , lastUpdateIndex = 0

        , checkNextHostState = function () {
            var interval = WolSettings.get('checkInterval');
            if (interval === 0) return; // disabled

            var $cards = $('#hostGrid .wol-card');
            lastUpdateIndex++;
            if (lastUpdateIndex > $cards.length) {
                lastUpdateIndex = 1;
            }

            var $card = $cards.eq(lastUpdateIndex - 1);
            if (!$card.length) {
                lastUpdateIndex = 0;
                checkIntervalTimer = setTimeout(checkNextHostState, 100);
                return;
            }

            var wolInfo;
            try {
                wolInfo = JSON.parse($card.attr('data-wol-card'));
            } catch (e) {
                checkIntervalTimer = setTimeout(checkNextHostState, interval);
                return;
            }

            // Also update the corresponding table row status icon
            var $tr = $('#hostTable tbody tr:nth-child(' + lastUpdateIndex + ')');
            var $i = $tr.find('td:first-child >');

            $card.removeClass('is-online is-offline').addClass('is-checking');

            $.ajax({
                url: baseAddress
                , type: 'GET'
                , data: {debug: isDebugEnabled, aop: 'HOST.CHECK', host: wolInfo.host}
                , beforeSend: function () {
                    $i.removeClass('fa-question fa-eye fa-thumbs-up fa-thumbs-down text-danger text-success')
                      .addClass('fa-eye text-muted');
                }
                , complete: function () {
                    checkIntervalTimer = setTimeout(checkNextHostState, interval);
                }
                , error: function (jqXHR) {
                    $card.removeClass('is-checking is-online').addClass('is-offline');
                }
                , success: function (resp) {
                    if ('string' === typeof resp) {
                        resp = {error: resp};
                    }
                    if (resp && resp.error && resp.error !== '') {
                        $card.removeClass('is-checking is-online').addClass('is-offline');
                        return;
                    }
                    $i.attr('title', resp.info);
                    if (resp.isUp) {
                        $card.removeClass('is-checking is-offline').addClass('is-online');
                        $card.find('.wol-card__port-info').text(resp.info || '');
                        $i.removeClass('fa-eye text-muted').addClass('fa-thumbs-up text-success');
                    } else {
                        $card.removeClass('is-checking is-online').addClass('is-offline');
                        $card.find('.wol-card__port-info').text('');
                        $i.removeClass('fa-eye text-muted').addClass('fa-thumbs-down text-danger');
                    }
                    updateStats();
                }
            });
        }
    ;


    /* ============================================================
       Event Handlers
       ============================================================ */

    // Save config from dropdown
    $('#saveConfigToServer').on('click', function () {
        setTimeout(saveConfigToServer, 10);
    });

    // Load config choice modal
    $('#loadConfigFromServer').bootstrapChoice({
        modal: '#chooseLoadConfigModal'
        , onClick: function (choice) {
            var rowCount = $('#hostTable tbody tr').length;
            if ('REPLACE' === choice) {
                $('#hostTable tbody').empty();
                $('#hostGrid').empty();
                rowCount = 0;
            }
            if (rowCount !== 0) makeDirty();
            loadConfigFromServer((rowCount !== 0));
            return true;
        }
    });

    // Export modal — populate JSON
    $('#exportModal').on('show.bs.modal', function () {
        $('#exportJson').val(JSON.stringify(getConfiguration(), null, 2));
    });

    // Import JSON
    $('#importJsonConfig').on('click', function () {
        var jsonString = $('#importJson').val();
        var overwrite = $('#importJsonOverwriteExisting:checked').length;
        var config = [];

        $('#importJsonErrorContainer').empty();

        try {
            config = JSON.parse(jsonString);
        } catch (err) {
            $('#importJsonErrorContainer').append(
                '<div class="alert alert-danger alert-dismissible fade show" role="alert">' +
                err +
                '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>'
            );
            return;
        }

        if (overwrite) {
            $('#hostTable tbody').empty();
            $('#hostGrid').empty();
        }
        makeDirty();
        for (var i = 0; i < config.length; i++) {
            addHost(config[i].mac, config[i].host, config[i].cidr, config[i].port, config[i].comment);
        }
        $('#importModal').modal('hide');
    });

    // Remove host — from card click
    $('#hostGrid').on('click', '.btnRemoveHost', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var $card = $(this).closest('.wol-card');
        var wolData;
        try {
            wolData = JSON.parse($card.attr('data-wol-card'));
        } catch (e) { return false; }

        // Find and remove the corresponding table row
        var cardIdx = $card.index();
        var $tr = $('#hostTable tbody tr').eq(cardIdx);
        $tr.remove();

        // Populate form with removed host data (for easy re-add)
        $('#mac').val(wolData.mac);
        $('#host').val(wolData.host);
        $('#cidr').val(wolData.cidr);
        $('#port').val(wolData.port);
        $('#comment').val(wolData.comment);

        // Animate card removal
        $card.css({ transition: 'all 0.25s ease', opacity: 0, transform: 'scale(0.95)' });
        setTimeout(function () {
            $card.remove();
            updateStats();
            updateEmptyState();
        }, 260);

        makeDirty();
        return false;
    });

    // Wake host — from card click
    $('#hostGrid').on('click', '.btnWakeUpHost', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var $card = $(this).closest('.wol-card');
        var wolData;
        try {
            wolData = JSON.parse($card.attr('data-wol-card'));
        } catch (e) { return false; }

        $.ajax({
            url: baseAddress + '?aop=HOST.WAKEUP' + (isDebugEnabled ? '&debug=1' : '')
            , type: 'POST'
            , data: JSON.stringify(wolData)
            , contentType: 'application/json; charset=utf-8'
            , dataType: 'json'
            , headers: {'X-CSRF-TOKEN': csrfToken}
            , beforeSend: function () {
                $('#ajaxLoader').fadeIn();
            }
            , complete: function () {
                $('#ajaxLoader').fadeOut();
            }
            , error: function (jqXHR) {
                showToast('Error ' + jqXHR.status + ': ' + jqXHR.statusText, 'danger');
            }
            , success: function (resp) {
                if ('string' == typeof resp) {
                    showToast(resp, 'danger');
                } else {
                    if (resp.csrfToken) csrfToken = resp.csrfToken;
                    showToast(resp['info'], 'success');
                }
            }
        });

        return false;
    });

    // FAB — open add host modal
    $('#fabAddHost').on('click', function () {
        // Pre-fill defaults from settings
        var $cidr = $('#cidr');
        var $port = $('#port');
        if ($cidr.val() === '') $cidr.val(WolSettings.get('defaultCidr'));
        if ($port.val() === '') $port.val(WolSettings.get('defaultPort'));
        var modal = new bootstrap.Modal(document.getElementById('addHostModal'));
        modal.show();
    });

    // Add host button (inside modal)
    $('#addHost').on('click', function () {
        var mac = $('#mac').val();
        var host = $('#host').val();
        var cidr = $('#cidr').val();
        var port = $('#port').val();
        var comment = $('#comment').val();
        var msg = '';

        if ('' === mac) msg = msg + 'MAC address is required. ';
        if ('' === host) msg = msg + 'Host is required. ';
        if ('' === cidr) cidr = String(WolSettings.get('defaultCidr'));
        if ('' === port) port = String(WolSettings.get('defaultPort'));

        if (/^\d+$/.test(cidr)) {
            if (typeof cidr === 'string') cidr = parseInt(cidr, 10);
            if (!(Number.isInteger(cidr) && cidr >= 0 && cidr <= 32)) {
                msg = msg + 'CIDR must be 0-32. ';
            }
        } else {
            msg = msg + 'CIDR must be numeric. ';
        }

        if (/^\d+$/.test(port)) {
            if (typeof port === 'string') port = parseInt(port, 10);
            if (!(Number.isInteger(port) && port > 0 && port <= 65535)) {
                msg = msg + 'Port must be 1-65535. ';
            }
        } else {
            msg = msg + 'Port must be numeric. ';
        }

        var cleanedMac = mac.replace(/[-:]/g, '');
        if (!/^[0-9A-Fa-f]{12}$/.test(cleanedMac)) {
            msg = msg + 'Invalid MAC address format. ';
        }

        if (mac.length === 12) {
            var isValidMAC = /^[0-9A-Fa-f]{12}$/.test(mac);
            if (isValidMAC) {
                mac = mac.match(/.{2}/g).join('-');
            }
        }

        if (msg) {
            showToast(msg, 'warning');
            return;
        }

        addHost(mac, host, cidr, port, comment);
        makeDirty();

        // Clear form and close modal
        $('#mac').val('');
        $('#host').val('');
        $('#cidr').val('');
        $('#port').val('');
        $('#comment').val('');
        var modalEl = document.getElementById('addHostModal');
        var modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    });


    /* ============================================================
       Settings Panel
       ============================================================ */
    function openSettings() {
        $('#settingsOverlay').addClass('is-open');
        $('#settingsPanel').addClass('is-open');
    }

    function closeSettings() {
        $('#settingsOverlay').removeClass('is-open');
        $('#settingsPanel').removeClass('is-open');
    }

    $('#openSettings').on('click', openSettings);
    $('#closeSettings').on('click', closeSettings);
    $('#settingsOverlay').on('click', closeSettings);

    // Apply settings to UI controls on load
    function loadSettingsUI() {
        var s = WolSettings.load();
        $('#settingTheme').val(s.theme);
        $('#settingCompact').prop('checked', s.compact);
        $('#settingInterval').val(String(s.checkInterval));
        $('#settingAutoRefresh').prop('checked', s.autoRefresh);
        $('#settingDefaultPort').val(s.defaultPort);
        $('#settingDefaultCidr').val(s.defaultCidr);
        $('#settingToastDuration').val(String(s.toastDuration));
        $('#settingLanguage').val(s.language);
    }

    function applyTheme(theme) {
        if (theme === 'auto') {
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    function applyCompact(compact) {
        if (compact) {
            $('body').addClass('view-compact');
        } else {
            $('body').removeClass('view-compact');
        }
    }

    // Bind setting changes
    $('#settingTheme').on('change', function () {
        var val = $(this).val();
        WolSettings.set('theme', val);
        applyTheme(val);
    });

    $('#settingCompact').on('change', function () {
        var val = $(this).prop('checked');
        WolSettings.set('compact', val);
        applyCompact(val);
    });

    $('#settingInterval').on('change', function () {
        var val = parseInt($(this).val(), 10);
        WolSettings.set('checkInterval', val);
        // Restart check loop
        if (checkIntervalTimer) clearTimeout(checkIntervalTimer);
        lastUpdateIndex = 0;
        if (val > 0) {
            checkIntervalTimer = setTimeout(checkNextHostState, 500);
        }
    });

    $('#settingAutoRefresh').on('change', function () {
        WolSettings.set('autoRefresh', $(this).prop('checked'));
    });

    $('#settingDefaultPort').on('change', function () {
        var val = parseInt($(this).val(), 10);
        if (val > 0 && val <= 65535) WolSettings.set('defaultPort', val);
    });

    $('#settingDefaultCidr').on('change', function () {
        var val = parseInt($(this).val(), 10);
        if (val >= 0 && val <= 32) WolSettings.set('defaultCidr', val);
    });

    $('#settingToastDuration').on('change', function () {
        WolSettings.set('toastDuration', parseInt($(this).val(), 10));
    });

    $('#settingLanguage').on('change', function () {
        var val = $(this).val();
        WolSettings.set('language', val);
        $.fn.miniI18n(val);
    });


    /* ============================================================
       Initialize Language Support
       ============================================================ */
    $.fn.miniI18n({
        debug: false
        , data: {
            'en-US': {
                'title': 'Wake On Lan'
                , 'options': 'Options'
                , 'download_config': 'Download Configuration'
                , 'export_config': 'Export Configuration'
                , 'import_config': 'Import Configuration'
                , 'load_config': 'Load Configuration'
                , 'save_config': 'Save Configuration'
                , 'mac_address': 'MAC Address'
                , 'ip_or_hostname': 'IP or Hostname'
                , 'subnet': 'Subnet CIDR'
                , 'port': 'Port'
                , 'comment': 'Comment'
                , 'c_load_configuration': 'Load Configuration'
                , 'c_replace_config': ''
                , 'c_append_config': ''
            }
            , 'de-DE': {
                'title': 'Wake On Lan'
                , 'options': 'Optionen'
                , 'download_config': 'Konfiguration herunterladen'
                , 'export_config': 'Konfiguration exportieren'
                , 'import_config': 'Konfiguration Importieren'
                , 'load_config': 'Konfiguration laden'
                , 'save_config': 'Konfiguration speichern'
                , 'mac_address': 'MAC-Addresse'
                , 'ip_or_hostname': 'IP oder Hostname'
                , 'subnet': 'Subnet CIDR'
                , 'port': 'Port'
                , 'comment': 'Bemerkung'
            }
            , 'es-ES': {
                'title': 'Wake On Lan'
                , 'options': 'Opciones'
                , 'download_config': 'Descargar configuraci\u00f3n'
                , 'export_config': 'Exportar configuraci\u00f3n'
                , 'import_config': 'Importar configuraci\u00f3n'
                , 'load_config': 'Cargar configuraci\u00f3n'
                , 'save_config': 'Guardar configuraci\u00f3n'
                , 'mac_address': 'MAC-Direcci\u00f3n'
                , 'ip_or_hostname': 'IP o nombre de host'
                , 'subnet': 'Subred CIDR'
                , 'port': 'Puerto'
                , 'comment': 'Comentario'
            }
        }
    });

    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Enable drag-and-drop sorting on card grid
    $("#hostGrid").sortable({
        items: '.wol-card'
        , handle: '.wol-card__info'
        , tolerance: 'pointer'
        , opacity: 0.8
        , placeholder: 'wol-card'
        , cursor: 'grabbing'
        , stop: function () {
            // Re-sync table from card order
            var $tbody = $('#hostTable tbody');
            $tbody.empty();
            $('#hostGrid .wol-card').each(function () {
                var wolData;
                try {
                    wolData = JSON.parse($(this).attr('data-wol-card'));
                } catch (e) { return; }
                var hostConfig = $.extend({}, wolData);
                hostConfig['dataWol'] = JSON.stringify(wolData);
                var tr = renderTemplate($('#tableRowTemplate').html(), hostConfig);
                $tbody.append(tr);
            });
            makeDirty();
        }
    });

    $(window).on('beforeunload', function (event) {
        if (!unsavedChangesCount) return;
        var confirmationMessage = 'It looks like you have been editing something. '
            + 'If you leave before saving, your changes will be lost.';
        (event || window.event).returnValue = confirmationMessage;
        return confirmationMessage;
    });


    /* ============================================================
       Startup
       ============================================================ */

    // Apply saved settings
    loadSettingsUI();
    applyTheme(WolSettings.get('theme'));
    applyCompact(WolSettings.get('compact'));

    // Apply saved language
    var savedLang = WolSettings.get('language');
    if (savedLang && savedLang !== 'en-US') {
        $.fn.miniI18n(savedLang);
    }

    // Show warning if sockets extension missing
    if (!isSocketExtensionLoaded) {
        showToast($('#textNoSocketExtensionLoaded').html(), 'warning', 0);
    }

    // Load configuration from server
    if (WolSettings.get('autoRefresh')) {
        setTimeout(loadConfigFromServer, 10);
    }

    // Start host status checking
    var startInterval = WolSettings.get('checkInterval');
    if (startInterval > 0) {
        checkIntervalTimer = setTimeout(checkNextHostState, 1000);
    }

});
