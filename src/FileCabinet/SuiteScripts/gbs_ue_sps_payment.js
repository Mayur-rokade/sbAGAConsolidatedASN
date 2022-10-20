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

define(['N/email', 'N/record', 'N/runtime', 'N/search', 'N/url'], function (
  email,
  record,
  runtime,
  search,
  url
) {
  function afterSubmit (scriptContext) {
    try {
      var loadSpsRecordContext = scriptContext.newRecord
      var internalidSps = loadSpsRecordContext.id
      var invoiceNumberArr = []
      var checkDataObjArr = []
      var paymentObj = {}

      var loadSpsRecord = record.load({
        type: 'customtransaction_sps_cx_820_basic',
        id: internalidSps
      })

      var spsTradingPartnerId = loadSpsRecord.getValue({
        fieldId: 'custbody_sps_cx_tpid'
      })

      var spsreferenceNum = loadSpsRecord.getValue({
        fieldId: 'custbody_sps_cx_refnum'
      })

      var spsdatesps = loadSpsRecord.getValue({
        fieldId: 'trandate'
      })

      let getLineCountSps = loadSpsRecord.getLineCount({
        sublistId: 'line'
      })

      let totalTranAmt = loadSpsRecord.getValue({
        fieldId: 'custbody_sps_cx_amount'
      })

      let checkCreated = loadSpsRecord.getValue({
        fieldId: 'custbody_gbs_check_created'
      })

      log.debug('totalTranAmt', totalTranAmt)
      if (_logValidation(totalTranAmt)) {
        totalTranAmt = Math.abs(totalTranAmt)
      }

      //LOWE,TARGET, WALMART, MACY, HD
      if (spsTradingPartnerId === 548 || spsTradingPartnerId === '548') {
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_invoicenumber',
            line: i
          })

          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_gbs_ispaymentcreate',
            line: i
          })

          if (_logValidation(invoiceNumber)) {
            let checkInt = isNumber(invoiceNumber)

            if (checkInt == true) {
              invoiceNumber = invoiceNumber.toString()
              invoiceNumber = Number(invoiceNumber).toString()
            }
          }

          let memo = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            line: i
          })

          let adjustAmt = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_adjamount',
            line: i
          })

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

          let purchaseOrNumber = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_purchaseordernumber',
            line: i
          })

          //CHECK DATA
          if (
            adjustAmt < 0 &&
            !paymentCreateCheckbox &&
            adjustAmt &&
            (purchaseOrNumber == null || purchaseOrNumber === 'NOT REQU')
          ) {
            checkDataObjArr.push({
              memo: microfilm,
              adjustAmt: adjustAmt,
              invoiceNumber: invoiceNumber,
              microfilm: microfilm
            })

            loadSpsRecord.setSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_gbs_ispaymentcreate',
              line: i,
              value: true
            })
          }

          //PAYMENT DATA
          if (!!invoiceNumber && paymentCreateCheckbox == false) {
            invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')
            paymentObj[invoiceNumber] = {
              netPaidAmt: netPaidAmt,
              remittanceDisc: remittanceDisc + Math.abs(adjustAmt)
            }
            loadSpsRecord.setSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_gbs_ispaymentcreate',
              line: i,
              value: true
            })
          }
        }

        invoiceNumberArr.pop()
        // log.debug({
        //   title: 'invoiceNumberArr',
        //   details: invoiceNumberArr
        // })

        /***************************CREATE PAYMENT************************/
        if (invoiceNumberArr.length != 0) {
          var searchResultInv = invoiceSearch(invoiceNumberArr)

          // log.debug({
          //   title: 'searchResultInv',
          //   details: searchResultInv
          // })

          let invoiceResultLength = searchResultInv.length
          let paymentLine = 0
          let custArr = []
          let custObj = {}

          for (let i = 0; i < invoiceResultLength; i++) {
            let customer = searchResultInv[i].getValue({
              name: 'entity',
              label: 'Name'
            })

            let tranid = searchResultInv[i].getValue({
              name: 'tranid',
              label: 'Document Number'
            })

            let status = searchResultInv[i].getValue({
              name: 'statusref',
              label: 'Status'
            })

            if (!custArr.includes(customer)) {
              custArr.push(customer)
              custObj[customer] = []
              custObj[customer].push({
                tranid: tranid,
                status: status
              })
            } else {
              custObj[customer].push({
                tranid: tranid,
                status: status
              })
            }
          }

          log.debug('custObj 214', custObj)

          for (const key in custObj) {
            let arr = custObj[key]

            for (let b = 0; b < arr.length; b++) {
              let obj = arr[b]

              if (obj.status === 'paidInFull') {
                //todo array checkbox
                //checkboxValueArr
              } else {
                paymentLine++

                let invoiceToPayment = record.create({
                  type: 'customerpayment',
                  isDynamic: true
                })

                invoiceToPayment.setValue({
                  fieldId: 'customer',
                  value: key
                })

                invoiceToPayment.setValue({
                  fieldId: 'account',
                  value: 571
                })

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
                  fieldId: 'custbody_820_payment_order',
                  value: internalidSps
                })

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
                  fieldId: 'custbody_820_payment_order',
                  value: internalidSps
                })

                let lineNo = invoiceToPayment.findSublistLineWithValue({
                  sublistId: 'apply',
                  fieldId: 'refnum',
                  value: obj.tranid
                })

                lineNo = (lineNo === -1) ? invoiceToPayment.findSublistLineWithValue({
                  sublistId: 'apply',
                  fieldId: 'refnum',
                  value: 'INV' + obj.tranid
                }) : lineNo

                if (lineNo != -1) {
                  invoiceToPayment.selectLine({
                    sublistId: 'apply',
                    line: lineNo
                  })

                  invoiceToPayment.setCurrentSublistValue({
                    sublistId: 'apply',
                    fieldId: 'apply',
                    value: true
                  })

                  //todo
                  invoiceToPayment.setCurrentSublistValue({
                    sublistId: 'apply',
                    fieldId: 'amount',
                    value: paymentObj[obj.tranid].netPaidAmt
                  })

                  invoiceToPayment.setCurrentSublistValue({
                    sublistId: 'apply',
                    fieldId: 'disc',
                    value: paymentObj[obj.tranid].remittanceDisc
                  })

                  invoiceToPayment.commitLine({
                    sublistId: 'apply'
                  })
                }

                if (paymentLine) {
                  invoiceToPayment.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                  })
                }
              }
            }
          }
        }

        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: 'check',
            isDynamic: true
          })

          createCheck.setValue({
            fieldId: 'entity',
            value: 537
          })

          createCheck.setValue({
            fieldId: 'account',
            value: 575
          })

          createCheck.setValue({
            fieldId: 'custbody_820_payment_order',
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

          log.debug('checkDataObjArr', checkDataObjArr); 
          var checkPaymentLine = 0;

          for (let j = 0; j < checkDataObjArr.length; j++) {
            checkPaymentLine++
            createCheck.selectNewLine({
              sublistId: 'expense'
            })

            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'account',
              value: 355,
              ignoreFieldChange: true
            })

            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'memo',
              value: checkDataObjArr[j].memo
            })

            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'amount',
              value: Math.abs(checkDataObjArr[j].adjustAmt)
            })

            createCheck.commitLine({
              sublistId: 'expense'
            })
          }

          if (checkPaymentLine) {
            createCheck.save()
          }

          loadSpsRecord.setValue({
            fieldId: 'custbody_gbs_check_created',
            value: true
          })
        }

        /********************CREATE JE*******************/
        let checkJE = loadSpsRecord.getValue({
          fieldId: 'custbody_je_created'
        })

        if (checkJE === false) {
          createJE(
            spsdatesps,
            internalidSps,
            spsreferenceNum,
            totalTranAmt,
            loadSpsRecord,
            571,
            221
          )
        }
      } else if (
        spsTradingPartnerId === 177282 ||
        spsTradingPartnerId === '177282'
      ) {
        let preDiscObj = {}
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_invoicenumber',
            line: i
          })
          if (_logValidation(invoiceNumber)) {
            invoiceNumber = invoiceNumber.split('-')[0]
          }
          log.debug({
            title: 'invoiceNumber 372',
            details: invoiceNumber
          })
          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_gbs_ispaymentcreate',
            line: i
          })
          let microfilm = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_microfilmnum',
            line: i
          })
          let adjustAmt = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_adjamount',
            line: i
          })

          let netPaidAmt = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_netpaidamt',
            line: i
          })

          //CHECK DATA
          if (adjustAmt < 0 && !paymentCreateCheckbox && adjustAmt) {
            checkDataObjArr.push({
              memo: microfilm,
              adjustAmt: adjustAmt,
              invoiceNumber: invoiceNumber
            })
            loadSpsRecord.setSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_gbs_ispaymentcreate',
              line: i,
              value: true
            })
          }

          //PAYMENT DATA
          if (!!invoiceNumber && paymentCreateCheckbox == false) {
            invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')
            preDiscObj[invoiceNumber] = netPaidAmt
            loadSpsRecord.setSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_gbs_ispaymentcreate',
              line: i,
              value: true
            })
          }
        }
        invoiceNumberArr.pop();
        // log.debug({
        //   title: 'invoiceNumberArr',
        //   details: invoiceNumberArr
        // })
        /***************************CREATE PAYMENT************************/
        let invoiceToPayment = record.create({
          type: 'customerpayment',
          isDynamic: true
        })
        invoiceToPayment.setValue({
          fieldId: 'customer',
          value: 546
        })
        invoiceToPayment.setValue({
          fieldId: 'account',
          value: 574
        })
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
          fieldId: 'custbody_820_payment_order',
          value: internalidSps
        })
        if (invoiceNumberArr.length != 0) {
          var searchResultInv = invoiceSearch(invoiceNumberArr)
          // log.debug({
          //   title: 'searchResultInv',
          //   details: searchResultInv
          // })
          let invoiceResultLength = searchResultInv.length
          let paymentLine = 0
          for (let i = 0; i < invoiceResultLength; i++) {
            let tranid = searchResultInv[i].getValue({
              name: 'tranid',
              label: 'Document Number'
            })
            let status = searchResultInv[i].getValue({
              name: 'statusref',
              label: 'Status'
            })
            if (status === 'paidInFull') {
              //todo array checkbox
              //checkboxValueArr
            } else {
              paymentLine++
              let lineNo = invoiceToPayment.findSublistLineWithValue({
                sublistId: 'apply',
                fieldId: 'refnum',
                value: tranid
              })
              if (lineNo != -1) {
                invoiceToPayment.selectLine({
                  sublistId: 'apply',
                  line: lineNo
                })
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: 'apply',
                  fieldId: 'apply',
                  value: true
                })
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: 'apply',
                  fieldId: 'amount',
                  value: preDiscObj[tranid]
                })
                invoiceToPayment.commitLine({
                  sublistId: 'apply'
                })
              }
            }
          }
          //log.debug('preDiscObj', preDiscObj)
          if (paymentLine) {
            invoiceToPayment.save({
              enableSourcing: true,
              ignoreMandatoryFields: true
            })
          }
        }

        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: 'check',
            isDynamic: true
          })
          createCheck.setValue({
            fieldId: 'entity',
            value: 546
          })
          createCheck.setValue({
            fieldId: 'account',
            value: 574
          })
          createCheck.setValue({
            fieldId: 'custbody_820_payment_order',
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
          for (let j = 0; j < checkDataObjArr.length; j++) {
            createCheck.selectNewLine({
              sublistId: 'expense'
            })
            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'account',
              value: 576,
              ignoreFieldChange: true
            })
            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'memo',
              value: checkDataObjArr[j].memo
            })
            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'amount',
              value: Math.abs(checkDataObjArr[j].adjustAmt)
            })
            createCheck.commitLine({
              sublistId: 'expense'
            })
          }
          createCheck.save()
          loadSpsRecord.setValue({
            fieldId: 'custbody_gbs_check_created',
            value: true
          })
        }
       /********************CREATE JE*******************/
       let checkJE = loadSpsRecord.getValue({
        fieldId: 'custbody_je_created'
      })

      if (checkJE === false) {
        createJE(
          spsdatesps,
          internalidSps,
          spsreferenceNum,
          totalTranAmt,
          loadSpsRecord,
          574,
          221
        )
      }
      } else if (spsTradingPartnerId === 540 || spsTradingPartnerId === '540') {
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_invoicenumber',
            line: i
          })

          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_gbs_ispaymentcreate',
            line: i
          })

          if (_logValidation(invoiceNumber)) {
            let checkInt = isNumber(invoiceNumber)

            if (checkInt == true) {
              invoiceNumber = invoiceNumber.toString()
              invoiceNumber = Number(invoiceNumber).toString()
            }
          }

          let memo = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            line: i
          })

          let adjustAmt = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_adjamount',
            line: i
          })

          let netPaidAmt = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_netpaidamt',
            line: i
          })

          //CHECK DATA
          if (adjustAmt < 0 && !paymentCreateCheckbox && adjustAmt) {
            checkDataObjArr.push({
              memo: memo,
              adjustAmt: adjustAmt,
              invoiceNumber: invoiceNumber
            })

            loadSpsRecord.setSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_gbs_ispaymentcreate',
              line: i,
              value: true
            })
          }

          //PAYMENT DATA
          if (!!invoiceNumber && paymentCreateCheckbox == false) {
            invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')
            paymentObj[invoiceNumber] = netPaidAmt
            loadSpsRecord.setSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_gbs_ispaymentcreate',
              line: i,
              value: true
            })
          }
        }

        invoiceNumberArr.pop()

        // log.debug({
        //   title: 'invoiceNumberArr',
        //   details: invoiceNumberArr
        // })

        /***************************CREATE PAYMENT************************/
        if (invoiceNumberArr.length != 0) {
          var searchResultInv = invoiceSearch(invoiceNumberArr)

          // log.debug({
          //   title: 'searchResultInv',
          //   details: searchResultInv
          // })

          let invoiceResultLength = searchResultInv.length

          let custArr = []
          let custObj = {}

          for (let i = 0; i < invoiceResultLength; i++) {
            let customer = searchResultInv[i].getValue({
              name: 'entity',
              label: 'Name'
            })

            let tranid = searchResultInv[i].getValue({
              name: 'tranid',
              label: 'Document Number'
            })

            let status = searchResultInv[i].getValue({
              name: 'statusref',
              label: 'Status'
            })

            if (!custArr.includes(customer)) {
              custArr.push(customer)
              custObj[customer] = []
              custObj[customer].push({
                tranid: tranid,
                status: status
              })
            } else {
              custObj[customer].push({
                tranid: tranid,
                status: status
              })
            }
          }

          log.debug('custObj 195', custObj)
          log.debug('paymentObj 195', paymentObj)

          for (const key in custObj) {
            let paymentLine = 0
            let arr = custObj[key]

            for (let b = 0; b < arr.length; b++) {
              let obj = arr[b]

              //log.debug('obj 847', obj)

              if (obj.status === 'paidInFull') {
                //todo array checkbox
                //checkboxValueArr
              } else {
                var invoiceToPayment = record.create({
                  type: 'customerpayment',
                  isDynamic: true
                })

                invoiceToPayment.setValue({
                  fieldId: 'customer',
                  value: key
                })

                invoiceToPayment.setValue({
                  fieldId: 'account',
                  value: 573
                })

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
                  fieldId: 'custbody_820_payment_order',
                  value: internalidSps
                })

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
                  fieldId: 'custbody_820_payment_order',
                  value: internalidSps
                })

                let lineNo = invoiceToPayment.findSublistLineWithValue({
                  sublistId: 'apply',
                  fieldId: 'refnum',
                  value: obj.tranid
                })

                lineNo = (lineNo === -1) ? invoiceToPayment.findSublistLineWithValue({
                  sublistId: 'apply',
                  fieldId: 'refnum',
                  value: 'INV' + obj.tranid
                }) : lineNo

                log.debug('lineNo', lineNo)

                if (lineNo != -1) {
                  paymentLine++
                  invoiceToPayment.selectLine({
                    sublistId: 'apply',
                    line: lineNo
                  })

                  invoiceToPayment.setCurrentSublistValue({
                    sublistId: 'apply',
                    fieldId: 'apply',
                    value: true
                  })

                  log.debug('lineNo', lineNo)

                  //todo
                  invoiceToPayment.setCurrentSublistValue({
                    sublistId: 'apply',
                    fieldId: 'amount',
                    value: paymentObj[obj.tranid]
                  })

                  let getAmountApplied = invoiceToPayment.getCurrentSublistValue({
                    sublistId: 'apply',
                    fieldId: 'amount',
                  })

                  if (!getAmountApplied && obj.tranid && obj.tranid.includes('INV')){
                    obj.tranid = obj.tranid.replace('INV', '')
                    log.debug('obj.tranid', obj.tranid)
                    invoiceToPayment.setCurrentSublistValue({
                      sublistId: 'apply',
                      fieldId: 'amount',
                      value: paymentObj[obj.tranid]
                    })
                  }

                  invoiceToPayment.commitLine({
                    sublistId: 'apply'
                  })
                }
              }
            }
            if (paymentLine) {
              invoiceToPayment.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
              })
            }
          }
        }

        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: 'check',
            isDynamic: true
          })

          createCheck.setValue({
            fieldId: 'entity',
            value: 540
          })

          createCheck.setValue({
            fieldId: 'account',
            value: 573
          })

          createCheck.setValue({
            fieldId: 'custbody_820_payment_order',
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

          for (let j = 0; j < checkDataObjArr.length; j++) {
            createCheck.selectNewLine({
              sublistId: 'expense'
            })

            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'account',
              value: 435,
              ignoreFieldChange: true
            })

            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'memo',
              value: checkDataObjArr[j].memo
            })

            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'amount',
              value: Math.abs(checkDataObjArr[j].adjustAmt)
            })

            createCheck.commitLine({
              sublistId: 'expense'
            })
          }

          createCheck.save()

          loadSpsRecord.setValue({
            fieldId: 'custbody_gbs_check_created',
            value: true
          })
        }

        /********************CREATE JE*******************/
        let checkJE = loadSpsRecord.getValue({
          fieldId: 'custbody_je_created'
        })

        if (checkJE === false) {
          createJE(
            spsdatesps,
            internalidSps,
            spsreferenceNum,
            totalTranAmt,
            loadSpsRecord,
            573,
            221,
            'walmart'
          )
        }
      } else if (spsTradingPartnerId === 537 || spsTradingPartnerId === '537') { //MACY
        let preDiscObj = {}
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_invoicenumber',
            line: i
          })
          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_gbs_ispaymentcreate',
            line: i
          })
          if (_logValidation(invoiceNumber)) {
            let checkInt = isNumber(invoiceNumber)
            if (checkInt == true) {
              invoiceNumber = invoiceNumber.toString()
              invoiceNumber = Number(invoiceNumber).toString()
            }
          }
          let memo = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            line: i
          })
          let adjustAmt = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_adjamount',
            line: i
          })
          let adjustAmtCode = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_adjreason',
            line: i
          })
          //CHECK DATA
          if (adjustAmt < 0 && !paymentCreateCheckbox && adjustAmt && adjustAmtCode === 'ZZ') {
            checkDataObjArr.push({
              memo: memo,
              adjustAmt: adjustAmt,
              invoiceNumber: invoiceNumber
            })
            loadSpsRecord.setSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_gbs_ispaymentcreate',
              line: i,
              value: true
            })
          }

          let preDiscAmt =
            loadSpsRecord.getSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_sps_cx_originalamt',
              line: i
            }) || 0
          //PAYMENT DATA
          if (
            !(preDiscAmt > 0 && !invoiceNumber) &&
            paymentCreateCheckbox == false &&
            preDiscAmt
          ) {
            invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')
            preDiscObj[invoiceNumber] = {preDiscAmt : (preDiscAmt * 0.02), payment: preDiscAmt - (preDiscAmt * 0.02)}
            loadSpsRecord.setSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_gbs_ispaymentcreate',
              line: i,
              value: true
            })
          }
        }
        invoiceNumberArr.pop()
        // log.debug({
        //   title: 'invoiceNumberArr',
        //   details: invoiceNumberArr
        // })
        /***************************CREATE PAYMENT************************/
        let invoiceToPayment = record.create({
          type: 'customerpayment',
          isDynamic: true
        })
        invoiceToPayment.setValue({
          fieldId: 'customer',
          value: 537
        })
        invoiceToPayment.setValue({
          fieldId: 'account',
          value: 575
        })
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
          fieldId: 'custbody_820_payment_order',
          value: internalidSps
        })
        if (invoiceNumberArr.length != 0) {
          var searchResultInv = invoiceSearch(invoiceNumberArr)
          // log.debug({
          //   title: 'searchResultInv',
          //   details: searchResultInv
          // })
          let invoiceResultLength = searchResultInv.length
          let paymentLine = 0
          for (let i = 0; i < invoiceResultLength; i++) {
            let tranid = searchResultInv[i].getValue({
              name: 'tranid',
              label: 'Document Number'
            })
            let status = searchResultInv[i].getValue({
              name: 'statusref',
              label: 'Status'
            })
            if (status === 'paidInFull') {
              //todo array checkbox
              //checkboxValueArr
            } else {
              paymentLine++
              let lineNo = invoiceToPayment.findSublistLineWithValue({
                sublistId: 'apply',
                fieldId: 'refnum',
                value: tranid
              })
              if (lineNo != -1) {
                invoiceToPayment.selectLine({
                  sublistId: 'apply',
                  line: lineNo
                })
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: 'apply',
                  fieldId: 'apply',
                  value: true
                })

                tranid = tranid.replace('INV','');
                
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: 'apply',
                  fieldId: 'amount',
                  value: preDiscObj[tranid].payment
                })
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: 'apply',
                  fieldId: 'disc',
                  value: preDiscObj[tranid].preDiscAmt
                })
                invoiceToPayment.commitLine({
                  sublistId: 'apply'
                })
              }
            }
          }
          //log.debug('preDiscObj', preDiscObj)
          if (paymentLine) {
            invoiceToPayment.save({
              enableSourcing: true,
              ignoreMandatoryFields: true
            })
          }
        }

        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: 'check',
            isDynamic: true
          })
          createCheck.setValue({
            fieldId: 'entity',
            value: 537
          })
          createCheck.setValue({
            fieldId: 'account',
            value: 575
          })
          createCheck.setValue({
            fieldId: 'custbody_820_payment_order',
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
          for (let j = 0; j < checkDataObjArr.length; j++) {
            createCheck.selectNewLine({
              sublistId: 'expense'
            })
            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'account',
              //value: 355,
              value: 576,
              ignoreFieldChange: true
            })
            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'memo',
              value: checkDataObjArr[j].memo
            })
            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'amount',
              value: Math.abs(checkDataObjArr[j].adjustAmt)
            })
            createCheck.commitLine({
              sublistId: 'expense'
            })
          }
          createCheck.save()
          loadSpsRecord.setValue({
            fieldId: 'custbody_gbs_check_created',
            value: true
          })
        }

        /********************CREATE JE*******************/
        let checkJE = loadSpsRecord.getValue({
          fieldId: 'custbody_je_created'
        })
        if (checkJE === false) {
        createJE(
          spsdatesps,
          internalidSps,
          spsreferenceNum,
          totalTranAmt,
          loadSpsRecord,
          575,
          221
        )
        }
      } else if (spsTradingPartnerId === 119 || spsTradingPartnerId === '119') {
        let preDiscObj = {}
        for (let i = 0; i < getLineCountSps; i++) {
          let invoiceNumber = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_invoicenumber',
            line: i
          })
          let paymentCreateCheckbox = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_gbs_ispaymentcreate',
            line: i
          })
          if (_logValidation(invoiceNumber)) {
            let checkInt = isNumber(invoiceNumber)
            if (checkInt == true) {
              invoiceNumber = invoiceNumber.toString()
              invoiceNumber = Number(invoiceNumber).toString()
            }
          }
          let remittanceDisc = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_disc_amounttaken',
            line: i
          })
          let adjustAmt = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_adjamount',
            line: i
          })

          let purchaseOrNumber = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_purchaseordernumber',
            line: i
          })

          let microfilm = loadSpsRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sps_cx_microfilmnum',
            line: i
          })

          //CHECK DATA
          if (
            adjustAmt < 0 &&
            !paymentCreateCheckbox &&
            adjustAmt &&
            (!purchaseOrNumber || purchaseOrNumber === 'NOT REQU')
          ) {
            checkDataObjArr.push({
              memo: microfilm,
              adjustAmt: adjustAmt,
              invoiceNumber: invoiceNumber,
              microfilm: microfilm
            })

            loadSpsRecord.setSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_gbs_ispaymentcreate',
              line: i,
              value: true
            })
          }

          //PAYMENT DATA
          let preDiscAmt =
            loadSpsRecord.getSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_sps_cx_originalamt',
              line: i
            }) || 0
          if (!!invoiceNumber && paymentCreateCheckbox == false) {
            invoiceNumberArr.push(['numbertext', 'is', invoiceNumber], 'OR')

            //only will work for two amounts in any form
            if (preDiscObj[invoiceNumber]) {
              let obj = preDiscObj[invoiceNumber]
              obj.disc = adjustAmt
                ? obj.remittanceDisc - adjustAmt
                : obj.adjustAmt - remittanceDisc
              obj.payment = adjustAmt
                ? obj.preDiscAmt - obj.remittanceDisc + adjustAmt
                : preDiscAmt - remittanceDisc + obj.adjustAmt
              preDiscObj[invoiceNumber] = obj
            } else {
              preDiscObj[invoiceNumber] = {
                remittanceDisc: remittanceDisc,
                adjustAmt: adjustAmt,
                preDiscAmt: preDiscAmt
              }
            }

            loadSpsRecord.setSublistValue({
              sublistId: 'line',
              fieldId: 'custcol_gbs_ispaymentcreate',
              line: i,
              value: true
            })
          }
        }
        invoiceNumberArr.pop()
        log.debug('preDiscObj', preDiscObj);
        // log.debug({
        //   title: 'invoiceNumberArr',
        //   details: invoiceNumberArr
        // })
        /***************************CREATE PAYMENT************************/
        let invoiceToPayment = record.create({
          type: 'customerpayment',
          isDynamic: true
        })
        invoiceToPayment.setValue({
          fieldId: 'customer',
          value: 119
        })
        invoiceToPayment.setValue({
          fieldId: 'account',
          value: 572
        })
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
          fieldId: 'custbody_820_payment_order',
          value: internalidSps
        })

        if (invoiceNumberArr.length != 0) {
          var searchResultInv = invoiceSearch(invoiceNumberArr)
          // log.debug({
          //   title: 'searchResultInv',
          //   details: searchResultInv
          // })
          let invoiceResultLength = searchResultInv.length
          let paymentLine = 0
          for (let i = 0; i < invoiceResultLength; i++) {
            let tranid = searchResultInv[i].getValue({
              name: 'tranid',
              label: 'Document Number'
            })
            let status = searchResultInv[i].getValue({
              name: 'statusref',
              label: 'Status'
            })
            if (status === 'paidInFull') {
              //todo array checkbox
              //checkboxValueArr
            } else {
              paymentLine++
              let lineNo = invoiceToPayment.findSublistLineWithValue({
                sublistId: 'apply',
                fieldId: 'refnum',
                value: tranid
              })
              if (lineNo != -1) {
                invoiceToPayment.selectLine({
                  sublistId: 'apply',
                  line: lineNo
                })
                invoiceToPayment.setCurrentSublistValue({
                  sublistId: 'apply',
                  fieldId: 'apply',
                  value: true
                })

                log.debug('preDiscObj[tranid].payment', preDiscObj[tranid].payment)

                invoiceToPayment.setCurrentSublistValue({
                  sublistId: 'apply',
                  fieldId: 'amount',
                  value: preDiscObj[tranid].payment
                })

                log.debug('preDiscObj[tranid].disc', preDiscObj[tranid].disc)

                invoiceToPayment.setCurrentSublistValue({
                  sublistId: 'apply',
                  fieldId: 'disc',
                  value: preDiscObj[tranid].preDiscAmt
                })

                invoiceToPayment.commitLine({
                  sublistId: 'apply'
                })
              }
            }
          }
          //log.debug('preDiscObj', preDiscObj)
          if (paymentLine) {
            // invoiceToPayment.save({
            //   enableSourcing: true,
            //   ignoreMandatoryFields: true
            // })
          }
        }
        /**********************CREATE CHECK*****************/
        if (!checkCreated) {
          var createCheck = record.create({
            type: 'check',
            isDynamic: true
          })
          createCheck.setValue({
            fieldId: 'entity',
            value: 119
          })
          createCheck.setValue({
            fieldId: 'account',
            value: 572
          })
          createCheck.setValue({
            fieldId: 'custbody_820_payment_order',
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
          for (let j = 0; j < checkDataObjArr.length; j++) {
            createCheck.selectNewLine({
              sublistId: 'expense'
            })
            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'account',
              value: 431,
              ignoreFieldChange: true
            })
            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'memo',
              value: checkDataObjArr[j].memo
            })
            createCheck.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'amount',
              value: Math.abs(checkDataObjArr[j].adjustAmt)
            })
            createCheck.commitLine({
              sublistId: 'expense'
            })
          }
          createCheck.save()
          loadSpsRecord.setValue({
            fieldId: 'custbody_gbs_check_created',
            value: true
          })
        }
        /********************CREATE JE*******************/
        let checkJE = loadSpsRecord.getValue({
          fieldId: 'custbody_je_created'
        })
        if (checkJE === false) {
          createJE(
            spsdatesps,
            internalidSps,
            spsreferenceNum,
            totalTranAmt,
            loadSpsRecord,
            572,
            221
          )
        }
      }

      //loadSpsRecord.setValue('transtatus', )

      loadSpsRecord.save()
    } catch (e) {
      log.debug({
        title: 'e',
        details: e
      })
    }
  }

  function createJE (
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
      value: 2 //jeSubsidiary
    })

    createJE.setValue({
      fieldId: 'custbody_820_payment_order',
      value: internalidSps
    })

    if (_logValidation(spsreferenceNum)) {
      createJE.setValue({
        fieldId: 'memo',
        value: spsreferenceNum
      })
    }

    createJE.setSublistValue({
      sublistId: 'line',
      fieldId: 'account',
      value: line1Acc,
      line: 0
    })

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
      fieldId: 'account',
      value: line2Acc,
      line: 1
    })

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

    log.debug({
      title: 'je_id ' + cust,
      details: je_id
    })

    loadSpsRecord.setValue({
      fieldId: 'custbody_je_created',
      value: true
    })
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

      //log.debug('invoiceNumberArr', invoiceNumberArr)

      let searchResultInv = searchAll(invoiceSearch.run())
      //log.debug('searchResultInv', searchResultInv)

      return searchResultInv
    } catch (e) {
      log.debug('error in invoiceSearch', e.toString())
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

  function isNumber (n) {
    return /^-?[\d.]+(?:e-?\d+)?$/.test(n)
  }
  return {
    afterSubmit: afterSubmit
  }
})
