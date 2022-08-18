/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/format', 'N/record', 'N/redirect', 'N/runtime', 'N/search'], /**
 * @param{format} format
 * @param{record} record
 * @param{redirect} redirect
 * @param{runtime} runtime
 * @param{search} search
 */
function (format, record, redirect, runtime, search) {
  function getInputData () {
    try {
      var finalSearchResults = []

      var transactionSearchObj = search.create({
        type: 'transaction',
        filters: [
          ['type', 'anyof', 'Custom101'],
          'AND',
          ['mainline', 'is', 'F'],
          'AND',
          ['internalid', 'anyof', '1387969', '1387566']
        ],
        columns: [
          search.createColumn({
            name: 'custcol_sps_cx_invoicenumber',
            label: 'SPS CX Invoice Number'
          }),
          search.createColumn({
            name: 'custcol_sps_cx_originalamt',
            label: 'SPS CX Amount (Pre-Discount)'
          }),
          search.createColumn({
            name: 'custcol_sps_cx_disc_amounttaken',
            label: 'SPS CX Remittance Discount'
          }),
          search.createColumn({
            name: 'custcol_sps_cx_adjamount',
            label: 'SPS CX Adjustment Amount'
          }),
          search.createColumn({
            name: 'custcol_sps_cx_netpaidamt',
            label: 'SPS CX Net Paid Amount'
          }),
          search.createColumn({ name: 'internalid', label: 'Internal ID' })
        ]
      })

      var searchResultSps = searchAll(transactionSearchObj.run())

      // log.debug('searchResultSps', searchResultSps);

      var searchResultSpsLength = searchResultSps.length

      let invoiceNumberArr = []

      for (let i = 0; i < searchResultSpsLength; i++) {
        var invoiceNumber = searchResultSps[i].getValue({
          name: 'custcol_sps_cx_invoicenumber',
          label: 'SPS CX Invoice Number'
        })
        var originalAmt = searchResultSps[i].getValue({
          name: 'custcol_sps_cx_originalamt',
          label: 'SPS CX Amount (Pre-Discount)'
        })
        var discAmountTaken = searchResultSps[i].getValue({
          name: 'custcol_sps_cx_disc_amounttaken',
          label: 'SPS CX Remittance Discount'
        })
        var adjAmount = searchResultSps[i].getValue({
          name: 'custcol_sps_cx_adjamount',
          label: 'SPS CX Adjustment Amount'
        })
        var netPaidAmt = searchResultSps[i].getValue({
          name: 'custcol_sps_cx_netpaidamt',
          label: 'SPS CX Net Paid Amount'
        })
        var internalidSps = searchResultSps[i].getValue({
          name: 'internalid',
          label: 'Internal ID'
        })

        finalSearchResults.push({
          lineNumber: i,
          invoiceNumber: invoiceNumber,
          originalAmt: originalAmt,
          discAmountTaken: discAmountTaken,
          adjAmount: adjAmount,
          netPaidAmt: netPaidAmt,
          internalidSps: internalidSps
        })

        invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')
      }
      invoiceNumberArr.pop()

      log.debug('finalSearchResults', finalSearchResults)

      var invoiceSearch = search.create({
        type: 'invoice',
        filters: [
          ['type', 'anyof', 'CustInvc'],
          'AND',
          invoiceNumberArr,
          'AND',
          ['mainline', 'is', 'T']
        ],
        columns: [
          search.createColumn({ name: 'tranid', label: 'Document Number' }),
          search.createColumn({ name: 'entity', label: 'Name' }),
          search.createColumn({ name: 'internalid', label: 'Internal ID' }),
          search.createColumn({
            name: 'transactionname',
            label: 'Transaction Name'
          })
        ]
      })

      var searchResultInv = searchAll(invoiceSearch.run())
      // log.debug("searchResultInv", searchResultInv)

      var finalInvResults = []

      let invoiceResultLength = searchResultInv.length

      for (let i = 0; i < invoiceResultLength; i++) {
        let tranid = searchResultInv[i].getValue({
          name: 'tranid',
          label: 'Document Number'
        })

        finalSearchResults.forEach(invNum => {
          if (invNum.invoiceNumber === tranid) {
            finalInvResults.push({
              tranid: searchResultInv[i].getValue({
                name: 'tranid',
                label: 'Document Number'
              }),
              customer: searchResultInv[i].getValue({
                name: 'entity',
                label: 'Name'
              }),
              internalid: searchResultInv[i].getValue({
                name: 'internalid',
                label: 'Internal ID'
              }),
              transactionname: searchResultInv[i].getValue({
                name: 'transactionname',
                label: 'Transaction Name'
              }),
              finalSearchResults: finalSearchResults
            })
          }
        })
      }

      log.debug('finalInvResults', finalInvResults)

      return finalInvResults
    } catch (e) {
      log.error('Error in getinputdata', e.toString())
    }
  }

  function map (mapContext) {
    try {
      var mapContextParse = JSON.parse(mapContext.value)
      log.debug('mapContextParse', mapContextParse)

      // let invoiceId = mapContextParse.internalid;
      // log.debug('invoiceId', invoiceId);

      // let customerInv = mapContextParse.customer;
      // log.debug('customerInv', customerInv);

      // let spsPaidAmount = mapContextParse.netPaidAmt;
      // log.debug('spsPaidAmount', spsPaidAmount);

      // let invoiceNumber = mapContextParse.invoiceNumber;
      // log.debug('invoiceNumber', invoiceNumber);

      // if (_logValidation(invoiceId) || _logValidation(customerInv) && _logValidation(spsPaidAmount) || _logValidation(invoiceNumber)) {

      //     var customerPayment = record.transform({
      //         fromType: 'invoice',
      //         fromId: invoiceId,
      //         toType: 'customerPayment',
      //         isDynamic: true
      //     });
      //     log.debug('customerPayment', customerPayment);

      //     customerPayment.setValue({
      //         fieldId: 'customer',
      //         value: customerInv
      //     });

      //     customerPayment.setValue({
      //         fieldId: 'payment',
      //         value: spsPaidAmount
      //     });

      //     let applyLineCount = customerPayment.getLineCount({ sublistId: 'apply' });
      //     log.debug('applyLineCount', applyLineCount);

      //     for (let i = 0; i < applyLineCount; i++) {

      //         let refNum = customerPayment.getSublistValue({ sublistId: 'apply', fieldId: 'refnum', line: i });

      //         if (refNum == invoiceNumber) {

      //             customerPayment.selectLine({ sublistId: 'apply', line: i });

      //             customerPayment.setCurrentSublistValue({sublistId: 'apply', fieldId: 'apply', value: true });

      //             customerPayment.setCurrentSublistValue({ sublistId: 'apply', fieldId: 'amount', value: spsPaidAmount });

      //             customerPayment.commitLine({ sublistId: 'apply' });

      //             var payment_id = customerPayment.save({
      //                 enableSourcing: true,
      //                 ignoreMandatoryFields: true
      //             });

      //             log.debug('payment_id', payment_id);

      //             break;
      //         }
      //     }
      // }
    } catch (e) {
      log.error('Error in map', e.toString())
    }
  }

  function reduce (reduceContext) {}

  function summarize (summaryContext) {}

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
      //log.debug({title: '199',details: allResults});

      var pagedResultsCount = pagedResults != null ? pagedResults.length : 0
      startIndex += pagedResultsCount

      var remainingUsage = runtime.getCurrentScript().getRemainingUsage()
      // log.debug({ title: "207", details: remainingUsage });
    } while (pagedResultsCount == RANGECOUNT)

    var remainingUsage = runtime.getCurrentScript().getRemainingUsage()
    // log.debug({ title: "213", details: remainingUsage });

    return allResults
  }

  return {
    getInputData: getInputData,
    map: map
    // reduce: reduce,
    // summarize: summarize
  }
})
