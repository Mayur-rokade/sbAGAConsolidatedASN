/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
//saylee
// BEGIN SCRIPT DESCRIPTION BLOCK ==================================
{
  /*
  Script Name: gbs_ue_consolidatedAsnPayment
  Author: Palavi Rajgude
  Description: Script will run on [sps] 820 payment order record and create customer payment, check and journal entry record on the basis of amount on line level item. If value present on SPS CX ADJUSTMENT AMOUNT field then script will create check record else value is present on SPS CX NET PAID AMOUNT then it will create payment record from present invoice. Also, Create Journal entry record from sum of adjustment amount and net paid amount. 
  Company: Green Business System 
  Date: 23-08-2022
  Script Modification Log:
  -- version--   -- Date --   -- Modified By --   --Requested By--    -- Description --
       1.0       23-08-2022     Palavi Rajgude      Albert Grazi         Create payment, check and journal entry record on the basis of present amount on line level of 820 payment order record. 
  */
}
// END SCRIPT DESCRIPTION BLOCK ====================================
define(["N/email", "N/record", "N/runtime", "N/search", "N/url"], function (
  email,
  record,
  runtime,
  search,
  url
) {
  function afterSubmit(scriptContext) {
    try {
      var loadSpsRecordContext = scriptContext.newRecord;
      var internalidSps = loadSpsRecordContext.id;
      var invoiceNumberArr = [];
      var checkDataObjArr = [];
      var loadSpsRecord = record.load({
        type: "customtransaction_sps_cx_820_basic",
        id: internalidSps,
      });
      var spsTradingPartnerId = loadSpsRecord.getValue({
        fieldId: "custbody_sps_cx_tpid",
      });
      var spsreferenceNum = loadSpsRecord.getValue({
        fieldId: "custbody_sps_cx_refnum",
      });
      var spsdatesps = loadSpsRecord.getValue({
        fieldId: "trandate",
      });
      let getLineCountSps = loadSpsRecord.getLineCount({
        sublistId: "line",
      });
      let totalTranAmt = loadSpsRecord.getValue({
        fieldId: "custbody_sps_cx_amount",
      });
      let checkCreated = loadSpsRecord.getValue({
        fieldId: "custbody_gbs_check_created",
      });
      log.debug("totalTranAmt", totalTranAmt);
      if (_logValidation(totalTranAmt)) {
        totalTranAmt = Math.abs(totalTranAmt);
      }
      //MACY,TARGET, WALMART, LOWE, HD
      if (spsTradingPartnerId === 537 || spsTradingPartnerId === "537") {
        let preDiscObj = {};
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_invoicenumber",
            line: i,
          });
          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_gbs_ispaymentcreate",
            line: i,
          });
          if (_logValidation(invoiceNumber)) {
            let checkInt = isNumber(invoiceNumber);
            if (checkInt == true) {
              invoiceNumber = invoiceNumber.toString();
              invoiceNumber = Number(invoiceNumber).toString();
            }
          }
          let memo = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "memo",
            line: i,
          });
          let adjustAmt = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_adjamount",
            line: i,
          });
          //CHECK DATA
          if (adjustAmt < 0 && !paymentCreateCheckbox && adjustAmt) {
            checkDataObjArr.push({
              memo: memo,
              adjustAmt: adjustAmt,
              invoiceNumber: invoiceNumber,
            });
            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_ispaymentcreate",
              line: i,
              value: true,
            });
          }
          let preDiscAmt =
            loadSpsRecord.getSublistValue({
              sublistId: "line",
              fieldId: "custcol_sps_cx_originalamt",
              line: i,
            }) || 0;
          //PAYMENT DATA
          if (
            !(preDiscAmt > 0 && !invoiceNumber) &&
            paymentCreateCheckbox == false &&
            preDiscAmt
          ) {
            invoiceNumberArr.push(["numbertext", "is", invoiceNumber], "OR");
            preDiscObj[invoiceNumber] = preDiscAmt;
            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_ispaymentcreate",
              line: i,
              value: true,
            });
          }
        }
        invoiceNumberArr.pop();
        // log.debug({
        //   title: 'invoiceNumberArr',
        //   details: invoiceNumberArr
        // })
        /***************************CREATE PAYMENT************************/
        let invoiceToPayment = record.create({
          type: "customerpayment",
          isDynamic: true,
        });
        invoiceToPayment.setValue({
          fieldId: "customer",
          value: 537,
        });
        invoiceToPayment.setValue({
          fieldId: "account",
          value: 575,
        });
        if (_logValidation(spsdatesps)) {
          invoiceToPayment.setValue({
            fieldId: "trandate",
            value: spsdatesps,
          });
        }
        if (_logValidation(spsreferenceNum)) {
          invoiceToPayment.setValue({
            fieldId: "memo",
            value: spsreferenceNum,
          });
        }
        invoiceToPayment.setValue({
          fieldId: "custbody_820_payment_order",
          value: internalidSps,
        });
        if (invoiceNumberArr.length != 0) {
          var searchResultInv = invoiceSearch(invoiceNumberArr);
          // log.debug({
          //   title: 'searchResultInv',
          //   details: searchResultInv
          // })
          let invoiceResultLength = searchResultInv.length;
          let paymentLine = 0;
          for (let i = 0; i < invoiceResultLength; i++) {
            let internalid = searchResultInv[i].getValue({
              name: "internalid",
              label: "Internal ID",
            });
            let tranid = searchResultInv[i].getValue({
              name: "tranid",
              label: "Document Number",
            });
            let status = searchResultInv[i].getValue({
              name: "statusref",
              label: "Status",
            });
            if (status === "paidInFull") {
              //todo array checkbox
              //checkboxValueArr
            } else {
              paymentLine++;
              let lineNo = invoiceToPayment.findSublistLineWithValue({
                sublistId: "apply",
                fieldId: "refnum",
                value: tranid,
              });
              if (lineNo != -1) {
                invoiceToPayment.selectLine({
                  sublistId: "apply",
                  line: lineNo,
                });
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: "apply",
                  fieldId: "apply",
                  value: true,
                });
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: "apply",
                  fieldId: "amount",
                  value: preDiscObj[tranid],
                });
                invoiceToPayment.commitLine({
                  sublistId: "apply",
                });
              }
            }
          }
          //log.debug('preDiscObj', preDiscObj)
          if (paymentLine) {
            invoiceToPayment.save({
              enableSourcing: true,
              ignoreMandatoryFields: true,
            });
          }
        }
        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: "check",
            isDynamic: true,
          });
          createCheck.setValue({
            fieldId: "entity",
            value: 537,
          });
          createCheck.setValue({
            fieldId: "account",
            value: 575,
          });
          createCheck.setValue({
            fieldId: "custbody_820_payment_order",
            value: internalidSps,
          });
          createCheck.setValue({
            fieldId: "trandate",
            value: spsdatesps,
          });
          if (_logValidation(spsreferenceNum)) {
            createCheck.setValue({
              fieldId: "memo",
              value: spsreferenceNum,
            });
          }
          for (let j = 0; j < checkDataObjArr.length; j++) {
            createCheck.selectNewLine({
              sublistId: "expense",
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "account",
              value: 355,
              ignoreFieldChange: true,
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "memo",
              value: checkDataObjArr[j].memo,
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "amount",
              value: Math.abs(checkDataObjArr[j].adjustAmt),
            });
            createCheck.commitLine({
              sublistId: "expense",
            });
          }
          createCheck.save();
          loadSpsRecord.setValue({
            fieldId: "custbody_gbs_check_created",
            value: true,
          });
        }
        /********************CREATE JE*******************/
        let checkJE = loadSpsRecord.getValue({
          fieldId: "custbody_je_created",
        });
        if (checkJE === false) {
          let createJE = record.create({
            type: "journalentry",
          });
          if (_logValidation(spsdatesps)) {
            createJE.setValue({
              fieldId: "trandate",
              value: spsdatesps,
            });
          }
          createJE.setValue({
            fieldId: "subsidiary",
            value: 1, //jeSubsidiary
          });
          createJE.setValue({
            fieldId: "custbody_820_payment_order",
            value: internalidSps,
          });
          if (_logValidation(spsreferenceNum)) {
            createJE.setValue({
              fieldId: "memo",
              value: spsreferenceNum,
            });
          }
          createJE.setSublistValue({
            sublistId: "line",
            fieldId: "account",
            value: 576,
            line: 0,
          });
          createJE.setSublistValue({
            sublistId: "line",
            fieldId: "credit",
            value: totalTranAmt,
            line: 0,
          });
          if (_logValidation(spsreferenceNum)) {
            createJE.setSublistValue({
              sublistId: "line",
              fieldId: "memo",
              value: spsreferenceNum,
              line: 0,
            });
          }
          createJE.setSublistValue({
            sublistId: "line",
            fieldId: "account",
            value: 576,
            line: 1,
          });
          createJE.setSublistValue({
            sublistId: "line",
            fieldId: "debit",
            value: totalTranAmt,
            line: 1,
          });
          if (_logValidation(spsreferenceNum)) {
            createJE.setSublistValue({
              sublistId: "line",
              fieldId: "memo",
              value: spsreferenceNum,
              line: 1,
            });
          }
          //save journal entry record.
          let je_id = createJE.save();
          log.debug({
            title: "je_id MACY",
            details: je_id,
          });
          loadSpsRecord.setValue({
            fieldId: "custbody_je_created",
            value: true,
          });
        }
      } else if (
        spsTradingPartnerId === 177282 ||
        spsTradingPartnerId === "177282"
      ) {
        let preDiscObj = {};
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_invoicenumber",
            line: i,
          });
          if (_logValidation(invoiceNumber)) {
            invoiceNumber = invoiceNumber.split("-")[0];
          }
          log.debug({
            title: "invoiceNumber 372",
            details: invoiceNumber,
          });
          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_gbs_ispaymentcreate",
            line: i,
          });
          let microfilm = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_microfilmnum",
            line: i,
          });
          let adjustAmt = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_adjamount",
            line: i,
          });
          //CHECK DATA
          if (adjustAmt < 0 && !paymentCreateCheckbox && adjustAmt) {
            checkDataObjArr.push({
              memo: microfilm,
              adjustAmt: adjustAmt,
              invoiceNumber: invoiceNumber,
            });
            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_ispaymentcreate",
              line: i,
              value: true,
            });
          }
          let preDiscAmt =
            loadSpsRecord.getSublistValue({
              sublistId: "line",
              fieldId: "custcol_sps_cx_originalamt",
              line: i,
            }) || 0;
          //PAYMENT DATA
          if (
            !(preDiscAmt > 0 && !invoiceNumber) &&
            paymentCreateCheckbox == false &&
            preDiscAmt
          ) {
            invoiceNumberArr.push(["numbertext", "is", invoiceNumber], "OR");
            preDiscObj[invoiceNumber] = preDiscAmt;
            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_ispaymentcreate",
              line: i,
              value: true,
            });
          }
        }
        invoiceNumberArr.pop();
        // log.debug({
        //   title: 'invoiceNumberArr',
        //   details: invoiceNumberArr
        // })
        /***************************CREATE PAYMENT************************/
        let invoiceToPayment = record.create({
          type: "customerpayment",
          isDynamic: true,
        });
        invoiceToPayment.setValue({
          fieldId: "customer",
          value: 546,
        });
        invoiceToPayment.setValue({
          fieldId: "account",
          value: 574,
        });
        if (_logValidation(spsdatesps)) {
          invoiceToPayment.setValue({
            fieldId: "trandate",
            value: spsdatesps,
          });
        }
        if (_logValidation(spsreferenceNum)) {
          invoiceToPayment.setValue({
            fieldId: "memo",
            value: spsreferenceNum,
          });
        }
        invoiceToPayment.setValue({
          fieldId: "custbody_820_payment_order",
          value: internalidSps,
        });
        if (invoiceNumberArr.length != 0) {
          var searchResultInv = invoiceSearch(invoiceNumberArr);
          // log.debug({
          //   title: 'searchResultInv',
          //   details: searchResultInv
          // })
          let invoiceResultLength = searchResultInv.length;
          let paymentLine = 0;
          for (let i = 0; i < invoiceResultLength; i++) {
            let internalid = searchResultInv[i].getValue({
              name: "internalid",
              label: "Internal ID",
            });
            let tranid = searchResultInv[i].getValue({
              name: "tranid",
              label: "Document Number",
            });
            let status = searchResultInv[i].getValue({
              name: "statusref",
              label: "Status",
            });
            if (status === "paidInFull") {
              //todo array checkbox
              //checkboxValueArr
            } else {
              paymentLine++;
              let lineNo = invoiceToPayment.findSublistLineWithValue({
                sublistId: "apply",
                fieldId: "refnum",
                value: tranid,
              });
              if (lineNo != -1) {
                invoiceToPayment.selectLine({
                  sublistId: "apply",
                  line: lineNo,
                });
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: "apply",
                  fieldId: "apply",
                  value: true,
                });
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: "apply",
                  fieldId: "amount",
                  value: preDiscObj[tranid],
                });
                invoiceToPayment.commitLine({
                  sublistId: "apply",
                });
              }
            }
          }
          //log.debug('preDiscObj', preDiscObj)
          if (paymentLine) {
            invoiceToPayment.save({
              enableSourcing: true,
              ignoreMandatoryFields: true,
            });
          }
        }
        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: "check",
            isDynamic: true,
          });
          createCheck.setValue({
            fieldId: "entity",
            value: 546,
          });
          createCheck.setValue({
            fieldId: "account",
            value: 574,
          });
          createCheck.setValue({
            fieldId: "custbody_820_payment_order",
            value: internalidSps,
          });
          createCheck.setValue({
            fieldId: "trandate",
            value: spsdatesps,
          });
          if (_logValidation(spsreferenceNum)) {
            createCheck.setValue({
              fieldId: "memo",
              value: spsreferenceNum,
            });
          }
          for (let j = 0; j < checkDataObjArr.length; j++) {
            createCheck.selectNewLine({
              sublistId: "expense",
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "account",
              value: 576,
              ignoreFieldChange: true,
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "memo",
              value: checkDataObjArr[j].memo,
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "amount",
              value: Math.abs(checkDataObjArr[j].adjustAmt),
            });
            createCheck.commitLine({
              sublistId: "expense",
            });
          }
          createCheck.save();
          loadSpsRecord.setValue({
            fieldId: "custbody_gbs_check_created",
            value: true,
          });
        }
        /********************CREATE JE*******************/
        let checkJE = loadSpsRecord.getValue({
          fieldId: "custbody_je_created",
        });
        if (checkJE === false) {
          let createJE = record.create({
            type: "journalentry",
          });
          if (_logValidation(spsdatesps)) {
            createJE.setValue({
              fieldId: "trandate",
              value: spsdatesps,
            });
          }
          createJE.setValue({
            fieldId: "subsidiary",
            value: 1, //jeSubsidiary
          });
          createJE.setValue({
            fieldId: "custbody_820_payment_order",
            value: internalidSps,
          });
          if (_logValidation(spsreferenceNum)) {
            createJE.setValue({
              fieldId: "memo",
              value: spsreferenceNum,
            });
          }
          createJE.setSublistValue({
            sublistId: "line",
            fieldId: "account",
            value: 574,
            line: 0,
          });
          createJE.setSublistValue({
            sublistId: "line",
            fieldId: "credit",
            value: totalTranAmt,
            line: 0,
          });
          if (_logValidation(spsreferenceNum)) {
            createJE.setSublistValue({
              sublistId: "line",
              fieldId: "memo",
              value: spsreferenceNum,
              line: 0,
            });
          }
          createJE.setSublistValue({
            sublistId: "line",
            fieldId: "account",
            value: 221,
            line: 1,
          });
          createJE.setSublistValue({
            sublistId: "line",
            fieldId: "debit",
            value: totalTranAmt,
            line: 1,
          });
          if (_logValidation(spsreferenceNum)) {
            createJE.setSublistValue({
              sublistId: "line",
              fieldId: "memo",
              value: spsreferenceNum,
              line: 1,
            });
          }
          //save journal entry record.
          let je_id = createJE.save();
          log.debug({
            title: "je_id MACY",
            details: je_id,
          });
          loadSpsRecord.setValue({
            fieldId: "custbody_je_created",
            value: true,
          });
        }
      } else if (spsTradingPartnerId === 540 || spsTradingPartnerId === "540") {
      } else if (spsTradingPartnerId === 548 || spsTradingPartnerId === "548") {
      } else if (spsTradingPartnerId === 119 || spsTradingPartnerId === "119") {
        let preDiscObj = {};
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_invoicenumber",
            line: i,
          });
          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_gbs_ispaymentcreate",
            line: i,
          });
          if (_logValidation(invoiceNumber)) {
            let checkInt = isNumber(invoiceNumber);
            if (checkInt == true) {
              invoiceNumber = invoiceNumber.toString();
              invoiceNumber = Number(invoiceNumber).toString();
            }
          }
          let memo = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "memo",
            line: i,
          });
          let adjustAmt = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_adjamount",
            line: i,
          });
          //CHECK DATA
          if (adjustAmt < 0 && !paymentCreateCheckbox && adjustAmt) {
            checkDataObjArr.push({
              memo: memo,
              adjustAmt: adjustAmt,
              invoiceNumber: invoiceNumber,
            });
            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_ispaymentcreate",
              line: i,
              value: true,
            });
          }
          let preDiscAmt =
            loadSpsRecord.getSublistValue({
              sublistId: "line",
              fieldId: "custcol_sps_cx_originalamt",
              line: i,
            }) || 0;
          //PAYMENT DATA
          if (
            !(preDiscAmt > 0 && !invoiceNumber) &&
            paymentCreateCheckbox == false &&
            preDiscAmt
          ) {
            invoiceNumberArr.push(["numbertext", "is", invoiceNumber], "OR");
            preDiscObj[invoiceNumber] = preDiscAmt;
            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_ispaymentcreate",
              line: i,
              value: true,
            });
          }
        }
        invoiceNumberArr.pop();
        // log.debug({
        //   title: 'invoiceNumberArr',
        //   details: invoiceNumberArr
        // })
        /***************************CREATE PAYMENT************************/
        let invoiceToPayment = record.create({
          type: "customerpayment",
          isDynamic: true,
        });
        invoiceToPayment.setValue({
          fieldId: "customer",
          value: 119,
        });
        invoiceToPayment.setValue({
          fieldId: "account",
          value: 572,
        });
        if (_logValidation(spsdatesps)) {
          invoiceToPayment.setValue({
            fieldId: "trandate",
            value: spsdatesps,
          });
        }
        if (_logValidation(spsreferenceNum)) {
          invoiceToPayment.setValue({
            fieldId: "memo",
            value: spsreferenceNum,
          });
        }
        invoiceToPayment.setValue({
          fieldId: "custbody_820_payment_order",
          value: internalidSps,
        });
        if (invoiceNumberArr.length != 0) {
          var searchResultInv = invoiceSearch(invoiceNumberArr);
          // log.debug({
          //   title: 'searchResultInv',
          //   details: searchResultInv
          // })
          let invoiceResultLength = searchResultInv.length;
          let paymentLine = 0;
          for (let i = 0; i < invoiceResultLength; i++) {
            let internalid = searchResultInv[i].getValue({
              name: "internalid",
              label: "Internal ID",
            });
            let tranid = searchResultInv[i].getValue({
              name: "tranid",
              label: "Document Number",
            });
            let status = searchResultInv[i].getValue({
              name: "statusref",
              label: "Status",
            });
            if (status === "paidInFull") {
              //todo array checkbox
              //checkboxValueArr
            } else {
              paymentLine++;
              let lineNo = invoiceToPayment.findSublistLineWithValue({
                sublistId: "apply",
                fieldId: "refnum",
                value: tranid,
              });
              if (lineNo != -1) {
                invoiceToPayment.selectLine({
                  sublistId: "apply",
                  line: lineNo,
                });
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: "apply",
                  fieldId: "apply",
                  value: true,
                });
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: "apply",
                  fieldId: "amount",
                  value: preDiscObj[tranid],
                });
                invoiceToPayment.commitLine({
                  sublistId: "apply",
                });
              }
            }
          }
          //log.debug('preDiscObj', preDiscObj)
          if (paymentLine) {
            invoiceToPayment.save({
              enableSourcing: true,
              ignoreMandatoryFields: true,
            });
          }
        }
        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: "check",
            isDynamic: true,
          });
          createCheck.setValue({
            fieldId: "entity",
            value: 119,
          });
          createCheck.setValue({
            fieldId: "account",
            value: 572,
          });
          createCheck.setValue({
            fieldId: "custbody_820_payment_order",
            value: internalidSps,
          });
          createCheck.setValue({
            fieldId: "trandate",
            value: spsdatesps,
          });
          if (_logValidation(spsreferenceNum)) {
            createCheck.setValue({
              fieldId: "memo",
              value: spsreferenceNum,
            });
          }
          for (let j = 0; j < checkDataObjArr.length; j++) {
            createCheck.selectNewLine({
              sublistId: "expense",
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "account",
              value: 431,
              ignoreFieldChange: true,
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "memo",
              value: checkDataObjArr[j].memo,
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "amount",
              value: Math.abs(checkDataObjArr[j].adjustAmt),
            });
            createCheck.commitLine({
              sublistId: "expense",
            });
          }
          createCheck.save();
          loadSpsRecord.setValue({
            fieldId: "custbody_gbs_check_created",
            value: true,
          });
        }
        /********************CREATE JE*******************/
        let checkJE = loadSpsRecord.getValue({
          fieldId: "custbody_je_created",
        });
        if (checkJE === false) {
          let createJE = record.create({
            type: "journalentry",
          });
          if (_logValidation(spsdatesps)) {
            createJE.setValue({
              fieldId: "trandate",
              value: spsdatesps,
            });
          }
          createJE.setValue({
            fieldId: "subsidiary",
            value: 1, //jeSubsidiary
          });
          createJE.setValue({
            fieldId: "custbody_820_payment_order",
            value: internalidSps,
          });
          if (_logValidation(spsreferenceNum)) {
            createJE.setValue({
              fieldId: "memo",
              value: spsreferenceNum,
            });
          }
          createJE.setSublistValue({
            sublistId: "line",
            fieldId: "account",
            value: 572,
            line: 0,
          });
          createJE.setSublistValue({
            sublistId: "line",
            fieldId: "credit",
            value: totalTranAmt,
            line: 0,
          });
          if (_logValidation(spsreferenceNum)) {
            createJE.setSublistValue({
              sublistId: "line",
              fieldId: "memo",
              value: spsreferenceNum,
              line: 0,
            });
          }
          createJE.setSublistValue({
            sublistId: "line",
            fieldId: "account",
            value: 221,
            line: 1,
          });
          createJE.setSublistValue({
            sublistId: "line",
            fieldId: "debit",
            value: totalTranAmt,
            line: 1,
          });
          if (_logValidation(spsreferenceNum)) {
            createJE.setSublistValue({
              sublistId: "line",
              fieldId: "memo",
              value: spsreferenceNum,
              line: 1,
            });
          }
          //save journal entry record.
          let je_id = createJE.save();
          log.debug({
            title: "je_id MACY",
            details: je_id,
          });
          loadSpsRecord.setValue({
            fieldId: "custbody_je_created",
            value: true,
          });
        }
      }
      loadSpsRecord.save();
    } catch (e) {
      log.debug({
        title: "e",
        details: e,
      });
    }
  }
  /**
   * function work for get all data from invoice record using search
   * @param {Array} invoiceNumberArr - contains invoice number to search on invoice record
   * @since 2015.2
   */
  function invoiceSearch(invoiceNumberArr) {
    try {
      let invoiceSearch = search.create({
        type: "invoice",
        filters: [
          ["type", "anyof", "CustInvc"],
          "AND",
          invoiceNumberArr,
          "AND",
          ["mainline", "is", "T"],
          // 'AND',
          // ['status', 'noneof', 'CustInvc:B']
        ],
        columns: [
          search.createColumn({ name: "tranid", label: "Document Number" }),
          search.createColumn({ name: "entity", label: "Name" }),
          search.createColumn({ name: "internalid", label: "Internal ID" }),
          search.createColumn({
            name: "transactionname",
            label: "Transaction Name",
          }),
          search.createColumn({ name: "statusref", label: "Status" }),
        ],
      });
      //log.debug('invoiceNumberArr', invoiceNumberArr)
      let searchResultInv = searchAll(invoiceSearch.run());
      //log.debug('searchResultInv', searchResultInv)
      return searchResultInv;
    } catch (e) {
      log.debug("error in invoiceSearch", e.toString());
    }
  }
  /**
   * function is use to search all records with range
   * @param {Array} resultset - pass search
   * @since 2015.2
   */
  function searchAll(resultset) {
    var allResults = [];
    var startIndex = 0;
    var RANGECOUNT = 1000;
    do {
      var pagedResults = resultset.getRange({
        start: parseInt(startIndex),
        end: parseInt(startIndex + RANGECOUNT),
      });
      allResults = allResults.concat(pagedResults);
      var pagedResultsCount = pagedResults != null ? pagedResults.length : 0;
      startIndex += pagedResultsCount;
      var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
    } while (pagedResultsCount == RANGECOUNT);
    var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
    return allResults;
  }
  function _logValidation(value) {
    if (
      value != null &&
      value != "" &&
      value != "null" &&
      value != undefined &&
      value != "undefined" &&
      value != "@NONE@" &&
      value != "NaN"
    ) {
      return true;
    } else {
      return false;
    }
  }
  function isNumber(n) {
    return /^-?[\d.]+(?:e-?\d+)?$/.test(n);
  }
  return {
    afterSubmit: afterSubmit,
  };
});