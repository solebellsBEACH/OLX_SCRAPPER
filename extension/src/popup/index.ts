/**
 * UI do OLX Workspace (janela separada, popup.html?tab=1).
 *
 * - "Executar Análise": lista os anúncios categorizados pela IA, paginado 5/5.
 * - Seleção por checkbox -> "Analisar selecionados": abre a página de cada
 *   anúncio, extrai o HTML/dados, categoriza e grava no JSON DB.
 * - "Ver DB": mostra o conteúdo do chrome.storage.local (olx_db).
 */

import { registerAnalyzeSelectedAction } from "./actions/analyze-selected";
import { registerAnalyzeAction } from "./actions/analyze";
import { registerCrawlAction } from "./actions/crawl";
import { registerDbViewActions } from "./actions/db-view";
import { registerIndicatorsAction } from "./actions/indicators";
import { registerLoadPendingAction } from "./actions/load-pending";
import { registerScrollAction } from "./actions/scroll";
import { registerSelectionActions } from "./actions/selection";
import { registerProgressListener } from "./progress-listener";
import { registerTabSwitcher } from "./render/tabs";

registerTabSwitcher();

registerAnalyzeAction();
registerCrawlAction();
registerScrollAction();
registerIndicatorsAction();
registerLoadPendingAction();
registerSelectionActions();
registerAnalyzeSelectedAction();
registerDbViewActions();

registerProgressListener();

export {};
