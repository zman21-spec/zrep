"use strict";

var OpportunityRollup = OpportunityRollup || {};

// Flag to prevent re-entrant saves triggered by this script
OpportunityRollup._saving = false;

/**
 * Retrieves opportunity product line totals and sets them on the form.
 * Returns a Promise that resolves when values have been set.
 *
 * @param {object} formContext
 * @param {string} opportunityId  - GUID without braces
 * @returns {Promise}
 */
OpportunityRollup._computeAndSetTotals = function (formContext, opportunityId) {
    var fetchFields = [
        "quantity",
        "dtn_goalvolume",
        "dtn_contractwon",
        "dtn_lostcancelled",
        "dtn_openvolume",
        "dtn_q1volume",
        "dtn_q2volume",
        "dtn_q3volume",
        "dtn_q4volume",
        "dtn_nextq4volume",
        "dtn_prioryearcontractwon"
    ];

    var options =
        "?$select=" + fetchFields.join(",") +
        "&$filter=_opportunityid_value eq " + opportunityId;

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

            result.entities.forEach(function (product) {
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
            console.error("OpportunityRollup: error retrieving products: ", error.message);
        }
    );
};

/**
 * OnLoad handler — computes totals and saves silently.
 * Register this on the Form OnLoad event.
 *
 * @param {object} executionContext
 */
OpportunityRollup.onLoad = function (executionContext) {
    var formContext = executionContext.getFormContext();
    var opportunityId = formContext.data.entity.getId();
    if (!opportunityId) { return; }

    opportunityId = opportunityId.replace(/[{}]/g, "");

    OpportunityRollup._computeAndSetTotals(formContext, opportunityId).then(function () {
        if (!formContext.data.getIsDirty()) { return; }

        OpportunityRollup._saving = true;
        formContext.data.save().then(
            function () {
                OpportunityRollup._saving = false;
                console.log("OpportunityRollup: pipeline totals saved on load.");
            },
            function (err) {
                OpportunityRollup._saving = false;
                console.error("OpportunityRollup: save failed on load: ", err.message);
            }
        );
    });
};

/**
 * OnSave handler — prevents the in-flight save, recomputes totals, then
 * re-triggers save so the rolled-up values are persisted in the same operation.
 * Register this on the Form OnSave event.
 *
 * @param {object} executionContext
 */
OpportunityRollup.onSave = function (executionContext) {
    // Skip if this save was triggered by us — let it proceed normally
    if (OpportunityRollup._saving) { return; }

    var formContext = executionContext.getFormContext();
    var opportunityId = formContext.data.entity.getId();
    if (!opportunityId) { return; }

    opportunityId = opportunityId.replace(/[{}]/g, "");

    // Hold the current save so we can inject computed values before it commits
    var eventArgs = executionContext.getEventArgs();
    eventArgs.preventDefault();

    OpportunityRollup._computeAndSetTotals(formContext, opportunityId).then(function () {
        OpportunityRollup._saving = true;
        formContext.data.save().then(
            function () {
                OpportunityRollup._saving = false;
                console.log("OpportunityRollup: pipeline totals saved.");
            },
            function (err) {
                OpportunityRollup._saving = false;
                console.error("OpportunityRollup: save failed: ", err.message);
            }
        );
    });
};
