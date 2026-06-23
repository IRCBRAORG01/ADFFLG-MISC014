var WdgMISC014 = SuperWidget.extend({

    currentDate: null,
    activeTab: 'brasil',

    init: function () {
        var self = this;
        var id   = self.instanceId;
        console.log('[Copa] init — instanceId:', id);

        var today = new Date();
        self.currentDate = self._fmtDate(today);

        var tabHoje   = document.getElementById('tabHoje_'   + id);
        var tabBrasil = document.getElementById('tabBrasil_' + id);
        if (tabHoje)   tabHoje.addEventListener('click',   function () { self._switchTab('hoje'); });
        if (tabBrasil) tabBrasil.addEventListener('click', function () { self._switchTab('brasil'); });

        var retry = document.getElementById('btnRetry_' + id);
        if (retry) retry.addEventListener('click', function () {
            if (self.activeTab === 'brasil') self._loadBrazil();
            else self.loadMatches(self.currentDate);
        });

        // Polling: 30s se há jogo ao vivo, 60s caso contrário
        var _pollFn = function () {
            self._fetchHoje();

            var root = document.getElementById('wdgMISC014_' + id);
            var hasLive = root && !!root.querySelector('.badge-green');
            var hasPending = false;
            if (root && !hasLive) {
                var now = new Date();
                var els = root.querySelectorAll('.copa-score-time[data-utc]');
                for (var i = 0; i < els.length; i++) {
                    try {
                        if (new Date(els[i].getAttribute('data-utc')) <= now) { hasPending = true; break; }
                    } catch (e) {}
                }
            }
            if (hasLive || hasPending) {
                console.log('[Copa] Auto-refresh — jogo ao vivo ou horario passou');
                if (self.activeTab === 'brasil') self._loadBrazil();
                else self.loadMatches(self.currentDate);
                self._pollTimer = setTimeout(_pollFn, 30000);
            } else {
                self._pollTimer = setTimeout(_pollFn, 60000);
            }
        };
        self._pollTimer = setTimeout(_pollFn, 30000);

        self._loadBrazil();
        self._fetchHoje(); // pre-fetch silencioso para Hoje ter dados frescos desde o início
    },

    bindings: { local: {}, global: {} },

    // ─── Tab ──────────────────────────────────────────────────────────────────

    _switchTab: function (tab) {
        var id = this.instanceId;
        this.activeTab = tab;
        var tabHoje   = document.getElementById('tabHoje_'   + id);
        var tabBrasil = document.getElementById('tabBrasil_' + id);
        if (tabHoje)   tabHoje.className   = 'copa-tab' + (tab === 'hoje'   ? ' copa-tab-active' : '');
        if (tabBrasil) tabBrasil.className = 'copa-tab' + (tab === 'brasil' ? ' copa-tab-active' : '');
        if (tab === 'brasil') this._loadBrazil();
        else this.loadMatches(this.currentDate);
    },

    // ─── Pre-fetch silencioso do Hoje (não altera UI) ─────────────────────────

    _fetchHoje: function () {
        var self = this;
        var date = self.currentDate;
        var d = new Date(date + 'T12:00:00');
        d.setDate(d.getDate() + 1);
        var nextDay = self._fmtDate(d);
        self._fetchDataset(date, nextDay, self.instanceId, function (ds) {
            self._saveCache(date, ds);
            // Se a aba Hoje já está ativa, atualiza a view
            if (self.activeTab === 'hoje') {
                self._renderDataset(ds, self.instanceId, date);
            }
        }, function () {});
    },

    // ─── Date helpers ─────────────────────────────────────────────────────────

    _pad: function (n) { return n < 10 ? '0' + n : String(n); },

    _fmtDate: function (d) {
        return d.getFullYear() + '-' + this._pad(d.getMonth() + 1) + '-' + this._pad(d.getDate());
    },

    _fmtDateLabel: function (utcDate) {
        if (!utcDate) return '';
        try {
            var d = new Date(utcDate);
            var months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            return this._pad(d.getDate()) + ' ' + months[d.getMonth()];
        } catch (e) { return ''; }
    },

    // ─── Load: hoje ───────────────────────────────────────────────────────────

    loadMatches: function (date) {
        var self = this;
        var id   = self.instanceId;
        self._show(id, 'loading');
        console.log('[Copa] loadMatches — data:', date);
        // Janela UTC de 2 dias para cobrir o dia completo no horário de Brasília (UTC-3)
        var d = new Date(date + 'T12:00:00');
        d.setDate(d.getDate() + 1);
        var nextDay = self._fmtDate(d);
        self._fetchDataset(date, nextDay, id, function (ds) {
            self._saveCache(date, ds);
            self._renderDataset(ds, id, date);
        }, function () {
            var cached = self._loadCache(date);
            if (cached) { self._renderDataset(cached, id, date); }
            else { self._show(id, 'error'); }
        });
    },

    // ─── Load: brasil ─────────────────────────────────────────────────────────

    _loadBrazil: function () {
        var self = this;
        var id   = self.instanceId;
        self._show(id, 'loading');
        self._fetchDataset('2026-06-11', '2026-07-19', id, function (ds) {
            self._renderBrazil(ds, id);
        }, function () {
            self._show(id, 'error');
        });
    },

    // ─── Fetch helper ─────────────────────────────────────────────────────────

    _fetchDataset: function (dateFrom, dateTo, id, onSuccess, onError) {
        var self = this;
        var body = {
            name: 'dsMISC014_API_JOGOS',
            fields: [], constraints: [],
            order: [dateFrom, dateTo]
        };
        console.log('[Copa] POST — dateFrom:', dateFrom, '| dateTo:', dateTo);
        $.ajax({
            url:         '/api/public/ecm/dataset/datasets',
            type:        'POST',
            contentType: 'application/json',
            dataType:    'json',
            data:        JSON.stringify(body),
            success: function (resp) {
                try { console.log('[Copa] resp:', JSON.stringify(resp).substring(0, 400)); } catch (e) {}
                var ds = self._parseResp(resp);
                if (ds) {
                    console.log('[Copa] Linhas:', ds.values.length);
                    onSuccess(ds);
                } else {
                    console.error('[Copa] Formato desconhecido:', resp ? Object.keys(resp) : 'null');
                    onError();
                }
            },
            error: function (xhr) {
                console.error('[Copa] POST falhou:', xhr.status, xhr.responseText);
                onError();
            }
        });
    },

    _parseResp: function (resp) {
        if (resp && resp.content && resp.content.columns && resp.content.values) {
            var cols = resp.content.columns, objs = resp.content.values, rows = [];
            for (var i = 0; i < objs.length; i++) {
                var row = [];
                for (var j = 0; j < cols.length; j++) {
                    var v = objs[i][cols[j]];
                    row.push(v != null ? String(v) : '');
                }
                rows.push(row);
            }
            return { fields: cols, values: rows };
        }
        if (resp && resp.fields && resp.values) return resp;
        return null;
    },

    // ─── Cache localStorage ────────────────────────────────────────────────────

    _cacheKey: function (date) { return 'copa2026_' + date; },

    _saveCache: function (date, ds) {
        try {
            localStorage.setItem(this._cacheKey(date), JSON.stringify({ ts: new Date().getTime(), ds: ds }));
        } catch (e) { console.warn('[Copa] Cache write falhou:', e); }
    },

    _loadCache: function (date) {
        try {
            var raw = localStorage.getItem(this._cacheKey(date));
            if (!raw) return null;
            var entry = JSON.parse(raw);
            if (!entry || !entry.ds || !entry.ts) return null;
            // Máximo 3 min — evita mostrar status stale em jogos ao vivo
            if (new Date().getTime() - entry.ts > 3 * 60 * 1000) return null;
            return entry.ds;
        } catch (e) { return null; }
    },

    // ─── Render: hoje ─────────────────────────────────────────────────────────

    _renderDataset: function (data, id, filterDate) {
        var self   = this;
        var fields = data.fields, rows = data.values;
        var col = function (name) { return fields.indexOf(name); };
        var iDate = col('utcDate'), iStatus = col('status'), iDay = col('matchday'),
            iStage = col('stage'), iGroup = col('group'),
            iHTeam = col('homeTeam'), iHTla = col('homeTla'), iHCrest = col('homeCrest'),
            iATeam = col('awayTeam'), iATla = col('awayTla'), iACrest = col('awayCrest'),
            iHS = col('homeScore'), iAS = col('awayScore'), iHH = col('homeHalf'), iAH = col('awayHalf');

        var matches = [];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (r[iDate] === 'DIAG') {
                console.log('[Copa] DIAG — status:', r[iStatus], '| jogos:', r[iDay], '| url:', r[iStage]);
                if (r[iHTla]) {
                    console.log('[Copa] Rate limit — X-Requests-Available-Minute:', r[iHTla],
                        '| X-RequestCounter-Reset:', r[iHCrest],
                        '| X-Authenticated-Client:', r[iATeam],
                        '| X-API-Version:', r[iATla]);
                }
                continue;
            }
            if (r[iDate] === 'ERRO') continue;
            if (filterDate && r[iDate]) {
                try {
                    var localDate = new Date(r[iDate]).toLocaleDateString('en-CA');
                    if (localDate !== filterDate) continue;
                } catch (e) {}
            }
            matches.push(r);
        }

        console.log('[Copa] _renderDataset. Jogos:', matches.length);
        if (matches.length === 0) {
            self._setEmptyMsg(id, 'Nenhum jogo hoje na Copa do Mundo.');
            self._show(id, 'empty');
            return;
        }

        var groupOrder = [], groupMap = {};
        for (var j = 0; j < matches.length; j++) {
            var key = matches[j][iGroup] || matches[j][iStage] || 'OUTROS';
            if (!groupMap[key]) { groupMap[key] = []; groupOrder.push(key); }
            groupMap[key].push(matches[j]);
        }

        var html = '';
        for (var k = 0; k < groupOrder.length; k++) {
            var gKey = groupOrder[k], gList = groupMap[gKey], fr = gList[0];
            html += '<div class="copa-group">' +
                '<div class="copa-group-header">' +
                '<span class="copa-group-tag">' + self._esc(self._groupLabel(gKey)) + '</span>' +
                '<span class="copa-group-meta">' + self._esc(self._stageLabel(fr[iStage]));
            if (fr[iDay]) html += ' &middot; Rodada ' + self._esc(fr[iDay]);
            html += '</span></div>';
            for (var m = 0; m < gList.length; m++) {
                var r2 = gList[m];
                html += self._buildCard(r2[iDate], r2[iStatus],
                    r2[iHTeam], r2[iHTla], r2[iHCrest],
                    r2[iATeam], r2[iATla], r2[iACrest],
                    r2[iHS] !== '' ? r2[iHS] : null,
                    r2[iAS] !== '' ? r2[iAS] : null,
                    r2[iHH] !== '' ? r2[iHH] : null,
                    r2[iAH] !== '' ? r2[iAH] : null);
            }
            html += '</div>';
        }
        self._setContent(html, id);
    },

    // ─── Render: brasil ───────────────────────────────────────────────────────

    _renderBrazil: function (data, id) {
        var self   = this;
        var fields = data.fields, rows = data.values;
        var col = function (name) { return fields.indexOf(name); };
        var iDate = col('utcDate'), iStatus = col('status'), iDay = col('matchday'),
            iStage = col('stage'), iGroup = col('group'),
            iHTeam = col('homeTeam'), iHTla = col('homeTla'), iHCrest = col('homeCrest'),
            iATeam = col('awayTeam'), iATla = col('awayTla'), iACrest = col('awayCrest'),
            iHS = col('homeScore'), iAS = col('awayScore'), iHH = col('homeHalf'), iAH = col('awayHalf');

        var matches = [];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (r[iDate] === 'DIAG' || r[iDate] === 'ERRO') continue;
            if (r[iHTla] === 'BRA' || r[iATla] === 'BRA') matches.push(r);
        }

        matches.sort(function (a, b) {
            return a[iDate] < b[iDate] ? -1 : a[iDate] > b[iDate] ? 1 : 0;
        });

        console.log('[Copa] _renderBrazil. Jogos do Brasil:', matches.length);
        if (matches.length === 0) {
            self._setEmptyMsg(id, 'Nenhum jogo do Brasil encontrado.');
            self._show(id, 'empty');
            return;
        }

        var html = '';
        for (var m = 0; m < matches.length; m++) {
            var r = matches[m];
            var brazilClass = r[iHTla] === 'BRA' ? 'copa-brazil-home' : 'copa-brazil-away';
            html += '<div class="copa-group">' +
                '<div class="copa-group-header">' +
                '<span class="copa-group-tag copa-brazil-tag">' + self._esc(self._fmtDateLabel(r[iDate])) + '</span>' +
                '<span class="copa-group-meta">' + self._esc(self._stageLabel(r[iStage]));
            if (r[iGroup]) html += ' &middot; ' + self._esc(self._groupLabel(r[iGroup]));
            html += '</span></div>';
            html += self._buildCard(r[iDate], r[iStatus],
                r[iHTeam], r[iHTla], r[iHCrest],
                r[iATeam], r[iATla], r[iACrest],
                r[iHS] !== '' ? r[iHS] : null,
                r[iAS] !== '' ? r[iAS] : null,
                r[iHH] !== '' ? r[iHH] : null,
                r[iAH] !== '' ? r[iAH] : null, brazilClass);
            html += '</div>';
        }
        self._setContent(html, id);
    },

    // ─── Card builder ─────────────────────────────────────────────────────────

    _buildCard: function (utcDate, status, hTeam, hTla, hCrest, aTeam, aTla, aCrest, hScore, aScore, hHalf, aHalf, extraClass) {
        var self      = this;
        var statusCls = self._statusClass(status);
        var statusLbl = self._statusLabel(status);

        var scoreHtml;
        if (hScore !== null && aScore !== null) {
            // Placar completo disponível (jogo encerrado ou API com tempo real)
            scoreHtml = '<div class="copa-score">' + hScore + '<span class="copa-score-sep">&ndash;</span>' + aScore + '</div>';
            if (hHalf !== null && aHalf !== null) {
                scoreHtml += '<div class="copa-score-ht">(' + hHalf + '&ndash;' + aHalf + ' HT)</div>';
            }
        } else {
            // Jogo não encerrado: exibe horário + placar do HT se disponível (2º tempo)
            scoreHtml = '<div class="copa-score-time" data-utc="' + self._esc(utcDate) + '"></div>';
            if (hHalf !== null && aHalf !== null) {
                scoreHtml += '<div class="copa-score-ht">(' + hHalf + '&ndash;' + aHalf + ' HT)</div>';
            }
        }

        var hImg = hCrest
            ? '<img class="copa-crest" src="' + self._esc(hCrest) + '" alt="' + self._esc(hTla) + '" onerror="this.style.display=\'none\'">'
            : '<div class="copa-crest-fb">&#9917;</div>';
        var aImg = aCrest
            ? '<img class="copa-crest" src="' + self._esc(aCrest) + '" alt="' + self._esc(aTla) + '" onerror="this.style.display=\'none\'">'
            : '<div class="copa-crest-fb">&#9917;</div>';

        return '<div class="copa-card' + (extraClass ? ' ' + extraClass : '') + '">' +
            '<div class="copa-card-top">' +
                '<span class="copa-time" data-utc="' + self._esc(utcDate) + '"></span>' +
                '<span class="copa-badge ' + statusCls + '">' + self._esc(statusLbl) + '</span>' +
            '</div>' +
            '<div class="copa-matchup">' +
                '<div class="copa-side copa-home">' + hImg + '<span class="copa-team-name">' + self._esc(hTeam) + '</span></div>' +
                '<div class="copa-center">' + scoreHtml + '</div>' +
                '<div class="copa-side copa-away">' + aImg + '<span class="copa-team-name">' + self._esc(aTeam) + '</span></div>' +
            '</div>' +
        '</div>';
    },

    // ─── UI helpers ───────────────────────────────────────────────────────────

    _setContent: function (html, id) {
        var el = document.getElementById('copaContent_' + id);
        if (el) el.innerHTML = html;
        this._show(id, 'content');
        this._convertTimes(id);
        console.log('[Copa] Render concluído.');
    },

    _setEmptyMsg: function (id, msg) {
        var el = document.getElementById('copaEmptyMsg_' + id);
        if (el) el.textContent = msg;
    },

    _convertTimes: function (id) {
        var root = document.getElementById('wdgMISC014_' + id);
        if (!root) return;
        var els = root.querySelectorAll('[data-utc]');
        for (var i = 0; i < els.length; i++) {
            var el = els[i], utc = el.getAttribute('data-utc');
            if (utc) {
                try {
                    var d = new Date(utc);
                    el.textContent = this._pad(d.getHours()) + ':' + this._pad(d.getMinutes());
                } catch (e) { el.textContent = '--:--'; }
            }
        }
    },

    _show: function (id, state) {
        var states = ['loading', 'content', 'empty', 'error'];
        for (var i = 0; i < states.length; i++) {
            var s  = states[i];
            var el = document.getElementById('copa' + s.charAt(0).toUpperCase() + s.slice(1) + '_' + id);
            if (el) el.style.display = (s === state) ? '' : 'none';
        }
    },

    // ─── Label maps ───────────────────────────────────────────────────────────

    _statusClass: function (s) {
        var m = { 'TIMED': 'badge-gray', 'SCHEDULED': 'badge-gray', 'IN_PLAY': 'badge-green', 'LIVE': 'badge-green', 'PAUSED': 'badge-yellow', 'FINISHED': 'badge-blue' };
        return m[s] || 'badge-gray';
    },
    _statusLabel: function (s) {
        var m = { 'TIMED': 'Agendado', 'SCHEDULED': 'Agendado', 'IN_PLAY': '● Ao Vivo', 'LIVE': '● Ao Vivo', 'PAUSED': 'Intervalo', 'FINISHED': 'Encerrado', 'POSTPONED': 'Adiado', 'CANCELLED': 'Cancelado', 'SUSPENDED': 'Suspenso' };
        return m[s] || s;
    },
    _stageLabel: function (s) {
        var m = { 'GROUP_STAGE': 'Fase de Grupos', 'LAST_16': 'Oitavas de Final', 'QUARTER_FINALS': 'Quartas de Final', 'SEMI_FINALS': 'Semifinal', 'FINAL': 'Final', 'THIRD_PLACE': '3º Lugar' };
        return m[s] || (s || '');
    },
    _groupLabel: function (k) {
        if (!k || k === 'OUTROS') return 'Jogos';
        return k.replace('GROUP_', 'Grupo ');
    },
    _esc: function (str) {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

});
