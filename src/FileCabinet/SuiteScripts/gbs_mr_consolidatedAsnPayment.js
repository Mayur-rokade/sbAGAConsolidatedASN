/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */

// BEGIN SCRIPT DESCRIPTION BLOCK ==================================
{
  /*
  Script Name: gbs_mr_consolidatedAsnPayment
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

define([
  'N/record',
  'N/runtime',
  'N/search',
  'N/email',
  'N/runtime',
  'N/url'
], function (record, runtime, search, email, runtime, url) {
  /**
   * @date 2022-08-23
   * @description - Gets all the [SPS] 820 Payment Order Custom Records and the Document Numbers for Invoices and
   * creates payment order for them
   * @returns {invoices} - Invoices to create payment order for does not return Invoices which are already paid in full.
   */
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
          ['internalid', 'anyof', '1387566'],
          'AND',
          ['custcol_gbs_ispaymentcreate', 'is', 'F']
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
      log.debug('searchresultlenght',searchResultSpsLength)

      let invoiceNumberArr = []

      for (let i = 0; i < searchResultSpsLength; i++) {
        var {
          invoiceNumber,
          originalAmt,
          discAmountTaken,
          adjAmount,
          netPaidAmt,
          internalidSps,
          lineId
        } = getSpsSearchFields(searchResultSps, i)

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

        var searchResultInv = searchAll(invoiceSearch.run())

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

        
        }
      }

      log.debug('finalsearchresult',finalSearchResults)
      return finalSearchResults
    } catch (e) {
      log.error('Error in getinputdata', e.toString())
    }
  }

  /**
   * @date 2022-08-23
   * @description - Map function creates payment record for the relative invoice record from the SPS Custom Record
   * @param {object} mapContext - Invoices from the SPS Record with respect to the invoice number on SPS record
   * @returns {payment Internal ID} - Created payment record Internal ID
   */
  function map (mapContext) {
    try {
      var mapContextParse = JSON.parse(mapContext.value)

      let invoiceId = mapContextParse.internalid

      let customerInv = mapContextParse.customerId

      let spsPaidAmount = mapContextParse.netPaidAmt

      let invoiceNumber = mapContextParse.invoiceNumber
      let status = mapContextParse.status

      if (status === 'paidInFull') {
        mapContext.write({
          key: mapContextParse.internalidSps,
          value: {
            lineId: mapContextParse.lineId,
            bool: true,
            invoiceNumber: mapContextParse.invoiceNumber,
            alreadyCreated: true
          }
        })
      } else if (
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
              `Payment record created for SPS Record --> ${mapContextParse.internalidSps}`,
              `Invoice Number ${invoiceNumber} --> Payment Record ${payment_id}`
            )

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
          log.audit(
            `No valid payment record found for SPS Record --> ${mapContextParse.internalidSps}`,
            `Invoice Number ${invoiceNumber}`
          )

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

  /**
   * @date 2022-08-23
   * @description - Update [SPS] 820 Payment Order line whether the payment record was created or not for the given
   * document number on [SPS] 820 Payment Order
   * @param {object} reduceContext
   */
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

      log.debug('SPS Record with Internal ID updated --->', spsRecId)

      reduceContext.write({
        key: spsRecId,
        value: spsInvDocNum
      })
    } catch (e) {
      log.error('Error in reduce', e.toString())
    }
  }

  /**
   * @date 2022-08-23
   * @param {summary} context
   * @returns {email} - Send email to the user who has executed the script
   */
  function summarize (context) {
    try {
      let body = `Dear User, 

                     [SPS] 820 Payment Order Custom Record has been Processed with following payment records created. 
                     Please click on the link to navigate to the payment record.
                     
                     `

      var accountID = runtime.accountId
      var resolvedDomain = url.resolveDomain({
        hostType: url.HostType.APPLICATION,
        accountId: accountID
      })
      resolvedDomain = 'https://' + '' + resolvedDomain
      log.debug('context',context);
      log.debug('context output',context.output);
      context.output.iterator().each(function (key, value) {
        log.debug('key', key)
        log.debug('value', value)
        value = JSON.parse(value)
        for (const iterator of value) {
          //log.debug('alreadyCreated', iterator.alreadyCreated)
          if (iterator.alreadyCreated == 'true' || iterator.alreadyCreated == true) {
            body += `Payment already created for invoice number ${iterator.invoiceNumber} \n`
          } else {
            var paymentUrl = url.resolveRecord({
              recordType: 'customerpayment',
              recordId: iterator.payment_id,
              isEditMode: false
            }) 
            body += `Payment record created with Internal ID ${
              iterator.payment_id
            } for SPS Record ${key} with Document Number ${
              iterator.invoiceNumber
            }: ${resolvedDomain + paymentUrl} \n`
            //log.debug('iterator', iterator)
            // record.delete({
            //   type: 'customerpayment',
            //   id: iterator.payment_id
            // })
          }
        }

        email.send({
          author: 2362,
          body: body,
          recipients: 2362,
          subject: `[SPS] 820 Payment Order Custom Record Processed Details`
        });
        return true
      })
    } catch (error) {
      log.error('error in summarize', error)
    }
  }

  /**
   * @date 2022-08-23
   * @param {JSON String} reduceContext - string JSON Array
   * @returns {Parsed String} - Parsed Object
   */
  function parseReducedRecords (reduceContext) {
    let reduceContextParse = []
    for (let j = 0; j < reduceContext.values.length; j++) {
      let parsedObject = JSON.parse(reduceContext.values[j])

      reduceContextParse.push(parsedObject)
    }

    return reduceContextParse
  }

  function getInvoiceSearchFields (searchResultInv, i) {
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

  function getSpsSearchFields (searchResultSps, i) {
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
    return {
      invoiceNumber,
      originalAmt,
      discAmountTaken,
      adjAmount,
      netPaidAmt,
      internalidSps,
      lineId
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
    reduce: reduce,
    summarize: summarize
  }
})
