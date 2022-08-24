/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */

// BEGIN SCRIPT DESCRIPTION BLOCK ==================================
{
  /*
  Script Name: gbs_ue_consolidatedAsnPayment
  Author: Palavi Rajgude
  Description: Create Payment records from [SPS] 820 Payment Order custom Record
  Company: Green Business System 
  Date: 23-08-2022
  Script Modification Log:
  -- version--   -- Date --   -- Modified By --   --Requested By--    -- Description --
       1.0       23-08-2022     Palavi Rajgude      Albert Grazi               
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

        var loadSpsRecord = scriptContext.newRecord;
        var getSpsRecId = loadSpsRecord.id;
     
        var finalSearchResults = []

        //get sps payment order search result
        var searchResultSps = spsSearch(getSpsRecId);

        if(_logValidation(searchResultSps))
        {
        let searchResultSpsLength = searchResultSps.length

        var invoiceNumberArr = []
        
        //iterate on length of sps search result
        for (let i = 0; i < searchResultSpsLength; i++) {

          //get all fields data from getSpsSearchFields() function
          var {
            invoiceNumber,
            // originalAmt,
            // discAmountTaken,
            // adjAmount,
            netPaidAmt,
            internalidSps,
            lineId
          } = getSpsSearchFields(searchResultSps, i)

          //push all line level data of invoice number and net paid ammount in finalSearchResults array
          finalSearchResults.push({
            lineNo: i,
            invoiceNumber: invoiceNumber,
            // originalAmt: originalAmt,
            // discAmountTaken: discAmountTaken,
            // adjAmount: adjAmount,
            netPaidAmt: netPaidAmt,
            internalidSps: internalidSps,
            lineId: lineId
          })

          //condition for if length of result is greater than 1 then add or condition
          if (i !== searchResultSpsLength - 1) {
            invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')
          } else {
            invoiceNumberArr.push(['numbertext', 'is', invoiceNumber])
          }
        }

        if (invoiceNumberArr.length != 0) {

          var searchResultInv = invoiceSearch(invoiceNumberArr);

          let invoiceResultLength = searchResultInv.length

          for (let i = 0; i < invoiceResultLength; i++) {
            var {
              tranid,
              customer,
              internalid,
              transactionname,
              status
            } = getInvoiceSearchFields(searchResultInv, i)
            //log.debug('status', status)

            var fileterRes = finalSearchResults.filter(
              x => x.invoiceNumber === tranid
            )

            for (const iterator of fileterRes) {
              let obj = finalSearchResults[iterator.lineNo]

              obj.invoiceId = tranid
              obj.customerId = customer
              obj.internalid = internalid
              obj.transactionname = transactionname
              obj.status = status
              finalSearchResults[iterator.lineNo] = obj
            }
          }
        }

        // log.debug('finalSearchResults', finalSearchResults)

        var finalSearchResultsLength = finalSearchResults.length;

        var checkboxValueArr = [];

        for (let i = 0; i < finalSearchResultsLength; i++) {

          let { status, internalidSps, lineId, invoiceNumber, invoiceId, customerInv, spsPaidAmount } = getInvoiceSpsValue(finalSearchResults, i);

          if (status === 'paidInFull') {

            checkboxValueArr.push({
              key: internalidSps,
              lineId: lineId,
              bool: true,
              invoiceNumber: invoiceNumber,
              alreadyCreated: true
            })
          }
          else if (
            _logValidation(invoiceId) &&
            _logValidation(customerInv) &&
            _logValidation(spsPaidAmount) &&
            _logValidation(invoiceNumber)
          ) {
            var objRecord3 = record.transform({
              fromType: record.Type.INVOICE,
              fromId: invoiceId,
              toType: record.Type.CUSTOMER_PAYMENT,
              isDynamic: false
            })

            let lineNo = objRecord3.findSublistLineWithValue({
              sublistId: 'apply',
              fieldId: 'refnum',
              value: invoiceNumber
            })

            log.debug(`Line found for ${invoiceId} on payment transform`, lineNo)

            if (lineNo != -1) {
              objRecord3.setValue({
                fieldId: 'payment',
                value: spsPaidAmount
              })

              objRecord3.setSublistValue({
                sublistId: 'apply',
                fieldId: 'apply',
                line: lineNo,
                value: true
              })

              objRecord3.setSublistValue({
                sublistId: 'apply',
                fieldId: 'amount',
                line: lineNo,
                value: spsPaidAmount
              })

              var payment_id = objRecord3.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
              })
              //log.debug('payment_id', payment_id)

              if (_logValidation(payment_id)) {
                log.audit(
                  `Payment record created for SPS Record --> ${internalidSps}`,
                  `Invoice Number ${invoiceNumber} --> Payment Record ${payment_id}`
                )

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
          else {
            log.audit(
              `No valid payment record found for SPS Record --> ${internalidSps}`,
              `Invoice Number ${invoiceNumber}`
            )

            checkboxValueArr.push({
              key: internalidSps,
              lineId: lineId,
              bool: true,
              invoiceNumber: invoiceNumber,
              payment_id: payment_id

            })
          }

        }

        // log.debug('checkboxarr', checkboxValueArr);

        var loadSpsRecord = setCheckboxValueOnSps(loadSpsRecord, getSpsRecId, checkboxValueArr);

        // log.debug('SPS Record with Internal ID updated --->', getSpsRecId)

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


    function setCheckboxValueOnSps(loadSpsRecord, getSpsRecId, checkboxValueArr) {

      var loadSpsRecord = record.load({
        type: 'customtransaction_sps_cx_820_basic',
        id: getSpsRecId
      });

      let spsInvDocNumLength = checkboxValueArr.length;

      for (let i = 0; i < spsInvDocNumLength; i++) {

        if(_logValidation(checkboxValueArr[i].payment_id || _logValidation(checkboxValueArr[i].alreadyCreated)))
        {
        let spsInvDocNumVal = checkboxValueArr[i].lineId;

        var lineNumber = loadSpsRecord.findSublistLineWithValue({
          sublistId: 'line',
          fieldId: 'line',
          value: spsInvDocNumVal
        });

        loadSpsRecord.setSublistValue({
          sublistId: 'line',
          fieldId: 'custcol_gbs_ispaymentcreate',
          value: checkboxValueArr[i].bool,
          line: lineNumber
        });
      }
      }

      var spsRecId = loadSpsRecord.save({
        enableSourcing: true,
        ignoreMandatoryFields: true
      });
      return loadSpsRecord;
    }

    function sendPaymentRecordMail(checkboxValueArr) {

      let body = `Dear User, 

                      [SPS] 820 Payment Order Custom Record has been Processed with following payment records created. 
                      Please click on the link to navigate to the payment record.
                      
                      `;

      var accountID = runtime.accountId;
      var resolvedDomain = url.resolveDomain({
        hostType: url.HostType.APPLICATION,
        accountId: accountID
      });
      resolvedDomain = 'https://' + '' + resolvedDomain;

      var value = checkboxValueArr;
      // log.debug('value', value);

      for (const iterator of value) {
        //log.debug('alreadyCreated', iterator.alreadyCreated)
        if(_logValidation(iterator.alreadyCreated) || _logValidation(iterator.payment_id))
        {
        if (iterator.alreadyCreated == 'true' || iterator.alreadyCreated == true) {
          body += `Payment already created for invoice number ${iterator.invoiceNumber} \n`;
        }
        else {
          var paymentUrl = url.resolveRecord({
            recordType: 'customerpayment',
            recordId: iterator.payment_id,
            isEditMode: false
          });
          body += `Payment record created with Internal ID ${iterator.payment_id} for SPS Record ${iterator.key} with Document Number ${iterator.invoiceNumber}: ${resolvedDomain + paymentUrl} \n`;
          //log.debug('iterator', iterator)
          // record.delete({
          //   type: 'customerpayment',
          //   id: iterator.payment_id
          // })
        }
      }
      }

      email.send({
        author: 2362,
        body: body,
        recipients: 2362,
        subject: `[SPS] 820 Payment Order Custom Record Processed Details`
      });
    }

    function getInvoiceSpsValue(finalSearchResults, i) {

      var invoiceId = finalSearchResults[i].internalid;

      var customerInv = finalSearchResults[i].customerId;

      var spsPaidAmount = finalSearchResults[i].netPaidAmt;

      var invoiceNumber = finalSearchResults[i].invoiceNumber;

      var status = finalSearchResults[i].status;

      var internalidSps = finalSearchResults[i].internalidSps;

      var lineId = finalSearchResults[i].lineId;

      return { status, internalidSps, lineId, invoiceNumber, invoiceId, customerInv, spsPaidAmount };
    }

    function invoiceSearch(invoiceNumberArr) {
      var invoiceSearch = search.create({
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

      var searchResultInv = searchAll(invoiceSearch.run());
      return searchResultInv;
    }

    function spsSearch(getSpsRecId) {

      var transactionSearchObj = search.create({
        type: 'transaction',
        filters: [
          ['type', 'anyof', 'Custom101'],
          'AND',
          ['mainline', 'is', 'F'],
          'AND',
          ['internalid', 'anyof', getSpsRecId],
          'AND',
          ['custcol_gbs_ispaymentcreate', 'is', 'F'],
          'AND',
          ["custcol_sps_cx_invoicenumber","isnotempty",""], 
          "AND", 
          ["custcol_sps_cx_netpaidamt","isnotempty",""]
        ],
        columns: [
          search.createColumn({
            name: 'custcol_sps_cx_invoicenumber',
            label: 'SPS CX Invoice Number'
          }),
          // search.createColumn({
          //   name: 'custcol_sps_cx_originalamt',
          //   label: 'SPS CX Amount (Pre-Discount)'
          // }),
          // search.createColumn({
          //   name: 'custcol_sps_cx_disc_amounttaken',
          //   label: 'SPS CX Remittance Discount'
          // }),
          // search.createColumn({
          //   name: 'custcol_sps_cx_adjamount',
          //   label: 'SPS CX Adjustment Amount'
          // }),
          search.createColumn({
            name: 'custcol_sps_cx_netpaidamt',
            label: 'SPS CX Net Paid Amount'
          }),
          search.createColumn({ name: 'internalid', label: 'Internal ID' }),
          search.createColumn({ name: 'line', label: 'Line ID' })
        ]
      });

      var searchResultSps = searchAll(transactionSearchObj.run());

      return searchResultSps;

    }

    function getSpsSearchFields(searchResultSps, i) {

      var invoiceNumber = searchResultSps[i].getValue({
        name: 'custcol_sps_cx_invoicenumber',
        label: 'SPS CX Invoice Number'
      })
      // var originalAmt = searchResultSps[i].getValue({
      //   name: 'custcol_sps_cx_originalamt',
      //   label: 'SPS CX Amount (Pre-Discount)'
      // })
      // var discAmountTaken = searchResultSps[i].getValue({
      //   name: 'custcol_sps_cx_disc_amounttaken',
      //   label: 'SPS CX Remittance Discount'
      // })
      // var adjAmount = searchResultSps[i].getValue({
      //   name: 'custcol_sps_cx_adjamount',
      //   label: 'SPS CX Adjustment Amount'
      // })
      var netPaidAmt = searchResultSps[i].getValue({
        name: 'custcol_sps_cx_netpaidamt',
        label: 'SPS CX Net Paid Amount'
      })
      var internalidSps = searchResultSps[i].getValue({
        name: 'internalid',
        label: 'Internal ID'
      })

      var lineId = searchResultSps[i].getValue({
        name: 'line',
        label: 'Line ID'
      })
      return {
        invoiceNumber,
        // originalAmt,
        // discAmountTaken,
        // adjAmount,
        netPaidAmt,
        internalidSps,
        lineId
      }
    }

    function getInvoiceSearchFields(searchResultInv, i) {
      var tranid = searchResultInv[i].getValue({
        name: 'tranid',
        label: 'Document Number'
      })
      var customer = searchResultInv[i].getValue({
        name: 'entity',
        label: 'Name'
      })
      var internalid = searchResultInv[i].getValue({
        name: 'internalid',
        label: 'Internal ID'
      })
      var transactionname = searchResultInv[i].getValue({
        name: 'transactionname',
        label: 'Transaction Name'
      })
      var status = searchResultInv[i].getValue({
        name: 'statusref',
        label: 'Status'
      })
      return { tranid, customer, internalid, transactionname, status }
    }

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
