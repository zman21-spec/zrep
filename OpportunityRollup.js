"use strict";

var OpportunityRollup = OpportunityRollup || {};

// ── Configuration ────────────────────────────────────────────────────────────
// Set this to the Name property of your Opportunity Products subgrid control.
// Find it in the form editor: select the subgrid → Properties → Name field.
OpportunityRollup.SUBGRID_NAME = "opportunityproducts";

// ── Internal state ────────────────────────────────────────────────────────────
// True while this script is triggering a programmatic save, so OnSave skips
// re-running and lets the save through cleanly.
OpportunityRollup._saving = false;

/**
 * Queries all opportunity product lines and writes the rolled-up totals back
 * onto the opportunity form.
 *
 * @param  {object} formContext
 * @param  {string} opportunityId  GUID without curly braces
 * @returns {Promise<void>}
 */
OpportunityRollup._computeAndSetTotals = function (formContext, opportunityId) {
    var options = [
        "?$select=quantity",
        ",dtn_goalvolume",
        ",dtn_contractwon",
        ",dtn_lostcancelled",
        ",dtn_openvolume",
        ",dtn_q1volume",
        ",dtn_q2volume",
        ",dtn_q3volume",
        ",dtn_q4volume",
        ",dtn_nextq4volume",
        ",dtn_prioryearcontractwon",
        "&$filter=_opportunityid_value eq " + opportunityId
    ].join("");

    return Xrm.WebApi.retrieveMultipleRecords("opportunityproduct", options).then(
        function (result) {
            var totals = {
                dtn_estimatedusage:       0,
                dtn_goalvolume:           0,
                dtn_contractwon:          0,
                dtn_lostcancelled:        0,
                dtn_openvolume:           0,
                dtn_q1volume:             0,
                dtn_q2volume:             0,
                dtn_q3volume:             0,
                dtn_q4volume:             0,
                dtn_nextq4volume:         0,
                dtn_prioryearcontractwon: 0
            };

            var entities = (result && result.entities) ? result.entities : [];

            entities.forEach(function (product) {
                totals.dtn_estimatedusage       += product.quantity                 || 0;
                totals.dtn_goalvolume           += product.dtn_goalvolume           || 0;
                totals.dtn_contractwon          += product.dtn_contractwon          || 0;
                totals.dtn_lostcancelled        += product.dtn_lostcancelled        || 0;
                totals.dtn_openvolume           += product.dtn_openvolume           || 0;
                totals.dtn_q1volume             += product.dtn_q1volume             || 0;
                totals.dtn_q2volume             += product.dtn_q2volume             || 0;
                totals.dtn_q3volume             += product.dtn_q3volume             || 0;
                totals.dtn_q4volume             += product.dtn_q4volume             || 0;
                totals.dtn_nextq4volume         += product.dtn_nextq4volume         || 0;
                totals.dtn_prioryearcontractwon += product.dtn_prioryearcontractwon || 0;
            });

            Object.keys(totals).forEach(function (fieldName) {
                var attr = formContext.getAttribute(fieldName);
                if (attr) {
                    attr.setValue(totals[fieldName]);
                }
            });
        },
        function (error) {
            console.error("OpportunityRollup – retrieveMultipleRecords failed:", error.message);
        }
    );
};

/**
 * Programmatic save guarded by _saving so OnSave does not recurse.
 * The flag is always cleared whether the save succeeds or fails.
 *
 * @param {object} formContext
 */
OpportunityRollup._doSave = function (formContext) {
    OpportunityRollup._saving = true;
    formContext.data.save().then(
        function () {
            OpportunityRollup._saving = false;
            console.log("OpportunityRollup – totals saved.");
        },
        function (err) {
            OpportunityRollup._saving = false;
            console.error("OpportunityRollup – save failed:", err.message);
        }
    );
};

/**
 * Recomputes totals and saves if any field changed.
 * Shared by the subgrid handler and OnSave follow-up.
 *
 * @param {object} formContext
 * @param {string} opportunityId  GUID without curly braces
 */
