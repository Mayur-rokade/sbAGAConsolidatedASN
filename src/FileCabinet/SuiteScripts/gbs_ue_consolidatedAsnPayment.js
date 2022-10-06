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


define(['N/email', 'N/record', 'N/runtime', 'N/search', 'N/url'],
  /**
* @param{email} email
* @param{record} record
* @param{runtime} runtime
* @param{search} search
* @param{url} url
*/
  function (email, record, runtime, search, url) {

    /**
     * Defines the function definition that is executed after record is submitted.
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record
     * @param {string} scriptContext.id - Trigger id; use id from the context.UserEventType enum
     * @since 2015.2
     */
    function afterSubmit(scriptContext) {


      try {

        var loadSpsRecordContext = scriptContext.newRecord;
        var internalidSps = loadSpsRecordContext.id;
        var finalSearchResults = []
        var invoiceNumberArr = []

        var consolidatedAsnPaymentScript = runtime.getCurrentScript();

        var paymentCustomer = consolidatedAsnPaymentScript.getParameter({
          name: "custscript_sps_cust_id",
        });

        // log.debug('paymentCustomer',paymentCustomer);

        var checkAccount = consolidatedAsnPaymentScript.getParameter({
          name: "custscript_sps_check_acc_id",
        });

        // log.debug('checkAccount',checkAccount);

        var checkExpenseAccount = consolidatedAsnPaymentScript.getParameter({
          name: "custscript_check_expense_account_id",
        });

        // log.debug('checkExpenseAccount',checkExpenseAccount);


        var jeSubsidiary = consolidatedAsnPaymentScript.getParameter({
          name: "custscript_je_subsidiary",
        });

        var jeCreditAcct = consolidatedAsnPaymentScript.getParameter({
          name: "custscript_je_credit_account",
        });

        var jeDebitAcct = consolidatedAsnPaymentScript.getParameter({
          name: "custscript_je_debit_account",
        });

        //load [sps]820 Payment order record
        var loadSpsRecord = record.load({
          type: 'customtransaction_sps_cx_820_basic',
          id: internalidSps
        });

        //get line count of sps payment order record
        let getLineCountSps = loadSpsRecord.getLineCount({
          sublistId: 'line'
        });


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
            referenceNum,
            datesps,
            remittanceDisc
          } = getSpsLineData(loadSpsRecord, i)

          // log.debug('payment create checkbox',paymentCreateCheckbox);

          //validation to check isCreatedPayment checkbox value is false and invoice number and net paid amount is not blank
          if (paymentCreateCheckbox == false && _logValidation(invoiceNumber) && (_logValidation(netPaidAmt) || _logValidation(adjustAmt))) {

            //push all line level data of invoice number and net paid ammount in finalSearchResults array
            finalSearchResults.push({
              lineNo: i,
              invoiceNumber: invoiceNumber,
              netPaidAmt: netPaidAmt,
              lineId: lineId,
              internalidSps: internalidSps,
              adjustAmt: adjustAmt,
              microfilm: microfilm,
              referenceNum: referenceNum,
              datesps: datesps,
              remittanceDisc: remittanceDisc
            })
            // log.debug('finalsearchresult',finalSearchResults)
            //push criteria of invoice number into invoiceNumberArr 
            invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')
          }
        }
        invoiceNumberArr.pop();

        // log.debug('finalsearchresult',finalSearchResults)
        // log.debug('invocienumberarr',invoiceNumberArr)

        //check invoicenumberarr is not blank
        if (invoiceNumberArr.length != 0) {

          //pass invoice number array and get invoice search result data from invoiceSearch() function 
          let searchResultInv = invoiceSearch(invoiceNumberArr);
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

            //find duplicate results of sps line level data using doucement number and invoice number 
            let fileterRes = finalSearchResults.filter(
              x => x.invoiceNumber === tranid
            )

            // log.debug('filterres',fileterRes);

            //loop on filterRes to merge invoice record data
            for (const iterator of fileterRes) {

              let iteratorVal = iterator.lineNo;

              //get index position of object from finalSearchResults array of object
              let index = finalSearchResults.map(object => object.lineNo).indexOf(iteratorVal);
              // log.debug('index',index)
              let obj = finalSearchResults[index];
              obj.invoiceId = tranid
              obj.customerId = customer
              obj.internalid = internalid
              obj.transactionname = transactionname
              obj.status = status
              finalSearchResults[index] = obj
            }
          }
        }

        // log.debug('finalSearchResults', finalSearchResults)

        if (_logValidation(finalSearchResults)) {

          let finalSearchResultsLength = finalSearchResults.length;

          var checkboxValueArr = [];
          var totalTranAmt = 0;
          var temp = 0;

          //create check record from adjustment amount
          var createCheck = record.create({
            type: 'check',
            isDynamic: true
          });

          //loop to iterate on search result contain sps 820 payment order record line level data.
          for (let i = 0; i < finalSearchResultsLength; i++) {

            //get all invoice record and sps record data values from getInvoiceSpsValue() function
            var { status, lineId, invoiceNumber, invoiceId, customerInv, spsPaidAmount, spsadjustAmt, spsmicrofilm, spsreferenceNum, spsdatesps, spsDisc } = getInvoiceSpsValue(finalSearchResults, i);
            // log.debug('invoice id',invoiceId)

            //get remittance checkbox value from customer record
            if (_logValidation(customerInv)) {
              let lookupOnCustomer = search.lookupFields({
                type: 'customer',
                id: customerInv,
                columns: ['custentity_auto_apply_remittance_payment']
              });

              var autoApplyRemit = lookupOnCustomer.custentity_auto_apply_remittance_payment;

              // log.debug('autoApplyRemit',autoApplyRemit)

              //if remittance checkbox is true then create payment, check and journal entry record.
              if (autoApplyRemit === true) {

                //if status is paidInFull then push alreadyCreated property into object to true and also push necessary data
                if (status === 'paidInFull') {

                  checkboxValueArr.push({
                    key: internalidSps,
                    lineId: lineId,
                    bool: true,
                    invoiceNumber: invoiceNumber,
                    alreadyCreated: true
                  })
                }
                //else if invoice id, customer, sps paid amount and invoice number is defined then transform invoice to customer payment record.
                else if (
                  _logValidation(invoiceId) &&
                  _logValidation(customerInv) &&
                  _logValidation(spsPaidAmount) &&
                  _logValidation(invoiceNumber) &&
                  spsPaidAmount > 0
                ) {

                  totalTranAmt += spsPaidAmount;

                  //transform invoice record to cutomer payment record using invoice id
                  let invoiceToPayment = record.transform({
                    fromType: record.Type.INVOICE,
                    fromId: invoiceId,
                    toType: record.Type.CUSTOMER_PAYMENT,
                    isDynamic: false
                  })

                  //find invoice number from apply line level data
                  let lineNo = invoiceToPayment.findSublistLineWithValue({
                    sublistId: 'apply',
                    fieldId: 'refnum',
                    value: invoiceNumber
                  })

                  // log.debug(`Line found for ${invoiceId} on payment transform`, lineNo)

                  //if line no is not equal to -1 then set sps paid amount on payment field and apply particular invoice from payment line level
                  if (lineNo != -1) {

                    var paymentObject = {
                      invoiceToPayment: invoiceToPayment,
                      spsPaidAmount: spsPaidAmount,
                      internalidSps: internalidSps,
                      lineNo: lineNo,
                      invoiceNumber: invoiceNumber,
                      checkboxValueArr: checkboxValueArr,
                      lineId: lineId,
                      spsDisc: spsDisc,
                    }

                    //function is use for apply invoice and amount on customer payment record.
                    var payment_id = applyInvoiceOnPayment(paymentObject);
                  }
                }
                //else if sps adjustment amount is negative then script will set amount on each line for each invoice.
                else if (
                  _logValidation(spsadjustAmt) &&
                  _logValidation(invoiceNumber) &&
                  spsadjustAmt < 0) {

                  temp++;

                  totalTranAmt += spsadjustAmt;

                  var checkApplyObj = {

                    createCheck: createCheck,
                    internalidSps: internalidSps,
                    spsdatesps: spsdatesps,
                    spsreferenceNum: spsreferenceNum,
                    spsmicrofilm: spsmicrofilm,
                    spsadjustAmt: spsadjustAmt,
                    checkboxValueArr: checkboxValueArr,
                    lineId: lineId,
                    invoiceNumber: invoiceNumber,
                    paymentCustomer: paymentCustomer,
                    checkAccount:checkAccount,
                    checkExpenseAccount:checkExpenseAccount,
                  }

                  //function is use for set account and amount on expense subtab line level
                  spsadjustAmt = applyCheckFromAdjstAmt(checkApplyObj);

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
            }

            //if i is equal to search result length and temp value is greater than 0 then save check record. If no expense is set on check record then it won't be save.
            if ((i == finalSearchResultsLength - 1) && temp > 0) {
              var payment_id = createCheck.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
              });

              log.audit(`Created Check Record from Invoice Number ${invoiceNumber}`, `Check Id ${payment_id}`);

            }

          }

          var JeObject = {
            totalTranAmt: totalTranAmt,
            loadSpsRecord: loadSpsRecord,
            spsdatesps: spsdatesps,
            internalidSps: internalidSps,
            spsreferenceNum: spsreferenceNum,
            invoiceNumber: invoiceNumber,
            jeSubsidiary:jeSubsidiary,
            jeCreditAcct:jeCreditAcct,
            jeDebitAcct:jeDebitAcct
          }
          //function is use for crate single journal entry record from sum of adjustment amount and sps net paid amount
          createJournalEntry(JeObject);

          // log.debug('checkboxarr', checkboxValueArr);

          //function is use for set true on checkbox present at line level in sps payment order record.
          setCheckboxValueOnSps(loadSpsRecord, checkboxValueArr);

          log.debug('SPS Record with Internal ID updated --->', internalidSps)

          //send mail to receiptant for # of payment record created and already created.
          sendPaymentRecordMail(checkboxValueArr);


        }
      }
      catch (e) {

        log.error('error in aftersubmit', e.toString());
      }
    }

    return {
      afterSubmit: afterSubmit

    }

    /**
      * function is use for set account and amount on expense subtab line level
      * @param {object} checkApplyObj - contains parameters to set value on line item
      * @since 2015.2
      */
    function applyCheckFromAdjstAmt(checkApplyObj) {

      var { createCheck, internalidSps, spsdatesps, spsreferenceNum, spsmicrofilm, spsadjustAmt, checkboxValueArr, lineId, invoiceNumber,paymentCustomer,checkAccount,checkExpenseAccount } = checkApplyObj;

      //set 10 Home Depot payee on entity field
      createCheck.setValue({
        fieldId: 'entity',
        value: paymentCustomer
      });

      //set 820 payment record on payment order field.
      createCheck.setValue({
        fieldId: 'custbody_gbs_payment_order',
        value: internalidSps
      });

      if (_logValidation(spsdatesps)) {
        createCheck.setValue({
          fieldId: 'trandate',
          value: spsdatesps
        });
      }

      if (_logValidation(spsreferenceNum)) {
        createCheck.setValue({
          fieldId: 'memo',
          value: spsreferenceNum
        });
      }

      //set Home Depot Clearing account on accont field (body level) 
      createCheck.setValue({
        fieldId: 'account',
        value: checkAccount
      });


      createCheck.selectNewLine({
        sublistId: 'expense'
      });

      //set Home Depot Chargebacks account on line level account field.
      createCheck.setCurrentSublistValue({
        sublistId: 'expense',
        fieldId: 'account',
        value: checkExpenseAccount,
        ignoreFieldChange: true
      });

      if (_logValidation(spsmicrofilm)) {
        createCheck.setCurrentSublistValue({
          sublistId: 'expense',
          fieldId: 'memo',
          value: spsmicrofilm,
        });
      }

      //convert value from negative to positive 
      spsadjustAmt = Math.abs(spsadjustAmt);

      createCheck.setCurrentSublistValue({
        sublistId: 'expense',
        fieldId: 'amount',
        value: spsadjustAmt,
      });

      createCheck.commitLine({
        sublistId: 'expense'
      });

      checkboxValueArr.push({
        key: internalidSps,
        lineId: lineId,
        bool: true,
        invoiceNumber: invoiceNumber,
        payment_id: 1
      });
      return spsadjustAmt;
    }

    /**
   * function is use for apply invoice and amount on customer payment record.
   * @param {object} paymentObject - contains parameters to set value on line item
   * @since 2015.2
   */
    function applyInvoiceOnPayment(paymentObject) {

      var {
        invoiceToPayment,
        spsPaidAmount,
        internalidSps,
        lineNo,
        invoiceNumber,
        checkboxValueArr,
        lineId,
        spsDisc,
      } = paymentObject;

      invoiceToPayment.setValue({
        fieldId: 'payment',
        value: spsPaidAmount
      });

      invoiceToPayment.setValue({
        fieldId: 'custbody_gbs_payment_order',
        value: internalidSps
      });

      invoiceToPayment.setSublistValue({
        sublistId: 'apply',
        fieldId: 'apply',
        line: lineNo,
        value: true
      });

      if (_logValidation(spsDisc)) {
        invoiceToPayment.setSublistValue({
          sublistId: 'apply',
          fieldId: 'disc',
          line: lineNo,
          value: spsDisc
        });
      }

      invoiceToPayment.setSublistValue({
        sublistId: 'apply',
        fieldId: 'amount',
        line: lineNo,
        value: spsPaidAmount
      });

      //save customer payment record
      var payment_id = invoiceToPayment.save({
        enableSourcing: true,
        ignoreMandatoryFields: true
      });
      // log.debug('payment_id', payment_id)
      if (_logValidation(payment_id)) {
        log.audit(
          `Payment record created for SPS Record --> ${internalidSps}`,
          `Invoice Number ${invoiceNumber} --> Payment Record ${payment_id}`
        );

        //push created payment record id into checkboxValueArr and other necessary data 
        checkboxValueArr.push({
          key: internalidSps,
          lineId: lineId,
          bool: true,
          invoiceNumber: invoiceNumber,
          payment_id: payment_id
        });
      }
      return payment_id;
    }

    /**
     * function is use for crate single journal entry record from sum of adjustment amount and sps net paid amount
     * @param {object} JeObject - contains parameters to set value on line item
     * @since 2015.2
     */
    function createJournalEntry(JeObject) {

      var { totalTranAmt,
        loadSpsRecord,
        spsdatesps,
        internalidSps,
        spsreferenceNum,
        invoiceNumber,
        jeSubsidiary,
        jeCreditAcct,
        jeDebitAcct } = JeObject;

      if (_logValidation(totalTranAmt)) {

        totalTranAmt = Math.abs(totalTranAmt);

        loadSpsRecord.setValue({
          fieldId: 'custbody_sps_cx_amount',
          value: totalTranAmt
        });

        //create journal entry record
        let createJE = record.create({
          type: 'journalentry',
        });

        if (_logValidation(spsdatesps)) {
          createJE.setValue({
            fieldId: 'trandate',
            value: spsdatesps
          });
        }
        createJE.setValue({
          fieldId: 'subsidiary',
          value: jeSubsidiary
        });

        createJE.setValue({
          fieldId: 'custbody_gbs_payment_order',
          value: internalidSps
        });

        if (_logValidation(spsreferenceNum)) {
          createJE.setValue({
            fieldId: 'memo',
            value: spsreferenceNum
          });
        }

        createJE.setSublistValue({
          sublistId: 'line',
          fieldId: 'account',
          value: jeCreditAcct,
          line: 0
        });


        createJE.setSublistValue({
          sublistId: 'line',
          fieldId: 'credit',
          value: totalTranAmt,
          line: 0
        });

        if (_logValidation(spsreferenceNum)) {
          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: spsreferenceNum,
            line: 0
          });
        }


        createJE.setSublistValue({
          sublistId: 'line',
          fieldId: 'account',
          value: jeDebitAcct,
          line: 1
        });

        createJE.setSublistValue({
          sublistId: 'line',
          fieldId: 'debit',
          value: totalTranAmt,
          line: 1
        });


        if (_logValidation(spsreferenceNum)) {
          createJE.setSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: spsreferenceNum,
            line: 1
          });
        }

        //save journal entry record.
        let je_id = createJE.save();

        if (_logValidation(je_id)) {

          log.audit(`Created Journal Entry Record from Invoice Number ${invoiceNumber}`, `Journal Entry Id ${je_id}`);

        }
      }
    }

    /**
     * function use to set isPaymentCreated checkbox value to true on the basis of present invoice number in checkboxValueArr
     * @param {Record} loadSpsRecord - load sps payment order record 
     * @param {Array} checkboxValueArr - array of object contain payment and sps record data
     * @since 2015.2
     */
    function setCheckboxValueOnSps(loadSpsRecord, checkboxValueArr) {

      try {
        let spsInvDocNumLength = checkboxValueArr.length;

        for (let i = 0; i < spsInvDocNumLength; i++) {

          if (_logValidation(checkboxValueArr[i].payment_id || _logValidation(checkboxValueArr[i].alreadyCreated))) {
            let spsInvDocNumVal = checkboxValueArr[i].lineId;

            //find line with invoice number 
            let lineNumber = loadSpsRecord.findSublistLineWithValue({
              sublistId: 'line',
              fieldId: 'line',
              value: spsInvDocNumVal
            });

            //set true to isPaymentCreated checkox on the basis of present invoice number in checkboxValueArr
            loadSpsRecord.setSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_gbs_ispaymentcreate',
              value: checkboxValueArr[i].bool,
              line: lineNumber
            });
          }
        }

        //save sps payment order record
        let spsRecId = loadSpsRecord.save({
          enableSourcing: true,
          ignoreMandatoryFields: true
        });

        log.audit(`Set checkbox value true on line item of SPS Record --> ${spsRecId}`, spsRecId);
      } catch (e) {
        log.error('error in setCheckboxValueOnSps', e.toString());
      }
    }


    /**
    * function is use to send status email of payemnt record created and already created record
    * @param {Array} checkboxValueArr - array of object contain payment and sps record data
    * @since 2015.2
    */
    function sendPaymentRecordMail(checkboxValueArr) {
      try {
        let body = `Dear User, 

                      [SPS] 820 Payment Order Custom Record has been Processed with following payment records created. 
                      Please click on the link to navigate to the payment record.
                      
                      `;

        //get netsuite account id             
        let accountID = runtime.accountId;
        //get domain of account
        let resolvedDomain = url.resolveDomain({
          hostType: url.HostType.APPLICATION,
          accountId: accountID
        });
        resolvedDomain = 'https://' + '' + resolvedDomain;

        let value = checkboxValueArr;
        // log.debug('value', value);

        //iterator on checkboxValuearr array of object
        for (const iterator of value) {
          //log.debug('alreadyCreated', iterator.alreadyCreated)
          if (_logValidation(iterator.alreadyCreated) || _logValidation(iterator.payment_id)) {
            //if payment record alreadyCreted then send status mail of already creted record
            if (iterator.alreadyCreated == 'true' || iterator.alreadyCreated == true) {
              body += `Payment already created for invoice number ${iterator.invoiceNumber} \n`;
            }
            //else send status mail of payment record creted 
            else {
              //return record created url from payment record id
              let paymentUrl = url.resolveRecord({
                recordType: 'customerpayment',
                recordId: iterator.payment_id,
                isEditMode: false
              });
              body += `Payment record created with Internal ID ${iterator.payment_id} for SPS Record ${iterator.key} with Document Number ${iterator.invoiceNumber}: ${resolvedDomain + paymentUrl} \n`;

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
        });
      }
      catch (e) {
        log.error('error in sendPaymentRecordMail', e.toString());
      }
    }


    /**
     * function is use for get all data from finalSearchResults array of object
     * @param {Array} finalSearchResults - array of object contain final data of invoice, payment and sps record data
     * @param {number} i - position of element in array
     * @since 2015.2
     */
    function getInvoiceSpsValue(finalSearchResults, i) {
      try {
        let invoiceId = finalSearchResults[i].internalid;

        let customerInv = finalSearchResults[i].customerId;

        let spsDisc = finalSearchResults[i].remittanceDisc;

        let spsPaidAmount = finalSearchResults[i].netPaidAmt;
        // log.debug('spsPaidAmount',spsPaidAmount)

        let invoiceNumber = finalSearchResults[i].invoiceNumber;

        let status = finalSearchResults[i].status;

        let lineId = finalSearchResults[i].lineId;

        let spsadjustAmt = finalSearchResults[i].adjustAmt;

        let spsmicrofilm = finalSearchResults[i].microfilm;

        let spsreferenceNum = finalSearchResults[i].referenceNum;

        let spsdatesps = finalSearchResults[i].datesps;

        return { status, lineId, invoiceNumber, invoiceId, customerInv, spsPaidAmount, spsadjustAmt, spsmicrofilm, spsreferenceNum, spsdatesps, spsDisc };
      }
      catch (e) {
        log.error('error in getInvoiceSpsValue', e.toString())
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
        });

        let searchResultInv = searchAll(invoiceSearch.run());
        return searchResultInv;
      }
      catch (e) {
        log.error('error in invoiceSearch', e.toString());
      }
    }



    /**
   * function is use to get line level data from sps payment order record 
   * @param {Record} loadSpsRecord - load sps payment order record 
   * @param {number} i - position of element in array
   * @since 2015.2
   */
    function getSpsLineData(loadSpsRecord, i) {
      try {

        let invoiceNumber = loadSpsRecord.getSublistValue({
          sublistId: 'line',
          fieldId: 'custcol_sps_cx_invoicenumber',
          line: i
        });

        let remittanceDisc = loadSpsRecord.getSublistValue({
          sublistId: 'line',
          fieldId: 'custcol_sps_cx_disc_amounttaken',
          line: i
        });

        let netPaidAmt = loadSpsRecord.getSublistValue({
          sublistId: 'line',
          fieldId: 'custcol_sps_cx_netpaidamt',
          line: i
        });


        let lineId = loadSpsRecord.getSublistValue({
          sublistId: 'line',
          fieldId: 'line',
          line: i
        });

        let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
          sublistId: 'line',
          fieldId: 'custcol_gbs_ispaymentcreate',
          line: i
        });

        let adjustAmt = loadSpsRecord.getSublistValue({
          sublistId: 'line',
          fieldId: 'custcol_sps_cx_adjamount',
          line: i
        });

        let microfilm = loadSpsRecord.getSublistValue({
          sublistId: 'line',
          fieldId: 'custcol_sps_cx_microfilmnum',
          line: i
        });

        let referenceNum = loadSpsRecord.getValue({
          sublistId: 'line',
          fieldId: 'custbody_sps_cx_refnum',
          line: i
        });

        let datesps = loadSpsRecord.getValue({
          sublistId: 'line',
          fieldId: 'trandate',
          line: i
        });


        // log.debug('invoicenumber + netPaidAmt + lineId + paymentCreateCheckbox',invoiceNumber + netPaidAmt + lineId + paymentCreateCheckbox)

        return {
          invoiceNumber,
          netPaidAmt,
          lineId,
          paymentCreateCheckbox,
          adjustAmt,
          microfilm,
          referenceNum,
          datesps,
          remittanceDisc
        }
      }
      catch (e) {
        log.error('error in setCheckboxValueOnSps', e.toString());
      }
    }


    /**
* function is use to get invoice search values from searchResultInv search
* @param {Array} searchResultInv - get all invoice search result data
* @param {number} i - position of element in array
* @since 2015.2
*/
    function getInvoiceSearchFields(searchResultInv, i) {
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
      }
      catch (e) {
        log.error('error in setCheckboxValueOnSps', e.toString());
      }
    }

    /**
     * function is use to search all records with range
     * @param {Array} resultset - pass search 
     * @since 2015.2
     */
    function searchAll(resultset) {
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
    function _logValidation(value) {
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

  });
