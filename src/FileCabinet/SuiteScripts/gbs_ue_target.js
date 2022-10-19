/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define([], function () {
  function afterSubmit (context) {
    var loadSpsRecordContext = scriptContext.newRecord
    var internalidSps = loadSpsRecordContext.id
    var finalSearchResults = []
    var invoiceNumberArr = []

    var loadSpsRecord = record.load({
      type: 'customtransaction_sps_cx_820_basic',
      id: internalidSps
    })

    var spsTradingPartnerId = loadSpsRecord.getValue({
      fieldId: 'custbody_sps_cx_tpid'
    })

    if (
      _logValidation(spsTradingPartnerId) &&
      spsTradingPartnerId === '177282' &&
      spsTradingPartnerId === 177282
    ) {
      let getLineCountSps = loadSpsRecord.getLineCount({
        sublistId: 'line'
      })

      var spsreferenceNum = loadSpsRecord.getValue({
        fieldId: 'custbody_sps_cx_refnum'
      })

      var spsdatesps = loadSpsRecord.getValue({
        fieldId: 'trandate'
      })

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
            preDiscAmt: preDiscAmt
          })
          // log.debug('finalsearchresult',finalSearchResults)

          //push criteria of invoice number into invoiceNumberArr
          invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')
        }
        //condition for check isCreatedPayment line level checkbox is false and adjustment amount is not blank then push check related data to array
        else if (paymentCreateCheckbox == false && _logValidation(adjustAmt)) {
          finalSearchResults.push({
            lineNo: i,
            lineId: lineId,
            internalidSps: internalidSps,
            adjustAmt: adjustAmt,
            microfilm: microfilm,
            remittanceDisc: remittanceDisc
          })
        }
      }

      invoiceNumberArr.pop()

      var custPaymentCheckJE

      if (invoiceNumberArr.length != 0) {
        let searchResultInv = invoiceSearch(invoiceNumberArr)

        let invoiceResultLength = searchResultInv.length

        for (let i = 0; i < invoiceResultLength; i++) {
          let {
            tranid,
            customer,
            internalid,
            transactionname,
            status
          } = getInvoiceSearchFields(searchResultInv, i)

          custPaymentCheckJE = customer

          let fileterRes = finalSearchResults.filter(
            x => x.invoiceNumber === tranid
          )

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

      if (_logValidation(finalSearchResults)) {
        let finalSearchResultsLength = finalSearchResults.length
        
            /***************************************** check ******************************************************/

        var createCheck = record.create({
          type: 'check',
          isDynamic: true
        })

        createCheck.setValue({
          fieldId: 'entity',
          value: targetCust
        })

        createCheck.setValue({
          fieldId: 'account',
          value: targetAccount
        })

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

            /***************************************** payment ******************************************************/


        let invoiceToPayment = record.create({
          type: 'customerpayment',
          isDynamic: true
        })

        invoiceToPayment.setValue({
          fieldId: 'customer',
          value: targetCust
        })

        invoiceToPayment.setValue({
          fieldId: 'account',
          value: targetAccount
        })

        invoiceToPayment.setValue({
          fieldId: 'custbody_gbs_payment_order',
          value: internalidSps
        })

        if (_logValidation(spsreferenceNum)) {
          invoiceToPayment.setValue({
            fieldId: 'memo',
            value: spsreferenceNum
          })
        }

        if (_logValidation(spsdatesps)) {
            invoiceToPayment.setValue({
              fieldId: 'trandate',
              value: spsdatesps
            });
          }
      }
    }
  }

  return {
    afterSubmit: afterSubmit
  }
})
