/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
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

define(['N/email', 'N/record', 'N/runtime', 'N/search', 'N/url']
/**
 * @param{email} email
 * @param{record} record
 * @param{runtime} runtime
 * @param{search} search
 * @param{url} url
 */, function (email, record, runtime, search, url) {
  /**
   * Defines the function definition that is executed after record is submitted.
   * @param {Object} scriptContext
   * @param {Record} scriptContext.newRecord - New record
   * @param {string} scriptContext.id - Trigger id; use id from the context.UserEventType enum
   * @since 2015.2
   */
  function afterSubmit (scriptContext) {
    try {
      var loadSpsRecordContext = scriptContext.newRecord
      var internalidSps = loadSpsRecordContext.id
      var finalSearchResults = []
      var invoiceNumberArr = []

      //load [sps]820 Payment order record
      var loadSpsRecord = record.load({
        type: 'customtransaction_sps_cx_820_basic',
        id: internalidSps
      })

      var spsTradingPartnerId = loadSpsRecord.getValue({
        fieldId: 'custbody_sps_cx_tpid'
      })

      //if 'SPS CX TRADING PARTNER ID' field is undefined then script will not execute else it will execute on the basis of partner id.
      if (_logValidation(spsTradingPartnerId)) {
        //get script parameter from scriptParameter() function.
        paramObj = scriptParameter()

        var {
          homeDepotCust,
          targetCust,
          macyCust,
          homeDepotAcct,
          homeDepotCheckExpenseAcct,
          targetAccount,
          targetCheckExpenseAcct,
          macysAcct,
          macysCheckExpenseAcct,
          jeSubsidiary,
          homeDepotJeDebitAcct
        } = paramObj

        //get line count of sps payment order record
        let getLineCountSps = loadSpsRecord.getLineCount({
          sublistId: 'line'
        })

        var spsreferenceNum = loadSpsRecord.getValue({
          fieldId: 'custbody_sps_cx_refnum'
        })

        var spsdatesps = loadSpsRecord.getValue({
          fieldId: 'trandate'
        })

        //iterate on length of sps line count
        for (let i = 0; i < getLineCountSps; i++) {
          //get all line level data of sps record from getSpsLineData() function
          let {
            invoiceNumber,
            netPaidAmt,
            lineId,
            paymentCreateCheckbox,
            adjustAmt,
            microfilm,
            remittanceDisc,
            preDiscAmt
          } = getSpsLineData(loadSpsRecord, i)

          // log.debug('payment create checkbox',paymentCreateCheckbox);

          //condition for check isCreatedPayment line level checkbox value is false and invoice number and net paid amount is not blank then push payment related data to array
          if (
            paymentCreateCheckbox == false &&
            _logValidation(invoiceNumber) &&
            _logValidation(netPaidAmt)
          ) {
            //push all line level data of invoice number and net paid ammount in finalSearchResults array
            finalSearchResults.push({
              lineNo: i,
              invoiceNumber: invoiceNumber,
              netPaidAmt: netPaidAmt,
              lineId: lineId,
              internalidSps: internalidSps,
              microfilm: microfilm,
              preDiscAmt: preDiscAmt,
              invoiceNumber:invoiceNumber
            })
            // log.debug('finalsearchresult',finalSearchResults)

            //push criteria of invoice number into invoiceNumberArr
            invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')
          }
          //condition for check isCreatedPayment line level checkbox is false and adjustment amount is not blank then push check related data to array
          else if (
            paymentCreateCheckbox == false &&
            _logValidation(adjustAmt) 
          ) {
            finalSearchResults.push({
              lineNo: i,
              lineId: lineId,
              internalidSps: internalidSps,
              adjustAmt: adjustAmt,
              microfilm: microfilm,
              remittanceDisc: remittanceDisc,
              invoiceNumber:invoiceNumber
            })
            invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')

          } else if ( paymentCreateCheckbox == false && spsTradingPartnerId == 537 && _logValidation(invoiceNumber) && preDiscAmt) {
            //MACY ignore positive lines with missing invoice number
            finalSearchResults.push({
              lineNo: i,
              lineId: lineId,
              internalidSps: internalidSps,
              adjustAmt: adjustAmt,
              microfilm: microfilm,
              remittanceDisc: remittanceDisc,
              preDiscAmt: preDiscAmt,
              invoiceNumber:invoiceNumber
            })
            invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')
          }
        }
        invoiceNumberArr.pop()

        //log.debug('finalsearchresult', finalSearchResults)
         log.debug('invocienumberarr 140',invoiceNumberArr)
        var custPaymentCheckJE

        ///check invoicenumberarr is not blank
        if (invoiceNumberArr.length != 0) {
          //pass invoice number array and get invoice search result data from invoiceSearch() function
          let searchResultInv = invoiceSearch(invoiceNumberArr)
          // log.debug('searchresultinv',searchResultInv)

          let invoiceResultLength = searchResultInv.length
          // log.debug('finalsearchresult',finalSearchResults)

          for (let i = 0; i < invoiceResultLength; i++) {
            //pass search result of invoice and get invoice record data from getInvoiceSearchFields() funciton
            let {
              tranid,
              customer,
              internalid,
              transactionname,
              status
            } = getInvoiceSearchFields(searchResultInv, i)
            //log.debug('status', status)
            // log.debug('tranid',tranid)
            // log.debug('tranid',tranid)

            custPaymentCheckJE = customer

            //find duplicate results of sps line level data using doucement number and invoice number
            let fileterRes = finalSearchResults.filter(
              x => x.invoiceNumber === tranid
            )
            // log.debug('filterres',fileterRes);

            //loop on filterRes to merge invoice record data
            for (const iterator of fileterRes) {
              let iteratorVal = iterator.lineNo

              //get index position of object from finalSearchResults array of object
              let index = finalSearchResults
                .map(object => object.lineNo)
                .indexOf(iteratorVal)
              // log.debug('index',index)
              let obj = finalSearchResults[index]
              obj.invoiceId = tranid
              obj.customerId = customer
              obj.internalid = internalid
              obj.transactionname = transactionname
              obj.status = status
              finalSearchResults[index] = obj
            }
          }
        }

         log.debug('finalSearchResults 194', finalSearchResults)

        if (_logValidation(finalSearchResults)) {
          let finalSearchResultsLength = finalSearchResults.length
          var checkboxValueArr = []
          var totalTranAmt = 0
          var temp = 0
          var tempPayment = 0
          let MACYspsPreDiscAmtTotal = 0
          let macyCHECKAmt = 0

          var checkAndPaymentBodyObj = {
            spsTradingPartnerId: spsTradingPartnerId,
            homeDepotCust: homeDepotCust,
            targetCust: targetCust,
            macyCust: macyCust,
            custPaymentCheckJE: custPaymentCheckJE,
            internalidSps: internalidSps,
            spsdatesps: spsdatesps,
            spsreferenceNum: spsreferenceNum,
            homeDepotAcct: homeDepotAcct,
            targetAccount: targetAccount,
            macysAcct: macysAcct
          }

          //create check record from adjustment amount
          var { createCheck, invoiceToPayment } = checkAndPaymentBody(
            checkAndPaymentBodyObj
          )

          
          //loop to iterate on search result contain sps 820 payment order record line level data.
          for (let i = 0; i < finalSearchResultsLength; i++) {
            //get all invoice record and sps record data values from getInvoiceSpsValue() function
            var {
              status,
              lineId,
              invoiceNumber,
              invoiceId,
              customerInv,
              spsPaidAmount,
              spsadjustAmt,
              spsmicrofilm,
              spsDisc,
              spsPreDiscAmt
            } = getInvoiceSpsValue(finalSearchResults, i)
             log.debug('invoice id',invoiceId)
             log.debug('invoiceNumber',invoiceNumber)

            //MACY CUSTOMER (Ignore positive lines missing SPS CX Invoice Number)
            if (!(Math.sign(spsadjustAmt) === 1 && !_logValidation(invoiceNumber)) && spsTradingPartnerId === 537) {
              MACYspsPreDiscAmtTotal += spsPreDiscAmt
            }

            if (_logValidation(spsadjustAmt) && spsadjustAmt < 0) {
              temp++

              totalTranAmt += spsadjustAmt

              //MACY AMOUNT 
              if (Math.sign(spsadjustAmt) === -1) {
                macyCHECKAmt += spsadjustAmt
              } 

              // log.debug('totalTranAmt in check',totalTranAmt)

              var checkApplyObj = {
                macyCHECKAmt:macyCHECKAmt,
                createCheck: createCheck,
                internalidSps: internalidSps,
                spsmicrofilm: spsmicrofilm,
                spsadjustAmt: spsadjustAmt,
                checkboxValueArr: checkboxValueArr,
                lineId: lineId,
                homeDepotCheckExpenseAcct: homeDepotCheckExpenseAcct,
                targetCheckExpenseAcct: targetCheckExpenseAcct,
                macysCheckExpenseAcct: macysCheckExpenseAcct,
                spsTradingPartnerId: spsTradingPartnerId,
                homeDepotCust: homeDepotCust,
                targetCust: targetCust,
                macyCust: macyCust
              }

              //function is use for set account and amount on expense subtab line level
              spsadjustAmt = applyCheckFromAdjstAmt(checkApplyObj)
            }

            //get remittance checkbox value from customer record
            if (_logValidation(customerInv)) {
              let lookupOnCustomer = search.lookupFields({
                type: 'customer',
                id: customerInv,
                columns: ['custentity_auto_apply_remittance_payment']
              })

              var autoApplyRemit =
                lookupOnCustomer.custentity_auto_apply_remittance_payment

              // log.debug('autoApplyRemit',autoApplyRemit)

              //if remittance checkbox is true then create payment, check and journal entry record.
              //if status is paidInFull then push alreadyCreated property into object to true and also push necessary data
              if (status === 'paidInFull') {
                if (autoApplyRemit === true) {
                  checkboxValueArr.push({
                    key: internalidSps,
                    lineId: lineId,
                    bool: true,
                    invoiceNumber: invoiceNumber,
                    alreadyCreated: true
                  })
                }
              }
              //else if invoice id, customer, sps paid amount and invoice number is defined then transform invoice to customer payment record.
              else if (
                _logValidation(invoiceId) &&
                _logValidation(customerInv) &&
                _logValidation(spsPaidAmount) &&
                _logValidation(invoiceNumber) &&
                spsPaidAmount > 0 &&
                autoApplyRemit === true
              ) {
                // log.debug('invoiceNumber in payment',invoiceNumber)

                //    if (autoApplyRemit === true) {

                totalTranAmt += spsPaidAmount
                // log.debug('totalTranAmt in payment',totalTranAmt)

                //find invoice number from apply line level data
                let lineNo = invoiceToPayment.findSublistLineWithValue({
                  sublistId: 'apply',
                  fieldId: 'refnum',
                  value: invoiceNumber
                })

                // log.debug(`Line found for ${invoiceId} on payment transform`, lineNo)

                //if line no is not equal to -1 then set sps paid amount on payment field and apply particular invoice from payment line level
                if (lineNo != -1) {
                  tempPayment++

                  var paymentObject = {
                    invoiceToPayment: invoiceToPayment,
                    spsPaidAmount: spsPaidAmount,
                    internalidSps: internalidSps,
                    lineNo: lineNo,
                    invoiceNumber: invoiceNumber,
                    checkboxValueArr: checkboxValueArr,
                    lineId: lineId,
                    spsDisc: spsDisc,
                    spsTradingPartnerId: spsTradingPartnerId,
                    homeDepotCust: homeDepotCust,
                    targetCust: targetCust,
                    macyCust: macyCust,
                    spsPreDiscAmt: MACYspsPreDiscAmtTotal
                  }

                  //function is use for apply invoice and amount on customer payment record.
                  applyInvoiceOnPayment(paymentObject)
                }
                //  }
              }
              //else no valid payment record found on sps record
              else {
                log.audit(
                  `No valid payment record found for SPS Record --> ${internalidSps}`,
                  `Invoice Number ${invoiceNumber}`
                )

                //else invoice record not found then push invoice number and line id
                checkboxValueArr.push({
                  key: internalidSps,
                  lineId: lineId,
                  bool: true,
                  invoiceNumber: invoiceNumber,
                  payment_id: payment_id
                })
              }
            }

            //if i is equal to search result length and temp value is greater than 0 then save check record. If no expense is set on check record then it won't be save.
            if (i == finalSearchResultsLength - 1 && temp > 0) {
              var payment_id = createCheck.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
              })

              log.audit(
                `Created Check Record from Invoice Number ${invoiceNumber}`,
                `Check Id ${payment_id}`
              )
            }

            if (i == finalSearchResultsLength - 1 && tempPayment > 0) {
              var payment_id = invoiceToPayment.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
              })

              if (_logValidation(payment_id)) {
                log.audit(
                  `Payment record created for SPS Record --> ${internalidSps}`,
                  `Invoice Number ${invoiceNumber} --> Payment Record ${payment_id}`
                )
              }
            }
          }

          let checkJE = loadSpsRecord.getValue({
            fieldId: 'custbody_je_created'
          })
           log.debug('checkJE',checkJE)

          //BODY LEVEL CHECKBOX FALSE ONLY THEN CREATE
          if (checkJE == false) {
            // log.debug('checkJE',checkJE)

            var JeObject = {
              totalTranAmt: totalTranAmt,
              loadSpsRecord: loadSpsRecord,
              spsdatesps: spsdatesps,
              internalidSps: internalidSps,
              spsreferenceNum: spsreferenceNum,
              invoiceNumber: invoiceNumber,
              jeSubsidiary: jeSubsidiary,
              homeDepotAcct: homeDepotAcct,
              homeDepotJeDebitAcct: homeDepotJeDebitAcct,
              targetAccount: targetAccount,
              macysAcct: macysAcct,
              spsTradingPartnerId: spsTradingPartnerId,
              homeDepotCust: homeDepotCust,
              targetCust: targetCust,
              macyCust: macyCust
            }
            //function is use for crate single journal entry record from sum of adjustment amount and sps net paid amount
            createJournalEntry(JeObject)
          }
          log.debug('checkboxarr', checkboxValueArr)

          //function is use for set true on checkbox present at line level in sps payment order record.
          setCheckboxValueOnSps(loadSpsRecord, checkboxValueArr)

          // log.debug('SPS Record with Internal ID updated --->', internalidSps)
          //send mail to receiptant for # of payment record created and already created.
          // sendPaymentRecordMail(checkboxValueArr);
        }
      }
    } catch (e) {
      log.error('error in aftersubmit', e.toString())
    }
  }

  return {
    afterSubmit: afterSubmit
  }

  function checkAndPaymentBody (checkAndPaymentBodyObj) {
    var {
      spsTradingPartnerId,
      homeDepotCust,
      targetCust,
      macyCust,
      custPaymentCheckJE,
      internalidSps,
      spsdatesps,
      spsreferenceNum,
      homeDepotAcct,
      targetAccount,
      macysAcct
    } = checkAndPaymentBodyObj

    var createCheck = record.create({
      type: 'check',
      isDynamic: true
    })

    let invoiceToPayment = record.create({
      type: 'customerpayment',
      isDynamic: true
    })

    // let finalCustomer = spsTradingPartnerId == homeDepotCust ? spsTradingPartnerId : custPaymentCheckJE;

    //set cust and acc value
    if (spsTradingPartnerId === homeDepotCust) {
      createCheck.setValue({
        fieldId: 'entity',
        value: homeDepotCust
      })

      // log.debug('customer for payment je check',custPaymentCheckJE);
      invoiceToPayment.setValue({
        fieldId: 'customer',
        value: homeDepotCust
      })

      //set Home Depot Clearing account on accont field (body level)
      createCheck.setValue({
        fieldId: 'account',
        value: homeDepotAcct
      })

      invoiceToPayment.setValue({
        fieldId: 'account',
        value: homeDepotAcct
      })
    } else if (spsTradingPartnerId === targetCust) {
      createCheck.setValue({
        fieldId: 'entity',
        value: targetCust
      })

      // log.debug('customer for payment je check',custPaymentCheckJE);
      invoiceToPayment.setValue({
        fieldId: 'customer',
        value: targetCust
      })

      //set Home Depot Clearing account on accont field (body level)
      createCheck.setValue({
        fieldId: 'account',
        value: targetAccount
      })

      invoiceToPayment.setValue({
        fieldId: 'account',
        value: targetAccount
      })
    } else if (spsTradingPartnerId === macyCust) {
      createCheck.setValue({
        fieldId: 'entity',
        value: 537
      })

      // log.debug('customer for payment je check',custPaymentCheckJE);
      invoiceToPayment.setValue({
        fieldId: 'customer',
        value: 537
      })

      //set Home Depot Clearing account on accont field (body level)
      createCheck.setValue({
        fieldId: 'account',
        value: 575
      })

      invoiceToPayment.setValue({
        fieldId: 'account',
        value: 575
      })
    }

    //set 820 payment record on payment order field.
    createCheck.setValue({
      fieldId: 'custbody_gbs_payment_order',
      value: internalidSps
    })

    createCheck.setValue({
      fieldId: 'trandate',
      value: spsdatesps
    })

    if (_logValidation(spsreferenceNum)) {
      createCheck.setValue({
        fieldId: 'memo',
        value: spsreferenceNum
      })
    }

    if (_logValidation(spsdatesps)) {
      invoiceToPayment.setValue({
        fieldId: 'trandate',
        value: spsdatesps
      })
    }

    if (_logValidation(spsreferenceNum)) {
      invoiceToPayment.setValue({
        fieldId: 'memo',
        value: spsreferenceNum
      })
    }

    invoiceToPayment.setValue({
      fieldId: 'custbody_gbs_payment_order',
      value: internalidSps
    })

    return { createCheck, invoiceToPayment }
  }

  function scriptParameter () {
    var consolidatedAsnPaymentScript = runtime.getCurrentScript()

    var homeDepotCust = consolidatedAsnPaymentScript.getParameter({
      name: 'custscript_sps_customer_home_depot'
    })

    var targetCust = consolidatedAsnPaymentScript.getParameter({
      name: 'custscript_sps_customer_target'
    })

    var macyCust = consolidatedAsnPaymentScript.getParameter({
      name: 'custscript_sps_customer_macy'
    })

    // log.debug('homeDepotCust',homeDepotCust);
    var homeDepotAcct = consolidatedAsnPaymentScript.getParameter({
      name: 'custscript_sps_home_depot_account'
    })

    // log.debug('checkAccount',checkAccount);
    var homeDepotCheckExpenseAcct = consolidatedAsnPaymentScript.getParameter({
      name: 'custscript_check_expense_home_depot_acct'
    })

    var targetAccount = consolidatedAsnPaymentScript.getParameter({
      name: 'custscript_sps_target_account'
    })

    // log.debug('checkAccount',checkAccount);
    var targetCheckExpenseAcct = consolidatedAsnPaymentScript.getParameter({
      name: 'custscript_sps_expense_target_account'
    })

    var macysAcct = consolidatedAsnPaymentScript.getParameter({
      name: 'custscript_sps_macys_account'
    })

    // log.debug('checkAccount',checkAccount);
    var macysCheckExpenseAcct = consolidatedAsnPaymentScript.getParameter({
      name: 'custscript_sps_expense_macys_account'
    })

    // log.debug('checkExpenseAccount',checkExpenseAccount);
    var jeSubsidiary = consolidatedAsnPaymentScript.getParameter({
      name: 'custscript_je_subsidiary'
    })

    var homeDepotJeDebitAcct = consolidatedAsnPaymentScript.getParameter({
      name: 'custscript_je_debit_account'
    })

    var paramObj = {
      homeDepotCust: homeDepotCust,
      targetCust: targetCust,
      macyCust: macyCust,
      homeDepotAcct: homeDepotAcct,
      homeDepotCheckExpenseAcct: homeDepotCheckExpenseAcct,
      targetAccount: targetAccount,
      targetCheckExpenseAcct: targetCheckExpenseAcct,
      macysAcct: macysAcct,
      macysCheckExpenseAcct: macysCheckExpenseAcct,
      jeSubsidiary: jeSubsidiary,
      homeDepotJeDebitAcct: homeDepotJeDebitAcct
    }
    return paramObj
  }

  /**
   * function is use for set account and amount on expense subtab line level
   * @param {object} checkApplyObj - contains parameters to set value on line item
   * @since 2015.2
   */
  function applyCheckFromAdjstAmt (checkApplyObj) {
    try {
      var {
        macyCHECKAmt,
        createCheck,
        internalidSps,
        spsmicrofilm,
        spsadjustAmt,
        checkboxValueArr,
        lineId,
        homeDepotCheckExpenseAcct,
        targetCheckExpenseAcct,
        macysCheckExpenseAcct,
        spsTradingPartnerId,
        homeDepotCust,
        targetCust,
        macyCust
      } = checkApplyObj

      createCheck.selectNewLine({
        sublistId: 'expense'
      })

      if (spsTradingPartnerId === homeDepotCust) {
        //set Home Depot Chargebacks account on line level account field.
        createCheck.setCurrentSublistValue({
          sublistId: 'expense',
          fieldId: 'account',
          value: homeDepotCheckExpenseAcct,
          ignoreFieldChange: true
        })

        if (_logValidation(spsmicrofilm)) {
          createCheck.setCurrentSublistValue({
            sublistId: 'expense',
            fieldId: 'memo',
            value: spsmicrofilm
          })
        }

        //convert value from negative to positive
        spsadjustAmt = Math.abs(spsadjustAmt)

        createCheck.setCurrentSublistValue({
          sublistId: 'expense',
          fieldId: 'amount',
          value: spsadjustAmt
        })
      } else if (spsTradingPartnerId === targetCust) {
        //set Home Depot Chargebacks account on line level account field.
        createCheck.setCurrentSublistValue({
          sublistId: 'expense',
          fieldId: 'account',
          value: targetCheckExpenseAcct,
          ignoreFieldChange: true
        })

        if (_logValidation(spsmicrofilm)) {
          createCheck.setCurrentSublistValue({
            sublistId: 'expense',
            fieldId: 'memo',
            value: spsmicrofilm
          })
        }

        //convert value from negative to positive
        spsadjustAmt = Math.abs(spsadjustAmt)

        createCheck.setCurrentSublistValue({
          sublistId: 'expense',
          fieldId: 'amount',
          value: spsadjustAmt
        })
      } else if (spsTradingPartnerId === macyCust) {
        //set Home Depot Chargebacks account on line level account field.
        createCheck.setCurrentSublistValue({
          sublistId: 'expense',
          fieldId: 'account',
          value: 576,
          ignoreFieldChange: true
        })

        if (_logValidation(spsmicrofilm)) {
          createCheck.setCurrentSublistValue({
            sublistId: 'expense',
            fieldId: 'memo',
            value: spsmicrofilm
          })
        }

        //convert value from negative to positive
        //spsadjustAmt = Math.abs(spsadjustAmt)

        log.debug('macy 749 check amt', macyCHECKAmt);

        createCheck.setCurrentSublistValue({
          sublistId: 'expense',
          fieldId: 'amount',
          value: macyCHECKAmt
        })
      }

      createCheck.commitLine({
        sublistId: 'expense'
      })

      checkboxValueArr.push({
        key: internalidSps,
        lineId: lineId,
        bool: true,
        payment_id: 1
      })

      return spsadjustAmt
    } catch (e) {
      log.error('error in applyCheckFromAdjstAmt', e.toString())
    }
  }

  /**
   * function is use for apply invoice and amount on customer payment record.
   * @param {object} paymentObject - contains parameters to set value on line item
   * @since 2015.2
   */
  function applyInvoiceOnPayment (paymentObject) {
    try {
      var {
        invoiceToPayment,
        spsPaidAmount,
        internalidSps,
        lineNo,
        invoiceNumber,
        checkboxValueArr,
        lineId,
        spsDisc,
        spsTradingPartnerId,
        homeDepotCust,
        targetCust,
        macyCust,
        spsPreDiscAmt
      } = paymentObject

      invoiceToPayment.selectLine({
        sublistId: 'apply',
        line: lineNo
      })

      if (spsTradingPartnerId === homeDepotCust) {
        invoiceToPayment.setCurrentSublistValue({
          sublistId: 'apply',
          fieldId: 'apply',
          value: true
        })

        if (_logValidation(spsDisc)) {
          invoiceToPayment.setCurrentSublistValue({
            sublistId: 'apply',
            fieldId: 'disc',
            value: spsDisc
          })
        }

        invoiceToPayment.setCurrentSublistValue({
          sublistId: 'apply',
          fieldId: 'amount',
          value: spsPaidAmount
        })
      } else if (spsTradingPartnerId === targetCust) {
        invoiceToPayment.setCurrentSublistValue({
          sublistId: 'apply',
          fieldId: 'apply',
          value: true
        })

        invoiceToPayment.setCurrentSublistValue({
          sublistId: 'apply',
          fieldId: 'amount',
          value: spsPaidAmount
        })
      } else if (spsTradingPartnerId === macyCust) {
        invoiceToPayment.setCurrentSublistValue({
          sublistId: 'apply',
          fieldId: 'apply',
          value: true
        })

        invoiceToPayment.setCurrentSublistValue({
          sublistId: 'apply',
          fieldId: 'amount',
          value: spsPreDiscAmt
        })
      }

      invoiceToPayment.commitLine({
        sublistId: 'apply'
      })

      //push created payment record id into checkboxValueArr and other necessary data
      checkboxValueArr.push({
        key: internalidSps,
        lineId: lineId,
        bool: true,
        invoiceNumber: invoiceNumber,
        payment_id: 1
      })
    } catch (e) {
      log.error('error in applyInvoiceOnPayment', e.toString())
    }
  }

  /**
   * function is use for crate single journal entry record from sum of adjustment amount and sps net paid amount
   * @param {object} JeObject - contains parameters to set value on line item
   * @since 2015.2
   */
  function createJournalEntry (JeObject) {
    try {
      var {
        totalTranAmt,
        loadSpsRecord,
        spsdatesps,
        internalidSps,
        spsreferenceNum,
        invoiceNumber,
        jeSubsidiary,
        homeDepotAcct,
        homeDepotJeDebitAcct,
        targetAccount,
        macysAcct,
        spsTradingPartnerId,
        homeDepotCust,
        targetCust,
        macyCust
      } = JeObject

      if (_logValidation(totalTranAmt)) {
        totalTranAmt = Math.abs(totalTranAmt)

        // log.debug('totalTranAmt',totalTranAmt)

        loadSpsRecord.setValue({
          fieldId: 'custbody_sps_cx_amount',
          value: totalTranAmt
        })

        //create journal entry record
        let createJE = record.create({
          type: 'journalentry'
        })

        if (_logValidation(spsdatesps)) {
          createJE.setValue({
            fieldId: 'trandate',
            value: spsdatesps
          })
        }
        createJE.setValue({
          fieldId: 'subsidiary',
          value: jeSubsidiary
        })

        createJE.setValue({
          fieldId: 'custbody_gbs_payment_order',
          value: internalidSps
        })

        if (_logValidation(spsreferenceNum)) {
          createJE.setValue({
            fieldId: 'memo',
            value: spsreferenceNum
          })
        }

        //HD, target, macy, walmart, lowe
        if (spsTradingPartnerId === homeDepotCust) {
          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: homeDepotAcct,
            line: 0
          })

          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: homeDepotJeDebitAcct,
            line: 1
          })
        } else if (spsTradingPartnerId === targetCust) {
          //177282

          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: targetAccount,
            line: 0
          })

          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: targetAccount,
            line: 1
          })
        } else if (spsTradingPartnerId === macyCust) {
          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: 575,
            line: 0
          })

          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: 575,
            line: 1
          })
        } else if (spsTradingPartnerId === 540 || spsTradingPartnerId === '540') {
          //walmart
          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: 218,
            line: 0
          })

          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: 218,
            line: 1
          })
        } else if (spsTradingPartnerId === 548 || spsTradingPartnerId === '548') {
          //lowes
          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: macysAcct,
            line: 0
          })

          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: macysAcct,
            line: 1
          })
        }

        createJE.setSublistValue({
          sublistId: 'line',
          fieldId: 'credit',
          value: totalTranAmt,
          line: 0
        })

        if (_logValidation(spsreferenceNum)) {
          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: spsreferenceNum,
            line: 0
          })
        }

        createJE.setSublistValue({
          sublistId: 'line',
          fieldId: 'debit',
          value: totalTranAmt,
          line: 1
        })

        if (_logValidation(spsreferenceNum)) {
          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: spsreferenceNum,
            line: 1
          })
        }

        //save journal entry record.
        let je_id = createJE.save()

        if (_logValidation(je_id)) {
          log.audit(
            `Created Journal Entry Record from Invoice Number ${invoiceNumber}`,
            `Journal Entry Id ${je_id}`
          )

          loadSpsRecord.setValue({
            fieldId: 'custbody_je_created',
            value: true
          })
        }
      }
    } catch (e) {
      log.error('error in createJournalEntry', e.toString())
    }
  }

  /**
   * function use to set isPaymentCreated checkbox value to true on the basis of present invoice number in checkboxValueArr
   * @param {Record} loadSpsRecord - load sps payment order record
   * @param {Array} checkboxValueArr - array of object contain payment and sps record data
   * @since 2015.2
   */
  function setCheckboxValueOnSps (loadSpsRecord, checkboxValueArr) {
    try {
      let spsInvDocNumLength = checkboxValueArr.length

      for (let i = 0; i < spsInvDocNumLength; i++) {
        if (
          _logValidation(
            checkboxValueArr[i].payment_id ||
              _logValidation(checkboxValueArr[i].alreadyCreated)
          )
        ) {
          let spsInvDocNumVal = checkboxValueArr[i].lineId

          //find line with invoice number
          let lineNumber = loadSpsRecord.findSublistLineWithValue({
            sublistId: 'line',
            fieldId: 'line',
            value: spsInvDocNumVal
          })

          //set true to isPaymentCreated checkox on the basis of present invoice number in checkboxValueArr
          loadSpsRecord.setSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_gbs_ispaymentcreate',
            value: checkboxValueArr[i].bool,
            line: lineNumber
          })
        }
      }

      //save sps payment order record
      let spsRecId = loadSpsRecord.save({
        enableSourcing: true,
        ignoreMandatoryFields: true
      })

      log.audit(
        `Set checkbox value true on line item of SPS Record --> ${spsRecId}`,
        spsRecId
      )
    } catch (e) {
      log.error('error in setCheckboxValueOnSps', e.toString())
    }
  }

  /**
   * function is use to send status email of payemnt record created and already created record
   * @param {Array} checkboxValueArr - array of object contain payment and sps record data
   * @since 2015.2
   */
  function sendPaymentRecordMail (checkboxValueArr) {
    try {
      let body = `Dear User, 

                      [SPS] 820 Payment Order Custom Record has been Processed with following payment records created. 
                      Please click on the link to navigate to the payment record.
                      
                      `

      //get netsuite account id
      let accountID = runtime.accountId
      //get domain of account
      let resolvedDomain = url.resolveDomain({
        hostType: url.HostType.APPLICATION,
        accountId: accountID
      })
      resolvedDomain = 'https://' + '' + resolvedDomain

      let value = checkboxValueArr
      // log.debug('value', value);

      //iterator on checkboxValuearr array of object
      for (const iterator of value) {
        //log.debug('alreadyCreated', iterator.alreadyCreated)
        if (
          _logValidation(iterator.alreadyCreated) ||
          _logValidation(iterator.payment_id)
        ) {
          //if payment record alreadyCreted then send status mail of already creted record
          if (
            iterator.alreadyCreated == 'true' ||
            iterator.alreadyCreated == true
          ) {
            body += `Payment already created for invoice number ${iterator.invoiceNumber} \n`
          }
          //else send status mail of payment record creted
          else {
            //return record created url from payment record id
            let paymentUrl = url.resolveRecord({
              recordType: 'customerpayment',
              recordId: iterator.payment_id,
              isEditMode: false
            })
            body += `Payment record created with Internal ID ${
              iterator.payment_id
            } for SPS Record ${iterator.key} with Document Number ${
              iterator.invoiceNumber
            }: ${resolvedDomain + paymentUrl} \n`
          }
        }
        //else invoice record is not found then send status mail of not valid invoice record.
        else {
          body += `No valid Invoice record found with Invoice Number ${iterator.invoiceNumber} in System for Sps Record --> ${iterator.key} \n`
        }
      }

      //send email to recieptant with body
      email.send({
        author: 2362,
        body: body,
        recipients: 2362,
        subject: `[SPS] 820 Payment Order Custom Record Processed Details`
      })
    } catch (e) {
      log.error('error in sendPaymentRecordMail', e.toString())
    }
  }

  /**
   * function is use for get all data from finalSearchResults array of object
   * @param {Array} finalSearchResults - array of object contain final data of invoice, payment and sps record data
   * @param {number} i - position of element in array
   * @since 2015.2
   */
  function getInvoiceSpsValue (finalSearchResults, i) {
    try {
      let invoiceId = finalSearchResults[i].internalid

      let customerInv = finalSearchResults[i].customerId

      let spsDisc = finalSearchResults[i].remittanceDisc

      let spsPaidAmount = finalSearchResults[i].netPaidAmt
      // log.debug('spsPaidAmount',spsPaidAmount)

      let invoiceNumber = finalSearchResults[i].invoiceNumber

      let status = finalSearchResults[i].status

      let lineId = finalSearchResults[i].lineId

      let spsadjustAmt = finalSearchResults[i].adjustAmt

      let spsmicrofilm = finalSearchResults[i].microfilm

      let spsPreDiscAmt = finalSearchResults[i].preDiscAmt

      return {
        status,
        lineId,
        invoiceNumber,
        invoiceId,
        customerInv,
        spsPaidAmount,
        spsadjustAmt,
        spsmicrofilm,
        spsDisc,
        spsPreDiscAmt
      }
    } catch (e) {
      log.error('error in getInvoiceSpsValue', e.toString())
    }
  }

  /**
   * function work for get all data from invoice record using search
   * @param {Array} invoiceNumberArr - contains invoice number to search on invoice record
   * @since 2015.2
   */
  function invoiceSearch (invoiceNumberArr) {
    try {
      let invoiceSearch = search.create({
        type: 'invoice',
        filters: [
          ['type', 'anyof', 'CustInvc'],
          'AND',
          invoiceNumberArr,
          'AND',
          ['mainline', 'is', 'T']
          // 'AND',
          // ['status', 'noneof', 'CustInvc:B']
        ],
        columns: [
          search.createColumn({ name: 'tranid', label: 'Document Number' }),
          search.createColumn({ name: 'entity', label: 'Name' }),
          search.createColumn({ name: 'internalid', label: 'Internal ID' }),
          search.createColumn({
            name: 'transactionname',
            label: 'Transaction Name'
          }),
          search.createColumn({ name: 'statusref', label: 'Status' })
        ]
      })

      let searchResultInv = searchAll(invoiceSearch.run())
      return searchResultInv
    } catch (e) {
      log.error('error in invoiceSearch', e.toString())
    }
  }

  /**
   * function is use to get line level data from sps payment order record
   * @param {Record} loadSpsRecord - load sps payment order record
   * @param {number} i - position of element in array
   * @since 2015.2
   */
  function getSpsLineData (loadSpsRecord, i) {
    try {
      let invoiceNumber = loadSpsRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_sps_cx_invoicenumber',
        line: i
      })

      if (_logValidation(invoiceNumber)) {
        let checkInt = isNumber(invoiceNumber)

        if (checkInt == true) {
          invoiceNumber = invoiceNumber.toString()

          if (invoiceNumber.charAt(0) === '0')
            invoiceNumber = invoiceNumber.slice(1)
        }
      }

      let remittanceDisc = loadSpsRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_sps_cx_disc_amounttaken',
        line: i
      })

      let netPaidAmt = loadSpsRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_sps_cx_netpaidamt',
        line: i
      })

      let lineId = loadSpsRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'line',
        line: i
      })

      let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_gbs_ispaymentcreate',
        line: i
      })

      let adjustAmt = loadSpsRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_sps_cx_adjamount',
        line: i
      })

      let microfilm = loadSpsRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_sps_cx_microfilmnum',
        line: i
      })

      let preDiscAmt = loadSpsRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_sps_cx_originalamt',
        line: i
      })

      // log.debug('invoicenumber + netPaidAmt + lineId + paymentCreateCheckbox',invoiceNumber + netPaidAmt + lineId + paymentCreateCheckbox)

      return {
        invoiceNumber,
        netPaidAmt,
        lineId,
        paymentCreateCheckbox,
        adjustAmt,
        microfilm,
        remittanceDisc,
        preDiscAmt
      }
    } catch (e) {
      log.error('error in setCheckboxValueOnSps', e.toString())
    }
  }

  function isNumber (n) {
    return /^-?[\d.]+(?:e-?\d+)?$/.test(n)
  }

  /**
   * function is use to get invoice search values from searchResultInv search
   * @param {Array} searchResultInv - get all invoice search result data
   * @param {number} i - position of element in array
   * @since 2015.2
   */
  function getInvoiceSearchFields (searchResultInv, i) {
    try {
      let tranid = searchResultInv[i].getValue({
        name: 'tranid',
        label: 'Document Number'
      })
      let customer = searchResultInv[i].getValue({
        name: 'entity',
        label: 'Name'
      })
      let internalid = searchResultInv[i].getValue({
        name: 'internalid',
        label: 'Internal ID'
      })
      let transactionname = searchResultInv[i].getValue({
        name: 'transactionname',
        label: 'Transaction Name'
      })
      let status = searchResultInv[i].getValue({
        name: 'statusref',
        label: 'Status'
      })

      // log.debug('tranid cust ',tranid + customer)

      return { tranid, customer, internalid, transactionname, status }
    } catch (e) {
      log.error('error in setCheckboxValueOnSps', e.toString())
    }
  }

  /**
   * function is use to search all records with range
   * @param {Array} resultset - pass search
   * @since 2015.2
   */
  function searchAll (resultset) {
    var allResults = []
    var startIndex = 0
    var RANGECOUNT = 1000

    do {
      var pagedResults = resultset.getRange({
        start: parseInt(startIndex),
        end: parseInt(startIndex + RANGECOUNT)
      })

      allResults = allResults.concat(pagedResults)

      var pagedResultsCount = pagedResults != null ? pagedResults.length : 0
      startIndex += pagedResultsCount

      var remainingUsage = runtime.getCurrentScript().getRemainingUsage()
    } while (pagedResultsCount == RANGECOUNT)

    var remainingUsage = runtime.getCurrentScript().getRemainingUsage()

    return allResults
  }

  /**
   * log validation to check value is null or undefined if true then execute next process else false
   * @param {number} value - pass variable name
   * @since 2015.2
   */
  function _logValidation (value) {
    if (
      value != null &&
      value != '' &&
      value != 'null' &&
      value != undefined &&
      value != 'undefined' &&
      value != '@NONE@' &&
      value != 'NaN'
    ) {
      return true
    } else {
      return false
    }
  }
})
