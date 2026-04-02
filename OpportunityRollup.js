"use strict";

var OpportunityRollup = OpportunityRollup || {};

// Set this to the Name of your Opportunity Products subgrid control
// (Form editor → click subgrid → Properties → Name)
OpportunityRollup.SUBGRID_NAME = "opportunityproducts";

// Prevents our programmatic save from re-triggering OnSave recursively
OpportunityRollup._saving = false;

// ─────────────────────────────────────────────────────────────────────────────

OpportunityRollup._computeAndSetTotals = function (formContext, opportunityId) {
    console.log("OpportunityRollup: querying products for opportunity " + opportunityId);

    var select = [
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
    ].join(",");

    var options = "?$select=" + select + "&$filter=_opportunityid_value eq " + opportunityId;

    return Xrm.WebApi.retrieveMultipleRecords("opportunityproduct", options).then(
        function (result) {
            var entities = (result && result.entities) ? result.entities : [];
            console.log("OpportunityRollup: found " + entities.length + " product line(s)");

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

            console.log("OpportunityRollup: totals calculated", totals);

            Object.keys(totals).forEach(function (fieldName) {
                var attr = formContext.getAttribute(fieldName);
                if (attr) {
                    attr.setValue(totals[fieldName]);
                    console.log("OpportunityRollup: set " + fieldName + " = " + totals[fieldName]);
                } else {
                    console.warn("OpportunityRollup: field not found on form – " + fieldName);
                }
            });
        },
        function (error) {
            console.error("OpportunityRollup: WebApi query failed –", error.message);
        }
    );
};

// ─────────────────────────────────────────────────────────────────────────────

OpportunityRollup._doSave = function (formContext) {
    console.log("OpportunityRollup: triggering save");
    OpportunityRollup._saving = true;
    formContext.data.save().then(
        function () {
            OpportunityRollup._saving = false;
            console.log("OpportunityRollup: save completed successfully");
        },
        function (err) {
            OpportunityRollup._saving = false;
            console.error("OpportunityRollup: save failed –", err.message);
        }
    );
};

// ─────────────────────────────────────────────────────────────────────────────

OpportunityRollup._refreshAndSave = function (formContext, opportunityId) {
    OpportunityRollup._computeAndSetTotals(formContext, opportunityId).then(function () {
        if (formContext.data.getIsDirty()) {
            OpportunityRollup._doSave(formContext);
        } else {
            console.log("OpportunityRollup: no changes, skipping save");
        }
    });
};

// ─────────────────────────────────────────────────────────────────────────────

OpportunityRollup._registerSubgridHandler = function (formContext, opportunityId, attempt) {
    attempt = attempt || 1;
    var subgrid = formContext.getControl(OpportunityRollup.SUBGRID_NAME);

    if (subgrid) {
        subgrid.addOnLoad(function () {
            console.log("OpportunityRollup: subgrid reloaded, recalculating");
            OpportunityRollup._refreshAndSave(formContext, opportunityId);
        });
        console.log("OpportunityRollup: subgrid handler registered on '" + OpportunityRollup.SUBGRID_NAME + "'");
    } else if (attempt < 5) {
        // Subgrid may not have rendered yet; retry up to 4 more times
        console.log("OpportunityRollup: subgrid not ready, retry " + attempt + "/5 in 1s");
        window.setTimeout(function () {
            OpportunityRollup._registerSubgridHandler(formContext, opportunityId, attempt + 1);
        }, 1000);
    } else {
        console.error(
            "OpportunityRollup: could not find subgrid '" + OpportunityRollup.SUBGRID_NAME +
            "' after 5 attempts. Open the form editor, click the Products subgrid, " +
            "go to Properties and confirm the Name field matches SUBGRID_NAME."
        );
    }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Form OnLoad — register on the Opportunity form.
 * Pass execution context as first parameter: YES
 */
OpportunityRollup.onLoad = function (executionContext) {
    console.log("OpportunityRollup: onLoad fired");

    var formContext   = executionContext.getFormContext();
    var opportunityId = formContext.data.entity.getId();

    if (!opportunityId) {
        console.log("OpportunityRollup: no opportunity ID yet (new record), skipping");
        return;
    }

    opportunityId = opportunityId.replace(/[{}]/g, "");
    console.log("OpportunityRollup: opportunityId = " + opportunityId);

    OpportunityRollup._registerSubgridHandler(formContext, opportunityId);

    OpportunityRollup._computeAndSetTotals(formContext, opportunityId).then(function () {
        if (formContext.data.getIsDirty()) {
            OpportunityRollup._doSave(formContext);
        }
    });
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Form OnSave — register on the Opportunity form.
 * Pass execution context as first parameter: YES
 */
OpportunityRollup.onSave = function (executionContext) {
    console.log("OpportunityRollup: onSave fired");

    if (OpportunityRollup._saving) {
        console.log("OpportunityRollup: programmatic save, skipping handler");
        return;
    }

    var formContext   = executionContext.getFormContext();
    var opportunityId = formContext.data.entity.getId();

    if (!opportunityId) {
        console.log("OpportunityRollup: no opportunity ID, skipping");
        return;
    }

    var eventArgs = executionContext.getEventArgs();
    var saveMode  = eventArgs ? eventArgs.getSaveMode() : 0;
    console.log("OpportunityRollup: saveMode = " + saveMode);

    // 2 = Save & Close, 59 = Save & New — OnLoad on next open handles these
    if (saveMode === 2 || saveMode === 59) {
        console.log("OpportunityRollup: Save & Close / Save & New, skipping follow-up save");
        return;
    }

    opportunityId = opportunityId.replace(/[{}]/g, "");

    OpportunityRollup._computeAndSetTotals(formContext, opportunityId).then(function () {
        if (formContext.data.getIsDirty()) {
            OpportunityRollup._doSave(formContext);
        }
    });
};
