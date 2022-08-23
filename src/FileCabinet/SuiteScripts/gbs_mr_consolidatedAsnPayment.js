/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define([
  'N/format',
  'N/record',
  'N/redirect',
  'N/runtime',
  'N/search',
  'N/file'
], /**
 * @param{format} format
 * @param{record} record
 * @param{redirect} redirect
 * @param{runtime} runtime
 * @param{search} search
 */ function (format, record, redirect, runtime, search, file) {
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
          ['internalid', 'anyof', '1387566']
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
          search.createColumn({ name: 'internalid', label: 'Internal ID' }),
          search.createColumn({ name: 'line', label: 'Line ID' })
        ]
      })

      var searchResultSps = searchAll(transactionSearchObj.run())

      var searchResultSpsLength = searchResultSps.length

      let invoiceNumberArr = []

      for (let i = 0; i < searchResultSpsLength; i++) {
        var { invoiceNumber, originalAmt, discAmountTaken, adjAmount, netPaidAmt, internalidSps, lineId } = getSpsSearchFields(searchResultSps, i)

        finalSearchResults.push({
          lineNo: i,
          invoiceNumber: invoiceNumber,
          originalAmt: originalAmt,
          discAmountTaken: discAmountTaken,
          adjAmount: adjAmount,
          netPaidAmt: netPaidAmt,
          internalidSps: internalidSps,
          lineId: lineId
        })

        if (i !== searchResultSpsLength - 1) {
          invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')
        } else {
          invoiceNumberArr.push(['numbertext', 'is', invoiceNumber])
        }
      }

      if (invoiceNumberArr.length != 0) {
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

        let invoiceResultLength = searchResultInv.length

        for (let i = 0; i < invoiceResultLength; i++) {
          var { tranid, customer, internalid, transactionname } = getInvoiceSearchFields(searchResultInv, i)

          var fileterRes = finalSearchResults.filter(
            x => x.invoiceNumber === tranid
          )

          for (const iterator of fileterRes) {
            let obj = finalSearchResults[iterator.lineNo]

            obj.invoiceId = tranid
            obj.customerId = customer
            obj.internalid = internalid
            obj.transactionname = transactionname

            finalSearchResults[iterator.lineNo] = obj
          }
        }
      }

      return finalSearchResults
    } catch (e) {
      log.error('Error in getinputdata', e.toString())
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
     return { tranid, customer, internalid, transactionname }
   }

   function getSpsSearchFields(searchResultSps, i) {
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

     var lineId = searchResultSps[i].getValue({
       name: 'line',
       label: 'Line ID'
     })
     return { invoiceNumber, originalAmt, discAmountTaken, adjAmount, netPaidAmt, internalidSps, lineId }
   }

  function map (mapContext) {
    try {
      var mapContextParse = JSON.parse(mapContext.value)

      let invoiceId = mapContextParse.internalid

      let customerInv = mapContextParse.customerId

      let spsPaidAmount = mapContextParse.netPaidAmt

      let invoiceNumber = mapContextParse.invoiceNumber
      log.debug('invoiceNumber', invoiceNumber)

      if (
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
        log.debug('lineNo', lineNo)

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

          var payment_id = objRecord3.save({
            enableSourcing: true,
            ignoreMandatoryFields: true
          })
          log.debug('payment_id', payment_id)

          if (_logValidation(payment_id)) {
            mapContext.write({
              key: mapContextParse.internalidSps,
              value: {
                lineId: mapContextParse.lineId,
                bool: true,
                invoiceNumber: mapContextParse.invoiceNumber,
                payment_id: payment_id
              }
            })
          }
        } else {
            mapContext.write({
              key: mapContextParse.internalidSps,
              value: {
                lineId: mapContextParse.lineId,
                bool: false,
                invoiceNumber: mapContextParse.invoiceNumber,
                payment_id: payment_id
              }
            })
        }
      }
    } catch (e) {
      log.error('Error in map', e.toString())
    }
  }

  function reduce (reduceContext) {
    try {
      var spsRecId = reduceContext.key
      var spsInvDocNum = parseReducedRecords(reduceContext)

      var loadSpsRecord = record.load({
        type: 'customtransaction_sps_cx_820_basic',
        id: spsRecId
      })

      let spsInvDocNumLength = spsInvDocNum.length

      for (let i = 0; i < spsInvDocNumLength; i++) {
        let spsInvDocNumVal = spsInvDocNum[i].lineId

        var lineNumber = loadSpsRecord.findSublistLineWithValue({
          sublistId: 'line',
          fieldId: 'line',
          value: spsInvDocNumVal
        })

        // let getCheckboxVal = loadSpsRecord.getSublistValue({
        //   sublistId: 'line',
        //   fieldId: 'custcol_gbs_ispaymentcreate',
        //   line: lineNumber
        // })

        //if (getCheckboxVal == false) {
          loadSpsRecord.setSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_gbs_ispaymentcreate',
            value: spsInvDocNum[i].bool,
            line: lineNumber
          })
        //}
      }

      var spsRecId = loadSpsRecord.save({
        enableSourcing: true,
        ignoreMandatoryFields: true
      })

      reduceContext.write({
        key: spsRecId,
        value: spsInvDocNum
      })
    } catch (e) {
      log.error('Error in reduce', e.toString())
    }
  }

  function parseReducedRecords (reduceContext) {
    let reduceContextParse = []
    for (let j = 0; j < reduceContext.values.length; j++) {
      let parsedObject = JSON.parse(reduceContext.values[j])

      reduceContextParse.push(parsedObject)
    }

    return reduceContextParse
  }

  function summarize (context) {
    try {
      context.output.iterator().each(function (key, value) {
        log.debug('key', key)
        log.debug('value', value)
        value = JSON.parse(value)
        for (const iterator of value) {
          log.debug('iterator', iterator)
          record.delete({
            type: 'customerpayment',
            id: iterator.payment_id
          })
        }
        return true
      })
    } catch (error) {
      log.error('error in summarize', error)
    }
  }

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

      var pagedResultsCount = pagedResults != null ? pagedResults.length : 0
      startIndex += pagedResultsCount

      var remainingUsage = runtime.getCurrentScript().getRemainingUsage()
    } while (pagedResultsCount == RANGECOUNT)

    var remainingUsage = runtime.getCurrentScript().getRemainingUsage()

    return allResults
  }

  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce
  }
})
