var WdgMISC014 = SuperWidget.extend({

    currentDate: null,

    init: function () {
        var self = this;
        var id   = self.instanceId;
        console.log('[Copa] init — instanceId:', id);

        var today = new Date();
        self.currentDate = self._fmtDate(today);

        var picker = document.getElementById('datePicker_' + id);
        if (picker) {
            picker.value = self.currentDate;
            picker.addEventListener('change', function () {
                self.currentDate = this.value;
                self.loadMatches(self.currentDate);
            });
        }

        var prev = document.getElementById('btnPrev_' + id);
        if (prev) prev.addEventListener('click', function () { self._shiftDay(-1); });

        var next = document.getElementById('btnNext_' + id);
        if (next) next.addEventListener('click', function () { self._shiftDay(1); });

        var retry = document.getElementById('btnRetry_' + id);
        if (retry) retry.addEventListener('click', function () { self.loadMatches(self.currentDate); });

        self.loadMatches(self.currentDate);
    },

    bindings: { local: {}, global: {} },

    // ─── Date helpers ────────────────────────────────────────────────────────

    _pad: function (n) { return n < 10 ? '0' + n : String(n); },

    _fmtDate: function (d) {
        return d.getFullYear() + '-' + this._pad(d.getMonth() + 1) + '-' + this._pad(d.getDate());
    },

    _shiftDay: function (delta) {
        var d = new Date(this.currentDate + 'T12:00:00');
        d.setDate(d.getDate() + delta);
        this.currentDate = this._fmtDate(d);
        var picker = document.getElementById('datePicker_' + this.instanceId);
        if (picker) picker.value = this.currentDate;
        this.loadMatches(this.currentDate);
    },

    // ─── Load ────────────────────────────────────────────────────────────────

    loadMatches: function (date) {
        var self = this;
        var id   = self.instanceId;
        self._show(id, 'loading');
        console.log('[Copa] loadMatches — data:', date);
        self._tryLegacy(date, id);
    },

    _tryLegacy: function (date, id) {
        var self = this;
        // Workaround Fluig 1.8.2: passa datas em 'order' → sortFields[0]/[1] no dataset.
        // Janela UTC de 2 dias para cobrir o dia completo no horário de Brasília (UTC-3):
        // ex.: jogo às 22h BRT do dia 18 = 01:00 UTC do dia 19 → precisa buscar dia 19 UTC.
        var d = new Date(date + 'T12:00:00');
        d.setDate(d.getDate() + 1);
        var nextDay = this._fmtDate(d);
        var body = {
            name: 'dsMISC014_API_JOGOS',
            fields: [],
            constraints: [],
            order: [date, nextDay]
        };
        console.log('[Copa] POST dsMISC014_API_JOGOS — BRT:', date, '| UTC window:', date, '→', nextDay);
        $.ajax({
            url:         '/api/public/ecm/dataset/datasets',
            type:        'POST',
            contentType: 'application/json',
            dataType:    'json',
            data:        JSON.stringify(body),
            success: function (resp) {
                try { console.log('[Copa] resp (JSON):', JSON.stringify(resp).substring(0, 600)); }
                catch (e) { console.log('[Copa] resp (raw):', resp); }

                // Formato real Fluig: {content: {columns:[...], values:[{obj},...] }, message:null}
                var ds = null;
                if (resp && resp.content && resp.content.columns && resp.content.values) {
                    var cols = resp.content.columns;
                    var objs = resp.content.values;
                    var rows = [];
                    for (var i = 0; i < objs.length; i++) {
                        var row = [];
                        for (var j = 0; j < cols.length; j++) {
                            var v = objs[i][cols[j]];
                            row.push(v != null ? String(v) : '');
                        }
                        rows.push(row);
                    }
                    ds = { fields: cols, values: rows };
                } else if (resp && resp.fields && resp.values) {
                    ds = resp;
                }

                if (ds) {
                    console.log('[Copa] Colunas:', ds.fields, '| Linhas:', ds.values.length);
                    self._saveCache(date, ds);
                    self._renderDataset(ds, id, date);
                } else {
                    console.error('[Copa] Formato desconhecido. Chaves:', resp ? Object.keys(resp) : 'null');
                    var cached = self._loadCache(date);
                    if (cached) {
                        console.warn('[Copa] Usando cache para', date);
                        self._renderDataset(cached, id, date);
                    } else {
                        self._show(id, 'error');
                    }
                }
            },
            error: function (xhr) {
                console.error('[Copa] POST falhou. status:', xhr.status, '| body:', xhr.responseText);
                var cached = self._loadCache(date);
                if (cached) {
                    console.warn('[Copa] API falhou — usando cache para', date);
                    self._renderDataset(cached, id, date);
                } else {
                    self._show(id, 'error');
                }
            }
        });
    },

    // ─── Cache localStorage ──────────────────────────────────────────────────

    _cacheKey: function (date) { return 'copa2026_' + date; },

    _saveCache: function (date, ds) {
        try {
            localStorage.setItem(this._cacheKey(date), JSON.stringify({
                ts: new Date().getTime(),
                ds: ds
            }));
        } catch (e) { console.warn('[Copa] Cache write falhou:', e); }
    },

    _loadCache: function (date) {
        try {
            var raw = localStorage.getItem(this._cacheKey(date));
            if (!raw) return null;
            var entry = JSON.parse(raw);
            return (entry && entry.ds) ? entry.ds : null;
        } catch (e) { return null; }
    },

    // ─── Render: formato dataset {fields, values} ────────────────────────────

    _renderDataset: function (data, id, filterDate) {
        var self   = this;
        var fields = data.fields;
        var rows   = data.values;

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
            // Filtra pela data local do browser (converte UTC → horário de Brasília)
            if (filterDate && r[iDate]) {
                try {
                    var localDate = new Date(r[iDate]).toLocaleDateString('en-CA');
                    if (localDate !== filterDate) continue;
                } catch (e) {}
            }
            matches.push(r);
        }

        console.log('[Copa] _renderDataset. Jogos válidos:', matches.length);
        if (matches.length === 0) { self._show(id, 'empty'); return; }

        var groupOrder = [], groupMap = {};
        for (var j = 0; j < matches.length; j++) {
            var key = matches[j][iGroup] || matches[j][iStage] || 'OUTROS';
            if (!groupMap[key]) { groupMap[key] = []; groupOrder.push(key); }
            groupMap[key].push(matches[j]);
        }

        var html = '';
        for (var k = 0; k < groupOrder.length; k++) {
            var gKey  = groupOrder[k];
            var gList = groupMap[gKey];
            var fr    = gList[0];
            html += '<div class="copa-group"><div class="copa-group-header">' +
                '<span class="copa-group-tag">'  + self._esc(self._groupLabel(gKey))       + '</span>' +
                '<span class="copa-group-meta">' + self._esc(self._stageLabel(fr[iStage]));
            if (fr[iDay]) html += ' &middot; Rodada ' + self._esc(fr[iDay]);
            html += '</span></div>';
            for (var m = 0; m < gList.length; m++) {
                var r2 = gList[m];
                var hScore = (r2[iHS] !== '' && r2[iHS] != null) ? r2[iHS] : null;
                var aScore = (r2[iAS] !== '' && r2[iAS] != null) ? r2[iAS] : null;
                var hHalf  = (r2[iHH] !== '' && r2[iHH] != null) ? r2[iHH] : null;
                var aHalf  = (r2[iAH] !== '' && r2[iAH] != null) ? r2[iAH] : null;
                html += self._buildCard(r2[iDate], r2[iStatus],
                    r2[iHTeam], r2[iHTla], r2[iHCrest],
                    r2[iATeam], r2[iATla], r2[iACrest],
                    hScore, aScore, hHalf, aHalf);
            }
            html += '</div>';
        }
        self._setContent(html, id);
    },

    // ─── Render: formato direto {matches:[...]} ───────────────────────────────

    _renderDirect: function (data, id) {
        var self = this;
        if (!data || !data.matches || data.matches.length === 0) {
            self._show(id, 'empty'); return;
        }
        var matches = data.matches;
        console.log('[Copa] _renderDirect. Jogos:', matches.length);

        var groupOrder = [], groupMap = {};
        for (var j = 0; j < matches.length; j++) {
            var key = matches[j].group || matches[j].stage || 'OUTROS';
            if (!groupMap[key]) { groupMap[key] = []; groupOrder.push(key); }
            groupMap[key].push(matches[j]);
        }

        var html = '';
        for (var k = 0; k < groupOrder.length; k++) {
            var gKey  = groupOrder[k];
            var gList = groupMap[gKey];
            var fm    = gList[0];
            html += '<div class="copa-group"><div class="copa-group-header">' +
                '<span class="copa-group-tag">'  + self._esc(self._groupLabel(gKey))           + '</span>' +
                '<span class="copa-group-meta">' + self._esc(self._stageLabel(fm.stage || ''));
            if (fm.matchday) html += ' &middot; Rodada ' + fm.matchday;
            html += '</span></div>';
            for (var m = 0; m < gList.length; m++) {
                var mx  = gList[m];
                var sc  = mx.score || {};
                var ft  = sc.fullTime  || {};
                var hft = sc.halfTime  || {};
                var ht  = mx.homeTeam  || {};
                var at  = mx.awayTeam  || {};
                html += self._buildCard(
                    mx.utcDate, mx.status,
                    ht.shortName || ht.name || '', ht.tla || '', ht.crest || '',
                    at.shortName || at.name || '', at.tla || '', at.crest || '',
                    ft.home != null ? String(ft.home) : null,
                    ft.away != null ? String(ft.away) : null,
                    hft.home != null ? String(hft.home) : null,
                    hft.away != null ? String(hft.away) : null
                );
            }
            html += '</div>';
        }
        self._setContent(html, id);
    },

    // ─── Shared card builder ─────────────────────────────────────────────────

    _buildCard: function (utcDate, status, hTeam, hTla, hCrest, aTeam, aTla, aCrest, hScore, aScore, hHalf, aHalf) {
        var self      = this;
        var statusCls = self._statusClass(status);
        var statusLbl = self._statusLabel(status);

        var scoreHtml;
        if (hScore !== null && aScore !== null) {
            scoreHtml = '<div class="copa-score">' + hScore + '<span class="copa-score-sep">&ndash;</span>' + aScore + '</div>';
            if (hHalf !== null && aHalf !== null) {
                scoreHtml += '<div class="copa-score-ht">(' + hHalf + '&ndash;' + aHalf + ' HT)</div>';
            }
        } else {
            scoreHtml = '<div class="copa-score-time" data-utc="' + self._esc(utcDate) + '"></div>';
        }

        var hImg = hCrest ? '<img class="copa-crest" src="' + self._esc(hCrest) + '" alt="' + self._esc(hTla) + '" onerror="this.style.display=\'none\'">' : '<div class="copa-crest-fb">&#9917;</div>';
        var aImg = aCrest ? '<img class="copa-crest" src="' + self._esc(aCrest) + '" alt="' + self._esc(aTla) + '" onerror="this.style.display=\'none\'">' : '<div class="copa-crest-fb">&#9917;</div>';

        return '<div class="copa-card">' +
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

    _setContent: function (html, id) {
        var el = document.getElementById('copaContent_' + id);
        if (el) el.innerHTML = html;
        this._show(id, 'content');
        this._convertTimes(id);
        console.log('[Copa] Render concluído.');
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

    // ─── UI state ────────────────────────────────────────────────────────────

    _show: function (id, state) {
        var states = ['loading', 'content', 'empty', 'error'];
        for (var i = 0; i < states.length; i++) {
            var s  = states[i];
            var el = document.getElementById('copa' + s.charAt(0).toUpperCase() + s.slice(1) + '_' + id);
            if (el) el.style.display = (s === state) ? '' : 'none';
        }
    },

    // ─── Label maps ──────────────────────────────────────────────────────────

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
