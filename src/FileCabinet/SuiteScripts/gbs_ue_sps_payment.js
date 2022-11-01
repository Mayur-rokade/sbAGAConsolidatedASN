/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */

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

define(["N/record", "N/runtime", "N/search"], function (
  record,
  runtime,
  search
) {
  function afterSubmit(scriptContext) {
    try {
      if (scriptContext.type === scriptContext.UserEventType.EDIT) {
        
      var loadSpsRecordContext = scriptContext.newRecord;
      var internalidSps = loadSpsRecordContext.id;
      var invoiceNumberArr = [];
      var checkDataObjArr = [];
      var paymentObj = {};

      var loadSpsRecord = record.load({
        type: "customtransaction_sps_cx_820_basic",
        id: internalidSps
      });

      var spsTradingPartnerId = loadSpsRecord.getValue({
        fieldId: "custbody_sps_cx_tpid"
      });

      var spsreferenceNum = loadSpsRecord.getValue({
        fieldId: "custbody_sps_cx_refnum"
      });

      var spsdatesps = loadSpsRecord.getValue({
        fieldId: "trandate"
      });

      let getLineCountSps = loadSpsRecord.getLineCount({
        sublistId: "line"
      });

      let totalTranAmt = loadSpsRecord.getValue({
        fieldId: "custbody_sps_cx_amount"
      });

      let checkCreated = loadSpsRecord.getValue({
        fieldId: "custbody_gbs_check_created"
      });

      // log.debug('totalTranAmt', totalTranAmt)
      if (_logValidation(totalTranAmt)) {
        totalTranAmt = Math.abs(totalTranAmt);
      }

      //LOWE,TARGET, WALMART, MACY, HD
      if (spsTradingPartnerId === 548 || spsTradingPartnerId === "548") {
        //LOWE'S
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_invoicenumber",
            line: i
          });

          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_gbs_ispaymentcreate",
            line: i
          });
          //paymentCreateCheckbox = false

          if (_logValidation(invoiceNumber)) {
            let checkInt = isNumber(invoiceNumber);

            if (checkInt == true) {
              invoiceNumber = invoiceNumber.toString();
              invoiceNumber = Number(invoiceNumber).toString();
            }
          }
          let netPaidAmt = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_netpaidamt",
            line: i
          });

          //CHECK DATA
          if (netPaidAmt < 0 && !paymentCreateCheckbox && netPaidAmt) {
            checkDataObjArr.push({
              memo: invoiceNumber,
              adjustAmt: netPaidAmt,
              invoiceNumber: invoiceNumber,
              i: i
            });
          }

          //PAYMENT DATA
          if (
            !!invoiceNumber &&
            paymentCreateCheckbox == false &&
            netPaidAmt > 0
          ) {
            invoiceNumberArr.push(["numbertext", "is", invoiceNumber], "OR");
            paymentObj[invoiceNumber] = { netPaidAmt: netPaidAmt, i: i };
          }
        }

        invoiceNumberArr.pop();

        // log.debug({
        //   title: 'invoiceNumberArr',
        //   details: invoiceNumberArr
        // })

        /***************************CREATE PAYMENT******************/
        if (invoiceNumberArr.length != 0) {
          var searchResultInv = invoiceSearch(invoiceNumberArr);

          // log.debug({
          //   title: 'searchResultInv',
          //   details: searchResultInv
          // })

          let invoiceResultLength = searchResultInv.length;
          let paymentLine = 0;
          let custArr = [];
          let custObj = {};

          for (let i = 0; i < invoiceResultLength; i++) {
            let customer = searchResultInv[i].getValue({
              name: "entity",
              label: "Name"
            });

            let tranid = searchResultInv[i].getValue({
              name: "tranid",
              label: "Document Number"
            });

            let status = searchResultInv[i].getValue({
              name: "statusref",
              label: "Status"
            });

            if (!custArr.includes(customer)) {
              custArr.push(customer);
              custObj[customer] = [];
              custObj[customer].push({
                tranid: tranid,
                status: status
              });
            } else {
              custObj[customer].push({
                tranid: tranid,
                status: status
              });
            }
          }

          log.debug("custObj 214", custObj);

          for (const key in custObj) {
            let paymentLine = 0;
            let arr = custObj[key];
            let invoiceToPayment = record.create({
              type: "customerpayment",
              isDynamic: true
            });

            invoiceToPayment.setValue({
              fieldId: "customer",
              value: key
            });

            invoiceToPayment.setValue({
              fieldId: "account",
              value: 571 //sb
             // value: 573 //Lowe clearing prod
            });

            if (_logValidation(spsdatesps)) {
              invoiceToPayment.setValue({
                fieldId: "trandate",
                value: spsdatesps
              });
            }

            if (_logValidation(spsreferenceNum)) {
              invoiceToPayment.setValue({
                fieldId: "memo",
                value: spsreferenceNum
              });
            }

            invoiceToPayment.setValue({
              fieldId: "custbody_820_payment_order",
              value: internalidSps
            });

            if (_logValidation(spsdatesps)) {
              invoiceToPayment.setValue({
                fieldId: "trandate",
                value: spsdatesps
              });
            }

            if (_logValidation(spsreferenceNum)) {
              invoiceToPayment.setValue({
                fieldId: "memo",
                value: spsreferenceNum
              });
            }

            invoiceToPayment.setValue({
              fieldId: "custbody_820_payment_order",
              value: internalidSps
            });

            for (let b = 0; b < arr.length; b++) {
              let obj = arr[b];

              if (obj.status === "paidInFull") {
                //todo array checkbox
                //checkboxValueArr
              } else {
                paymentLine++;

                let lineNo = invoiceToPayment.findSublistLineWithValue({
                  sublistId: "apply",
                  fieldId: "refnum",
                  value: obj.tranid
                });

                lineNo =
                  lineNo === -1
                    ? invoiceToPayment.findSublistLineWithValue({
                        sublistId: "apply",
                        fieldId: "refnum",
                        value: "INV" + obj.tranid
                      })
                    : lineNo;

                if (lineNo != -1) {
                  invoiceToPayment.selectLine({
                    sublistId: "apply",
                    line: lineNo
                  });

                  invoiceToPayment.setCurrentSublistValue({
                    sublistId: "apply",
                    fieldId: "apply",
                    value: true
                  });

                  obj.tranid = paymentObj[obj.tranid]
                    ? obj.tranid
                    : obj.tranid.replace("INV", "");

                  //todo
                  invoiceToPayment.setCurrentSublistValue({
                    sublistId: "apply",
                    fieldId: "amount",
                    value: paymentObj[obj.tranid]
                  });

                  invoiceToPayment.commitLine({
                    sublistId: "apply"
                  });

                  loadSpsRecord.setSublistValue({
                    sublistId: "line",
                    fieldId: "custcol_gbs_ispaymentcreate",
                    line: paymentObj[obj.tranid].i,
                    value: true
                  });
                }
              }
            }

            if (paymentLine) {
              invoiceToPayment.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
              });
            }
          }
        }

        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: "check",
            isDynamic: true
          });

          createCheck.setValue({
            fieldId: "entity",
            value: 122
          });

          createCheck.setValue({
            fieldId: "account",
            value: 571 //sb
            //value: 573 //lowe clearing
          });

          createCheck.setValue({
            fieldId: "custbody_820_payment_order",
            value: internalidSps
          });

          createCheck.setValue({
            fieldId: "trandate",
            value: spsdatesps
          });

          if (_logValidation(spsreferenceNum)) {
            createCheck.setValue({
              fieldId: "memo",
              value: spsreferenceNum
            });
          }

          log.debug("checkDataObjArr", checkDataObjArr);
          var checkPaymentLine = 0;

          for (let j = 0; j < checkDataObjArr.length; j++) {
            checkPaymentLine++;
            createCheck.selectNewLine({
              sublistId: "expense"
            });

            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "account",
              value: 432, //same in prod and sb lowe chargeback
              ignoreFieldChange: true
            });

            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "memo",
              value: checkDataObjArr[j].memo
            });

            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "amount",
              value: Math.abs(checkDataObjArr[j].adjustAmt)
            });

            createCheck.commitLine({
              sublistId: "expense"
            });

            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_is_check_created",
              line: checkDataObjArr[j].i,
              value: true
            });
          }

          if (checkPaymentLine) {
            createCheck.save();
          }

          loadSpsRecord.setValue({
            fieldId: "custbody_gbs_check_created",
            value: true
          });
        }

        /********************CREATE JE*******************/
        let checkJE = loadSpsRecord.getValue({
          fieldId: "custbody_je_created"
        });

        if (checkJE === false) {
          createJE(
            spsdatesps,
            internalidSps,
            spsreferenceNum,
            totalTranAmt,
            loadSpsRecord,
           // 573, //prod
            571, //sb
            221
          );
        }
      } else if (
        spsTradingPartnerId === 177282 ||
        spsTradingPartnerId === "177282"
      ) {
        //TARGET
        let preDiscObj = {};
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_invoicenumber",
            line: i
          });
          if (_logValidation(invoiceNumber)) {
            invoiceNumber = invoiceNumber.split("-")[0];
          }

          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_gbs_ispaymentcreate",
            line: i
          });

          let microfilm = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_microfilmnum",
            line: i
          });
          let adjustAmt = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_adjamount",
            line: i
          });

          let netPaidAmt = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_netpaidamt",
            line: i
          });

          //CHECK DATA
          if (adjustAmt < 0 && !paymentCreateCheckbox && adjustAmt) {
            checkDataObjArr.push({
              memo: microfilm,
              adjustAmt: adjustAmt,
              invoiceNumber: invoiceNumber,
              i: i
            });
            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_ispaymentcreate",
              line: i,
              value: true
            });
          }

          //PAYMENT DATA
          if (!!invoiceNumber && paymentCreateCheckbox == false) {
            invoiceNumberArr.push(["poastext", "is", invoiceNumber], "OR");
            preDiscObj[invoiceNumber] = { netPaidAmt: netPaidAmt, i: i };
            // loadSpsRecord.setSublistValue({
            //   sublistId: "line",
            //   fieldId: "custcol_gbs_ispaymentcreate",
            //   line: i,
            //   value: true
            // });
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
          isDynamic: true
        });
        invoiceToPayment.setValue({
          fieldId: "customer",
          value: 546
        });
        invoiceToPayment.setValue({
          fieldId: "account",
          value: 574 //sb and prod
        });
        if (_logValidation(spsdatesps)) {
          invoiceToPayment.setValue({
            fieldId: "trandate",
            value: spsdatesps
          });
        }
        if (_logValidation(spsreferenceNum)) {
          invoiceToPayment.setValue({
            fieldId: "memo",
            value: spsreferenceNum
          });
        }
        invoiceToPayment.setValue({
          fieldId: "custbody_820_payment_order",
          value: internalidSps
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
            let tranid = searchResultInv[i].getValue({
              name: "tranid",
              label: "Document Number"
            });
            let poNum = searchResultInv[i].getValue({
              name: "otherrefnum",
              label: "PO/Check Number"
            });
            log.debug("poNum", poNum);
            let status = searchResultInv[i].getValue({
              name: "statusref",
              label: "Status"
            });
            if (status === "paidInFull") {
              //todo array checkbox
              //checkboxValueArr
            } else {
              paymentLine++;
              let lineNo = invoiceToPayment.findSublistLineWithValue({
                sublistId: "apply",
                fieldId: "refnum",
                value: tranid
              });
              log.debug("lineNo", lineNo);
              if (lineNo != -1) {
                invoiceToPayment.selectLine({
                  sublistId: "apply",
                  line: lineNo
                });
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: "apply",
                  fieldId: "apply",
                  value: true
                });
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: "apply",
                  fieldId: "amount",
                  value: preDiscObj[poNum].netPaidAmt
                });
                invoiceToPayment.commitLine({
                  sublistId: "apply"
                });
                loadSpsRecord.setSublistValue({
                  sublistId: "line",
                  fieldId: "custcol_gbs_ispaymentcreate",
                  line: preDiscObj[poNum].i,
                  value: true
                });
              }
            }
          }
          //log.debug('preDiscObj', preDiscObj)
          if (paymentLine) {
            invoiceToPayment.save({
              enableSourcing: true,
              ignoreMandatoryFields: true
            });
          }
        }

        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: "check",
            isDynamic: true
          });
          createCheck.setValue({
            fieldId: "entity",
            value: 546
          });
          createCheck.setValue({
            fieldId: "account",
            value: 574 //sb and prod
          });
          createCheck.setValue({
            fieldId: "custbody_820_payment_order",
            value: internalidSps
          });
          createCheck.setValue({
            fieldId: "trandate",
            value: spsdatesps
          });
          if (_logValidation(spsreferenceNum)) {
            createCheck.setValue({
              fieldId: "memo",
              value: spsreferenceNum
            });
          }
          var checkPaymentLine = 0;

          for (let j = 0; j < checkDataObjArr.length; j++) {
            checkPaymentLine++;
            createCheck.selectNewLine({
              sublistId: "expense"
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "account",
             // value: 434, //prod
              value: 578, //sb
              ignoreFieldChange: true
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "memo",
              value: checkDataObjArr[j].memo
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "amount",
              value: Math.abs(checkDataObjArr[j].adjustAmt)
            });
            createCheck.commitLine({
              sublistId: "expense"
            });
            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_is_check_created",
              line: checkDataObjArr[j].i,
              value: true
            });
          }

          if (checkPaymentLine) {
            createCheck.save();
          }

          loadSpsRecord.setValue({
            fieldId: "custbody_gbs_check_created",
            value: true
          });
        }

        /********************CREATE JE*******************/
        let checkJE = loadSpsRecord.getValue({
          fieldId: "custbody_je_created"
        });

        if (checkJE === false) {
          createJE(
            spsdatesps,
            internalidSps,
            spsreferenceNum,
            totalTranAmt,
            loadSpsRecord,
            574, //target clearing
            221
          );
        }
      } else if (spsTradingPartnerId === 540 || spsTradingPartnerId === "540") {
        //WALMART
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_invoicenumber",
            line: i
          });

          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_gbs_ispaymentcreate",
            line: i
          });
          //paymentCreateCheckbox = false;

          if (_logValidation(invoiceNumber)) {
            let checkInt = isNumber(invoiceNumber);

            if (checkInt == true) {
              invoiceNumber = invoiceNumber.toString();
              invoiceNumber = Number(invoiceNumber).toString();
            }
          }

          let adjustAmt = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_adjamount",
            line: i
          });

          let remittanceDisc = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_disc_amounttaken",
            line: i
          });

          let netPaidAmt = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_netpaidamt",
            line: i
          });

          let microfilm = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_microfilmnum",
            line: i
          });

          let purchaseOrNumber = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_purchaseordernumber",
            line: i
          });

          //CHECK DATA
          if (
            (adjustAmt < 0 || netPaidAmt < 0) &&
            !paymentCreateCheckbox &&
            (adjustAmt || netPaidAmt) &&
            !purchaseOrNumber
          ) {
            //log.debug('invoiceNumber.toString().charAt(0) == "7"', invoiceNumber.toString().charAt(0) == "7")
            if (invoiceNumber.toString().charAt(0) == "7") {
              checkDataObjArr.push({
                memo: microfilm,
                adjustAmt: adjustAmt || netPaidAmt,
                invoiceNumber: invoiceNumber,
                i: i,
                sevenThousand: true
              });
            } else {
              checkDataObjArr.push({
                memo: microfilm,
                adjustAmt: adjustAmt || netPaidAmt,
                invoiceNumber: invoiceNumber,
                i: i,
                sevenThousand: false
              });
            }
          }

          //PAYMENT DATA
          if (!!invoiceNumber && paymentCreateCheckbox == false) {
            invoiceNumberArr.push(["numbertext", "is", invoiceNumber], "OR");
            paymentObj[invoiceNumber] = {
              netPaidAmt: netPaidAmt,
              remittanceDisc: remittanceDisc + Math.abs(adjustAmt),
              i: i
            };
          }
        }

        invoiceNumberArr.pop();

        // log.debug({
        //   title: 'invoiceNumberArr',
        //   details: invoiceNumberArr
        // })

        /***************************CREATE PAYMENT************************/
        if (invoiceNumberArr.length != 0) {
          var searchResultInv = invoiceSearch(invoiceNumberArr);

          // log.debug({
          //   title: 'searchResultInv',
          //   details: searchResultInv
          // })

          let invoiceResultLength = searchResultInv.length;

          let custArr = [];
          let custObj = {};

          for (let i = 0; i < invoiceResultLength; i++) {
            let customer = searchResultInv[i].getValue({
              name: "entity",
              label: "Name"
            });

            let tranid = searchResultInv[i].getValue({
              name: "tranid",
              label: "Document Number"
            });

            let status = searchResultInv[i].getValue({
              name: "statusref",
              label: "Status"
            });

            if (!custArr.includes(customer)) {
              custArr.push(customer);
              custObj[customer] = [];
              custObj[customer].push({
                tranid: tranid,
                status: status
              });
            } else {
              custObj[customer].push({
                tranid: tranid,
                status: status
              });
            }
          }

          log.debug("custObj 195", custObj);
          log.debug("paymentObj 195", paymentObj);

          for (const key in custObj) {
            let paymentLine = 0;
            let arr = custObj[key];

            var invoiceToPayment = record.create({
              type: "customerpayment",
              isDynamic: true
            });

            invoiceToPayment.setValue({
              fieldId: "customer",
              value: key
            });

            invoiceToPayment.setValue({
              fieldId: "account",
              value: 573 //sb
              //value: 575 //prod
            });

            if (_logValidation(spsdatesps)) {
              invoiceToPayment.setValue({
                fieldId: "trandate",
                value: spsdatesps
              });
            }

            if (_logValidation(spsreferenceNum)) {
              invoiceToPayment.setValue({
                fieldId: "memo",
                value: spsreferenceNum
              });
            }

            invoiceToPayment.setValue({
              fieldId: "custbody_820_payment_order",
              value: internalidSps
            });

            if (_logValidation(spsdatesps)) {
              invoiceToPayment.setValue({
                fieldId: "trandate",
                value: spsdatesps
              });
            }

            if (_logValidation(spsreferenceNum)) {
              invoiceToPayment.setValue({
                fieldId: "memo",
                value: spsreferenceNum
              });
            }

            invoiceToPayment.setValue({
              fieldId: "custbody_820_payment_order",
              value: internalidSps
            });

            for (let b = 0; b < arr.length; b++) {
              let obj = arr[b];

              //log.debug('obj 847', obj)

              if (obj.status === "paidInFull") {
                //todo array checkbox
                //checkboxValueArr
              } else {
                let lineNo = invoiceToPayment.findSublistLineWithValue({
                  sublistId: "apply",
                  fieldId: "refnum",
                  value: obj.tranid
                });

                lineNo =
                  lineNo === -1
                    ? invoiceToPayment.findSublistLineWithValue({
                        sublistId: "apply",
                        fieldId: "refnum",
                        value: "INV" + obj.tranid
                      })
                    : lineNo;

                log.debug("lineNo", lineNo);
                log.debug("obj.tranid", obj.tranid);

                if (lineNo != -1) {
                  paymentLine++;
                  invoiceToPayment.selectLine({
                    sublistId: "apply",
                    line: lineNo
                  });

                  invoiceToPayment.setCurrentSublistValue({
                    sublistId: "apply",
                    fieldId: "apply",
                    value: true
                  });

                  //log.debug('lineNo', lineNo)
                  // obj.tranid = paymentObj[obj.tranid]
                  //   ? obj.tranid
                  //   : obj.tranid.replace('INV', '')

                  //todo
                  try {
                    log.debug(
                      "paymentObj[obj.tranid].remittanceDisc",
                      paymentObj[obj.tranid].remittanceDisc
                    );
                  } catch (error) {
                    obj.tranid = obj.tranid.substring(3);
                  }

                  log.debug(
                    "paymentObj[obj.tranid].remittanceDisc",
                    paymentObj[obj.tranid].remittanceDisc
                  );

                  invoiceToPayment.setCurrentSublistValue({
                    sublistId: "apply",
                    fieldId: "disc",
                    value: paymentObj[obj.tranid].remittanceDisc
                  });

                  log.debug(
                    "paymentObj[obj.tranid].netPaidAmt",
                    paymentObj[obj.tranid].netPaidAmt
                  );

                  invoiceToPayment.setCurrentSublistValue({
                    sublistId: "apply",
                    fieldId: "amount",
                    value: Math.abs(paymentObj[obj.tranid].netPaidAmt)
                  });

                  invoiceToPayment.commitLine({
                    sublistId: "apply"
                  });

                  if (_logValidation(paymentObj[obj.tranid].i)) {
                    loadSpsRecord.setSublistValue({
                      sublistId: "line",
                      fieldId: "custcol_gbs_ispaymentcreate",
                      line: paymentObj[obj.tranid].i,
                      value: true
                    });
                  }
                }
              }
            }

            if (paymentLine) {
              invoiceToPayment.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
              });
            }
          }
        }

        var checkPaymentLine = 0;

        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: "check",
            isDynamic: true
          });

          createCheck.setValue({
            fieldId: "entity",
            value: 540
          });

          createCheck.setValue({
            fieldId: "account",
            //value: 575 //walmart clearing prod
            value: 573 //walmart clearing sb
          });

          createCheck.setValue({
            fieldId: "custbody_820_payment_order",
            value: internalidSps
          });

          createCheck.setValue({
            fieldId: "trandate",
            value: spsdatesps
          });

          if (_logValidation(spsreferenceNum)) {
            createCheck.setValue({
              fieldId: "memo",
              value: spsreferenceNum
            });
          }

          log.debug('checkDataObjArr', checkDataObjArr)

          for (let j = 0; j < checkDataObjArr.length; j++) {
            checkPaymentLine++;
            createCheck.selectNewLine({
              sublistId: "expense"
            });

            if (checkDataObjArr[j].sevenThousand) {
              createCheck.setCurrentSublistValue({
                sublistId: "expense",
                fieldId: "account",
                value: 450, //sb and prod
                ignoreFieldChange: true
              });
            } else {
              createCheck.setCurrentSublistValue({
                sublistId: "expense",
                fieldId: "account",
                //value: 435, prod
                value: 435, //sb
                ignoreFieldChange: true
              });
            }

            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "memo",
              value: checkDataObjArr[j].memo
            });

            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "amount",
              value: Math.abs(checkDataObjArr[j].adjustAmt)
            });

            createCheck.commitLine({
              sublistId: "expense"
            });

            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_is_check_created",
              line: checkDataObjArr[j].i,
              value: true
            });
          }

          if (checkPaymentLine) {
            try {
              createCheck.save();
            } catch (error) {
              log.debug(
                "Negative amount encountered on check for walmart",
                error
              );
            }
          }

          loadSpsRecord.setValue({
            fieldId: "custbody_gbs_check_created",
            value: true
          });
        }

        /********************CREATE JE*******************/
        let checkJE = loadSpsRecord.getValue({
          fieldId: "custbody_je_created"
        });

        if (checkJE === false) {
          createJE(
            spsdatesps,
            internalidSps,
            spsreferenceNum,
            totalTranAmt,
            loadSpsRecord,
            //575, //prod
            573, //sb
            221,
            "walmart"
          );
        }
      } else if (spsTradingPartnerId === 537 || spsTradingPartnerId === "537") {
        //MACY
        let preDiscObj = {};
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_invoicenumber",
            line: i
          });
          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_gbs_ispaymentcreate",
            line: i
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
            line: i
          });
          let adjustAmt = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_adjamount",
            line: i
          });
          let adjustAmtCode = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_adjreason",
            line: i
          });
          //CHECK DATA
          if (
            adjustAmt < 0 &&
            !paymentCreateCheckbox &&
            adjustAmt &&
            adjustAmtCode === "ZZ"
          ) {
            checkDataObjArr.push({
              memo: memo,
              adjustAmt: adjustAmt,
              invoiceNumber: invoiceNumber,
              i: i
            });
            // loadSpsRecord.setSublistValue({
            //   sublistId: "line",
            //   fieldId: "custcol_gbs_ispaymentcreate",
            //   line: i,
            //   value: true
            // });
          }

          let preDiscAmt =
            loadSpsRecord.getSublistValue({
              sublistId: "line",
              fieldId: "custcol_sps_cx_originalamt",
              line: i
            }) || 0;

          //PAYMENT DATA
          if (
            !(preDiscAmt > 0 && !invoiceNumber) &&
            paymentCreateCheckbox == false &&
            preDiscAmt
          ) {
            //change 2
            invoiceNumberArr.push(["numbertext", "is", invoiceNumber], "OR");
            preDiscObj[invoiceNumber] = {
              preDiscAmt: preDiscAmt * 0.02,
              payment: preDiscAmt - preDiscAmt * 0.02,
              i: i
            };
            // loadSpsRecord.setSublistValue({
            //   sublistId: "line",
            //   fieldId: "custcol_gbs_ispaymentcreate",
            //   line: i,
            //   value: true
            // });
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
          isDynamic: true
        });
        invoiceToPayment.setValue({
          fieldId: "customer",
          value: 537
        });
        invoiceToPayment.setValue({
          fieldId: "account",
          value: 575 //sb
          //value: 577 //macy clearing
        });
        if (_logValidation(spsdatesps)) {
          invoiceToPayment.setValue({
            fieldId: "trandate",
            value: spsdatesps
          });
        }
        if (_logValidation(spsreferenceNum)) {
          invoiceToPayment.setValue({
            fieldId: "memo",
            value: spsreferenceNum
          });
        }
        invoiceToPayment.setValue({
          fieldId: "custbody_820_payment_order",
          value: internalidSps
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
            let tranid = searchResultInv[i].getValue({
              name: "tranid",
              label: "Document Number"
            });
            let status = searchResultInv[i].getValue({
              name: "statusref",
              label: "Status"
            });
            if (status === "paidInFull") {
              //todo array checkbox
              //checkboxValueArr
            } else {
              paymentLine++;
              let lineNo = invoiceToPayment.findSublistLineWithValue({
                sublistId: "apply",
                fieldId: "refnum",
                value: tranid
              });
              if (lineNo != -1) {
                invoiceToPayment.selectLine({
                  sublistId: "apply",
                  line: lineNo
                });
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: "apply",
                  fieldId: "apply",
                  value: true
                });

                tranid = tranid.replace("INV", "");

                invoiceToPayment.setCurrentSublistValue({
                  sublistId: "apply",
                  fieldId: "amount",
                  value: preDiscObj[tranid].payment
                });
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: "apply",
                  fieldId: "disc",
                  value: preDiscObj[tranid].preDiscAmt
                });
                invoiceToPayment.commitLine({
                  sublistId: "apply"
                });

                loadSpsRecord.setSublistValue({
                  sublistId: "line",
                  fieldId: "custcol_gbs_ispaymentcreate",
                  line: preDiscObj[poNum].i,
                  value: true
                });
              }
            }
          }
          //log.debug('preDiscObj', preDiscObj)
          if (paymentLine) {
            invoiceToPayment.save({
              enableSourcing: true,
              ignoreMandatoryFields: true
            });
          }
        }

        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: "check",
            isDynamic: true
          });
          createCheck.setValue({
            fieldId: "entity",
            value: 537
          });
          createCheck.setValue({
            fieldId: "account",
           // value: 577 //macy clearing prod
            value: 575 //macy clearing sb
          });
          createCheck.setValue({
            fieldId: "custbody_820_payment_order",
            value: internalidSps
          });
          createCheck.setValue({
            fieldId: "trandate",
            value: spsdatesps
          });

          if (_logValidation(spsreferenceNum)) {
            createCheck.setValue({
              fieldId: "memo",
              value: spsreferenceNum
            });
          }

          var checkPaymentLine = 0;

          for (let j = 0; j < checkDataObjArr.length; j++) {
            checkPaymentLine++;
            createCheck.selectNewLine({
              sublistId: "expense"
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "account",
              value: 576, //sb
              //value: 578, //macy chargeback prod
              ignoreFieldChange: true
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "memo",
              value: checkDataObjArr[j].memo
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "amount",
              value: Math.abs(checkDataObjArr[j].adjustAmt)
            });
            createCheck.commitLine({
              sublistId: "expense"
            });

            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_is_check_created",
              line: checkDataObjArr[j].i,
              value: true
            });
          }

          if (checkPaymentLine) {
            createCheck.save();
          }

          loadSpsRecord.setValue({
            fieldId: "custbody_gbs_check_created",
            value: true
          });
        }

        /********************CREATE JE*******************/
        let checkJE = loadSpsRecord.getValue({
          fieldId: "custbody_je_created"
        });
        if (checkJE === false) {
          createJE(
            spsdatesps,
            internalidSps,
            spsreferenceNum,
            totalTranAmt,
            loadSpsRecord,
           // 577, prod 
            575, //sb
            221
          );
        }
      } else if (spsTradingPartnerId === 119 || spsTradingPartnerId === "119") {
        //HOME DEPOT
        let preDiscObj = {};
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_invoicenumber",
            line: i
          });
          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_gbs_ispaymentcreate",
            line: i
          });
          //!!change this before mvoing to prod
          //paymentCreateCheckbox = false;

          if (_logValidation(invoiceNumber)) {
            let checkInt = isNumber(invoiceNumber);
            if (checkInt == true) {
              invoiceNumber = invoiceNumber.toString();
              invoiceNumber = Number(invoiceNumber).toString();
            }
          }
          let remittanceDisc = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_disc_amounttaken",
            line: i
          });
          remittanceDisc = remittanceDisc ? Number(remittanceDisc) : 0;

          let adjustAmt = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_adjamount",
            line: i
          });
          adjustAmt = adjustAmt ? Number(adjustAmt) : 0;

          let purchaseOrNumber = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_purchaseordernumber",
            line: i
          });
          if (purchaseOrNumber) {
            // purchaseOrNumber = Number(purchaseOrNumber).toString()
            purchaseOrNumber = parseInt(purchaseOrNumber);
            //  purchaseOrNumber = (purchaseOrNumber * 1).toString();
          }

          let microfilm = loadSpsRecord.getSublistValue({
            sublistId: "line",
            fieldId: "custcol_sps_cx_microfilmnum",
            line: i
          });

          //CHECK DATA
          if (
            adjustAmt < 0 &&
            !paymentCreateCheckbox &&
            adjustAmt &&
            (!purchaseOrNumber || purchaseOrNumber === "NOT REQU")
          ) {
            //1 change
            checkDataObjArr.push({
              memo: microfilm,
              adjustAmt: adjustAmt,
              invoiceNumber: invoiceNumber,
              microfilm: microfilm,
              i: i
            });
          }

          //PAYMENT DATA
          let preDiscAmt =
            loadSpsRecord.getSublistValue({
              sublistId: "line",
              fieldId: "custcol_sps_cx_originalamt",
              line: i
            }) || 0;
          preDiscAmt = preDiscAmt ? Number(preDiscAmt) : preDiscAmt;

          if (!!purchaseOrNumber && paymentCreateCheckbox == false) {
            invoiceNumberArr.push(["numbertext", "is", invoiceNumber], "OR");

            //only will work for two amounts in any form
            if (preDiscObj[purchaseOrNumber]) {
              //(purchaseOrNumber === '31586201') ? log.debug('purchaseOrNumber', preDiscObj[purchaseOrNumber]) : '';
              purchaseOrNumber == "31586201" || purchaseOrNumber === 31586201
                ? log.debug(
                    `b ${purchaseOrNumber}`,
                    preDiscObj[purchaseOrNumber]
                  )
                : "";

              let objectx = preDiscObj[purchaseOrNumber];
              //log.audit("objectx b", objectx);
              objectx.disc = objectx.adjustAmt
                ? remittanceDisc - objectx.adjustAmt
                : objectx.remittanceDisc - adjustAmt;
              objectx.payment = objectx.adjustAmt
                ? preDiscAmt - remittanceDisc + objectx.adjustAmt
                : objectx.preDiscAmt - objectx.remittanceDisc + adjustAmt;
              preDiscObj[purchaseOrNumber].paymentline.push(i);
              //log.audit("objectx a", objectx);
              preDiscObj[purchaseOrNumber] = objectx;
              purchaseOrNumber == "31586201" || purchaseOrNumber === 31586201
                ? log.debug(
                    `b ${purchaseOrNumber}`,
                    preDiscObj[purchaseOrNumber]
                  )
                : "";
            } else {
              preDiscObj[purchaseOrNumber] = {
                remittanceDisc: remittanceDisc,
                adjustAmt: adjustAmt,
                preDiscAmt: preDiscAmt,
                payment: preDiscAmt - remittanceDisc + adjustAmt
              };
              preDiscObj[purchaseOrNumber].paymentline = [];
              preDiscObj[purchaseOrNumber].paymentline.push(i);
            }

            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_ispaymentcreate",
              line: i,
              value: true
            });
          }
        }
        invoiceNumberArr.pop();
        log.debug("preDiscObj", preDiscObj);
        // log.debug({
        //   title: 'invoiceNumberArr',
        //   details: invoiceNumberArr
        // })

        /***************************CREATE PAYMENT************************/
        let invoiceToPayment = record.create({
          type: "customerpayment",
          isDynamic: true
        });
        invoiceToPayment.setValue({
          fieldId: "customer",
          value: 119
        });
        invoiceToPayment.setValue({
          fieldId: "account",
           value: 572 //sb
         // value: 574 //prod 
        });
        if (_logValidation(spsdatesps)) {
          invoiceToPayment.setValue({
            fieldId: "trandate",
            value: spsdatesps
          });
        }
        if (_logValidation(spsreferenceNum)) {
          invoiceToPayment.setValue({
            fieldId: "memo",
            value: spsreferenceNum
          });
        }

        invoiceToPayment.setValue({
          fieldId: "custbody_820_payment_order",
          value: internalidSps
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
            let tranid = searchResultInv[i].getValue({
              name: "tranid",
              label: "Document Number"
            });
            let status = searchResultInv[i].getValue({
              name: "statusref",
              label: "Status"
            });
            let poNum = searchResultInv[i].getValue({
              name: "otherrefnum",
              label: "PO/Check Number"
            });
            poNum = poNum ? parseInt(poNum) : tranid;
            log.debug("poNum", poNum);

            if (status === "paidInFull") {
              //todo array checkbox
              //checkboxValueArr
            } else {
              paymentLine++;
              let lineNo = invoiceToPayment.findSublistLineWithValue({
                sublistId: "apply",
                fieldId: "refnum",
                value: tranid
              });

              lineNo =
                lineNo === -1
                  ? invoiceToPayment.findSublistLineWithValue({
                      sublistId: "apply",
                      fieldId: "refnum",
                      value: "INV" + tranid
                    })
                  : lineNo;

              log.debug("lineNo", lineNo);

              if (lineNo != -1) {
                invoiceToPayment.selectLine({
                  sublistId: "apply",
                  line: lineNo
                });
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: "apply",
                  fieldId: "apply",
                  value: true
                });

                if (preDiscObj[poNum]) {
                  // log.debug(
                  //   'preDiscObj[poNum].payment',
                  //   preDiscObj[poNum].payment
                  // )

                  invoiceToPayment.setCurrentSublistValue({
                    sublistId: "apply",
                    fieldId: "amount",
                    value: preDiscObj[poNum].payment
                  });

                  log.debug("preDiscObj[poNum].disc", preDiscObj[poNum].disc);

                  invoiceToPayment.setCurrentSublistValue({
                    sublistId: "apply",
                    fieldId: "disc",
                    value:
                      preDiscObj[poNum].disc || preDiscObj[poNum].preDiscAmt
                  });

                  log.debug(
                    poNum,
                    invoiceToPayment.getCurrentSublistValue({
                      sublistId: "apply",
                      fieldId: "disc"
                    })
                  );

                  invoiceToPayment.commitLine({
                    sublistId: "apply"
                  });
                }

                //checkbox check
                for (let h = 0; h < preDiscObj[poNum].paymentline.length; h++) {
                  loadSpsRecord.setSublistValue({
                    sublistId: "line",
                    fieldId: "custcol_gbs_ispaymentcreate",
                    line: preDiscObj[poNum].paymentline[h],
                    value: true
                  });
                }
              }
            }
          }
          //log.debug('preDiscObj', preDiscObj)
          if (paymentLine) {
            invoiceToPayment.save({
              enableSourcing: true,
              ignoreMandatoryFields: true
            });
          }
        }
        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: "check",
            isDynamic: true
          });
          createCheck.setValue({
            fieldId: "entity",
            value: 119
          });
          createCheck.setValue({
            fieldId: "account",
         //   value: 574 //prod
             value: 572 //sb
          });
          createCheck.setValue({
            fieldId: "custbody_820_payment_order",
            value: internalidSps
          });
          createCheck.setValue({
            fieldId: "trandate",
            value: spsdatesps
          });

          if (_logValidation(spsreferenceNum)) {
            createCheck.setValue({
              fieldId: "memo",
              value: spsreferenceNum
            });
          }

          var checkPaymentLine = 0;

          for (let j = 0; j < checkDataObjArr.length; j++) {
            checkPaymentLine++;
            createCheck.selectNewLine({
              sublistId: "expense"
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "account",
              value: 431, //sb and prod
              ignoreFieldChange: true
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "memo",
              value: checkDataObjArr[j].memo
            });
            createCheck.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "amount",
              value: Math.abs(checkDataObjArr[j].adjustAmt)
            });
            createCheck.commitLine({
              sublistId: "expense"
            });

            loadSpsRecord.setSublistValue({
              sublistId: "line",
              fieldId: "custcol_gbs_is_check_created",
              line: checkDataObjArr[j].i,
              value: true
            });
          }

          if (checkPaymentLine) {
            createCheck.save();
          }

          loadSpsRecord.setValue({
            fieldId: "custbody_gbs_check_created",
            value: true
          });
        }

        /********************CREATE JE*******************/
        let checkJE = loadSpsRecord.getValue({
          fieldId: "custbody_je_created"
        });
        if (checkJE === false) {
          createJE(
            spsdatesps,
            internalidSps,
            spsreferenceNum,
            totalTranAmt,
            loadSpsRecord,
             572, //sb
           // 574, //prod
            221
          );
        }
      }

      loadSpsRecord.setValue("transtatus", "B");

      loadSpsRecord.save();
      }
    } catch (e) {
      log.debug({
        title: "e",
        details: e
      });
    }
  }

  function createJE(
    spsdatesps,
    internalidSps,
    spsreferenceNum,
    totalTranAmt,
    loadSpsRecord,
    line1Acc,
    line2Acc,
    cust
  ) {
    let createJE = record.create({
      type: "journalentry"
    });

    if (_logValidation(spsdatesps)) {
      createJE.setValue({
        fieldId: "trandate",
        value: spsdatesps
      });
    }
    createJE.setValue({
      fieldId: "subsidiary",
      value: 2 //jeSubsidiary
    });

    createJE.setValue({
      fieldId: "custbody_820_payment_order",
      value: internalidSps
    });

    if (_logValidation(spsreferenceNum)) {
      createJE.setValue({
        fieldId: "memo",
        value: spsreferenceNum
      });
    }

    log.debug('line1Acc', line1Acc);

    createJE.setSublistValue({
      sublistId: "line",
      fieldId: "account",
      value: line1Acc,
      line: 0
    });

    createJE.setSublistValue({
      sublistId: "line",
      fieldId: "credit",
      value: totalTranAmt,
      line: 0
    });

    if (_logValidation(spsreferenceNum)) {
      createJE.setSublistValue({
        sublistId: "line",
        fieldId: "memo",
        value: spsreferenceNum,
        line: 0
      });
    }

    log.debug('line2Acc', line2Acc);
    createJE.setSublistValue({
      sublistId: "line",
      fieldId: "account",
      value: line2Acc,
      line: 1
    });

    createJE.setSublistValue({
      sublistId: "line",
      fieldId: "debit",
      value: totalTranAmt,
      line: 1
    });

    if (_logValidation(spsreferenceNum)) {
      createJE.setSublistValue({
        sublistId: "line",
        fieldId: "memo",
        value: spsreferenceNum,
        line: 1
      });
    }

    //save journal entry record.
    let je_id = createJE.save();

    log.debug({
      title: "je_id " + cust,
      details: je_id
    });

    loadSpsRecord.setValue({
      fieldId: "custbody_je_created",
      value: true
    });
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
          ["mainline", "is", "T"]
          // 'AND',
          // ['status', 'noneof', 'CustInvc:B']
        ],
        columns: [
          search.createColumn({ name: "tranid", label: "Document Number" }),
          search.createColumn({ name: "entity", label: "Name" }),
          search.createColumn({ name: "internalid", label: "Internal ID" }),
          search.createColumn({
            name: "transactionname",
            label: "Transaction Name"
          }),
          search.createColumn({ name: "statusref", label: "Status" }),
          search.createColumn({ name: "otherrefnum", label: "PO/Check Number" })
        ]
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
        end: parseInt(startIndex + RANGECOUNT)
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
    afterSubmit: afterSubmit
  };
});