OpportunityRollup._refreshAndSave = function (formContext, opportunityId) {
    OpportunityRollup._computeAndSetTotals(formContext, opportunityId).then(function () {
        if (formContext.data.getIsDirty()) {
            OpportunityRollup._doSave(formContext);
        }
    });
};

/**
 * Registers an OnLoad listener on the Opportunity Products subgrid so that
 * totals are recalculated automatically whenever a product line is added,
 * edited, or deleted — without the user having to manually save or refresh.
 *
 * The subgrid fires its OnLoad event after every grid refresh, which happens
 * each time a product record is saved inside the quick-create/edit panel.
 *
 * @param {object} formContext
 * @param {string} opportunityId  GUID without curly braces
 */
OpportunityRollup._registerSubgridHandler = function (formContext, opportunityId) {
    var subgrid = formContext.getControl(OpportunityRollup.SUBGRID_NAME);

    if (!subgrid) {
        // Subgrid may not have rendered yet; retry once after a short delay
        window.setTimeout(function () {
            var retrySubgrid = formContext.getControl(OpportunityRollup.SUBGRID_NAME);
            if (retrySubgrid) {
                retrySubgrid.addOnLoad(function () {
                    OpportunityRollup._refreshAndSave(formContext, opportunityId);
                });
            } else {
                console.warn(
                    "OpportunityRollup – subgrid '" +
                    OpportunityRollup.SUBGRID_NAME +
                    "' not found. Check SUBGRID_NAME matches the control Name in the form editor."
                );
            }
        }, 1500);
        return;
    }

    subgrid.addOnLoad(function () {
        OpportunityRollup._refreshAndSave(formContext, opportunityId);
    });
};

/**
 * OnLoad handler.
 * • Computes rollup totals from product lines and saves if values changed.
 * • Hooks the Opportunity Products subgrid so any add/edit/delete instantly
 *   recalculates and saves totals without user interaction.
 *
 * Register on the Opportunity form OnLoad event.
 * "Pass execution context as first parameter" must be checked.
 *
 * @param {object} executionContext
 */
OpportunityRollup.onLoad = function (executionContext) {
    var formContext  = executionContext.getFormContext();
    var opportunityId = formContext.data.entity.getId();
    if (!opportunityId) { return; }

    opportunityId = opportunityId.replace(/[{}]/g, "");

    // Wire up the subgrid listener (runs immediately and on every grid refresh)
    OpportunityRollup._registerSubgridHandler(formContext, opportunityId);

    // Also compute on form load so the header totals are correct right away
    OpportunityRollup._computeAndSetTotals(formContext, opportunityId).then(function () {
        if (formContext.data.getIsDirty()) {
            OpportunityRollup._doSave(formContext);
        }
    });
};

/**
 * OnSave handler.
 * Lets the user's save proceed untouched (save button is never blocked), then
 * fires a follow-up save to persist any freshly computed totals.
 *
 * Save & Close (2) and Save & New (59) are skipped — the next OnLoad handles
 * recalculation on the newly opened form.
 *
 * Register on the Opportunity form OnSave event.
 * "Pass execution context as first parameter" must be checked.
 *
 * @param {object} executionContext
 */
OpportunityRollup.onSave = function (executionContext) {
    // Our own programmatic save — let it through
    if (OpportunityRollup._saving) { return; }

    var formContext   = executionContext.getFormContext();
    var opportunityId = formContext.data.entity.getId();
    if (!opportunityId) { return; }

    var eventArgs = executionContext.getEventArgs();
    var saveMode  = eventArgs ? eventArgs.getSaveMode() : 0;

    // 2 = Save & Close, 59 = Save & New — don't block or follow up
    if (saveMode === 2 || saveMode === 59) { return; }

    opportunityId = opportunityId.replace(/[{}]/g, "");

    // User's save proceeds normally; after async compute a follow-up save
    // persists the new totals without disabling or intercepting the save button.
    OpportunityRollup._computeAndSetTotals(formContext, opportunityId).then(function () {
        if (formContext.data.getIsDirty()) {
            OpportunityRollup._doSave(formContext);
        }
    });
};
