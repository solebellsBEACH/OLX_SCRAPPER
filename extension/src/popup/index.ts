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
import { registerCancelActions } from "./actions/cancel";
import { registerCrawlAction } from "./actions/crawl";
import { registerDbViewActions } from "./actions/db-view";
import { registerIndicatorsAction } from "./actions/indicators";
import { registerLoadPendingAction } from "./actions/load-pending";
import { registerOpenPanelAction } from "./actions/open-panel";
import { registerQuickAnalyzeAction } from "./actions/quick-analyze";
import { registerSelectionActions } from "./actions/selection";
import { analyzePendingBeginner, registerBeginnerMode } from "./beginner";
import { registerModeToggle } from "./mode";
import { registerPendingToast } from "./pending-toast";
import { registerProgressListener } from "./progress-listener";
import { registerTabSwitcher } from "./render/tabs";

registerTabSwitcher();
registerModeToggle();
registerBeginnerMode();

registerOpenPanelAction();
registerAnalyzeAction();
registerQuickAnalyzeAction();
registerCrawlAction();
registerIndicatorsAction();
registerLoadPendingAction();
registerSelectionActions();
registerAnalyzeSelectedAction();
registerDbViewActions();

registerCancelActions();
registerProgressListener();
registerPendingToast(analyzePendingBeginner);

export {};
