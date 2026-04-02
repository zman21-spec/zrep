"use strict";

var OpportunityRollup = OpportunityRollup || {};

// True while our code is triggering a programmatic save.
// Prevents the OnSave handler from firing again on our own save.
OpportunityRollup._saving = false;

/**
 * Queries all opportunity product lines for the given opportunity and writes
 * the rolled-up totals back onto the form context.
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
 * Triggers a programmatic save, guarded by the _saving flag so OnSave does
 * not fire again recursively.  The flag is always cleared on completion.
 *
 * @param  {object} formContext
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
 * OnLoad handler.
 * Computes product-line rollup totals and, if any values changed, saves the
 * record so the Pipeline Tracker view is immediately up-to-date.
 *
 * Register this function on the Opportunity form OnLoad event.
 * Pass execution context: YES.
 *
 * @param {object} executionContext
 */
OpportunityRollup.onLoad = function (executionContext) {
    var formContext = executionContext.getFormContext();
    var opportunityId = formContext.data.entity.getId();
    if (!opportunityId) { return; }

    opportunityId = opportunityId.replace(/[{}]/g, "");

    OpportunityRollup._computeAndSetTotals(formContext, opportunityId).then(function () {
        // Only save if our writes actually dirtied the form
        if (formContext.data.getIsDirty()) {
            OpportunityRollup._doSave(formContext);
        }
    });
};

/**
 * OnSave handler.
 * Lets the user's save proceed untouched, then asynchronously recomputes
 * totals and triggers a silent follow-up save so the rolled-up values are
 * always current after any manual save.
 *
 * Save & Close and Save & New are left alone — the next OnLoad handles them.
 *
 * Register this function on the Opportunity form OnSave event.
 * Pass execution context: YES.
 *
 * @param {object} executionContext
 */
OpportunityRollup.onSave = function (executionContext) {
    // If we triggered this save ourselves, allow it through without re-running
    if (OpportunityRollup._saving) { return; }

    var formContext = executionContext.getFormContext();
    var opportunityId = formContext.data.entity.getId();
    if (!opportunityId) { return; }

    // getSaveMode() values:  1 = Save,  2 = Save & Close,  59 = Save & New
    // For Save & Close / Save & New let the save proceed normally;
    // OnLoad on the next form open will recompute.
    var eventArgs = executionContext.getEventArgs();
    var saveMode  = eventArgs ? eventArgs.getSaveMode() : 0;
    if (saveMode === 2 || saveMode === 59) { return; }

    opportunityId = opportunityId.replace(/[{}]/g, "");

    // Allow the current save to proceed; after async compute, trigger one
    // more save so the rolled-up values are persisted.
    OpportunityRollup._computeAndSetTotals(formContext, opportunityId).then(function () {
        if (formContext.data.getIsDirty()) {
            OpportunityRollup._doSave(formContext);
        }
    });
};
