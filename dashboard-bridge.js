'use strict';
const previousChartRender=render;
render=function(){previousChartRender();window.updateLedgerCharts(data.transactions,key());};
render();
