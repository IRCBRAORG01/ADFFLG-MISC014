<div id="wdgMISC014_${instanceId}" class="super-widget wcm-widget-class fluig-style-guide copa-root" data-params="WdgMISC014.instance()">

    <div class="copa-header">
        <h2 class="copa-title">&#9917; Copa do Mundo 2026</h2>
        <div class="copa-nav">
            <button class="copa-btn-nav" id="btnPrev_${instanceId}">&#8249;</button>
            <input type="date" id="datePicker_${instanceId}" class="copa-date-input" />
            <button class="copa-btn-nav" id="btnNext_${instanceId}">&#8250;</button>
        </div>
    </div>

    <div id="copaLoading_${instanceId}" class="copa-loading">
        <div class="copa-spinner"></div>
        <span>Carregando jogos...</span>
    </div>

    <div id="copaContent_${instanceId}" class="copa-content" style="display:none;"></div>

    <div id="copaEmpty_${instanceId}" class="copa-empty" style="display:none;">
        <span>&#128197;</span>
        <span>Nenhum jogo para esta data.</span>
    </div>

    <div id="copaError_${instanceId}" class="copa-error" style="display:none;">
        <span>&#9888; Erro ao carregar os jogos.</span>
        <button id="btnRetry_${instanceId}" class="copa-btn-retry">Tentar novamente</button>
    </div>

</div>
