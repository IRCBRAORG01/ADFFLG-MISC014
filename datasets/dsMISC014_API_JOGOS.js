function createDataset(fields, constraints, sortFields) {
    var dataset = DatasetBuilder.newDataset();
    dataset.addColumn('utcDate');
    dataset.addColumn('status');
    dataset.addColumn('matchday');
    dataset.addColumn('stage');
    dataset.addColumn('group');
    dataset.addColumn('homeTeam');
    dataset.addColumn('homeTla');
    dataset.addColumn('homeCrest');
    dataset.addColumn('awayTeam');
    dataset.addColumn('awayTla');
    dataset.addColumn('awayCrest');
    dataset.addColumn('homeScore');
    dataset.addColumn('awayScore');
    dataset.addColumn('homeHalf');
    dataset.addColumn('awayHalf');

    var apiUrl = 'nao-definido';

    try {

        // --- lê parâmetros ---
        var dateFrom    = '';
        var competition = 'WC';

        // 1. Tenta constraints (chamada via DatasetFactory interno)
        if (constraints != null) {
            var size;
            try { size = constraints.size(); } catch (e) { size = constraints.length || 0; }
            for (var i = 0; i < size; i++) {
                var c;
                try { c = constraints.get(i); } catch (e) { c = constraints[i]; }
                var fn = '', val = '';
                try { fn  = String(c.getFieldName()); }    catch (e) { fn  = String(c.fieldName    || c._field        || ''); }
                try { val = String(c.getInitialValue()); } catch (e) { val = String(c.initialValue || c._initialValue || ''); }
                if (fn === 'dateFrom')    { dateFrom    = val; }
                if (fn === 'competition') { competition = val; }
            }
        }

        // 2. Workaround REST API Fluig 1.8.2: constraints são rejeitadas pelo servidor.
        //    Widget passa sortFields[0]=dateFrom e sortFields[1]=dateTo (janela UTC de 2 dias).
        var dateTo = '';
        if (!dateFrom && sortFields != null) {
            var sfSize;
            try { sfSize = sortFields.size(); } catch (e) { sfSize = sortFields.length || 0; }
            if (sfSize > 0) {
                var sf0;
                try { sf0 = sortFields.get(0); } catch (e) { sf0 = sortFields[0]; }
                var sfStr = String(sf0 || '');
                if (/^\d{4}-\d{2}-\d{2}$/.test(sfStr)) { dateFrom = sfStr; }
            }
            if (sfSize > 1) {
                var sf1;
                try { sf1 = sortFields.get(1); } catch (e) { sf1 = sortFields[1]; }
                var sfStr1 = String(sf1 || '');
                if (/^\d{4}-\d{2}-\d{2}$/.test(sfStr1)) { dateTo = sfStr1; }
            }
        }

        // default: hoje
        if (!dateFrom || dateFrom === 'null') {
            var cal = java.util.Calendar.getInstance();
            var yy  = cal.get(java.util.Calendar.YEAR);
            var mm  = cal.get(java.util.Calendar.MONTH) + 1;
            var dd  = cal.get(java.util.Calendar.DAY_OF_MONTH);
            dateFrom = yy + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
        }

        // --- chamada HTTP ---
        var TOKEN  = 'b0d35b11a6eb4defaad7dcbd48b6a100';
        var season = (competition === 'WC') ? '&season=2026' : '';
        if (!dateTo) { dateTo = dateFrom; }
        apiUrl = 'https://api.football-data.org/v4/competitions/' + competition +
                 '/matches?dateFrom=' + dateFrom + '&dateTo=' + dateTo + season;

        // --- cache de arquivo server-side ---
        var sep       = String(java.io.File.separator);
        var tempDir   = String(java.lang.System.getProperty('java.io.tmpdir'));
        var cacheKey  = 'copa2026_' + dateFrom + '_' + dateTo + '.json';
        var cacheFile = new java.io.File(tempDir + sep + cacheKey);

        // Dias passados: cache de 24h. Dia atual/futuro: cache de 30s (placar ao vivo).
        var today     = new java.text.SimpleDateFormat('yyyy-MM-dd').format(new java.util.Date());
        var cacheTTL  = (dateTo < String(today)) ? (24 * 60 * 60 * 1000) : (30 * 1000);
        var responseBody = null;
        var fromCache = false;
        var hApiVersion = '', hAuthClient = '', hReqReset = '', hReqAvail = '';

        if (cacheFile.exists()) {
            var cacheAge = java.lang.System.currentTimeMillis() - cacheFile.lastModified();
            if (cacheAge < cacheTTL) {
                var cr  = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(cacheFile), 'UTF-8'));
                var csb = new java.lang.StringBuilder();
                var cl;
                while ((cl = cr.readLine()) != null) { csb.append(cl); }
                cr.close();
                responseBody = String(csb.toString());
                fromCache = true;
            }
        }

        if (!responseBody) {
            var url  = new java.net.URL(apiUrl);
            var conn = url.openConnection();
            conn.setRequestMethod('GET');
            conn.setRequestProperty('X-Auth-Token', TOKEN);
            conn.setRequestProperty('User-Agent', 'FluigWidget/1.0');
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(12000);
            conn.connect();

            var httpStatus = conn.getResponseCode();
            hApiVersion = String(conn.getHeaderField('X-API-Version')               || '');
            hAuthClient = String(conn.getHeaderField('X-Authenticated-Client')      || '');
            hReqReset   = String(conn.getHeaderField('X-RequestCounter-Reset')      || '');
            hReqAvail   = String(conn.getHeaderField('X-Requests-Available-Minute') || '');

            var stream = (httpStatus >= 400) ? conn.getErrorStream() : conn.getInputStream();
            if (stream == null) {
                dataset.addRow(['ERRO', String(httpStatus), '', apiUrl, '', 'stream nulo', '', '', '', '', '', '', '', '', '']);
                return dataset;
            }

            var reader = new java.io.BufferedReader(new java.io.InputStreamReader(stream, 'UTF-8'));
            var sb     = new java.lang.StringBuilder();
            var line;
            while ((line = reader.readLine()) != null) { sb.append(line); }
            reader.close();

            responseBody = String(sb.toString());

            if (httpStatus !== 200) {
                dataset.addRow(['ERRO', String(httpStatus), '', apiUrl, '',
                    responseBody.substring(0, 300), '', '', '', '', '', '', '', '', '']);
                return dataset;
            }

            // Grava cache
            try {
                var fw = new java.io.OutputStreamWriter(new java.io.FileOutputStream(cacheFile), 'UTF-8');
                fw.write(responseBody);
                fw.close();
            } catch (cacheErr) {}
        }

        var data    = JSON.parse(responseBody);
        var matches = data.matches || [];

        dataset.addRow(['DIAG', fromCache ? 'CACHE' : '200', String(matches.length), apiUrl, '',
            responseBody.substring(0, 150),
            hReqAvail, hReqReset, hAuthClient, hApiVersion,
            '', '', '', '', '']);

        for (var m = 0; m < matches.length; m++) {
            var match = matches[m];
            var sc    = match.score || {};
            var ft    = sc.fullTime  || {};
            var ht    = sc.halfTime  || {};

            dataset.addRow([
                match.utcDate    || '',
                match.status     || '',
                String(match.matchday != null ? match.matchday : ''),
                match.stage      || '',
                match.group      || '',
                match.homeTeam   ? (match.homeTeam.shortName || match.homeTeam.name || '') : '',
                match.homeTeam   ? (match.homeTeam.tla   || '') : '',
                match.homeTeam   ? (match.homeTeam.crest || '') : '',
                match.awayTeam   ? (match.awayTeam.shortName || match.awayTeam.name || '') : '',
                match.awayTeam   ? (match.awayTeam.tla   || '') : '',
                match.awayTeam   ? (match.awayTeam.crest || '') : '',
                ft.home != null  ? String(ft.home) : '',
                ft.away != null  ? String(ft.away) : '',
                ht.home != null  ? String(ht.home) : '',
                ht.away != null  ? String(ht.away) : ''
            ]);
        }

    } catch (e) {
        dataset.addRow(['ERRO', 'EXCEPTION', '', apiUrl, '', String(e), '', '', '', '', '', '', '', '', '']);
    }

    return dataset;
}
