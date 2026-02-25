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


/**
 * Main Wake-on-LAN application
 * Reads configuration from window.WOL_CONFIG set by PHP
 */
$(function () {
    'use strict'
    var
        isSocketExtensionLoaded = window.WOL_CONFIG.isSocketExtensionLoaded

        , isDebugEnabled = window.WOL_CONFIG.isDebugEnabled

        , csrfToken = window.WOL_CONFIG.csrfToken

        , baseAddress = window.WOL_CONFIG.baseAddress

        , debugPrint = function (/* args */) {
            if (console && isDebugEnabled) {
                var args = [].slice.call(arguments);
                args.unshift('*** WOL: ');
                console.log.apply(null, args);
            }
        }

        , getAllQueryParameters = function (url) {
            url = url || location.search;
            var
                isArray = function (o) {
                    return ('[object Array]' === Object.prototype.toString.call(o));
                },
                params = {}
            ;

            if (url) url.substr(1).split("&").forEach(function (item) {
                var
                    s = item.split("="),
                    k = decodeURIComponent(s[0]),
                    v = s[1] && decodeURIComponent((s[1] + '').replace(/\+/g, '%20'))
                ;
                if (!params.hasOwnProperty(k)) {
                    params[k] = v;
                } else {
                    if (!isArray(params[k])) params[k] = [params[k]];
                    params[k].push(v);
                }
            })
            return params;
        }

        , showNotification = function (message, style, autoClose) {
            var $notificationContainer = $('#notificationContainer');

            if (!message || '' === message) {
                $notificationContainer.empty();
                return;
            }

            style = style || 'danger';
            autoClose = +autoClose || 0;

            var
                $notification = $([
                    '<div class="alert alert-'
                    , style
                    , ' alert-dismissible fade show" role="alert" >'
                    , message
                    , '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" ></button>'
                    , '</div>'
                ].join('')).hide()

                , hideNotification = function () {
                    $notification.slideUp(400, function () {
                        $notification.remove()
                    });
                }
            ;

            $notificationContainer.prepend($notification);
            $notification
                .fadeIn()
                .find('.close-alert')
                .on('click', hideNotification)
            ;

            if (0 < autoClose) setTimeout(hideNotification, autoClose);
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

        , makeClean = function () {
            unsavedChangesCount = 0;
            updateUi();
        }

        , makeDirty = function () {
            unsavedChangesCount++;
            updateUi();
        }

        , getConfiguration = function () {
            return $('#hostTable tbody tr').map(function () {
                return $(this).data('wol');
            }).get();
        }

        , addHost = function (mac, host, cidr, port, comment) {
            var
                hostConfig = {
                    mac: mac
                    , host: host
                    , cidr: cidr
                    , port: port
                    , comment: comment
                }
            ;
            hostConfig['dataWol'] = JSON.stringify(hostConfig);
            var tr = renderTemplate($('#tableRowTemplate').html(), hostConfig);
            $('#hostTable tbody').append(tr);
        }

        , saveConfigToServer = function () {
            $.ajax({
                url: baseAddress + '?aop=CONFIG.SET' + (isDebugEnabled ? '&debug=1' : '')
                , type: 'POST'
                , data: JSON.stringify(getConfiguration())
                , contentType: 'application/json; charset=utf-8'
                , dataType: 'json'
                , headers: {'X-CSRF-TOKEN': csrfToken}
                , beforeSend: function (/* xhr */) {
                    $('#ajaxLoader').fadeIn();
                }
                , complete: function () {
                    $('#ajaxLoader').fadeOut();
                }
                , error: function (jqXHR) {
                    showNotification('<small>Error ' + jqXHR.status + ' calling "' + baseAddress + '": ' + jqXHR.statusText + '<hr>' + jqXHR.responseText + '</small>', 'danger', 10000);
                }
                , success: function (resp) {
                    if ('string' == typeof resp) {
                        showNotification(resp);
                    } else {
                        makeClean();
                        showNotification($('#textConfigSavedSuccessfully').html(), 'success', 3000);

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
                , beforeSend: function (/* xhr */) {
                    $('#ajaxLoader').fadeIn();
                }
                , complete: function () {
                    $('#ajaxLoader').fadeOut();
                }
                , error: function (jqXHR) {
                    showNotification('<small>Error ' + jqXHR.status + ' calling "' + baseAddress + '": ' + jqXHR.statusText + '<hr>' + jqXHR.responseText + '</small>', 'danger', 10000);
                }
                , success: function (resp) {
                    if ('string' == typeof resp) {
                        showNotification(resp);
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
            if (unsavedChangesCount) {
                saveButton.style.display = 'block';
                cancelButton.style.display = 'block';
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
                saveButton.style.display = 'none';
                cancelButton.style.display = 'none';
                document.getElementById('saveConfigToServer').closest('li').style.display = 'none';
            }
        }

        , lastUpdateIndex = 0
        , checkNextHostState = function () {

            var
                $tr = $('#hostTable tbody tr:nth-child(' + (++lastUpdateIndex) + ')')
                , $i = $tr.find('td:first-child >') // i element of the first TR child
                , wolInfo = $tr.data('wol') || {}
            ;

            if (0 === $tr.length) {
                lastUpdateIndex = 0;
                setTimeout(checkNextHostState, 10);
            } else {
                $.ajax({
                    url: baseAddress
                    , type: 'GET'
                    , data: {debug: isDebugEnabled, aop: 'HOST.CHECK', host: wolInfo.host}
                    , beforeSend: function (/* xhr */) {
                        $i
                            .removeClass('fa-question fa-eye fa-thumbs-up fa-thumbs-down text-danger text-success')
                            .addClass('fa-eye text-muted')
                        ;
                    }
                    , complete: function () {
                        setTimeout(checkNextHostState, 2000);
                    }
                    , error: function (jqXHR) {
                        showNotification('<small>Error ' + jqXHR.status + ' calling "' + baseAddress + '": ' + jqXHR.statusText + '<hr>' + jqXHR.responseText + '</small>', 'danger', 10000);
                    }
                    , success: function (resp) {
                        if ('string' === typeof resp) {
                            resp = {error: resp};
                        }
                        if (resp && resp.error && resp.error !== '') {
                            return showNotification(resp.error, 'danger', 7000);
                        } else {
                            $i.attr('title', resp.info);
                            if (resp.isUp) {
                                $i
                                    .removeClass('fa-eye text-muted')
                                    .addClass('fa-thumbs-up text-success')
                                ;
                            } else {
                                $i
                                    .removeClass('fa-eye text-muted')
                                    .addClass('fa-thumbs-down text-danger')
                                ;
                            }
                        }
                    }
                });
            }
        }
    ;


    /**
     * Event Handler
     */
    $('#saveConfigToServer').on('click', function () {
        setTimeout(saveConfigToServer, 10);
    })

    $('#loadConfigFromServer').bootstrapChoice({
        modal: '#chooseLoadConfigModal'
        , onClick: function (choice) {
            var rowCount = $('#hostTable tbody tr').length;
            if ('REPLACE' === choice) {
                $('#hostTable tbody').empty();
                rowCount = 0;
            }
            if (rowCount !== 0) makeDirty();
            loadConfigFromServer((rowCount !== 0));
            return true;
        }
    });

    $('#exportModal').on('show.bs.modal', function () {
        $('#exportJson').val(JSON.stringify(getConfiguration()));
    });

    $('#importJsonConfig').on('click', function () {
        var
            jsonString = $('#importJson').val()
            , overwrite = $('#importJsonOverwriteExisting:checked').length
            , config = []
        ;

        $('#importJsonErrorContainer').empty();

        try {
            config = JSON.parse(jsonString);
        } catch (err) {
            $('#importJsonErrorContainer').append([
                '<div class="alert alert-danger alert-dismissible fade show" role="alert" >'
                , err
                , '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" ></button>'
                , '</div>'
            ].join());
            return;
        }

        if (overwrite) {
            $('#hostTable tbody').empty();
        }
        makeDirty();
        for (var i = 0; i < config.length; i++) {
            addHost(config[i].mac, config[i].host, config[i].cidr, config[i].port, config[i].comment);
        }
        $('#importModal').modal('hide');
    });

    $('#hostTable tbody').on('click', '.btnRemoveHost', function (event) {
        event.preventDefault();
        var
            $tr = $(this).closest('tr')
            , wolData = $tr.data('wol')
        ;

        $('#mac').val(wolData.mac);
        $('#host').val(wolData.host);
        $('#cidr').val(wolData.cidr);
        $('#port').val(wolData.port);
        $('#comment').val(wolData.comment);
        $tr.remove();
        makeDirty();
        return false;
    })

    $('#hostTable tbody').on('click', '.btnWakeUpHost', function (event) {
        event.preventDefault();
        var
            $tr = $(this).closest('tr')
            , wolData = JSON.parse(JSON.stringify($tr.data('wol')))
        ;

        $.ajax({
            url: baseAddress + '?aop=HOST.WAKEUP' + (isDebugEnabled ? '&debug=1' : '')
            , type: 'POST'
            , data: JSON.stringify(wolData)
            , contentType: 'application/json; charset=utf-8'
            , dataType: 'json'
            , headers: {'X-CSRF-TOKEN': csrfToken}
            , beforeSend: function (/* xhr */) {
                $('#ajaxLoader').fadeIn();
            }
            , complete: function () {
                $('#ajaxLoader').fadeOut();
            }
            , error: function (jqXHR) {
                showNotification('<small>Error ' + jqXHR.status + ' calling "' + baseAddress + '": ' + jqXHR.statusText + '<hr>' + jqXHR.responseText + '</small>', 'danger', 10000);
            }
            , success: function (resp) {
                if ('string' == typeof resp) {
                    showNotification(resp);
                } else {
                    showNotification(resp['info'], 'success', 5000);
                }
            }
        });


        return false;
    })

    $('#addHost').on('click', function () {

        var
            mac = $('#mac').val()
            , host = $('#host').val()
            , cidr = $('#cidr').val()
            , port = $('#port').val()
            , comment = $('#comment').val()
            , msg = ''
        ;

        if ('' === mac) msg = msg + '<br/>The <strong>mac-address</strong> field must not be empty.'
        if ('' === host) msg = msg + '<br/>The <strong>host</strong> field must not be empty.'
        if ('' === cidr) cidr = '24'
        if ('' === port) port = '9'


        if (/^\d+$/.test(cidr)) {
            if (typeof cidr === 'string') cidr = parseInt(cidr, 10);

            if (!(Number.isInteger(cidr) && cidr >= 0 && cidr <= 32)) {
                msg = msg + '<br/>The <strong>cidr</strong> value is not valid. It must be a number between 0 and 32.';
            }
        } else {
            msg = msg + '<br/>The <strong>cidr</strong> value is not valid. It must be a purely numeric value.';
        }

        if (/^\d+$/.test(port)) {
            if (typeof port === 'string') port = parseInt(port, 10);

            if (!(Number.isInteger(port) && port > 0 && port <= 65535)) {
                msg = msg + '<br/>The <strong>port</strong> value is not valid. Port must be between 1 and 65535.';
            }
        } else {
            msg = msg + '<br/>The <strong>port</strong> value is not valid. It must be a purely numeric value.';
        }

        var cleanedMac = mac.replace(/[-:]/g, '');
        if (!/^[0-9A-Fa-f]{12}$/.test(cleanedMac)) {
            msg = msg + '<br/>The <strong>mac-address</strong> is not valid.';
        }

        if (mac.length === 12) {
            const isValidMAC = /^[0-9A-Fa-f]{12}$/.test(mac);
            if (isValidMAC) {
                mac = mac.match(/.{2}/g).join('-');
            }
        }


        if (msg) {
            showNotification('Please check your input:' + msg, 'warning', 10000);
            return;
        }

        addHost(mac, host, cidr, port, comment);
        makeDirty();
    });

    /**
     * Initialize language switching support
     */
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
                , 'mac_address': 'MAC-Address'
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
                , 'download_config': 'Descargar configuración'
                , 'export_config': 'Exportar configuración'
                , 'import_config': 'Importar configuración'
                , 'load_config': 'Cargar configuración'
                , 'save_config': 'Guardar configuración'
                , 'mac_address': 'MAC-Dirección'
                , 'ip_or_hostname': 'IP o nombre de host'
                , 'subnet': 'Subred CIDR'
                , 'port': 'Puerto'
                , 'comment': 'Comentario'
            }
        }
    });

    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    });

    // Enable sorting the table rows with drag&drop
    $("#hostTable tbody").sortable({
        helper: function (e, tr) {
            var $originals = tr.children();
            var $helper = tr.clone();
            $helper.children().each(function (index) {
                $(this).width($originals.eq(index).width())
            });
            return $helper;
        }
        , items: 'tr'
        , opacity: 0.9
        , stop: function () {
            makeDirty();
        }
    }).disableSelection();

    $(window).on('beforeunload', function (event) {
        if (!unsavedChangesCount) return;
        $('#unsavedChangesConfirmation').text();
        var confirmationMessage = 'It looks like you have been editing something. '
            + 'If you leave before saving, your changes will be lost.';
        (event || window.event).returnValue = confirmationMessage;
        return confirmationMessage;
    });

    // Show warning if the sockets extension is not available in php
    if (!isSocketExtensionLoaded) showNotification($('#textNoSocketExtensionLoaded').html(), 'warning');

    // Finally load the configuration from the server
    setTimeout(loadConfigFromServer, 10);

    // Start updating the host state
    setTimeout(checkNextHostState, 1000);

});
